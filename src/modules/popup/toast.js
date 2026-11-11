import { execFile, spawn } from 'node:child_process'
import { win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createToastReplies } from './reply.js'

const scriptPath = fileURLToPath(new URL('./toast.ps1', import.meta.url))
const activatorPath = fileURLToPath(new URL('./activate.ps1', import.meta.url))
const powershell = win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
// Windows shows one banner per notification identity. The next identity stacks a new banner above the previous one.
const stackIds = ['KeS1Ke.DSH', 'KeS1Ke.DSH.2', 'KeS1Ke.DSH.3', 'KeS1Ke.DSH.4', 'KeS1Ke.DSH.5']

export function createWindowsToast(config, launch = execFile, launchActivator = spawn) {
  const lifetime = new AbortController()
  const replies = createToastReplies()
  let activator, stackIndex = 0

  function startActivator() {
    if (activator) return activator.ready
    const env = { ...process.env }
    // Desktop Host runs Electron as Node. The activator must launch dsh://open in GUI mode.
    delete env.ELECTRON_RUN_AS_NODE
    const child = launchActivator(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-MTA', '-ExecutionPolicy', 'Bypass', '-File', activatorPath,
    ], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const ready = new Promise((resolve, reject) => {
      let stdout = '', stderr = ''
      const timer = setTimeout(() => {
        reject(new Error('Windows 通知回复服务启动超时'))
        child.kill()
      }, 15_000)
      const onOutput = chunk => {
        stdout += chunk
        if (!stdout.includes('\n') && stdout.length < 64) return
        child.stdout.removeListener('data', onOutput)
        clearTimeout(timer)
        if (stdout.trim() !== 'ready') {
          reject(new Error('Windows 通知回复服务返回了无效的启动响应'))
          child.kill()
          return
        }
        resolve()
        child.stdout.unref()
        child.stderr.unref()
        child.stdin.unref()
        child.unref()
      }
      child.stdout.setEncoding('utf8').on('data', onOutput)
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr = (stderr + chunk).slice(-2048) })
      child.stdin.on('error', () => {})
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('close', code => {
        clearTimeout(timer)
        activator = undefined
        reject(new Error(stderr.trim() || `Windows 通知回复服务退出 (${code})`))
      })
    })
    activator = { child, ready }
    return ready
  }

  return {
    async notify({ title = config.title, message = config.message, signal, onReply, onDecision, onOpen, sound } = {}) {
      signal = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal
      if (signal.aborted) return
      if (onReply || onDecision || onOpen) await startActivator()
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
          routes.push(reply)
          Object.assign(payload, { reply: reply.argument, replyPlaceholder: '回复 DSH', replyLabel: '发送' })
        }
        if (signal.aborted) return
        payload.appId = stackIds[stackIndex]
        stackIndex = (stackIndex + 1) % stackIds.length
        if (typeof sound === 'string' && sound) payload.sound = sound
        await new Promise((resolve, reject) => {
          // Windows PowerShell's .NET Framework provides the WinRT projection used by toast.ps1.
          const child = launch(powershell, [
            '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
          ], { windowsHide: true, timeout: payload.sound ? 22_000 : 15_000 }, (error, _stdout, stderr) => {
            signal.removeEventListener('abort', abort)
            if (signal.aborted) resolve()
            else if (error) reject(new Error(stderr.trim() || error.message, { cause: error }))
            else resolve()
          })
          const abort = () => child.kill()
          signal.addEventListener('abort', abort, { once: true })
          child.stdin.on('error', () => {})
          child.stdin.end(JSON.stringify(payload) + '\n', 'utf8')
        })
        sent = !signal.aborted
      } finally {
        if (!sent) for (const route of routes) route.release()
      }
    },
    dispose() { lifetime.abort(); replies.dispose(); activator?.child.stdin.end() },
  }
}
