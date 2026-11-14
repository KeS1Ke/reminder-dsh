import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { Config, createEsp32Module, deviceAddress, deviceRequest } from '../src/modules/esp32/index.js'
import { startReminderRuntime } from '../src/index.js'

const address = 'http://192.168.137.22:8080', token = '0123456789abcdef0123456789abcdef'
const accepted = () => Response.json({ accepted: true })
function setup(t, fetcher, values = {}) {
  let route
  const ctx = { inject(_names, cb) { cb({ connection: { fetch: { register(value) { route = value } } } }) } }
  const config = Config({ enabled: true, address, token, ...values })
  const module = createEsp32Module(ctx, config, fetcher)
  t.after(() => module.dispose())
  const request = body => route.fetch(new Request('http://dsh.local/api/reminder-dsh/esp32', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }))
  return { config, module, request }
}

test('device URL only permits numeric private LAN addresses and fixed device port', () => {
  for (const value of [address, 'http://10.0.0.2:8080/', 'http://172.16.0.3:8080']) assert.match(deviceAddress(value), /:8080$/)
  for (const value of ['http://127.0.0.1:8080', 'http://8.8.8.8:8080', 'https://192.168.1.2:8080',
    'http://192.168.1.2:80', 'http://192.168.1.2:8080/api', address + '?x=y', address + '#a',
    'http://user:pass@192.168.1.2:8080', 'http://esp32.local:8080', 'http://[::1]:8080']) assert.throws(() => deviceAddress(value))
})

test('completion sends immediately with UTF-8 byte limits and no extra model call', async t => {
  const calls = []
  const { module } = setup(t, async (url, options) => { calls.push({ url, options }); return accepted() })
  await module.notify({ sessionTitle: '修复 Wi-Fi 🔔'.repeat(30), completedText: '完成\n'.repeat(200), signal: new AbortController().signal })
  assert.equal(calls.length, 1)
  const { url, options } = calls[0], body = JSON.parse(options.body)
  assert.equal(url, address + '/api/reminder')
  assert.equal(options.headers.authorization, 'Bearer ' + token)
  assert.equal(options.redirect, 'error')
  assert.equal(body.type, 'task.completed')
  assert.equal(body.version, 1)
  assert.equal(body.sound, true)
  assert.ok(Buffer.byteLength(body.title) <= 128 && Buffer.byteLength(body.message) <= 384)
  assert.ok(!body.title.includes('�') && !body.message.includes('\n'))
})

test('lost response and busy device retry the same id, but authentication failure does not retry', async t => {
  const ids = []
  const { module } = setup(t, async (_url, options) => {
    ids.push(JSON.parse(options.body).id)
    if (ids.length === 1) throw new TypeError('lost response')
    if (ids.length === 2) return new Response('', { status: 409 })
    return accepted()
  })
  await module.notify({})
  assert.equal(ids.length, 3)
  assert.equal(new Set(ids).size, 1)
  let calls = 0
  const other = setup(t, async () => { calls++; return new Response('', { status: 401 }) })
  await assert.rejects(other.module.notify({}), /配对已失效/)
  assert.equal(calls, 1)
})

test('disabled device does not send and shutdown aborts an in-flight request', async t => {
  let signal, calls = 0
  const { module } = setup(t, async (_url, options) => {
    calls++; signal = options.signal
    await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  })
  const pending = module.notify({})
  module.dispose()
  await pending
  assert.equal(signal.aborted, true)
  const off = setup(t, async () => { calls++; return accepted() }, { enabled: false })
  await off.module.notify({})
  assert.equal(calls, 1)
})

test('JSON escaping fits the board request cap and whitespace titles have a fallback', async t => {
  const bodies = []
  const { module } = setup(t, async (_url, options) => { bodies.push(options.body); return accepted() })
  await module.notify({ sessionTitle: '"'.repeat(128), completedText: '\\'.repeat(384) })
  assert.ok(Buffer.byteLength(bodies[0]) < 1024)
  await module.notify({ sessionTitle: ' \n\t ' })
  assert.equal(JSON.parse(bodies[1]).title, 'DSH 任务完成')
})

test('owner backend pairs without Authorization and tests with saved credentials', async t => {
  const calls = []
  const { request } = setup(t, async (url, options) => {
    calls.push({ url, options })
    return url.endsWith('/api/pair') ? Response.json({ token }) : accepted()
  })
  let response = await request({ action: 'pair', address, pin: '123456' })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { token })
  assert.equal(calls[0].options.body, '123456')
  assert.equal(calls[0].options.headers.authorization, undefined)
  response = await request({ action: 'test' })
  assert.equal(response.status, 200)
  assert.equal(calls[1].options.headers.authorization, 'Bearer ' + token)
  response = await request({ action: 'pair', address, pin: '123' })
  assert.equal(response.status, 400)
  assert.equal(calls.length, 2)
})

test('unexpected or oversized device responses fail without treating HTTP 200 as delivery', async t => {
  await assert.rejects(deviceRequest(address, '/api/pair', '123456', undefined, undefined,
    async () => new Response('x'.repeat(1100))), /响应过长/)
  const { request } = setup(t, async () => Response.json({ token: 'invalid' }))
  const response = await request({ action: 'pair', address, pin: '123456' })
  assert.equal(response.status, 400)
})

test('live successful main session reaches ESP32 while a Windows module remains pending', async t => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const sent = [], config = Config({ enabled: true, address, token })
  const esp32 = createEsp32Module(ctx, config, async (_url, options) => { sent.push(JSON.parse(options.body)); return accepted() })
  startReminderRuntime(ctx, {}, { esp32, popup: { notify: () => new Promise(() => {}), update() {}, dispose() {} } })
  const agent = { session: { id: 'main', header: {} } }
  ctx.emit('agent/status', { agent, status: 'running' })
  ctx.emit('session/event', agent.session, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'Task finished' }] } } })
  ctx.emit('session/event', agent.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  ctx.emit('agent/status', { agent, status: 'idle' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(sent.length, 1)
  assert.equal(sent[0].message, 'Task finished')
  ctx.emit('agent/status', { agent, status: 'idle' })
  assert.equal(sent.length, 1)
})
