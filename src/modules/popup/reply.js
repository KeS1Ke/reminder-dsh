import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'

const replyLifetimeMs = 24 * 60 * 60 * 1000
const maxReplyChars = 8000
const requestPattern = /^([a-f0-9]{32}) ([A-Za-z0-9+/]+={0,2})$/

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
      const match = requestPattern.exec(request.slice(0, -1))
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

  return {
    async register(onReply) {
      if (disposed) return
      listening ??= new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(`\\\\.\\pipe\\kesike-dsh-reply-${pipeId}`, () => {
          server.unref()
          resolve()
        })
      }).catch(error => { listening = undefined; throw error })
      await listening
      if (disposed) return
      const token = randomBytes(16).toString('hex')
      const release = () => { clearTimeout(timer); routes.delete(token) }
      const timer = setTimeout(release, replyLifetimeMs).unref()
      routes.set(token, { onReply, release })
      return { argument: `${pipeId}:${token}`, release }
    },
    dispose() {
      disposed = true
      for (const route of routes.values()) route.release()
      for (const socket of sockets) socket.destroy()
      void listening?.then(() => server.close(), () => {})
    },
  }
}
