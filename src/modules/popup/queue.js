/** Await preparation or a scheduling delay without retaining an aborted queue entry. */
function interruptible(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

function waitUntil(time, signal) {
  const delay = Math.max(0, time - Date.now())
  if (!delay) return Promise.resolve()
  let timer
  const waiting = new Promise(resolve => { timer = setTimeout(resolve, delay) })
  return interruptible(waiting, signal).finally(() => clearTimeout(timer))
}

/** FIFO completion queue with a live interval and exactly one popup process at a time. */
export function createReminderQueue({ prepare, show, enabled = true, intervalSeconds = 10 }) {
  const pending = [], live = new Set()
  let running = false, disposed = false, lastReadyAt, reschedule

  async function waitForSlot(signal) {
    while (lastReadyAt !== undefined && Date.now() < lastReadyAt + intervalSeconds * 1000) {
      const delay = new AbortController()
      reschedule = delay
      try { await waitUntil(lastReadyAt + intervalSeconds * 1000, AbortSignal.any([signal, delay.signal])) }
      catch (error) { if (signal.aborted || !delay.signal.aborted) throw error }
      finally { if (reschedule === delay) reschedule = undefined }
    }
  }

  async function pump() {
    if (running) return
    running = true
    try {
      while (pending.length) {
        const item = pending.shift()
        try {
          const prepared = await interruptible(item.prepared, item.signal)
          if (prepared.error) throw prepared.error
          await waitForSlot(item.signal)
          item.signal.throwIfAborted()
          // Await process closure even on cancellation, before showing another window.
          await show({ ...item.options, ...prepared.value, signal: item.signal,
            onReady: () => { lastReadyAt = Date.now() },
          })
          item.resolve()
        } catch (error) {
          if (item.signal.aborted) item.resolve()
          else item.reject(error)
        } finally { live.delete(item) }
      }
    } finally { running = false }
  }

  function clear() {
    for (const item of live) item.controller.abort()
    for (const item of pending.splice(0)) {
      live.delete(item)
      item.resolve()
    }
    lastReadyAt = undefined
  }

  return {
    enqueue(options) {
      if (disposed || !enabled || options.signal?.aborted) return Promise.resolve()
      const controller = new AbortController()
      const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
      return new Promise((resolve, reject) => {
        const item = { options, controller, signal, resolve, reject }
        // Prepare concurrently but reserve FIFO position before any model call settles.
        item.prepared = Promise.resolve().then(() => {
          signal.throwIfAborted()
          return prepare({ ...options, signal })
        }).then(value => ({ value }), error => ({ error }))
        live.add(item)
        pending.push(item)
        void pump()
      })
    },
    setEnabled(value) {
      enabled = value
      if (!enabled) clear()
    },
    setIntervalSeconds(value) {
      if (value === intervalSeconds) return
      intervalSeconds = value
      reschedule?.abort()
    },
    dispose() { disposed = true; enabled = false; clear() },
  }
}
