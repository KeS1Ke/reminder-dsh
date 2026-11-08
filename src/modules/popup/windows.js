import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(new URL('./popup.ps1', import.meta.url))

/** Own popup processes and exchange JSON lines; reply callbacks stay in the DSH process. */
export function createWindowsNotifier(config, launch = spawn) {
  const children = new Set()
  let disposed = false
  let currentDuration = config.durationSeconds
  return {
    notify({ sessionId = '', onReply, onReady, message = config.message, signal, durationSeconds = currentDuration } = {}) {
      if (disposed || signal?.aborted) return Promise.resolve()
      return new Promise((resolve, reject) => {
        const child = launch('pwsh.exe', [
          '-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass',
          '-File', scriptPath,
        ], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
        children.add(child)
        let stderr = '', buffer = ''
        let settled = false, sending = false, sent = false, ready = false, cancelled = false
        let terminalError
        const finish = error => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          children.delete(child)
          if (error && !disposed) reject(error)
          else resolve()
        }
        // Once ready, WPF owns the timer and pauses it while the user writes.
        const timer = setTimeout(() => {
          terminalError = new Error('pwsh 弹窗启动超时')
          child.kill()
        }, (durationSeconds + 15) * 1000)
        const onAbort = () => { cancelled = true; child.kill() }
        signal?.addEventListener('abort', onAbort, { once: true })
        const respond = data => {
          if (!settled && !disposed && !child.stdin.destroyed) {
            child.stdin.write(JSON.stringify(data) + '\n', 'utf8')
          }
        }
        const handle = async message => {
          if (settled || disposed || cancelled) return
          if (message?.type === 'ready') {
            clearTimeout(timer)
            if (!ready) { ready = true; onReady?.() }
            return
          }
          if (message?.type !== 'reply') throw new Error('无效的弹窗通信消息')
          if (sending) return
          if (sent) { respond({ ok: true }); return }
          sending = true
          try {
            if (!onReply) throw new Error('此测试弹窗未连接 DSH 会话。')
            if (typeof message.text !== 'string' || !message.text.trim() || message.text.length > 8000) {
              throw new Error('回复不能为空，且不能超过 8000 个字符。')
            }
            await onReply(message.text)
            sent = true
            respond({ ok: true })
          } catch (error) {
            respond({ ok: false, error: error instanceof Error ? error.message : String(error) })
          } finally { sending = false }
        }
        const protocolError = error => { terminalError = error; child.kill() }
        child.stdout.setEncoding('utf8')
        child.stdout.on('data', chunk => {
          buffer += chunk
          if (buffer.length > 65536) { protocolError(new Error('弹窗通信消息过长')); return }
          let newline
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline).trim()
            buffer = buffer.slice(newline + 1)
            if (!line) continue
            try { void handle(JSON.parse(line)).catch(protocolError) }
            catch (error) { protocolError(error); return }
          }
        })
        child.stderr.setEncoding('utf8')
        child.stderr.on('data', data => { stderr = (stderr + data).slice(-2048) })
        child.on('error', error => finish(error.code === 'ENOENT'
          ? new Error('找不到 pwsh.exe：请安装 PowerShell 7 并将其加入 PATH，然后重启 DSH。', { cause: error })
          : error))
        child.on('close', code => finish(cancelled ? undefined : terminalError ?? (code === 0 ? undefined
          : new Error(`pwsh 退出码 ${code}：${stderr.trim()}`))))
        child.stdin.on('error', protocolError)
        // Keep stdin open for delivery acknowledgements; never interpolate text into code.
        child.stdin.write(JSON.stringify({
          title: config.title, message, durationSeconds,
          sessionId, canReply: !!onReply,
        }) + '\n', 'utf8')
      })
    },
    setDurationSeconds(value) {
      if (currentDuration === value) return
      currentDuration = value
      for (const child of children) {
        if (!child.stdin.destroyed) child.stdin.write(JSON.stringify({ type: 'config', durationSeconds: value }) + '\n', 'utf8')
      }
    },
    dispose() {
      disposed = true
      for (const child of children) child.kill()
    },
  }
}
