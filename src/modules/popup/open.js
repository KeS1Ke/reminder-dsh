/** One-slot mailbox: a toast click posts the session id, the GUI's long poll consumes it once. */
export function createSessionOpenRequests({ timeoutMs = 25_000 } = {}) {
  let pending
  const waiters = new Set()

  return {
    request(sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') return
      pending = sessionId
      for (const waiter of [...waiters]) waiter()
    },
    /** Resolve with a posted session id, or undefined when the caller gives up first. */
    take() {
      if (pending !== undefined) {
        const sessionId = pending
        pending = undefined
        return Promise.resolve(sessionId)
      }
      return new Promise(resolve => {
        let timer
        const settle = () => {
          clearTimeout(timer)
          waiters.delete(settle)
          const sessionId = pending
          pending = undefined
          resolve(sessionId)
        }
        waiters.add(settle)
        timer = setTimeout(settle, timeoutMs)
      })
    },
  }
}
