import { spawn } from 'node:child_process'
import { captureStderr, normalizeHelperSpawnError, resolveLaunchTarget, writeJsonLine } from '../native-process.js'

// The helper clears the badge on focus; the lifetime only stops a forgotten process from living forever.
const badgeMinutes = 120

/** Coalesce taskbar badges for the same app; keep one helper process and update its unread count. */
export function createTaskbarNotifier({ isEnabled, getWindowTitle }, launch = spawn, helper) {
  let active, starting, disposed = false, count = 0

  function stop(state = active) {
    if (!state || state.stopping) return
    state.stopping = true
    writeJsonLine(state.child, { type: 'stop' })
    state.killTimer = setTimeout(() => state.child.kill(), 2000)
    state.killTimer.unref?.()
  }
  function start(exe) {
    const child = launch(exe, ['taskbar-badge'], {
      windowsHide: true, shell: false, stdio: ['pipe', 'ignore', 'pipe'],
    })
    const state = { child, subscribers: new Set(), stopping: false }
    let resolve, reject, timeoutError, stdinError, finished = false
    const readStderr = captureStderr(child.stderr)
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
    child.on('error', failure => finish(normalizeHelperSpawnError(failure, '任务栏辅助程序', exe)))
    child.on('close', code => {
      if (timeoutError) return finish(timeoutError)
      if (code !== 0 && code !== null) return finish(new Error(`任务栏角标失败：${readStderr() || code}`))
      if (code === 0) return finish()
      const text = readStderr()
      if (text) return finish(new Error(`任务栏角标失败：${text}`))
      finish(stdinError ?? new Error(`任务栏角标失败：${code}`))
    })
    child.stdin.on('error', failure => {
      if (failure?.code === 'EPIPE' && state.stopping) return
      stdinError = failure
      child.kill()
    })
    state.timeout = setTimeout(() => { timeoutError = new Error('任务栏角标进程超时'); child.kill() }, (badgeMinutes + 1) * 60_000)
    state.timeout.unref?.()
    writeJsonLine(child, { hostPid: process.pid, windowTitle: getWindowTitle(), count, maxMinutes: badgeMinutes })
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
      writeJsonLine(active.child, { type: 'set', count })
      return subscribe(active, signal)
    }
    if (starting) return starting.then(() => notify({ signal }))

    const target = resolveLaunchTarget(launch, helper)
    if (target.exe) {
      count = 1
      active = start(target.exe)
      return subscribe(active, signal)
    }

    starting = target.promise.finally(() => { starting = undefined })
    return starting.then(exe => {
      if (disposed || !isEnabled() || signal?.aborted) return
      if (active) {
        count = Math.min(count + 1, 100)
        writeJsonLine(active.child, { type: 'set', count })
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
