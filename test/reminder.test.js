import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { attachReminder } from '../src/reminder.js'
import { Config } from '../src/modules/popup/index.js'

function harness(t, notify) {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const calls = [], errors = []
  attachReminder(ctx, notify ?? (() => calls.push('popup')), e => errors.push(e))
  const agent = { session: { header: {} } }
  const status = (value, a = agent) => ctx.emit('agent/status', { agent: a, status: value })
  const event = (type, data, a = agent) => ctx.emit('session/event', a.session, { type, data })
  const end = (kind = 'completed', a = agent) => event('turn/end', { reason: { kind } }, a)
  return { ctx, calls, errors, agent, status, event, end }
}

test('notifies once at idle after success and permits subsequent tasks', t => {
  const h = harness(t)
  h.status('running'); h.end()
  assert.equal(h.calls.length, 0)
  h.status('idle'); h.status('idle'); h.end(); h.status('idle')
  assert.equal(h.calls.length, 1)
  h.status('running'); h.end(); h.status('idle')
  assert.equal(h.calls.length, 2)
})

test('initial idle and restored history do not notify', t => {
  const h = harness(t)
  h.end(); h.status('idle'); h.status('running'); h.status('idle')
  assert.deepEqual(h.calls, [])
})

for (const kind of ['aborted', 'error', 'blocked', 'max-tokens', 'interrupted', 'forked', 'custom']) {
  test(`${kind} does not show success`, t => {
    const h = harness(t)
    h.status('running'); h.end(kind); h.status('idle')
    assert.deepEqual(h.calls, [])
  })
}

test('subagents are excluded; ordinary forks remain main sessions', t => {
  const h = harness(t)
  for (const header of [{ origin: 'subagent' }, { delegationDepth: 1 }]) {
    const child = { session: { header } }
    h.status('running', child); h.end('completed', child); h.status('idle', child)
  }
  assert.equal(h.calls.length, 0)
  h.agent.session.header = { parentSession: 'old-fork-parent', isSeeded: true }
  h.status('running'); h.end(); h.status('idle')
  assert.equal(h.calls.length, 1)
})

test('queued turns notify only once and only if the last turn succeeds', t => {
  const h = harness(t)
  h.status('running'); h.end(); h.event('turn/start', { turn: 2 })
  assert.equal(h.calls.length, 0)
  h.end(); h.status('idle')
  assert.equal(h.calls.length, 1)
  h.status('running'); h.end(); h.event('turn/start', { turn: 3 })
  h.end('error'); h.status('idle')
  assert.equal(h.calls.length, 1)
})

test('concurrent main sessions have independent completion state', t => {
  const h = harness(t), other = { session: { header: {} } }
  h.status('running'); h.status('running', other)
  h.end(); h.end('error', other)
  h.status('idle', other); h.status('idle')
  assert.equal(h.calls.length, 1)
})

for (const event of ['agent/error', 'agent/disposed']) {
  test(`${event} clears pending completion`, t => {
    const h = harness(t)
    h.status('running'); h.end()
    h.ctx.emit(event, { agent: h.agent }); h.status('idle')
    assert.deepEqual(h.calls, [])
  })
}

test('notification failure is contained and reported', async t => {
  const h = harness(t, () => Promise.reject(new Error('unavailable')))
  h.status('running'); h.end(); h.status('idle')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.errors[0].message, 'unavailable')
})

test('unload stops reminders', async t => {
  const h = harness(t)
  h.status('running'); h.end()
  await h.ctx.fiber.dispose()
  h.status('idle')
  assert.deepEqual(h.calls, [])
})

test('configuration validates duration and disabled mode loads', async () => {
  assert.equal(Config({}).durationSeconds.get(), 10)
  for (const durationSeconds of [0, -1, 301, 1.5, '10']) assert.throws(() => Config({ durationSeconds }))
  assert.equal(Config({ enabled: false }).enabled.get(), false)
})

test('notification summarizes only the latest turn final answer, excluding reasoning and tools', t => {
  let popup
  const h = harness(t, options => { popup = options })
  h.agent.model = { current: () => ({ provider: 'deepseek', model: 'test-model' }) }
  h.status('running')
  h.event('assistant/message', { message: { content: [{ type: 'text', text: '旧任务' }] } })
  h.end()
  h.event('turn/start', { turn: 2 })
  h.event('assistant/message', { message: { content: [
    { type: 'text', text: '即将执行' }, { type: 'tool-call', arguments: 'secret tool input' },
  ] } })
  h.event('assistant/message', { message: { content: [
    { type: 'reasoning', text: 'private thinking' }, { type: 'text', text: '新任务已完成，测试通过。' },
  ] } })
  h.end(); h.status('idle')
  assert.equal(popup.completedText, '新任务已完成，测试通过。')
  assert.equal(popup.route.model, 'test-model')
})

test('disposing a session aborts its in-flight summary or notification', t => {
  let popup
  const h = harness(t, options => { popup = options; return new Promise(() => {}) })
  h.status('running'); h.end(); h.status('idle')
  h.ctx.emit('agent/disposed', { agent: h.agent })
  assert.equal(popup.signal.aborted, true)
})

test('native replies use the originating session and reject a closed or switched session', t => {
  let notification
  const h = harness(t, options => { notification = options })
  const received = []
  const original = h.agent.session
  h.agent.followup = message => received.push(message)
  h.status('running'); h.end(); h.status('idle')
  notification.onReply('继续检查')
  assert.equal(received[0].role, 'user')
  assert.deepEqual(received[0].content, [{ type: 'text', text: '继续检查' }])
  h.agent.session = { header: {} }
  assert.throws(() => notification.onReply('切换后'), /会话已关闭或切换/)
  h.agent.session = original
  h.ctx.emit('agent/disposed', { agent: h.agent })
  assert.throws(() => notification.onReply('关闭后'), /会话已关闭或切换/)
  assert.equal(received.length, 1)
})
