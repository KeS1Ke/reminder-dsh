import { fileURLToPath } from 'node:url'
import Schema from '@deepseek-ai/schemastery'
import { createWindowsToast } from './toast.js'
import { summarizeCompletion } from './summary.js'
import { createReminderQueue } from './queue.js'
import { createSessionOpenRequests } from './open.js'
import { customSoundPath, removeCustomSound, saveCustomSound } from './sound.js'

const defaultSound = fileURLToPath(new URL('../../../assets/ding.wav', import.meta.url))

export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('启用 Windows 完成和审批通知').volatile(),
  durationSeconds: Schema.number().min(1).max(300).step(1).default(10)
    .description('连续提交系统通知的最短间隔（秒）').volatile(),
  showSummary: Schema.boolean().default(true)
    .description('在通知正文中显示压缩到 3 行的任务总结；关闭后只显示会话标题').volatile(),
  soundEnabled: Schema.boolean().default(true)
    .description('弹窗出现时播放提示音。默认约 1 秒叮声，可改用不超过 5 秒的自定义音效').volatile(),
  title: Schema.string().default('DSH 任务完成').description('无法取得会话标题时的通知标题'),
  message: Schema.string().default('主会话已完成本轮任务。').description('没有最终文字回复时的备用提示'),
  summaryMaxChars: Schema.number().min(20).max(60).step(1).default(60)
    .description('AI 总结最大字符数；通知正文按 3 行预算展示，最多 60 字'),
  summaryTimeoutSeconds: Schema.number().min(1).max(60).step(1).default(15).description('AI 总结超时秒数'),
})

function currentSound(config) {
  if (!config.soundEnabled.get()) return undefined
  return customSoundPath() ?? defaultSound
}

/** Owner-only route for the optional toast sound. The file stays in the plugin data folder. */
function attachSoundRoute(ctx, logger) {
  ctx.inject(['connection'], scope => {
    try {
      return scope.connection.fetch.register({
        path: '/api/reminder-dsh/sound', methods: ['GET', 'POST', 'DELETE'], requestBody: 'buffered',
        async fetch(request) {
          const headers = { 'cache-control': 'no-store' }
          if (request.method === 'GET') return Response.json({ custom: Boolean(customSoundPath()) }, { headers })
          if (request.method === 'DELETE') {
            removeCustomSound()
            return new Response(null, { status: 204, headers })
          }
          try {
            const name = new URL(request.url).searchParams.get('name') ?? ''
            saveCustomSound(name, Buffer.from(await request.arrayBuffer()))
            return Response.json({ custom: true }, { headers })
          } catch (error) {
            const message = error instanceof Error ? error.message : '音效未保存'
            return Response.json({ error: message }, { status: 400, headers })
          }
        },
      })
    } catch (error) {
      logger.warn(`提示音上传不可用：${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

/** DSH's Fetch router admits only authenticated owner peers and forwards request cancellation. */
function attachSessionOpenRoute(ctx, requests, logger) {
  ctx.inject(['connection'], scope => {
    try {
      return scope.connection.fetch.register({
        path: '/api/reminder-dsh/session-open', methods: ['GET'], requestBody: 'buffered',
        async fetch(request) {
          const acknowledgedId = new URL(request.url).searchParams.get('ack')
          const open = await requests.take(acknowledgedId, request.signal)
          const headers = { 'cache-control': 'no-store' }
          return open ? Response.json(open, { headers }) : new Response(null, { status: 204, headers })
        },
      })
    } catch (error) {
      // Keep sending reminders when the host's session navigation route is unavailable.
      logger.warn(`会话跳转路由不可用：${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

/** Keep the popup configuration key for existing profiles. */
export function createPopupModule(ctx, config, notifier = createWindowsToast(config)) {
  const logger = ctx.logger('reminder-popup')
  let approvals = new AbortController()
  const opens = createSessionOpenRequests()
  const openOf = options => options.sessionId
    ? () => opens.request(options.sessionId)
    : undefined
  const queue = createReminderQueue({
    enabled: config.enabled.get(), intervalSeconds: config.durationSeconds.get(),
    prepare: async options => ({
      title: options.sessionTitle || config.title,
      message: config.showSummary.get()
        ? await summarizeCompletion(ctx.llm, config, options, error => {
          logger.warn(`AI 任务总结失败：${error instanceof Error ? error.message : String(error)}`)
        })
        : '',
    }),
    show: options => notifier.notify({ ...options, onOpen: openOf(options), sound: currentSound(config) }),
  })
  attachSessionOpenRoute(ctx, opens, logger)
  attachSoundRoute(ctx, logger)
  return {
    notify: options => queue.enqueue(options),
    notifyApproval(options) {
      if (!config.enabled.get()) return
      const signal = AbortSignal.any([options.signal, approvals.signal])
      return notifier.notify({ ...options, signal, sound: currentSound(config), onOpen: openOf(options), onDecision(outcome) {
        signal.throwIfAborted()
        return options.onDecision(outcome)
      } })
    },
    update() {
      queue.setEnabled(config.enabled.get())
      queue.setIntervalSeconds(config.durationSeconds.get())
      if (!config.enabled.get()) approvals.abort()
      else if (approvals.signal.aborted) approvals = new AbortController()
    },
    dispose() { queue.dispose(); approvals.abort(); opens.dispose(); notifier.dispose() },
  }
}
