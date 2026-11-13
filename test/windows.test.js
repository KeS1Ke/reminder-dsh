import test from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { EventEmitter } from 'node:events'
import { spawnSync } from 'node:child_process'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'
import { createWindowsToast } from '../src/modules/popup/toast.js'
import { createToastReplies } from '../src/modules/popup/reply.js'

const config = { title: '中文 " $() ` 标题', message: "任务完成 & <已就绪> 🐋\n'hello'" }
function fakeHost({ fail } = {}) {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  let buffer = ''
  const payloads = []
  const child = Object.assign(new EventEmitter(), {
    stdin, stdout, stderr, killed: false,
    kill() { this.killed = true; this.emit('close', 0) },
    unref() {},
  })
  let invocation, launches = 0
  return { child, stdin, payloads, get invocation() { return invocation }, get launches() { return launches },
    launch(exe, args, options) {
      invocation = { exe, args, options }
      launches += 1
      process.nextTick(() => stdout.write('ready\n'))
      stdin.on('data', chunk => {
        buffer += chunk.toString('utf8')
        let index
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index)
          buffer = buffer.slice(index + 1)
          if (!line.startsWith('{')) continue
          payloads.push(JSON.parse(line))
          stdout.write(fail ? `error ${fail}\n` : 'ok\n')
        }
      })
      return child
    },
  }
}

test('the toast host receives UTF-8 JSON with no session data or shell interpolation', async () => {
  const fake = fakeHost()
  const notifier = createWindowsToast(config, fake.launch)
  const result = notifier.notify({ sessionId: 'private-session', message: '摘要：' + config.message })
  while (fake.payloads.length < 1) await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(fake.payloads[0], {
    title: config.title, message: '摘要：' + config.message, appId: 'KeS1Ke.DSH',
  })
  const { exe, args, options } = fake.invocation
  assert.match(exe, /\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/)
  assert.match(args.at(-2), /toast\.ps1$/)
  assert.equal(args.at(-1), '-HostMode')
  assert.equal(args.includes(config.title), false)
  assert.equal(options.windowsHide, true)
  assert.equal(options.timeout, undefined)
  await result
  notifier.dispose()
})

test('toast host failures report the host error line or the launch error', async () => {
  const fake = fakeHost({ fail: 'Windows desktop unavailable' })
  await assert.rejects(createWindowsToast(config, fake.launch).notify(), { message: 'Windows desktop unavailable' })
  await assert.rejects(createWindowsToast(config, () => { throw new Error('spawn failed') }).notify(), { message: 'spawn failed' })
})

test('the toast host can relaunch Desktop from an Electron Host running as Node', { timeout: 5_000 }, async t => {
  const previous = process.env.ELECTRON_RUN_AS_NODE
  process.env.ELECTRON_RUN_AS_NODE = '1'
  t.after(() => {
    if (previous === undefined) delete process.env.ELECTRON_RUN_AS_NODE
    else process.env.ELECTRON_RUN_AS_NODE = previous
  })
  const stopped = new Error('test host stopped before launch')
  let environment
  const notifier = createWindowsToast(config, (_exe, _args, options) => {
    environment = options.env
    throw stopped
  })
  t.after(() => notifier.dispose())
  await assert.rejects(notifier.notify({ onOpen() {} }), stopped)
  assert.equal(environment.ELECTRON_RUN_AS_NODE, undefined)
  assert.equal(environment.SystemRoot, process.env.SystemRoot)
  assert.equal(process.env.ELECTRON_RUN_AS_NODE, '1')
})

test('disposing the plugin stops the toast host and does not start another for a cancelled notify', async () => {
  const fake = fakeHost(), controller = new AbortController()
  const notifier = createWindowsToast(config, fake.launch)
  const result = notifier.notify({ signal: controller.signal })
  notifier.dispose()
  await result
  assert.equal(fake.child.killed, true)
  await notifier.notify({ signal: controller.signal })
  assert.equal(fake.launches, 1)
})

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
  assert.doesNotMatch(result.stdout, /<audio\b/)
})

test('a plugin sound silences the Windows toast sound without putting the file in the toast', { skip: process.platform !== 'win32' }, () => {
  const script = fileURLToPath(new URL('../src/modules/popup/toast.ps1', import.meta.url))
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ValidateOnly',
  ], { input: JSON.stringify({ title: '会话标题', message: '正文', sound: 'C:\\sounds\\ding.wav', appId: 'KeS1Ke.DSH.2' }) + '\n', encoding: 'utf8', timeout: 15_000, windowsHide: true })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  assert.match(result.stdout, /<audio silent="true"/)
  assert.doesNotMatch(result.stdout, /C:\\sounds/)
})

test('an unexpected notification identity is rejected before a toast is built', { skip: process.platform !== 'win32' }, () => {
  const script = fileURLToPath(new URL('../src/modules/popup/toast.ps1', import.meta.url))
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ValidateOnly',
  ], { input: JSON.stringify({ title: '会话标题', message: '', appId: 'Other.App' }) + '\n', encoding: 'utf8', timeout: 15_000, windowsHide: true })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Unexpected notification identity/)
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

test('Enter sends a toast reply and Shift+Enter keeps the newline', { skip: process.platform !== 'win32' }, () => {
  const path = fileURLToPath(new URL('../src/modules/popup/ToastActivator.cs', import.meta.url))
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    `Add-Type -Path '${path.replace(/'/g, "''")}'; ` +
    `[DshReminder.ReplyKeys]::ShouldSend($false,$false,$false,$true); ` +
    `[DshReminder.ReplyKeys]::ShouldSend($true,$false,$false,$true); ` +
    `[DshReminder.ReplyKeys]::ShouldSend($false,$true,$false,$true); ` +
    `[DshReminder.ReplyKeys]::ShouldSend($false,$false,$true,$true); ` +
    `[DshReminder.ReplyKeys]::ShouldSend($false,$false,$false,$false)`],
  { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  const lines = result.stdout.replace(/^\uFEFF/, '').trim().split(/\r?\n/)
  assert.deepEqual(lines, ['True', 'False', 'False', 'False', 'False'])
})

test('a reply toast arms Enter-to-send and releases it with the route', async () => {
  const chunks = []
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  for (const stream of [stdin, stdout, stderr]) stream.unref = () => {}
  stdin.on('data', chunk => chunks.push(Buffer.from(chunk)))
  const notifier = createWindowsToast(config, () => {
    const child = new EventEmitter()
    Object.assign(child, { stdin, stdout, stderr, kill() { this.killed = true; this.emit('close', 0) }, unref() {} })
    process.nextTick(() => stdout.write('ready\n'))
    stdin.on('data', chunk => {
      if (chunk.toString('utf8').includes('{')) stdout.write('ok\n')
    })
    return child
  })
  const pending = notifier.notify({ onReply() {} })
  while (!Buffer.concat(chunks).toString().includes('{')) await new Promise(resolve => setImmediate(resolve))
  assert.match(Buffer.concat(chunks).toString(), /^reply-keys\n\{/)
  await pending
  notifier.dispose()
  assert.match(Buffer.concat(chunks).toString(), /reply-keys-off\n$/)
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

test('a toast cancelled while another toast is in flight is not shown', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const payloads = []
  let written = ''
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const child = Object.assign(new EventEmitter(), {
    stdin, stdout, stderr,
    kill() { this.killed = true; this.emit('close', 0) },
  })
  let buffer = ''
  stdin.on('data', chunk => {
    written += chunk.toString('utf8')
    buffer += chunk.toString('utf8')
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      if (!line.startsWith('{')) continue
      payloads.push(JSON.parse(line))
      if (payloads.length === 1) gate.then(() => stdout.write('ok\n'))
      else stdout.write('ok\n')
    }
  })
  const notifier = createWindowsToast(config, () => {
    process.nextTick(() => stdout.write('ready\n'))
    return child
  })
  const first = notifier.notify({ message: 'keep' })
  while (payloads.length < 1) await new Promise(resolve => setImmediate(resolve))
  const controller = new AbortController()
  const second = notifier.notify({ message: 'drop', signal: controller.signal, onReply() {} })
  for (let step = 0; step < 10; step++) await new Promise(resolve => setImmediate(resolve))
  controller.abort()
  release()
  await first
  await second
  assert.deepEqual(payloads.map(item => item.message), ['keep'])
  assert.equal(written.includes('reply-keys'), false)
  notifier.dispose()
})

test('a toast host that exits before the banner is sent is started again', async () => {
  const payloads = []
  let launches = 0
  const notifier = createWindowsToast(config, () => {
    const generation = ++launches
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const child = Object.assign(new EventEmitter(), {
      stdin, stdout, stderr,
      kill() { this.killed = true; this.emit('close', 0) },
    })
    let buffer = ''
    stdin.on('data', chunk => {
      buffer += chunk.toString('utf8')
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        if (!line.startsWith('{')) continue
        payloads.push(JSON.parse(line))
        stdout.write('ok\n')
      }
    })
    process.nextTick(() => {
      stdout.write('ready\n')
      if (generation === 1) child.emit('close', 0)
    })
    return child
  })
  await notifier.notify({ message: 'after-restart' })
  assert.equal(launches, 2)
  assert.deepEqual(payloads.map(item => item.message), ['after-restart'])
  notifier.dispose()
})

test('a host that fails to start can be replaced', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let launches = 0
  const notifier = createWindowsToast(config, () => {
    launches += 1
    return Object.assign(new EventEmitter(), {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
      kill() { this.killed = true },
    })
  })
  const first = notifier.notify()
  t.mock.timers.tick(15_000)
  await assert.rejects(first, /启动超时/)
  const second = notifier.notify()
  t.mock.timers.tick(15_000)
  await assert.rejects(second, /启动超时/)
  assert.equal(launches, 2)
  notifier.dispose()
})

test('a launch error does not stick the failed host', async () => {
  let launches = 0
  const notifier = createWindowsToast(config, () => {
    launches += 1
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
      kill() { this.killed = true },
    })
    process.nextTick(() => child.emit('error', new Error(`down-${launches}`)))
    return child
  })
  await assert.rejects(notifier.notify(), /down-1/)
  await assert.rejects(notifier.notify(), /down-2/)
  assert.equal(launches, 2)
  notifier.dispose()
})

test('a failed toast write does not consume the next toast result', async () => {
  const payloads = []
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  let failed = false
  const original = stdin.write.bind(stdin)
  stdin.write = (chunk, encoding, cb) => {
    if (!failed && String(chunk).startsWith('{')) {
      failed = true
      cb(new Error('EPIPE'))
      return true
    }
    return original(chunk, encoding, cb)
  }
  let buffer = ''
  stdin.on('data', chunk => {
    buffer += chunk.toString('utf8')
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      if (!line.startsWith('{')) continue
      payloads.push(JSON.parse(line))
      stdout.write('ok\n')
    }
  })
  const child = Object.assign(new EventEmitter(), {
    stdin, stdout, stderr,
    kill() { this.killed = true },
  })
  const notifier = createWindowsToast(config, () => {
    process.nextTick(() => stdout.write('ready\n'))
    return child
  })
  await assert.rejects(notifier.notify({ message: 'lost' }), /EPIPE/)
  await notifier.notify({ message: 'kept' })
  assert.equal(child.killed, true)
  assert.deepEqual(payloads.map(item => item.message), ['kept'])
  notifier.dispose()
})

test('releasing a reply route disarms the host that showed it', async () => {
  const logs = []
  const children = []
  const notifier = createWindowsToast(config, () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const child = Object.assign(new EventEmitter(), {
      stdin, stdout, stderr,
      kill() { this.killed = true; this.emit('close', 0) },
    })
    const index = children.length
    logs[index] = ''
    children.push(child)
    stdin.on('data', chunk => {
      logs[index] += chunk.toString('utf8')
      if (chunk.toString('utf8').includes('{')) stdout.write('ok\n')
    })
    process.nextTick(() => stdout.write('ready\n'))
    return child
  })
  await notifier.notify({ onReply() {} })
  assert.match(logs[0], /^reply-keys\n\{/)
  children[0].emit('close', 0)
  await notifier.notify({ message: 'plain' })
  assert.equal(children.length, 2)
  assert.equal(logs[1].includes('reply-keys'), false)
  notifier.dispose()
  assert.match(logs[0], /reply-keys-off\n/)
  assert.equal(logs[1].includes('reply-keys-off'), false)
})

test('reply text tracking counts typing and paste without treating deletion as new text', { skip: process.platform !== 'win32' }, () => {
  const path = fileURLToPath(new URL('../src/modules/popup/ToastActivator.cs', import.meta.url))
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    `Add-Type -Path '${path.replace(/'/g, "''")}'; ` +
    `$u = [DshReminder.ReplyKeys]::NoteInput(0, 0x41, $false); ` +
    `$u = [DshReminder.ReplyKeys]::NoteInput($u, 0x08, $false); ` +
    `Write-Output $u; ` +
    `Write-Output ([DshReminder.ReplyKeys]::NoteInput(0, 0x08, $false)); ` +
    `Write-Output ([DshReminder.ReplyKeys]::NoteInput(0, 0x56, $true)); ` +
    `Write-Output ([DshReminder.ReplyKeys]::PassEnterToIme($true, $true, $false)); ` +
    `Write-Output ([DshReminder.ReplyKeys]::PassEnterToIme($true, $false, $false)); ` +
    `Write-Output ([DshReminder.ReplyKeys]::PassEnterToIme($false, $false, $true)); ` +
    `Write-Output ([DshReminder.ReplyKeys]::NoteCommit($true, 0x20, $false)); ` +
    `Write-Output ([DshReminder.ReplyKeys]::NoteCommit($false, 0x41, $false))`],
  { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  const lines = result.stdout.replace(/^\uFEFF/, '').trim().split(/\r?\n/)
  assert.deepEqual(lines, ['0', '0', '1', 'True', 'False', 'True', 'False', 'True'])
})

test('successive toasts rotate identities so a new banner can stack above the previous one', async () => {
  const fake = fakeHost()
  const notifier = createWindowsToast(config, fake.launch)
  for (const [index, message] of ['one', 'two', 'three', 'four', 'five', 'six'].entries()) {
    await notifier.notify({ message, sound: index === 0 ? 'C:\\sounds\\ding.wav' : undefined })
  }
  assert.equal(fake.launches, 1)
  assert.deepEqual(fake.payloads.map(item => item.appId), [
    'KeS1Ke.DSH', 'KeS1Ke.DSH.2', 'KeS1Ke.DSH.3', 'KeS1Ke.DSH.4', 'KeS1Ke.DSH.5', 'KeS1Ke.DSH',
  ])
  assert.equal(fake.payloads[0].sound, 'C:\\sounds\\ding.wav')
  assert.equal(fake.payloads[1].sound, undefined)
  notifier.dispose()
})
