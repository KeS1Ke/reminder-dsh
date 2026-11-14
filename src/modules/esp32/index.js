import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import Schema from '@deepseek-ai/schemastery'

export const Config = Schema.object({
  enabled: Schema.boolean().default(false).description('将任务完成提醒发送到 ESP32').volatile(),
  address: Schema.string().default('').description('ESP32 屏幕显示的 HTTP 地址，如 http://192.168.137.22:8080').volatile(),
  token: Schema.string().role('secret').default('').description('设备配对凭据；重启设备或重新开启手机控制后需重新配对').volatile(),
  soundEnabled: Schema.boolean().default(true).description('ESP32 收到提醒时播放提示音').volatile(),
})

/** The board accepts a numeric LAN Host on port 8080. Never follow redirects. */
export function deviceAddress(value) {
  let url
  try { url = new URL(value) } catch { throw new Error('请输入设备显示的完整 HTTP 地址。') }
  const parts = url.hostname.split('.').map(Number)
  const local = parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
  if (url.protocol !== 'http:' || isIP(url.hostname) !== 4 || !local || url.port !== '8080'
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('请使用设备显示的局域网 HTTP 地址（端口 8080）。')
  }
  return url.origin
}

function boundedText(value, bytes) {
  let text = ''
  for (const char of String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()) {
    if (Buffer.byteLength(text + char) > bytes) break
    text += char
  }
  return text
}

class DeviceError extends Error {
  constructor(status) {
    super(status === 401 ? '设备配对已失效，请重新开启设备的手机控制并配对。'
      : status === 404 ? '设备固件尚不支持 DSH 提醒，请先更新固件。'
        : status === 429 ? '配对尝试过多，请等待 60 秒。'
          : status === 409 ? '设备忙或已配对，请检查设备。' : `设备请求失败（HTTP ${status}）。`)
    this.status = status
  }
}

export async function deviceRequest(address, path, body, token, signal, fetcher = fetch) {
  const response = await fetcher(deviceAddress(address) + path, {
    method: 'POST', redirect: 'error',
    headers: { 'content-type': 'application/json', ...token ? { authorization: `Bearer ${token}` } : {} },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    signal: AbortSignal.any([AbortSignal.timeout(2500), ...signal ? [signal] : []]),
  })
  if (!response.ok) { await response.body?.cancel(); throw new DeviceError(response.status) }
  // Read responses under the same deadline, with a cap even for an unexpected LAN service.
  const reader = response.body?.getReader()
  let result = '', bytes = 0
  if (reader) try {
    const decoder = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 1024) throw new Error('设备响应过长。')
      result += decoder.decode(value, { stream: true })
    }
    result += decoder.decode()
  } finally { await reader.cancel() }
  return JSON.parse(result)
}

function payload(options, sound) {
  const body = {
    version: 1, type: 'task.completed', id: randomUUID(),
    title: boundedText(options.sessionTitle, 128) || 'DSH 任务完成',
    message: boundedText(options.completedText || '主会话已完成本轮任务。', 384), sound,
  }
  // Quotes and backslashes expand in JSON; the board limits the entire wire body to 1023 bytes.
  const chars = Array.from(body.message)
  while (Buffer.byteLength(JSON.stringify(body)) >= 1024 && chars.length) {
    chars.pop(); body.message = chars.join('')
  }
  return body
}

/** One bounded delivery per completion, independent of toast summaries and queues. */
export function createEsp32Module(ctx, config, fetcher = fetch) {
  let lifetime = new AbortController(), disposed = false, pending = 0
  const fingerprint = () => JSON.stringify([config.enabled.get(), config.address.get(), config.token.get(), config.soundEnabled.get()])
  let previous = fingerprint()
  const credentials = () => {
    const address = deviceAddress(config.address.get())
    const token = config.token.get()
    if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('请先配对 ESP32。')
    return { address, token }
  }
  async function send(options, test = false) {
    if (disposed || (!test && !config.enabled.get())) return
    if (pending >= 8) throw new Error('ESP32 待发送提醒已满，请检查设备连接。')
    const { address, token } = credentials()
    const moduleSignal = lifetime.signal
    const signal = AbortSignal.any([moduleSignal, ...options.signal ? [options.signal] : []])
    const body = payload(options, config.soundEnabled.get())
    ++pending
    try {
      for (let attempt = 0; ; ++attempt) {
        signal.throwIfAborted()
        try {
          const result = await deviceRequest(address, '/api/reminder', body, token, signal, fetcher)
          if (result.accepted !== true) throw new Error('设备未确认接收提醒。')
          return result
        } catch (error) {
          if (signal.aborted || attempt >= 2 || (error instanceof DeviceError && ![408, 409, 429, 503].includes(error.status))) throw error
          await delay(400 * 2 ** attempt, undefined, { signal })
        }
      }
    } catch (error) {
      if (!moduleSignal.aborted) throw error
    } finally { --pending }
  }
  // Forward through DSH's owner-authenticated backend; browsers cannot call the board cross-origin.
  ctx.inject(['connection'], scope => scope.connection.fetch.register({
    path: '/api/reminder-dsh/esp32', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      const headers = { 'cache-control': 'no-store' }
      try {
        const raw = await request.text()
        if (raw.length > 1024) throw new Error('请求过长。')
        const input = JSON.parse(raw)
        if (input.action === 'pair') {
          if (disposed) throw new Error('插件已停止。')
          if (typeof input.pin !== 'string' || !/^\d{6}$/.test(input.pin)) throw new Error('请输入设备显示的六位配对码。')
          const result = await deviceRequest(input.address, '/api/pair', input.pin, undefined,
            AbortSignal.any([lifetime.signal, request.signal]), fetcher)
          if (!/^[a-f0-9]{32}$/.test(result.token)) throw new Error('设备未返回有效配对凭据。')
          return Response.json({ token: result.token }, { headers })
        }
        if (input.action !== 'test') throw new Error('未知操作。')
        const result = await send({ sessionTitle: 'DSH 连接测试', completedText: '电脑与 ESP32 已连通。', signal: request.signal }, true)
        return Response.json(result, { headers })
      } catch (error) {
        return Response.json({ error: error instanceof DeviceError ? error.message
          : error instanceof TypeError ? '无法连接设备，请检查 Wi-Fi、地址及手机控制开关。'
            : error.message || '设备请求失败。' }, { status: 400, headers })
      }
    },
  }))
  return {
    notify: options => send(options),
    update() {
      const next = fingerprint()
      if (next !== previous) { lifetime.abort(); lifetime = new AbortController(); previous = next }
    },
    dispose() { disposed = true; lifetime.abort() },
  }
}
