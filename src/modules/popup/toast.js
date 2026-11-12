import { spawn } from 'node:child_process'
import { win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createToastReplies } from './reply.js'

const scriptPath = fileURLToPath(new URL('./toast.ps1', import.meta.url))
const powershell = win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
// Windows shows one banner per notification identity. The next identity stacks a new banner above the previous one.
const stackIds = ['KeS1Ke.DSH', 'KeS1Ke.DSH.2', 'KeS1Ke.DSH.3', 'KeS1Ke.DSH.4', 'KeS1Ke.DSH.5']

export function createWindowsToast(config, launchHost = spawn) {
  const lifetime = new AbortController()
  const replies = createToastReplies()
  let stackIndex = 0, host, chain = Promise.resolve()

  function enqueue(task) {
    const run = chain.then(task, task)
    chain = run.then(() => {}, () => {})
    return run
  }

  // One Windows PowerShell process shows every later toast. Add-Type runs once inside it.
  function startHost() {
    if (host) return host.ready
    const env = { ...process.env }
    // Desktop Host runs Electron as Node. The activator must launch dsh://open in GUI mode.
    delete env.ELECTRON_RUN_AS_NODE
    const child = launchHost(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-MTA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-HostMode',
    ], { env, windowsHide: true })
    let buffer = '', stderr = '', settled = false
    const waiters = []
    const failWaiters = error => { waiters.splice(0).forEach(waiter => waiter.reject(error)) }
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error('Windows 通知服务启动超时'))
      }, 15_000)
      const finishReady = error => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) reject(error)
        else resolve()
      }
      child.stdout.setEncoding('utf8').on('data', chunk => {
        buffer += chunk
        let index
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).trim()
          buffer = buffer.slice(index + 1)
          if (!line) continue
          if (!settled) {
            finishReady(line === 'ready' ? null : new Error(line))
            continue
          }
          const waiter = waiters.shift()
          if (!waiter) continue
          if (line === 'ok') waiter.resolve()
          else waiter.reject(new Error(line.startsWith('error ') ? line.slice(6) : line))
        }
      })
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr = (stderr + chunk).slice(-2048) })
      child.stdin.on('error', () => {})
      child.once('error', error => { finishReady(error); failWaiters(error) })
      child.once('close', code => {
        const error = new Error(stderr.trim() || `Windows 通知服务退出 (${code})`)
        if (host && host.child === child) host = undefined
        finishReady(error)
        failWaiters(error)
      })
    })
    host = { child, ready, waiters }
    return ready
  }

  function setReplyKeys(on) {
    const stdin = host && host.child && host.child.stdin
    if (!stdin || !stdin.writable) return
    stdin.write(on ? 'reply-keys\n' : 'reply-keys-off\n', 'utf8')
  }

  function requestToast(payload) {
    const current = host
    return new Promise((resolve, reject) => {
      let done = false
      const settle = error => {
        if (done) return
        done = true
        if (error) reject(error)
        else resolve()
      }
      current.waiters.push({ resolve: () => settle(), reject: settle })
      current.child.stdin.write(JSON.stringify(payload) + '\n', 'utf8', error => { if (error) settle(error) })
    })
  }

  return {
    async notify({ title = config.title, message = config.message, signal, onReply, onDecision, onOpen, sound } = {}) {
      signal = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal
      if (signal.aborted) return
      try { await startHost() }
      catch (error) { if (signal.aborted) return; throw error }
      if (signal.aborted) return
      const payload = { title, message }
      const routes = []
      let sent = false
      try {
        if (onOpen) {
          // Keep the jump available while the notification sits in the action center, even after this turn ended.
          const open = await replies.registerOpen(onOpen, lifetime.signal)
          if (!open) return
          routes.push(open)
          // The body click is a background activation: it notifies this process, then opens the app.
          payload.open = open.argument
        }
        if (onDecision) {
          payload.approval = []
          for (const [label, outcome] of [['允许', 'allowed-once'], ['拒绝', 'rejected']]) {
            const route = await replies.register(() => onDecision(outcome), signal)
            if (!route) return
            routes.push(route)
            payload.approval.push({ label, argument: `${route.argument}:decision` })
          }
        } else if (onReply) {
          const reply = await replies.register(onReply)
          if (!reply) return
          const release = reply.release
          let armed = true
          reply.release = () => {
            if (armed) setReplyKeys(false)
            armed = false
            release()
          }
          setReplyKeys(true)
          routes.push(reply)
          Object.assign(payload, { reply: reply.argument, replyPlaceholder: '回复 DSH', replyLabel: '发送' })
        }
        if (signal.aborted) return
        payload.appId = stackIds[stackIndex]
        stackIndex = (stackIndex + 1) % stackIds.length
        if (typeof sound === 'string' && sound) payload.sound = sound
        await enqueue(() => requestToast(payload))
        sent = !signal.aborted
      } finally {
        if (!sent) for (const route of routes) route.release()
      }
    },
    dispose() {
      lifetime.abort()
      replies.dispose()
      const child = host && host.child
      host = undefined
      if (!child) return
      child.stdin.end()
      child.kill()
    },
  }
}
