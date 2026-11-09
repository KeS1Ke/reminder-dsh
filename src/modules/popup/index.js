import Schema from '@deepseek-ai/schemastery'
import { createWindowsToast } from './toast.js'
import { summarizeCompletion } from './summary.js'
import { createReminderQueue } from './queue.js'

export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('启用 Windows 完成和审批通知').volatile(),
  durationSeconds: Schema.number().min(1).max(300).step(1).default(10)
    .description('连续提交系统通知的最短间隔（秒）').volatile(),
  showSummary: Schema.boolean().default(true)
    .description('在通知正文中显示压缩到 3 行的任务总结；关闭后只显示会话标题').volatile(),
  title: Schema.string().default('DSH 任务完成').description('无法取得会话标题时的通知标题'),
  message: Schema.string().default('主会话已完成本轮任务。').description('没有最终文字回复时的备用提示'),
  summaryMaxChars: Schema.number().min(20).max(1000).step(1).default(60)
    .description('AI 总结最大字符数；通知正文按 3 行预算展示，最多 60 字'),
  summaryTimeoutSeconds: Schema.number().min(1).max(60).step(1).default(15).description('AI 总结超时秒数'),
})

/** Keep the popup configuration key for existing profiles. */
export function createPopupModule(ctx, config, notifier = createWindowsToast(config)) {
  const logger = ctx.logger('reminder-popup')
  let approvals = new AbortController()
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
    show: options => notifier.notify(options),
  })
  return {
    notify: options => queue.enqueue(options),
    notifyApproval(options) {
      if (!config.enabled.get()) return
      const signal = AbortSignal.any([options.signal, approvals.signal])
      return notifier.notify({ ...options, signal, onDecision(outcome) {
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
    dispose() { queue.dispose(); approvals.abort(); notifier.dispose() },
  }
}
