import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createWindowsNotifier } from '../src/modules/popup/windows.js'

const config = { title: '中文 " $() ` 标题', message: "任务完成\n'hello'", durationSeconds: 1 }
function fakeLaunch() {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close', null)) }
  let invocation
  return { child, get invocation() { return invocation }, launch: (...args) => {
    invocation = args
    return child
  } }
}

test('Unicode and shell metacharacters are JSON data, never commands', async () => {
  const fake = fakeLaunch()
  const result = createWindowsNotifier(config, fake.launch).notify()
  assert.deepEqual(JSON.parse(fake.child.stdin.read().toString('utf8')), { ...config, sessionId: '', canReply: false })
  const [exe, args, options] = fake.invocation
  assert.equal(exe, 'pwsh.exe')
  assert.equal(args.includes('-STA'), true)
  assert.equal(options.shell, false)
  assert.equal(options.windowsHide, true)
  assert.equal(args.includes(config.title), false)
  fake.child.emit('close', 0)
  await result
})

test('spawn errors and failed exits are reported', async () => {
  for (const failure of ['error', 'exit']) {
    const fake = fakeLaunch()
    const result = createWindowsNotifier(config, fake.launch).notify()
    if (failure === 'error') fake.child.emit('error', new Error('ENOENT'))
    else { fake.child.stderr.write('desktop unavailable'); fake.child.emit('close', 1) }
    await assert.rejects(result, failure === 'error' ? /ENOENT/ : /desktop unavailable/)
  }
})

test('unload kills active popups', async () => {
  const fake = fakeLaunch(), notifier = createWindowsNotifier(config, fake.launch)
  const result = notifier.notify()
  notifier.dispose()
  assert.equal(fake.child.killed, true)
  await result
  await notifier.notify()
})

test('missing pwsh reports how to install it without falling back to Windows PowerShell', async () => {
  const fake = fakeLaunch()
  const result = createWindowsNotifier(config, fake.launch).notify()
  fake.child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))
  await assert.rejects(result, /安装 PowerShell 7.*PATH/)
})

test('hung PowerShell is killed at its deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = fakeLaunch(), result = createWindowsNotifier(config, fake.launch).notify()
  const rejected = assert.rejects(result, /超时/)
  t.mock.timers.tick(16_000)
  assert.equal(fake.child.killed, true)
  await rejected
})

test('PowerShell script parses on Windows', { skip: process.platform !== 'win32' }, () => {
  const script = fileURLToPath(new URL('../src/modules/popup/popup.ps1', import.meta.url))
  const check = '$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile($env:DSH_POPUP_SCRIPT,[ref]$tokens,[ref]$errors) | Out-Null; if ($errors.Count) { Write-Error ($errors | Out-String); exit 1 }'
  const result = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', check], {
    env: { ...process.env, DSH_POPUP_SCRIPT: script }, encoding: 'utf8', timeout: 15000,
  })
  assert.equal(result.status, 0, result.stderr)
})

test('pwsh creates the WPF window and loads the bundled whale icon', { skip: process.platform !== 'win32' }, () => {
  const script = fileURLToPath(new URL('../src/modules/popup/popup.ps1', import.meta.url))
  const result = spawnSync('pwsh.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass',
    '-File', script, '-ValidateOnly',
  ], { input: JSON.stringify({ ...config, sessionId: 'test-session', canReply: true }) + '\n', encoding: 'utf8', timeout: 30000, windowsHide: true })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
})

test('reply is acknowledged only after acceptance and duplicate clicks submit once', async () => {
  const fake = fakeLaunch(), texts = []
  let accept
  const waiting = new Promise(resolve => { accept = resolve })
  const notifier = createWindowsNotifier(config, fake.launch)
  const result = notifier.notify({ sessionId: 'main-1', onReply: async text => { texts.push(text); await waiting } })
  assert.equal(JSON.parse(fake.child.stdin.read()).sessionId, 'main-1')
  fake.child.stdout.write('{"type":"ready"}\n')
  fake.child.stdout.write(JSON.stringify({ type: 'reply', text: '继续处理\n第二行' }) + '\n')
  fake.child.stdout.write('{"type":"reply","text":"duplicate"}\n')
  assert.equal(fake.child.stdin.read(), null)
  assert.deepEqual(texts, ['继续处理\n第二行'])
  accept()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(JSON.parse(fake.child.stdin.read()), { ok: true })
  fake.child.stdout.write('{"type":"reply","text":"duplicate"}\n')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(texts.length, 1)
  assert.deepEqual(JSON.parse(fake.child.stdin.read()), { ok: true })
  fake.child.emit('close', 0)
  await result
})

test('failed delivery returns an error without closing the popup', async () => {
  const fake = fakeLaunch()
  const result = createWindowsNotifier(config, fake.launch).notify({ onReply: () => { throw new Error('会话已关闭') } })
  fake.child.stdin.read()
  fake.child.stdout.write('{"type":"reply","text":"hello"}\n')
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(JSON.parse(fake.child.stdin.read()), { ok: false, error: '会话已关闭' })
  assert.notEqual(fake.child.killed, true)
  fake.child.emit('close', 0)
  await result
})

test('ready popup stays alive while editing beyond the original auto-close timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = fakeLaunch()
  const result = createWindowsNotifier(config, fake.launch).notify()
  fake.child.stdout.write('{"type":"ready"}\n')
  t.mock.timers.tick(120_000)
  assert.notEqual(fake.child.killed, true)
  fake.child.emit('close', 0)
  await result
})

test('malformed protocol output fails without submitting a reply', async () => {
  const fake = fakeLaunch()
  let called = false
  const result = createWindowsNotifier(config, fake.launch).notify({ onReply: () => { called = true } })
  fake.child.stdout.write('invalid JSON\n')
  await assert.rejects(result)
  assert.equal(called, false)
  assert.equal(fake.child.killed, true)
})

test('per-session summary text overrides the fallback and disposal closes the popup', async () => {
  const fake = fakeLaunch(), controller = new AbortController()
  const result = createWindowsNotifier(config, fake.launch).notify({
    message: '已完成按钮布局和任务总结。', signal: controller.signal,
  })
  assert.equal(JSON.parse(fake.child.stdin.read()).message, '已完成按钮布局和任务总结。')
  controller.abort()
  await result
  assert.equal(fake.child.killed, true)
})

test('interval updates reach an open popup and become the next popup default', async () => {
  const fake = fakeLaunch()
  const notifier = createWindowsNotifier(config, fake.launch)
  const result = notifier.notify()
  fake.child.stdin.read()
  notifier.setDurationSeconds(25)
  assert.deepEqual(JSON.parse(fake.child.stdin.read()), { type: 'config', durationSeconds: 25 })
  fake.child.emit('close', 0)
  await result
})

test('aborting a popup does not release its slot before the child process actually exits', async () => {
  const fake = fakeLaunch(), controller = new AbortController()
  fake.child.kill = () => { fake.child.killed = true }
  let closed = false
  const result = createWindowsNotifier(config, fake.launch).notify({ signal: controller.signal }).then(() => { closed = true })
  controller.abort()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(fake.child.killed, true)
  assert.equal(closed, false)
  fake.child.emit('close', null)
  await result
  assert.equal(closed, true)
})

test('a real Windows popup applies a shorter interval while visible', { skip: process.platform !== 'win32', timeout: 25000 }, async t => {
  const notifier = createWindowsNotifier({ ...config, durationSeconds: 10 })
  t.after(() => notifier.dispose())
  let readyAt
  await notifier.notify({ onReady: () => {
    readyAt = Date.now()
    notifier.setDurationSeconds(1)
  } })
  assert.equal(typeof readyAt, 'number')
  assert.ok(Date.now() - readyAt < 8000, 'The original ten-second timeout should be replaced')
})
