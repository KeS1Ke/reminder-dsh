import test from 'node:test'
import assert from 'node:assert/strict'
import { createReminderQueue } from '../src/modules/popup/queue.js'

const flush = () => new Promise(resolve => setImmediate(resolve))
function rig(t, prepare = async options => ({ message: options.sessionId })) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  const shown = []
  let active = 0, maximum = 0
  const queue = createReminderQueue({ prepare, show: options => {
    active++
    maximum = Math.max(maximum, active)
    return new Promise(resolve => {
      const item = { ...options, at: Date.now(), closed: false, close: () => {
        if (item.closed) return
        item.closed = true
        active--
        resolve()
      } }
      shown.push(item)
    })
  } })
  t.after(() => { queue.dispose(); for (const item of shown) if (!item.closed) item.close() })
  return { queue, shown, maximum: () => maximum }
}

test('simultaneous completions submit in order, with 10 seconds between notifications', async t => {
  const h = rig(t)
  const first = h.queue.enqueue({ sessionId: 'main-1' })
  const second = h.queue.enqueue({ sessionId: 'main-2' })
  await flush()
  assert.deepEqual(h.shown.map(item => item.sessionId), ['main-1'])
  h.shown[0].close()
  await flush()
  t.mock.timers.tick(10_000)
  await flush()
  assert.deepEqual(h.shown.map(item => [item.sessionId, item.at]), [['main-1', 0], ['main-2', 10_000]])
  assert.equal(h.maximum(), 1)
  h.shown[1].close()
  await Promise.all([first, second])
})

test('the interval starts after Windows submission finishes', async t => {
  const h = rig(t)
  const first = h.queue.enqueue({ sessionId: 'first' })
  const second = h.queue.enqueue({ sessionId: 'second' })
  await flush()
  t.mock.timers.tick(1000)
  h.shown[0].close()
  await flush()
  t.mock.timers.tick(9999)
  await flush()
  assert.equal(h.shown.length, 1)
  t.mock.timers.tick(1)
  await flush()
  assert.equal(h.shown.length, 2)
  h.shown[1].close()
  await Promise.all([first, second])
})

test('a pending submission keeps its slot until it finishes', async t => {
  const h = rig(t)
  const first = h.queue.enqueue({ sessionId: 'sending' })
  const second = h.queue.enqueue({ sessionId: 'waiting' })
  await flush()
  t.mock.timers.tick(60_000)
  await flush()
  assert.equal(h.shown.length, 1)
  h.shown[0].close()
  await flush()
  t.mock.timers.tick(10_000)
  await flush()
  assert.equal(h.shown[1].at, 70_000)
  assert.equal(h.maximum(), 1)
  h.shown[1].close()
  await Promise.all([first, second])
})

test('disabling clears waiting tasks; quick re-enabling waits for the cancelled submission', async t => {
  const h = rig(t)
  const first = h.queue.enqueue({ sessionId: 'active' })
  const old = h.queue.enqueue({ sessionId: 'discarded' })
  await flush()
  h.queue.setEnabled(false)
  assert.equal(h.shown[0].signal.aborted, true)
  await old
  await h.queue.enqueue({ sessionId: 'disabled' })
  h.queue.setEnabled(true)
  const fresh = h.queue.enqueue({ sessionId: 'fresh' })
  await flush()
  assert.equal(h.shown.length, 1)
  h.shown[0].close()
  await flush()
  assert.deepEqual(h.shown.map(item => item.sessionId), ['active', 'fresh'])
  assert.equal(h.maximum(), 1)
  h.shown[1].close()
  await Promise.all([first, fresh])
})

test('a slower first summary does not reorder simultaneous completions', async t => {
  let release
  const h = rig(t, options => options.sessionId === 'slow'
    ? new Promise(resolve => { release = resolve }) : Promise.resolve({ message: 'fast' }))
  const slow = h.queue.enqueue({ sessionId: 'slow' })
  const fast = h.queue.enqueue({ sessionId: 'fast' })
  await flush()
  assert.equal(h.shown.length, 0)
  release({ message: 'slow' })
  await flush()
  assert.equal(h.shown[0].sessionId, 'slow')
  h.shown[0].close()
  await flush()
  t.mock.timers.tick(10_000)
  await flush()
  assert.equal(h.shown[1].sessionId, 'fast')
  h.shown[1].close()
  await Promise.all([slow, fast])
})

test('disabling during summary generation cancels it and never revives old reminders', async t => {
  let signal, release
  const h = rig(t, options => { signal = options.signal; return new Promise(resolve => { release = resolve }) })
  const job = h.queue.enqueue({ sessionId: 'old' })
  await flush()
  h.queue.setEnabled(false)
  await job
  assert.equal(signal.aborted, true)
  h.queue.setEnabled(true)
  release({ message: 'late summary' })
  await flush()
  assert.equal(h.shown.length, 0)
})

test('a custom interval can be shortened live while the next notification is waiting', async t => {
  const h = rig(t)
  h.queue.setIntervalSeconds(30)
  const first = h.queue.enqueue({ sessionId: 'first' })
  const second = h.queue.enqueue({ sessionId: 'second' })
  await flush()
  t.mock.timers.tick(2000)
  h.shown[0].close()
  await flush()
  t.mock.timers.tick(8000)
  await flush()
  assert.equal(h.shown.length, 1)
  h.queue.setIntervalSeconds(5)
  await flush()
  assert.equal(h.shown[1].at, 10_000)
  h.shown[1].close()
  await Promise.all([first, second])
})

test('lengthening the interval reschedules an already waiting notification', async t => {
  const h = rig(t)
  const first = h.queue.enqueue({ sessionId: 'first' })
  const second = h.queue.enqueue({ sessionId: 'second' })
  await flush()
  h.shown[0].close()
  await flush()
  t.mock.timers.tick(5000)
  h.queue.setIntervalSeconds(20)
  await flush()
  t.mock.timers.tick(5000)
  await flush()
  assert.equal(h.shown.length, 1)
  t.mock.timers.tick(10000)
  await flush()
  assert.equal(h.shown[1].at, 20000)
  h.shown[1].close()
  await Promise.all([first, second])
})
