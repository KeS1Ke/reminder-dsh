import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { captureStderr, normalizeHelperSpawnError, resolveLaunchTarget, writeJsonLine } from '../native-process.js'
import { createToastReplies } from './reply.js'

const assetsDir = fileURLToPath(new URL('../../../assets', import.meta.url))
// Windows shows one banner per notification identity. The next identity stacks a new banner above the previous one.
const stackIds = ['KeS1Ke.DSH', 'KeS1Ke.DSH.2', 'KeS1Ke.DSH.3', 'KeS1Ke.DSH.4', 'KeS1Ke.DSH.5']

export function createWindowsToast(config, launchHost = spawn, helper) {
  const lifetime = new AbortController()
  const replies = createToastReplies()
  let stackIndex = 0, nextId = 1, host, lastFailure, tail = null

  function enqueue(task) {
    const prev = tail
    const run = (async () => {
      if (prev) await prev
      return await task()
    })()
    const settled = run.then(() => {}, () => {})
    tail = settled
    settled.then(() => { if (tail === settled) tail = null })
    return run
  }

  function handleActivation(state, msg) {
    Promise.resolve()
      .then(() => replies.dispatch(msg.argument, msg.input))
      .then(Boolean, () => false)
      .then(ok => writeJsonLine(state.child, { type: 'ack', id: msg.id, ok }))
  }

  // One native helper process shows every later toast and hosts the COM activator & Enter hook.
  function startHost() {
    if (lifetime.signal.aborted) return Promise.reject(lifetime.signal.reason)
    if (host) return host.ready
    const target = resolveLaunchTarget(launchHost, helper)
    if (target.exe) return startWithExe(target.exe)
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(lifetime.signal.reason)
      lifetime.signal.addEventListener('abort', onAbort, { once: true })
      target.promise
        .then(exe => startWithExe(exe))
        .then(resolve, reject)
        .finally(() => lifetime.signal.removeEventListener('abort', onAbort))
    })
  }

  function startWithExe(exe) {
    if (lifetime.signal.aborted) throw lifetime.signal.reason
    if (host) return host.ready
    const env = { ...process.env }
    // Desktop Host runs Electron as Node. The activator must launch dsh://open in GUI mode.
    delete env.ELECTRON_RUN_AS_NODE
    const child = launchHost(exe, ['toast-host', '--assets-dir', assetsDir], {
      env, windowsHide: true, shell: false,
    })
    let buffer = '', settled = false
    const readStderr = captureStderr(child.stderr)
    const waiters = new Map()
    const state = { child, waiters }
    host = state
    const failWaiters = error => {
      for (const waiter of waiters.values()) waiter.reject(error)
      waiters.clear()
    }
    let timer
    state.ready = new Promise((resolve, reject) => {
      const finishReady = error => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) reject(error)
        else resolve()
      }
      // Drop a failed process immediately. Otherwise every later toast awaits the same rejected ready.
      const fail = error => {
        const normalized = normalizeHelperSpawnError(error, '通知辅助程序', exe)
        lastFailure = normalized
        if (host === state) host = undefined
        finishReady(normalized)
        failWaiters(normalized)
      }
      state.fail = fail
      timer = setTimeout(() => {
        fail(new Error('Windows 通知服务启动超时'))
        try { child.kill() } catch {}
      }, 15_000)
      child.stdout.setEncoding('utf8').on('data', chunk => {
        buffer += chunk
        let index
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).trim()
          buffer = buffer.slice(index + 1)
          if (!line) continue
          let msg
          try {
            msg = JSON.parse(line)
          } catch {
            if (!settled) {
              fail(new Error(line))
              try { child.kill() } catch {}
            }
            continue
          }
          if (!settled) {
            if (msg.type === 'ready') finishReady()
            else {
              fail(new Error(msg.error ?? line))
              try { child.kill() } catch {}
            }
            continue
          }
          if (msg.type === 'activate') {
            handleActivation(state, msg)
            continue
          }
          if (msg.type === 'show-result') {
            const waiter = waiters.get(msg.id)
            if (!waiter) continue
            waiters.delete(msg.id)
            if (msg.ok) waiter.resolve()
            else waiter.reject(new Error(msg.error || 'Windows 通知发送失败'))
          }
        }
      })
      child.stdin.on('error', () => {})
      child.once('error', fail)
      child.once('close', code => {
        fail(new Error(readStderr() || `Windows 通知服务退出 (${code})`))
      })
    })
    state.ready.catch(() => { if (host === state) host = undefined })
    return state.ready
  }

  function requestToast(payload) {
    const current = host
    if (!current?.child?.stdin?.writable) return Promise.reject(new Error('Windows 通知服务不可用'))
    const id = nextId++
    return new Promise((resolve, reject) => {
      let settled = false
      const waiter = {}
      const finish = (error, drop) => {
        if (settled) return
        settled = true
        if (drop) current.waiters.delete(id)
        if (error) reject(error)
        else resolve()
      }
      waiter.resolve = () => finish()
      waiter.reject = error => finish(error)
      current.waiters.set(id, waiter)
      const failWrite = error => {
        if (host === current) host = undefined
        finish(error, true)
        try { current.child.kill() } catch {}
      }
      try {
        current.child.stdin.write(JSON.stringify({ type: 'show', id, ...payload }) + '\n', 'utf8', error => {
          if (error) failWrite(error)
        })
      } catch (error) {
        failWrite(error)
      }
    })
  }

  async function ensureHost() {
    lastFailure = undefined
    // Ready can resolve in the same turn the process exits. Try once more before giving up.
    for (let attempt = 0; attempt < 2 && !host; attempt++) await startHost()
    if (!host && !lifetime.signal.aborted) {
      throw lastFailure ?? new Error('Windows 通知服务不可用')
    }
  }

  return {
    async notify({ title = config.title, message = config.message, signal, onReply, onDecision, onOpen, sound } = {}) {
      signal = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal
      if (signal.aborted) return
      const payload = { title, message }
      const routes = []
      let sent = false
      // Disarm only the process that was armed. A restarted host has its own Enter-to-send count.
      let armedHost
      const disarm = () => {
        const target = armedHost
        armedHost = undefined
        if (target) writeJsonLine(target.child, { type: 'reply-keys', armed: false })
      }
      try {
        if (onOpen) {
          // Keep the jump available while the notification sits in the action center, even after this turn ended.
          const open = replies.registerOpen(onOpen, lifetime.signal)
          if (!open) return
          routes.push(open)
          // The body click is a background activation: it notifies this process, then opens the app.
          payload.open = open.argument
        }
        if (onDecision) {
          payload.approval = []
          for (const [label, outcome] of [['允许', 'allowed-once'], ['拒绝', 'rejected']]) {
            const route = replies.register(() => onDecision(outcome), signal)
            if (!route) return
            routes.push(route)
            payload.approval.push({ label, argument: `${route.argument}:decision` })
          }
        } else if (onReply) {
          const reply = replies.register(text => {
            disarm()
            return onReply(text)
          }, signal)
          if (!reply) return
          const release = reply.release
          reply.release = () => {
            disarm()
            release()
          }
          routes.push(reply)
          Object.assign(payload, { reply: reply.argument, replyPlaceholder: '回复 DSH', replyLabel: '发送' })
        }
        await enqueue(async () => {
          if (signal.aborted) return
          try { await ensureHost() }
          catch (error) { if (signal.aborted) return; throw error }
          if (signal.aborted) return
          payload.appId = stackIds[stackIndex]
          stackIndex = (stackIndex + 1) % stackIds.length
          if (typeof sound === 'string' && sound) payload.sound = sound
          if (onReply && writeJsonLine(host.child, { type: 'reply-keys', armed: true })) armedHost = host
          try { await requestToast(payload) }
          catch (error) { if (signal.aborted) return; throw error }
          sent = true
        })
      } finally {
        if (!sent) for (const route of routes) route.release()
      }
    },
    dispose() {
      lifetime.abort()
      replies.dispose()
      const current = host
      host = undefined
      if (!current) return
      current.fail?.(lifetime.signal.reason)
      current.child.stdin.end()
      current.child.kill()
    },
  }
}
