import { execFile, spawn } from 'node:child_process'
import { win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createToastReplies } from './reply.js'

const scriptPath = fileURLToPath(new URL('./toast.ps1', import.meta.url))
const activatorPath = fileURLToPath(new URL('./activate.ps1', import.meta.url))
const powershell = win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

export function createWindowsToast(config, launch = execFile) {
  const lifetime = new AbortController()
  const replies = createToastReplies()
  let activator

  function startActivator() {
    if (activator) return activator.ready
    const child = spawn(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-MTA', '-ExecutionPolicy', 'Bypass', '-File', activatorPath,
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
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
    async notify({ message = config.message, signal, onReply } = {}) {
      signal = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal
      if (signal.aborted) return
      if (onReply) await startActivator()
      if (signal.aborted) return
      const reply = onReply && await replies.register(onReply)
      if (signal.aborted) { reply?.release(); return }
      const payload = { title: config.title, message }
      if (reply) Object.assign(payload, { reply: reply.argument, replyPlaceholder: '回复 DSH', replyLabel: '发送' })
      try {
        await new Promise((resolve, reject) => {
          // Windows PowerShell's .NET Framework provides the WinRT projection used by toast.ps1.
          const child = launch(powershell, [
            '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
          ], { windowsHide: true, timeout: 15_000 }, (error, _stdout, stderr) => {
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
      } catch (error) {
        reply?.release()
        throw error
      }
      if (signal.aborted) reply?.release()
    },
    dispose() { lifetime.abort(); replies.dispose(); activator?.child.stdin.end() },
  }
}
