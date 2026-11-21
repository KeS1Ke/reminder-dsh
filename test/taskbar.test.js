import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawnSync } from 'node:child_process'
import { createTaskbarNotifier } from '../src/modules/taskbar/windows.js'
import { Config, createTaskbarModule } from '../src/modules/taskbar/index.js'
import { resolveHelperBinary } from '../src/native-helper.js'

function rig() {
  const calls = []
  let enabled = true
  const notifier = createTaskbarNotifier({ isEnabled: () => enabled, getWindowTitle: () => 'DSH " $() 中文' }, (exe, args, options) => {
    const child = new EventEmitter()
    child.stdin = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close', null)) }
    calls.push({ exe, args, options, child })
    return child
  })
  return {
    calls, notifier,
    get child() { return calls.at(-1).child },
    launches: () => calls.length,
    invocation: () => { const { exe, args, options } = calls.at(-1); return [exe, args, options] },
    disable: () => { enabled = false },
  }
}

test('taskbar badges use the native helper with the target window and increment the unread count', async () => {
  const h = rig()
  const first = h.notifier.notify()
  assert.match(h.invocation()[0], /dsh-reminder-helper\.exe$/)
  assert.deepEqual(h.invocation()[1], ['taskbar-badge'])
  assert.equal(h.invocation()[2].shell, false)
  assert.deepEqual(JSON.parse(h.child.stdin.read()), {
    hostPid: process.pid, windowTitle: 'DSH " $() 中文', count: 1, maxMinutes: 120,
  })
  const second = h.notifier.notify()
  assert.equal(h.launches(), 1)
  assert.deepEqual(JSON.parse(h.child.stdin.read()), { type: 'set', count: 2 })
  h.child.emit('close', 0)
  await Promise.all([first, second])
})

test('a helper that closes on focus resets the next badge to one', async () => {
  const h = rig()
  const first = h.notifier.notify()
  h.child.stdin.read()
  h.child.emit('close', 0)
  await first
  const second = h.notifier.notify()
  assert.equal(h.launches(), 2)
  assert.equal(JSON.parse(h.child.stdin.read()).count, 1)
  h.child.emit('close', 0)
  await second
})

test('disabling requests graceful native cleanup instead of immediately killing the helper', async () => {
  const h = rig(), pending = h.notifier.notify()
  h.child.stdin.read()
  h.disable()
  h.notifier.stop()
  assert.deepEqual(JSON.parse(h.child.stdin.read()), { type: 'stop' })
  assert.notEqual(h.child.killed, true)
  await h.notifier.notify()
  assert.equal(h.launches(), 1)
  h.child.emit('close', 0)
  await pending
})

test('one disposed main session does not cancel another main session taskbar reminder', async () => {
  const h = rig(), a = new AbortController(), b = new AbortController()
  const first = h.notifier.notify({ signal: a.signal })
  const second = h.notifier.notify({ signal: b.signal })
  h.child.stdin.read()
  a.abort()
  await first
  assert.equal(h.child.stdin.read(), null)
  b.abort()
  await second
  assert.deepEqual(JSON.parse(h.child.stdin.read()), { type: 'stop' })
  h.child.emit('close', 0)
})

test('taskbar spawn and target lookup failures are reported', async () => {
  const h = rig(), pending = h.notifier.notify()
  h.child.stderr.write('未找到 DSH 窗口')
  h.child.emit('close', 1)
  await assert.rejects(pending, /未找到 DSH 窗口/)
  const missing = rig(), result = missing.notifier.notify()
  missing.child.emit('error', Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
  await assert.rejects(result, /任务栏辅助程序/)
})

test('taskbar early exit with stderr preserves the real failure when stdin hits EPIPE, and clean exit ignores EPIPE', async () => {
  const h = rig(), first = h.notifier.notify()
  h.child.stderr.write('未找到 DSH 窗口')
  h.child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
  h.child.emit('close', 1)
  await assert.rejects(first, /未找到 DSH 窗口/)

  const clean = rig(), second = clean.notifier.notify()
  clean.child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
  clean.child.emit('close', 0)
  await second
})

test('taskbar disabled by default does not start a process', async () => {
  let calls = 0
  const module = createTaskbarModule(Config({}), { notify: () => { calls++ }, stop() {}, dispose() {} })
  await module.notify({})
  assert.equal(calls, 0)
})

test('concurrent taskbar notifications share a single async helper download and emit count 1 then 2', async () => {
  const calls = []
  let ensureCalls = 0, releaseEnsure
  const notifier = createTaskbarNotifier(
    { isEnabled: () => true, getWindowTitle: () => 'DSH' },
    exe => {
      const child = new EventEmitter()
      child.stdin = new PassThrough()
      child.stderr = new PassThrough()
      child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close', null)) }
      calls.push({ exe, child })
      return child
    },
    {
      resolve: () => undefined,
      ensure: () => {
        ensureCalls += 1
        return new Promise(resolve => { releaseEnsure = resolve })
      },
    },
  )

  const first = notifier.notify()
  const second = notifier.notify()
  assert.equal(ensureCalls, 1)
  releaseEnsure('C:\\fake\\dsh-reminder-helper.exe')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(ensureCalls, 1)
  assert.equal(calls.length, 1)
  const sent = calls[0].child.stdin.read().toString('utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(sent, [
    { hostPid: process.pid, windowTitle: 'DSH', count: 1, maxMinutes: 120 },
    { type: 'set', count: 2 },
  ])
  calls[0].child.emit('close', 0)
  await Promise.all([first, second])

  let ensureFailCalls = 0, rejectEnsure
  const failing = createTaskbarNotifier(
    { isEnabled: () => true, getWindowTitle: () => 'DSH' },
    () => { throw new Error('should not launch') },
    {
      resolve: () => undefined,
      ensure: () => {
        ensureFailCalls += 1
        return new Promise((_, reject) => { rejectEnsure = reject })
      },
    },
  )
  const unhandled = []
  const onUnhandled = reason => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  try {
    const a = failing.notify()
    const b = failing.notify()
    assert.equal(ensureFailCalls, 1)
    rejectEnsure(new Error('download boom'))
    const results = await Promise.allSettled([a, b])
    assert.equal(results[0].status, 'rejected')
    assert.equal(results[1].status, 'rejected')
    assert.match(results[0].reason.message, /download boom/)
    assert.match(results[1].reason.message, /download boom/)
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(unhandled, [])
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})

test('badge startup keeps queued count updates', { skip: process.platform !== 'win32' }, () => {
  const helper = resolveHelperBinary()
  assert.ok(helper, 'expected compiled or packaged dsh-reminder-helper.exe on Windows')
  const result = spawnSync(helper, ['--drain-self-test'], {
    encoding: 'utf8', timeout: 15000, windowsHide: true,
  })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
})

test('taskbar Win32 badge helper initializes GDI+ and COM on Windows', { skip: process.platform !== 'win32' }, () => {
  const helper = resolveHelperBinary()
  assert.ok(helper, 'expected compiled or packaged dsh-reminder-helper.exe on Windows')
  const result = spawnSync(helper, ['--validate-taskbar'], {
    encoding: 'utf8', timeout: 30000, windowsHide: true,
  })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
})
