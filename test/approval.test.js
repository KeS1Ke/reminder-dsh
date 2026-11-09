import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { attachApprovalNotifications } from '../src/modules/popup/approval.js'

const flush = () => new Promise(resolve => setImmediate(resolve))

function fixture(t) {
  const ctx = new Context(), notifications = []
  t.after(() => ctx.fiber.dispose())
  const pendingRemoteEvents = new Map()
  const gateway = {
    pendingRemoteEvents,
    settleRemoteEvent(event, outcome) {
      assert.equal(pendingRemoteEvents.get(event.id), event)
      pendingRemoteEvents.delete(event.id)
      event.resolve(outcome.value)
    },
  }
  let policy = 'ask', sequence = 0
  ctx.provide('approval', { effectivePolicy: () => policy })
  ctx.provide('typertGateway', gateway)
  attachApprovalNotifications(ctx, options => notifications.push(options))
  ctx.on('approval/request', request => {
    const decision = Promise.withResolvers()
    const id = String(++sequence)
    queueMicrotask(() => pendingRemoteEvents.set(id, {
      id, frame: { event: 'approval/request' }, source: { request, context: { subject: request.agent } },
      resolve: decision.resolve,
    }))
    return decision.promise
  })
  const agent = { session: { id: 'original' } }
  return {
    notifications, agent, pendingRemoteEvents,
    ask: (options = {}) => ctx.waterfall('approval/request', { agent, toolName: 'bash', reason: '需要访问工作区外的文件', ...options }, () => 'unavailable'),
    answerInDsh: (id, outcome) => gateway.settleRemoteEvent(pendingRemoteEvents.get(id), { kind: 'result', value: outcome }),
    changePolicy: value => { policy = value },
  }
}

test('allow and reject settle only the exact pending request, even for identical tools in the same session', async t => {
  const h = fixture(t)
  const first = h.ask(), second = h.ask()
  await flush()
  assert.equal(h.notifications.length, 2)
  assert.match(h.notifications[0].title, /bash/)
  h.notifications[1].onDecision('rejected')
  assert.equal(await second, 'rejected')
  assert.equal(h.pendingRemoteEvents.size, 1)
  h.notifications[0].onDecision('allowed-once')
  assert.equal(await first, 'allowed-once')
  assert.throws(() => h.notifications[0].onDecision('rejected'), /已失效/)
})

test('approval from the DSH card makes the notification action stale', async t => {
  const h = fixture(t), decision = h.ask()
  await flush()
  h.answerInDsh('1', 'rejected')
  assert.equal(await decision, 'rejected')
  assert.equal(h.notifications[0].signal.aborted, true)
  assert.throws(() => h.notifications[0].onDecision('allowed-once'), /已失效/)
})

test('native approval fails closed after a policy change, abort or session switch', async t => {
  const h = fixture(t), original = h.agent.session
  const controller = new AbortController()
  const decision = h.ask({ signal: controller.signal })
  await flush()
  const notification = h.notifications[0]
  h.changePolicy('never')
  assert.throws(() => notification.onDecision('allowed-once'), /已失效/)
  h.changePolicy('ask')
  h.agent.session = { id: 'another' }
  assert.throws(() => notification.onDecision('allowed-once'), /已失效/)
  h.agent.session = original
  controller.abort()
  assert.throws(() => notification.onDecision('allowed-once'), /已失效/)
  h.answerInDsh('1', 'cancelled')
  assert.equal(await decision, 'cancelled')
})
