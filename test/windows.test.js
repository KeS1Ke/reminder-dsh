import test from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { spawnSync } from 'node:child_process'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'
import { createWindowsToast } from '../src/modules/popup/toast.js'
import { createToastReplies } from '../src/modules/popup/reply.js'

const config = { title: '中文 " $() ` 标题', message: "任务完成 & <已就绪> 🐋\n'hello'" }
function fakeLaunch() {
  const stdin = new PassThrough()
  let invocation, finish
  const child = { stdin, killed: false, kill() { this.killed = true } }
  return { child, stdin, get invocation() { return invocation }, finish: (...args) => finish(...args),
    launch(exe, args, options, callback) {
      invocation = { exe, args, options }
      finish = callback
      return child
    },
  }
}

test('the toast child receives UTF-8 JSON with no session data or shell interpolation', async () => {
  const fake = fakeLaunch()
  const result = createWindowsToast(config, fake.launch).notify({
    sessionId: 'private-session', message: '摘要：' + config.message,
  })
  assert.deepEqual(JSON.parse(fake.stdin.read().toString('utf8')), { ...config, message: '摘要：' + config.message })
  const { exe, args, options } = fake.invocation
  assert.match(exe, /\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/)
  assert.match(args.at(-1), /toast\.ps1$/)
  assert.equal(args.includes(config.title), false)
  assert.equal(options.windowsHide, true)
  assert.equal(options.timeout, 15_000)
  fake.finish(null, '', '')
  await result
})

test('toast process failures report stderr or the launch error', async () => {
  for (const stderr of ['', 'Windows desktop unavailable']) {
    const fake = fakeLaunch()
    const result = createWindowsToast(config, fake.launch).notify()
    fake.finish(new Error('spawn failed'), '', stderr)
    await assert.rejects(result, { message: stderr || 'spawn failed' })
  }
})

test('the activator can relaunch Desktop from an Electron Host running as Node', { timeout: 5_000 }, async t => {
  const previous = process.env.ELECTRON_RUN_AS_NODE
  process.env.ELECTRON_RUN_AS_NODE = '1'
  t.after(() => {
    if (previous === undefined) delete process.env.ELECTRON_RUN_AS_NODE
    else process.env.ELECTRON_RUN_AS_NODE = previous
  })
  const stopped = new Error('test activator stopped before launch')
  let environment
  const notifier = createWindowsToast(config, () => assert.fail('unexpected toast submission'), (_exe, _args, options) => {
    environment = options.env
    throw stopped
  })
  t.after(() => notifier.dispose())
  await assert.rejects(notifier.notify({ onOpen() {} }), stopped)
  assert.equal(environment.ELECTRON_RUN_AS_NODE, undefined)
  assert.equal(environment.SystemRoot, process.env.SystemRoot)
  assert.equal(process.env.ELECTRON_RUN_AS_NODE, '1')
})

for (const cancel of ['session', 'plugin']) {
  test(`${cancel} cancellation aborts the child and prevents another launch`, async () => {
    const fake = fakeLaunch(), controller = new AbortController()
    const notifier = createWindowsToast(config, fake.launch)
    let finished = false
    const result = notifier.notify({ signal: controller.signal }).then(() => { finished = true })
    if (cancel === 'session') controller.abort()
    else notifier.dispose()
    const invocation = fake.invocation
    assert.equal(fake.child.killed, true)
    await Promise.resolve()
    assert.equal(finished, false)
    fake.finish(new Error('aborted'), '', '')
    await result
    await notifier.notify({ signal: controller.signal })
    assert.equal(fake.invocation, invocation)
  })
}

test('Windows builds a full-width toast and links the native Send button to the reply input', { skip: process.platform !== 'win32' }, () => {
  const script = fileURLToPath(new URL('../src/modules/popup/toast.ps1', import.meta.url))
  const input = { ...config, reply: 'test-route', replyPlaceholder: '回复 DSH', replyLabel: '发送' }
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ValidateOnly',
  ], { input: JSON.stringify(input) + '\n', encoding: 'utf8', timeout: 15_000, windowsHide: true })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  assert.match(result.stdout, /<binding template="ToastGeneric">/)
  assert.ok(result.stdout.includes(`<text hint-maxLines="1">${config.title}</text>`))
  assert.ok(result.stdout.includes('<text hint-maxLines="3">任务完成 &amp; &lt;已就绪&gt; 🐋'))
  if (result.stdout.includes('launch="dsh://open"')) assert.doesNotMatch(result.stdout, /<image\b/)
  else assert.match(result.stdout, /<image placement="appLogoOverride" src="file:\/\/\/[^" ]*\/deepseek-harness\.png"/)
  assert.match(result.stdout, /<input id="reply" type="text" placeHolderContent="回复 DSH"/)
  assert.match(result.stdout, /<action content="发送" arguments="test-route" activationType="background" hint-inputId="reply"/)
})

test('Windows shows only the session title when the summary is hidden', { skip: process.platform !== 'win32' }, () => {
  const script = fileURLToPath(new URL('../src/modules/popup/toast.ps1', import.meta.url))
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ValidateOnly',
  ], { input: JSON.stringify({ title: '会话标题 & <测试>', message: '' }) + '\n', encoding: 'utf8', timeout: 15_000, windowsHide: true })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  assert.ok(result.stdout.includes('<text hint-maxLines="1">会话标题 &amp; &lt;测试&gt;</text>'))
  assert.equal((result.stdout.match(/<text\b/g) ?? []).length, 1)
})

test('Windows sends the session route to the toast activator and keeps approval actions separate', { skip: process.platform !== 'win32' }, () => {
  const script = fileURLToPath(new URL('../src/modules/popup/toast.ps1', import.meta.url))
  const pipe = 'a'.repeat(32), token = 'b'.repeat(32)
  const route = `${pipe}:${token}:open`
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ValidateOnly',
  ], { input: JSON.stringify({ title: '会话标题', message: '', open: route, approval: [{ label: '允许', argument: 'allow-route' }] }) + '\n', encoding: 'utf8', timeout: 15_000, windowsHide: true })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  assert.ok(result.stdout.includes(`<toast activationType="background" launch="${route}">`))
  assert.match(result.stdout, /<action content="允许" arguments="allow-route" activationType="background"/)
  assert.doesNotMatch(result.stdout, /dsh:\/\/open/)
})

test('toast body activation routes every click to the captured session', { skip: process.platform !== 'win32' }, async t => {
  const replies = createToastReplies()
  t.after(() => replies.dispose())
  const opened = []
  const route = await replies.registerOpen(() => { opened.push('open') })
  assert.match(route.argument, /^[a-f0-9]{32}:[a-f0-9]{32}:open$/)
  const [pipeId, token] = route.argument.split(':')

  function click() {
    return new Promise((resolve, reject) => {
      const socket = createConnection(`\\\\.\\pipe\\kesike-dsh-reply-${pipeId}`)
      let acknowledgment = ''
      socket.setTimeout(2000, () => socket.destroy(new Error('Body-click acknowledgment timed out')))
      socket.setEncoding('ascii').on('data', chunk => { acknowledgment += chunk })
      socket.on('error', reject).on('end', () => resolve(acknowledgment.trim()))
      socket.on('connect', () => socket.write(`${token}\n`))
    })
  }

  assert.equal(await click(), 'ok')
  assert.equal(await click(), 'ok')
  assert.deepEqual(opened, ['open', 'open'])
  route.release()
  assert.equal(await click(), 'failed')
})

test('the toast activator C# compiles under Windows PowerShell', { skip: process.platform !== 'win32' }, () => {
  const path = fileURLToPath(new URL('../src/modules/popup/ToastActivator.cs', import.meta.url))
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    `Add-Type -Path '${path.replace(/'/g, "''")}'`], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
})

test('Windows renders distinct native approval actions without a text input', { skip: process.platform !== 'win32' }, () => {
  const script = fileURLToPath(new URL('../src/modules/popup/toast.ps1', import.meta.url))
  const input = { ...config, approval: [{ label: '允许', argument: 'allow-route' }, { label: '拒绝', argument: 'reject-route' }] }
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ValidateOnly',
  ], { input: JSON.stringify(input) + '\n', encoding: 'utf8', timeout: 15_000, windowsHide: true })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  assert.match(result.stdout, /<action content="允许" arguments="allow-route" activationType="background"/)
  assert.match(result.stdout, /<action content="拒绝" arguments="reject-route" activationType="background"/)
  assert.doesNotMatch(result.stdout, /<input\b/)
})

test('local reply routes isolate sessions, reject empty text and acknowledge duplicate activations once', { skip: process.platform !== 'win32' }, async t => {
  const replies = createToastReplies(), received = []
  t.after(() => replies.dispose())
  const first = await replies.register(text => received.push(['first', text]))
  const second = await replies.register(text => received.push(['second', text]))

  function send(route, text) {
    const [pipeId, token] = route.argument.split(':')
    return new Promise((resolve, reject) => {
      const socket = createConnection(`\\\\.\\pipe\\kesike-dsh-reply-${pipeId}`)
      let acknowledgment = ''
      socket.setTimeout(2000, () => socket.destroy(new Error('Reply acknowledgment timed out')))
      socket.setEncoding('ascii').on('data', chunk => { acknowledgment += chunk })
      socket.on('error', reject).on('end', () => resolve(acknowledgment.trim()))
      socket.on('connect', () => socket.write(`${token} ${Buffer.from(text).toString('base64')}\n`))
    })
  }

  assert.equal(await send(first, ' '), 'failed')
  assert.equal(await send(second, '第二个会话 🐋'), 'ok')
  assert.deepEqual(await Promise.all([send(first, '请继续'), send(first, '请继续')]), ['ok', 'ok'])
  assert.deepEqual(received, [['second', '第二个会话 🐋'], ['first', '请继续']])
  second.release()
  assert.equal(await send(second, '已经失效'), 'failed')
})
