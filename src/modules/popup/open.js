import { randomUUID } from 'node:crypto'

/** Keep the latest toast click until the focused GUI has opened its session. */
export function createSessionOpenRequests({ timeoutMs = 25_000 } = {}) {
  let pending, disposed = false
  const waiters = new Set()

  return {
    request(sessionId) {
      if (disposed || typeof sessionId !== 'string' || sessionId === '') return
      pending = { id: randomUUID(), sessionId }
      for (const waiter of waiters) waiter(pending)
    },
    take(acknowledgedId, signal) {
      if (disposed || signal?.aborted) return Promise.resolve()
      if (pending?.id === acknowledgedId) pending = undefined
      if (pending) return Promise.resolve(pending)
      return new Promise(resolve => {
        const settle = value => {
          clearTimeout(timer)
          waiters.delete(settle)
          signal?.removeEventListener('abort', abort)
          resolve(value)
        }
        const abort = () => settle()
        const timer = setTimeout(abort, timeoutMs)
        waiters.add(settle)
        signal?.addEventListener('abort', abort, { once: true })
      })
    },
    dispose() {
      disposed = true
      pending = undefined
      for (const waiter of waiters) waiter()
    },
  }
}
