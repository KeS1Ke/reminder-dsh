import { randomBytes } from 'node:crypto'

const replyLifetimeMs = 24 * 60 * 60 * 1000
const maxReplyChars = 8000
const openPattern = /^(?:[a-f0-9]{32}:)?([a-f0-9]{32}):open$/
const decisionPattern = /^(?:[a-f0-9]{32}:)?([a-f0-9]{32}):decision$/
const replyPattern = /^(?:[a-f0-9]{32}:)?([a-f0-9]{32})$/

/** Route a local Windows activation to the callback captured when its toast was sent. */
export function createToastReplies() {
  const routes = new Map()
  let disposed = false

  function add(route, signal, suffix) {
    const token = randomBytes(16).toString('hex')
    // Callers can replace entry.release; the timer and abort path must see that replacement.
    const entry = {
      ...route,
      argument: `${token}${suffix}`,
      release() {
        signal?.removeEventListener('abort', onAbort)
        clearTimeout(timer)
        routes.delete(token)
      },
    }
    function onAbort() { entry.release() }
    const timer = setTimeout(() => entry.release(), replyLifetimeMs).unref()
    routes.set(token, entry)
    signal?.addEventListener('abort', onAbort, { once: true })
    return entry
  }

  return {
    register(onReply, signal) {
      if (disposed || signal?.aborted) return
      return add({ onReply }, signal, '')
    },
    /** Body-click route: navigation repeats on every activation, unlike a one-shot reply. */
    registerOpen(onOpen, signal) {
      if (disposed || signal?.aborted) return
      return add({ onOpen }, signal, ':open')
    },
    async dispatch(argument, input) {
      if (disposed || typeof argument !== 'string') return false

      const openMatch = openPattern.exec(argument)
      if (openMatch) {
        const route = routes.get(openMatch[1])
        if (!route?.onOpen) return false
        try {
          await route.onOpen()
          return true
        } catch {
          return false
        }
      }

      const decisionMatch = decisionPattern.exec(argument)
      if (decisionMatch) {
        const route = routes.get(decisionMatch[1])
        if (!route || (!route.onReply && !route.delivery)) return false
        if (!route.delivery) {
          const decision = route.onReply
          route.onReply = undefined
          route.delivery = Promise.resolve().then(() => decision()).then(() => true, () => false)
        }
        return route.delivery
      }

      const replyMatch = replyPattern.exec(argument)
      if (replyMatch) {
        const route = routes.get(replyMatch[1])
        const text = typeof input?.reply === 'string' ? input.reply.trim() : ''
        if (!route || (!route.onReply && !route.delivery) || !text || text.length > maxReplyChars) {
          return false
        }
        if (!route.delivery) {
          const reply = route.onReply
          route.onReply = undefined
          route.delivery = Promise.resolve().then(() => reply(text)).then(() => true, () => false)
        }
        return route.delivery
      }

      return false
    },
    dispose() {
      disposed = true
      for (const route of routes.values()) route.release()
    },
  }
}
