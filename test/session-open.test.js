import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { createSessionOpenRequests } from '../src/modules/popup/open.js'
import { Config, createPopupModule } from '../src/modules/popup/index.js'

const flush = () => new Promise(resolve => setImmediate(resolve))

function fakeResponse() {
  return {
    status: 0, headers: {}, body: '',
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers ?? {}) },
    end(body) { this.body = body ?? '' },
  }
}

test('a click posts one session id and the next poll consumes it once', async () => {
  const requests = createSessionOpenRequests({ timeoutMs: 10 })
  const pending = requests.take()
  requests.request('session-a')
  assert.equal(await pending, 'session-a')
  assert.equal(await requests.take(), undefined)
})

test('a poll without a click gives up after its timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const requests = createSessionOpenRequests({ timeoutMs: 500 })
  const pending = requests.take()
  t.mock.timers.tick(500)
  assert.equal(await pending, undefined)
})

test('a clicked notification wires the GUI route to its session', async t => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  ctx.provide('llm', {})
  const routes = []
  ctx.provide('webServer', { register: route => { routes.push(route); return () => {} } })
  ctx.provide('connection', { requestRejection: () => undefined })
  const notifications = []
  const module = createPopupModule(ctx, Config({ showSummary: false }), {
    notify: options => { notifications.push(options); return Promise.resolve() }, dispose() {},
  })
  t.after(() => module.dispose())
  await flush()
  const route = routes.find(item => item.path === '/reminder-dsh/session-open')
  assert.ok(route, 'session-open route registered')
  await module.notify({ sessionId: 'session-42', sessionTitle: '标题', completedText: '', signal: new AbortController().signal })
  assert.equal(typeof notifications[0].onOpen, 'function')
  notifications[0].onOpen()
  const response = fakeResponse()
  await route.handler({ method: 'GET' }, response)
  assert.equal(response.status, 200)
  assert.deepEqual(JSON.parse(response.body), { sessionId: 'session-42' })
})

test('the GUI route rejects unauthenticated browser requests', async t => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  ctx.provide('llm', {})
  const routes = []
  ctx.provide('webServer', { register: route => { routes.push(route); return () => {} } })
  ctx.provide('connection', { requestRejection: () => 403 })
  const module = createPopupModule(ctx, Config({ showSummary: false }), { notify: async () => {}, dispose() {} })
  t.after(() => module.dispose())
  await flush()
  const route = routes.find(item => item.path === '/reminder-dsh/session-open')
  const response = fakeResponse()
  await route.handler({ method: 'GET' }, response)
  assert.equal(response.status, 403)
})
