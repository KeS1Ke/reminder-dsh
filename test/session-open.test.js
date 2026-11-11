import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { createSessionOpenRequests } from '../src/modules/popup/open.js'
import { Config, createPopupModule } from '../src/modules/popup/index.js'

const flush = () => new Promise(resolve => setImmediate(resolve))

test('an aborted or unacknowledged poll leaves the jump available to the next page', async t => {
  const requests = createSessionOpenRequests()
  t.after(() => requests.dispose())
  const controller = new AbortController()
  const abandoned = requests.take(null, controller.signal)
  controller.abort()
  requests.request('session-a')
  assert.equal(await abandoned, undefined)
  const opened = await requests.take()
  assert.equal(opened.sessionId, 'session-a')
  assert.deepEqual(await requests.take(), opened)
  const pending = requests.take(opened.id)
  requests.request('session-b')
  const latest = await pending
  assert.equal(latest.sessionId, 'session-b')
  assert.deepEqual(await requests.take(opened.id), latest)
})

test('a poll without a click gives up after its timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const requests = createSessionOpenRequests({ timeoutMs: 500 })
  const pending = requests.take()
  t.mock.timers.tick(500)
  assert.equal(await pending, undefined)
})

test('completion and approval clicks select their own session through the DSH Fetch route', async t => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  ctx.provide('llm', {})
  const routes = []
  ctx.provide('connection', { fetch: { register: route => { routes.push(route); return () => {} } } })
  const notifications = []
  const module = createPopupModule(ctx, Config({ showSummary: false }), {
    notify: options => { notifications.push(options); return Promise.resolve() }, dispose() {},
  })
  t.after(() => module.dispose())
  await flush()
  const route = routes.find(item => item.path === '/api/reminder-dsh/session-open')
  assert.ok(route, 'session-open route registered')
  assert.deepEqual(route.methods, ['GET'])
  const signal = new AbortController().signal
  await module.notify({ sessionId: 'session-42', sessionTitle: '标题', completedText: '', signal })
  await module.notifyApproval({ sessionId: 'approval-17', onDecision: () => {}, signal })
  const endpoint = new URL(route.path, 'http://localhost')
  notifications[0].onOpen()
  const response = await route.fetch(new Request(endpoint))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const opened = await response.json()
  assert.equal(opened.sessionId, 'session-42')
  endpoint.searchParams.set('ack', opened.id)
  notifications[1].onOpen()
  assert.equal((await (await route.fetch(new Request(endpoint))).json()).sessionId, 'approval-17')
})
