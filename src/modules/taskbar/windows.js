import { spawn } from 'node:child_process'
import { ensureHelperBinary, resolveHelperBinary } from '../../native-helper.js'

// The helper clears the badge on focus; the lifetime only stops a forgotten process from living forever.
const badgeMinutes = 120

/** Coalesce taskbar badges for the same app; keep one helper process and update its unread count. */
export function createTaskbarNotifier({ isEnabled, getWindowTitle }, launch = spawn) {
  let active, starting, disposed = false, count = 0

  function send(state, message) {
    if (!state.child.stdin?.writable) return
    try { state.child.stdin.write(JSON.stringify(message) + '\n', 'utf8') } catch {}
  }
  function stop(state = active) {
    if (!state || state.stopping) return
    state.stopping = true
    send(state, { type: 'stop' })
    state.killTimer = setTimeout(() => state.child.kill(), 2000)
    state.killTimer.unref?.()
  }
  function start(exe) {
    const child = launch(exe, ['taskbar-badge'], {
      windowsHide: true, shell: false, stdio: ['pipe', 'ignore', 'pipe'],
    })
    const state = { child, subscribers: new Set(), stopping: false }
    let resolve, reject, stderr = '', error, finished = false
    state.done = new Promise((yes, no) => { resolve = yes; reject = no })
    state.done.catch(() => {})
    const finish = failure => {
      if (finished) return
      finished = true
      clearTimeout(state.timeout)
      clearTimeout(state.killTimer)
      if (active === state) { active = undefined; count = 0 }
      if (failure && !state.stopping && !disposed) reject(failure)
      else resolve()
    }
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', value => { stderr = (stderr + value).slice(-2048) })
    child.on('error', failure => finish(failure.code === 'ENOENT'
      ? new Error('找不到 Windows 任务栏辅助程序，请重新安装插件或设置 DSH_REMINDER_HELPER_PATH。') : failure))
    child.on('close', code => finish(error ?? (code === 0 ? undefined : new Error(`任务栏角标失败：${stderr.trim() || code}`))))
    child.stdin.on('error', failure => { error = failure; child.kill() })
    state.timeout = setTimeout(() => { error = new Error('任务栏角标进程超时'); child.kill() }, (badgeMinutes + 1) * 60_000)
    state.timeout.unref?.()
    send(state, { hostPid: process.pid, windowTitle: getWindowTitle(), count, maxMinutes: badgeMinutes })
    return state
  }
  function subscribe(state, signal) {
    return new Promise((resolve, reject) => {
      const subscriber = {}
      state.subscribers.add(subscriber)
      const abort = () => {
        state.subscribers.delete(subscriber)
        resolve()
        if (!state.subscribers.size) stop(state)
      }
      signal?.addEventListener('abort', abort, { once: true })
      state.done.then(resolve, reject).finally(() => {
        state.subscribers.delete(subscriber)
        signal?.removeEventListener('abort', abort)
      })
    })
  }
  function notify({ signal } = {}) {
    if (disposed || !isEnabled() || signal?.aborted) return Promise.resolve()
    if (active?.stopping) return active.done.catch(() => {}).then(() => notify({ signal }))
    if (active) {
      count = Math.min(count + 1, 100)
      send(active, { type: 'set', count })
      return subscribe(active, signal)
    }

    const immediateExe = resolveHelperBinary() ?? (launch !== spawn ? 'dsh-reminder-helper.exe' : undefined)
    if (immediateExe) {
      count = 1
      active = start(immediateExe)
      return subscribe(active, signal)
    }

    if (starting) return starting.then(() => notify({ signal }))
    starting = ensureHelperBinary().finally(() => { starting = undefined })
    return starting.then(exe => {
      if (disposed || !isEnabled() || signal?.aborted) return
      if (active) {
        count = Math.min(count + 1, 100)
        send(active, { type: 'set', count })
      } else {
        count = 1
        active = start(exe)
      }
      return subscribe(active, signal)
    })
  }
  return {
    notify,
    stop: () => stop(),
    dispose() { disposed = true; stop() },
  }
}
