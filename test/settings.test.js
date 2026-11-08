import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { Config, startReminderRuntime } from '../src/index.js'
import { createPopupModule } from '../src/modules/popup/index.js'
import { createTaskbarModule } from '../src/modules/taskbar/index.js'

const flush = () => new Promise(resolve => setImmediate(resolve))

test('real Loader updates the enabled reference and runtime without remounting', async t => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(Loader)
  ctx.provide('llm', {})
  const shown = []
  let mounts = 0, captured, shutdowns = 0
  const intervals = []
  const notifier = {
    setDurationSeconds: value => intervals.push(value),
    notify: options => new Promise(resolve => {
      options.onReady()
      shown.push(options)
      options.signal.addEventListener('abort', () => resolve(), { once: true })
    }),
    dispose: () => { shutdowns++ },
  }
  ctx.loader.builtins.reminder = { Config, apply(owner, config) {
    mounts++
    captured = config
    startReminderRuntime(owner, config, { popup: createPopupModule(owner, config.popup, notifier), taskbar: { notify: async () => {}, update() {}, dispose() {} } })
  } }
  const id = await ctx.loader.create({ name: 'cordis:reminder', config: { popup: { enabled: false } } })
  const entry = ctx.loader.resolve(id)
  const fiber = entry.fiber
  await fiber.await()
  const reference = captured.popup.enabled
  const complete = (name, header = {}) => {
    const agent = { session: { id: name, header } }
    fiber.ctx.emit('agent/status', { agent, status: 'running' })
    fiber.ctx.emit('session/event', agent.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    fiber.ctx.emit('agent/status', { agent, status: 'idle' })
  }
  complete('while-off')
  await flush()
  assert.equal(shown.length, 0)
  await entry.update({ config: { popup: { enabled: true } } })
  assert.equal(reference.get(), true)
  assert.equal(captured.popup.enabled, reference)
  assert.equal(entry.fiber, fiber)
  assert.equal(mounts, 1)
  complete('child', { origin: 'subagent' })
  complete('main')
  complete('queued')
  await flush()
  assert.deepEqual(shown.map(item => item.sessionId), ['main'])
  await entry.update({ config: { popup: { enabled: true, durationSeconds: 25 } } })
  assert.equal(captured.popup.durationSeconds.get(), 25)
  assert.equal(intervals.at(-1), 25)
  assert.equal(mounts, 1)
  await entry.update({ config: { popup: { enabled: false } } })
  await flush()
  assert.equal(shown[0].signal.aborted, true)
  assert.equal(shutdowns, 0)
  await entry.update({ config: { popup: { enabled: true } } })
  complete('new-main')
  await flush()
  assert.deepEqual(shown.map(item => item.sessionId), ['main', 'new-main'])
  assert.equal(mounts, 1)
  await fiber.dispose()
  assert.equal(shutdowns, 1)
  assert.equal(shown[1].signal.aborted, true)
})

test('settings select taskbar only, popup only, both, or neither without remounting', async t => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  ctx.provide('llm', {})
  await ctx.plugin(Loader)
  const calls = [], stops = []
  let mounts = 0
  ctx.loader.builtins.modules = { Config, apply(owner, config) {
    mounts++
    startReminderRuntime(owner, config, {
      taskbar: createTaskbarModule(config.taskbar, {
        notify: async options => { calls.push('taskbar:' + options.sessionId) },
        stop: () => stops.push('taskbar'), dispose() {},
      }),
      popup: createPopupModule(owner, config.popup, {
        notify: async options => { options.onReady(); calls.push('popup:' + options.sessionId) },
        setDurationSeconds() {}, dispose() {},
      }),
    })
  } }
  const id = await ctx.loader.create({ name: 'cordis:modules', config: { taskbar: { enabled: false }, popup: { enabled: false } } })
  const entry = ctx.loader.resolve(id), fiber = entry.fiber
  await fiber.await()
  const complete = (id, header = {}) => {
    const agent = { session: { id, header } }
    fiber.ctx.emit('agent/status', { agent, status: 'running' })
    fiber.ctx.emit('session/event', agent.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    fiber.ctx.emit('agent/status', { agent, status: 'idle' })
  }
  const select = async (taskbar, popup) => {
    await entry.update({ config: { taskbar: { enabled: taskbar }, popup: { enabled: popup } } })
  }
  complete('neither'); await flush()
  await select(true, false)
  complete('taskbar'); complete('child', { origin: 'subagent' }); await flush()
  await select(false, true)
  complete('popup'); await flush()
  await select(false, false)
  await select(true, true)
  complete('both'); await flush()
  assert.deepEqual(calls, ['taskbar:taskbar', 'popup:popup', 'taskbar:both', 'popup:both'])
  assert.ok(stops.length > 0)
  assert.equal(mounts, 1)
  assert.equal(entry.fiber, fiber)
})
