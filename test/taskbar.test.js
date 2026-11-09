import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createTaskbarNotifier } from '../src/modules/taskbar/windows.js'
import { Config, createTaskbarModule } from '../src/modules/taskbar/index.js'

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

test('taskbar badges use pwsh with the target window and increment the unread count', async () => {
  const h = rig()
  const first = h.notifier.notify()
  assert.equal(h.invocation()[0], 'pwsh.exe')
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
  await assert.rejects(result, /PowerShell 7/)
})

test('taskbar disabled by default does not start a process', async () => {
  let calls = 0
  const module = createTaskbarModule(Config({}), { notify: () => { calls++ }, stop() {}, dispose() {} })
  await module.notify({})
  assert.equal(calls, 0)
})

test('taskbar Win32 badge helper compiles under pwsh on Windows', { skip: process.platform !== 'win32' }, () => {
  const path = fileURLToPath(new URL('../src/modules/taskbar/badge.ps1', import.meta.url))
  const result = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-File', path, '-ValidateOnly'], {
    encoding: 'utf8', timeout: 30000, windowsHide: true,
  })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
})
