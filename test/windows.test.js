import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createWindowsToast } from '../src/modules/popup/toast.js'
import { createToastReplies } from '../src/modules/popup/reply.js'
import {
  downloadHelperBinary,
  getHelperAssetUrls,
  parseSha256,
  resolveHelperBinary,
  verifySha256,
} from '../src/native-helper.js'

const config = { title: '中文 " $() ` 标题', message: "任务完成 & <已就绪> 🐋\n'hello'" }
const assetsDir = fileURLToPath(new URL('../assets', import.meta.url))

function fakeHost({ fail } = {}) {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  let buffer = ''
  const payloads = []
  const commands = []
  const acks = []
  const child = Object.assign(new EventEmitter(), {
    stdin, stdout, stderr, killed: false,
    kill() { this.killed = true; this.emit('close', 0) },
    unref() {},
  })
  let invocation, launches = 0
  return {
    child, stdin, stdout, payloads, commands, acks,
    get invocation() { return invocation },
    get launches() { return launches },
    launch(exe, args, options) {
      invocation = { exe, args, options }
      launches += 1
      process.nextTick(() => stdout.write(JSON.stringify({ type: 'ready' }) + '\n'))
      stdin.on('data', chunk => {
        buffer += chunk.toString('utf8')
        let index
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).trim()
          buffer = buffer.slice(index + 1)
          if (!line) continue
          const msg = JSON.parse(line)
          commands.push(msg)
          if (msg.type === 'show') {
            payloads.push(msg)
            stdout.write(JSON.stringify({
              type: 'show-result',
              id: msg.id,
              ok: !fail,
              ...(fail ? { error: fail } : {}),
            }) + '\n')
          } else if (msg.type === 'ack') {
            acks.push(msg)
          }
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
    type: 'show', id: 1, title: config.title, message: '摘要：' + config.message, appId: 'KeS1Ke.DSH',
  })
  const { exe, args, options } = fake.invocation
  assert.match(exe, /dsh-reminder-helper\.exe$/)
  assert.deepEqual(args, ['toast-host', '--assets-dir', assetsDir])
  assert.equal(args.includes(config.title), false)
  assert.equal(options.windowsHide, true)
  assert.equal(options.shell, false)
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
  const helper = resolveHelperBinary()
  assert.ok(helper, 'expected compiled or packaged dsh-reminder-helper.exe on Windows')
  const input = { ...config, reply: 'test-route', replyPlaceholder: '回复 DSH', replyLabel: '发送' }
  const result = spawnSync(helper, ['--validate-toast', '--assets-dir', assetsDir], {
    input: JSON.stringify(input) + '\n', encoding: 'utf8', timeout: 15_000, windowsHide: true,
  })
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
  const helper = resolveHelperBinary()
  assert.ok(helper)
  const result = spawnSync(helper, ['--validate-toast', '--assets-dir', assetsDir], {
    input: JSON.stringify({ title: '会话标题 & <测试>', message: '' }) + '\n', encoding: 'utf8', timeout: 15_000, windowsHide: true,
  })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  assert.ok(result.stdout.includes('<text hint-maxLines="1">会话标题 &amp; &lt;测试&gt;</text>'))
  assert.equal((result.stdout.match(/<text\b/g) ?? []).length, 1)
  assert.doesNotMatch(result.stdout, /<audio\b/)
})

test('a plugin sound silences the Windows toast sound without putting the file in the toast', { skip: process.platform !== 'win32' }, () => {
  const helper = resolveHelperBinary()
  assert.ok(helper)
  const result = spawnSync(helper, ['--validate-toast', '--assets-dir', assetsDir], {
    input: JSON.stringify({ title: '会话标题', message: '正文', sound: 'C:\\sounds\\ding.wav', appId: 'KeS1Ke.DSH.2' }) + '\n',
    encoding: 'utf8', timeout: 15_000, windowsHide: true,
  })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  assert.match(result.stdout, /<audio silent="true"/)
  assert.doesNotMatch(result.stdout, /C:\\sounds/)
})

test('an unexpected notification identity is rejected before a toast is built', { skip: process.platform !== 'win32' }, () => {
  const helper = resolveHelperBinary()
  assert.ok(helper)
  const result = spawnSync(helper, ['--validate-toast', '--assets-dir', assetsDir], {
    input: JSON.stringify({ title: '会话标题', message: '', appId: 'Other.App' }) + '\n',
    encoding: 'utf8', timeout: 15_000, windowsHide: true,
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Unexpected notification identity/)
})

test('Windows sends the session route to the toast activator and keeps approval actions separate', { skip: process.platform !== 'win32' }, () => {
  const helper = resolveHelperBinary()
  assert.ok(helper)
  const token = 'b'.repeat(32)
  const route = `${token}:open`
  const result = spawnSync(helper, ['--validate-toast', '--assets-dir', assetsDir], {
    input: JSON.stringify({ title: '会话标题', message: '', open: route, approval: [{ label: '允许', argument: 'allow-route' }] }) + '\n',
    encoding: 'utf8', timeout: 15_000, windowsHide: true,
  })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  assert.ok(result.stdout.includes(`<toast activationType="background" launch="${route}">`))
  assert.match(result.stdout, /<action content="允许" arguments="allow-route" activationType="background"/)
  assert.doesNotMatch(result.stdout, /dsh:\/\/open/)
})

test('toast body activation routes every click to the captured session', async t => {
  const replies = createToastReplies()
  t.after(() => replies.dispose())
  const opened = []
  const route = await replies.registerOpen(() => { opened.push('open') })
  assert.match(route.argument, /^[a-f0-9]{32}:open$/)

  assert.equal(await replies.dispatch(route.argument), true)
  assert.equal(await replies.dispatch(route.argument), true)
  assert.deepEqual(opened, ['open', 'open'])
  route.release()
  assert.equal(await replies.dispatch(route.argument), false)
})

test('a reply toast arms Enter-to-send, disarms when replied, and does not disarm twice on dispose', async () => {
  const fake = fakeHost()
  const received = []
  const notifier = createWindowsToast(config, fake.launch)
  await notifier.notify({ onReply: text => received.push(text) })

  assert.deepEqual(fake.commands.map(c => c.type), ['reply-keys', 'show'])
  assert.equal(fake.commands[0].armed, true)

  const replyArg = fake.payloads[0].reply
  fake.stdout.write(JSON.stringify({
    type: 'activate',
    id: 99,
    argument: replyArg,
    input: { reply: '继续' },
  }) + '\n')

  while (fake.acks.length < 1) await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(fake.acks[0], { type: 'ack', id: 99, ok: true })
  assert.deepEqual(received, ['继续'])

  const disarms = fake.commands.filter(c => c.type === 'reply-keys' && c.armed === false)
  assert.equal(disarms.length, 1)

  notifier.dispose()
  assert.equal(fake.commands.filter(c => c.type === 'reply-keys' && c.armed === false).length, 1)
})

test('Windows renders distinct native approval actions without a text input', { skip: process.platform !== 'win32' }, () => {
  const helper = resolveHelperBinary()
  assert.ok(helper)
  const input = { ...config, approval: [{ label: '允许', argument: 'allow-route' }, { label: '拒绝', argument: 'reject-route' }] }
  const result = spawnSync(helper, ['--validate-toast', '--assets-dir', assetsDir], {
    input: JSON.stringify(input) + '\n', encoding: 'utf8', timeout: 15_000, windowsHide: true,
  })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  assert.match(result.stdout, /<action content="允许" arguments="allow-route" activationType="background"/)
  assert.match(result.stdout, /<action content="拒绝" arguments="reject-route" activationType="background"/)
  assert.doesNotMatch(result.stdout, /<input\b/)
})

test('local reply routes isolate sessions, reject empty text and acknowledge duplicate activations once', async t => {
  const replies = createToastReplies(), received = []
  t.after(() => replies.dispose())
  const first = await replies.register(text => received.push(['first', text]))
  const second = await replies.register(text => received.push(['second', text]))
  const decision = await replies.register(() => received.push(['decision', 'allowed']))

  assert.equal(await replies.dispatch(first.argument, { reply: ' ' }), false)
  assert.equal(await replies.dispatch(first.argument, {}), false)
  assert.equal(await replies.dispatch(second.argument, { reply: '第二个会话 🐋' }), true)
  assert.deepEqual(await Promise.all([
    replies.dispatch(first.argument, { reply: '请继续' }),
    replies.dispatch(first.argument, { reply: '请继续' }),
  ]), [true, true])
  assert.deepEqual(await Promise.all([
    replies.dispatch(`${decision.argument}:decision`),
    replies.dispatch(`${decision.argument}:decision`),
  ]), [true, true])
  assert.deepEqual(received, [
    ['second', '第二个会话 🐋'],
    ['first', '请继续'],
    ['decision', 'allowed'],
  ])
  second.release()
  assert.equal(await replies.dispatch(second.argument, { reply: '已经失效' }), false)
})

test('a toast cancelled while another toast is in flight is not shown', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const payloads = []
  const commands = []
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
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (!line) continue
      const msg = JSON.parse(line)
      commands.push(msg)
      if (msg.type === 'show') {
        payloads.push(msg)
        const reply = JSON.stringify({ type: 'show-result', id: msg.id, ok: true }) + '\n'
        if (payloads.length === 1) gate.then(() => stdout.write(reply))
        else stdout.write(reply)
      }
    }
  })
  const notifier = createWindowsToast(config, () => {
    process.nextTick(() => stdout.write(JSON.stringify({ type: 'ready' }) + '\n'))
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
  assert.equal(commands.some(c => c.type === 'reply-keys'), false)
  notifier.dispose()
})

test('disposing while a toast write is awaiting host acknowledgment resolves cleanly', async () => {
  let written = false
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const child = Object.assign(new EventEmitter(), {
    stdin, stdout, stderr,
    kill() { this.killed = true; this.emit('close', 0) },
  })
  stdin.on('data', chunk => {
    if (chunk.toString('utf8').includes('"type":"show"')) written = true
  })
  const notifier = createWindowsToast(config, () => {
    process.nextTick(() => stdout.write(JSON.stringify({ type: 'ready' }) + '\n'))
    return child
  })
  const pending = notifier.notify({ message: 'in-flight' })
  while (!written) await new Promise(resolve => setImmediate(resolve))
  notifier.dispose()
  await pending
  assert.equal(child.killed, true)
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
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (!line) continue
        const msg = JSON.parse(line)
        if (msg.type === 'show') {
          payloads.push(msg)
          stdout.write(JSON.stringify({ type: 'show-result', id: msg.id, ok: true }) + '\n')
        }
      }
    })
    process.nextTick(() => {
      stdout.write(JSON.stringify({ type: 'ready' }) + '\n')
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

test('a failed toast write replaces the host and does not consume the next toast result', async () => {
  const payloads = [], children = []
  const notifier = createWindowsToast(config, () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const index = children.length
    const original = stdin.write.bind(stdin)
    stdin.write = (chunk, encoding, cb) => {
      if (index === 0 && String(chunk).includes('"type":"show"')) {
        cb(new Error('EPIPE'))
        return true
      }
      return original(chunk, encoding, cb)
    }
    let buffer = ''
    stdin.on('data', chunk => {
      buffer += chunk.toString('utf8')
      let end
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim()
        buffer = buffer.slice(end + 1)
        if (!line) continue
        const msg = JSON.parse(line)
        if (msg.type === 'show') {
          payloads.push(msg)
          stdout.write(JSON.stringify({ type: 'show-result', id: msg.id, ok: true }) + '\n')
        }
      }
    })
    const child = Object.assign(new EventEmitter(), {
      stdin, stdout, stderr,
      kill() { this.killed = true },
    })
    children.push(child)
    process.nextTick(() => stdout.write(JSON.stringify({ type: 'ready' }) + '\n'))
    return child
  })
  await assert.rejects(notifier.notify({ message: 'lost' }), /EPIPE/)
  await notifier.notify({ message: 'kept' })
  assert.equal(children.length, 2)
  assert.equal(children[0].killed, true)
  assert.deepEqual(payloads.map(item => item.message), ['kept'])
  notifier.dispose()
})

test('releasing a reply route disarms the host that showed it', async () => {
  const commandsByChild = []
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
    commandsByChild[index] = []
    children.push(child)
    let buf = ''
    stdin.on('data', chunk => {
      buf += chunk.toString('utf8')
      let end
      while ((end = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, end).trim()
        buf = buf.slice(end + 1)
        if (!line) continue
        const msg = JSON.parse(line)
        commandsByChild[index].push(msg)
        if (msg.type === 'show') {
          stdout.write(JSON.stringify({ type: 'show-result', id: msg.id, ok: true }) + '\n')
        }
      }
    })
    process.nextTick(() => stdout.write(JSON.stringify({ type: 'ready' }) + '\n'))
    return child
  })
  await notifier.notify({ onReply() {} })
  assert.deepEqual(commandsByChild[0].map(c => c.type), ['reply-keys', 'show'])
  assert.equal(commandsByChild[0][0].armed, true)
  children[0].emit('close', 0)
  await notifier.notify({ message: 'plain' })
  assert.equal(children.length, 2)
  assert.equal(commandsByChild[1].some(c => c.type === 'reply-keys'), false)
  notifier.dispose()
  assert.equal(commandsByChild[0].filter(c => c.type === 'reply-keys' && c.armed === false).length, 1)
  assert.equal(commandsByChild[1].some(c => c.type === 'reply-keys'), false)
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

test('native helper resolver honors explicit overrides, optional package, and SHA-256 verification', async t => {
  assert.equal(resolveHelperBinary({ env: { DSH_REMINDER_HELPER_PATH: 'C:\\custom\\helper.exe' }, platform: 'linux', arch: 'x64' }), 'C:\\custom\\helper.exe')
  assert.equal(resolveHelperBinary({ env: {}, platform: 'linux', arch: 'x64' }), undefined)
  const mockPkgJson = join('/pkg', 'node_modules', '@kesike', 'reminder-dsh-win32-x64', 'package.json')
  const mockBin = join('/pkg', 'node_modules', '@kesike', 'reminder-dsh-win32-x64', 'bin', 'dsh-reminder-helper.exe')
  assert.equal(resolveHelperBinary({
    env: {},
    platform: 'win32',
    arch: 'x64',
    resolvePkg: () => mockPkgJson,
    exists: p => p === mockBin,
  }), mockBin)

  const urls = getHelperAssetUrls('0.2.2')
  assert.equal(urls.binaryUrl, 'https://github.com/KeS1Ke/reminder-dsh/releases/download/v0.2.2/dsh-reminder-helper-win32-x64.exe')
  assert.equal(urls.shaUrl, 'https://github.com/KeS1Ke/reminder-dsh/releases/download/v0.2.2/dsh-reminder-helper-win32-x64.exe.sha256')

  const sample = Buffer.from('MZ-dummy-helper-binary')
  const digest = createHash('sha256').update(sample).digest('hex')
  assert.equal(parseSha256(`${digest.toUpperCase()}  dsh-reminder-helper-win32-x64.exe\n`), digest)
  assert.throws(() => parseSha256('not-a-sha'), /SHA-256/)
  assert.equal(verifySha256(sample, digest), digest)
  assert.throws(() => verifySha256(sample, '0'.repeat(64)), /SHA-256/)

  const dir = mkdtempSync(join(tmpdir(), 'dsh-helper-dl-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const dest = join(dir, 'dsh-reminder-helper.exe')
  const fetched = await downloadHelperBinary({
    targetPath: dest,
    version: '0.2.2',
    fetchImpl: async url => {
      if (url.endsWith('.sha256')) {
        return new Response(`${digest}  dsh-reminder-helper-win32-x64.exe\n`, { status: 200 })
      }
      return new Response(sample, { status: 200 })
    },
  })
  assert.equal(fetched, dest)
  assert.deepEqual(readFileSync(dest), sample)

  await assert.rejects(() => downloadHelperBinary({
    targetPath: join(dir, 'bad.exe'),
    version: '0.2.2',
    fetchImpl: async url => {
      if (url.endsWith('.sha256')) {
        return new Response(`${'f'.repeat(64)}  dsh-reminder-helper-win32-x64.exe\n`, { status: 200 })
      }
      return new Response(sample, { status: 200 })
    },
  }), /SHA-256/)
})
