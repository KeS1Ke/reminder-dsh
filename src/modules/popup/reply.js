import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'

const replyLifetimeMs = 24 * 60 * 60 * 1000
const maxReplyChars = 8000
const replyPattern = /^([a-f0-9]{32}) ([A-Za-z0-9+/]+={0,2})$/
const openPattern = /^([a-f0-9]{32})$/

/** Route a local Windows activation to the callback captured when its toast was sent. */
export function createToastReplies() {
  const pipeId = randomBytes(16).toString('hex')
  const routes = new Map(), sockets = new Set()
  let listening, disposed = false
  const server = createServer(socket => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
    socket.setTimeout(6000, () => socket.destroy())
    socket.setEncoding('ascii')
    let request = ''
    const receive = async chunk => {
      request += chunk
      // Base64 of at most 8000 UTF-16 code units, plus the route token.
      if (request.length > 32_034) { socket.destroy(); return }
      if (!request.endsWith('\n')) return
      socket.removeListener('data', receive)
      const line = request.slice(0, -1)
      const open = openPattern.exec(line)
      if (open) {
        const route = routes.get(open[1])
        if (!route?.onOpen) { socket.end('failed\n'); return }
        let acknowledgment = 'failed'
        try { await route.onOpen(); acknowledgment = 'ok' } catch {}
        socket.end(acknowledgment + '\n')
        return
      }
      const match = replyPattern.exec(line)
      const route = match && routes.get(match[1])
      const text = match && Buffer.from(match[2], 'base64').toString('utf8').trim()
      if (!route || !text || text.length > maxReplyChars) { socket.end('failed\n'); return }
      if (!route.delivery) {
        const reply = route.onReply
        route.onReply = undefined
        route.delivery = Promise.resolve().then(() => reply(text)).then(() => 'ok', () => 'failed')
      }
      socket.end((await route.delivery) + '\n')
    }
    socket.on('data', receive)
  })

  function listen() {
    listening ??= new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(`\\\\.\\pipe\\kesike-dsh-reply-${pipeId}`, () => {
        server.unref()
        resolve()
      })
    }).catch(error => { listening = undefined; throw error })
    return listening
  }

  function add(route, signal, suffix) {
    const token = randomBytes(16).toString('hex')
    const release = () => {
      signal?.removeEventListener('abort', release)
      clearTimeout(timer)
      routes.delete(token)
    }
    const timer = setTimeout(release, replyLifetimeMs).unref()
    routes.set(token, { ...route, release })
    signal?.addEventListener('abort', release, { once: true })
    return { argument: `${pipeId}:${token}${suffix}`, release }
  }

  return {
    async register(onReply, signal) {
      if (disposed || signal?.aborted) return
      await listen()
      if (disposed || signal?.aborted) return
      return add({ onReply }, signal, '')
    },
    /** Body-click route: navigation repeats on every activation, unlike a one-shot reply. */
    async registerOpen(onOpen, signal) {
      if (disposed || signal?.aborted) return
      await listen()
      if (disposed || signal?.aborted) return
      return add({ onOpen }, signal, ':open')
    },
    dispose() {
      disposed = true
      for (const route of routes.values()) route.release()
      for (const socket of sockets) socket.destroy()
      void listening?.then(() => server.close(), () => {})
    },
  }
}
