import Schema from '@deepseek-ai/schemastery'
import { createWindowsToast } from './toast.js'
import { summarizeCompletion } from './summary.js'
import { createReminderQueue } from './queue.js'

export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('启用 Windows 系统通知').volatile(),
  durationSeconds: Schema.number().min(1).max(300).step(1).default(10)
    .description('连续提交系统通知的最短间隔（秒）').volatile(),
  title: Schema.string().default('DSH 任务完成').description('通知标题'),
  message: Schema.string().default('主会话已完成本轮任务。').description('没有最终文字回复时的备用提示'),
  summaryMaxChars: Schema.number().min(60).max(1000).step(1).default(180).description('AI 总结最大字符数'),
  summaryTimeoutSeconds: Schema.number().min(1).max(60).step(1).default(15).description('AI 总结超时秒数'),
})

/** Keep the popup configuration key for existing profiles. */
export function createPopupModule(ctx, config, notifier = createWindowsToast(config)) {
  const logger = ctx.logger('reminder-popup')
  const queue = createReminderQueue({
    enabled: config.enabled.get(), intervalSeconds: config.durationSeconds.get(),
    prepare: async options => ({ message: await summarizeCompletion(ctx.llm, config, options, error => {
      logger.warn(`AI 任务总结失败：${error instanceof Error ? error.message : String(error)}`)
    }) }),
    show: options => notifier.notify(options),
  })
  return {
    notify: options => queue.enqueue(options),
    update() {
      queue.setEnabled(config.enabled.get())
      queue.setIntervalSeconds(config.durationSeconds.get())
    },
    dispose() { queue.dispose(); notifier.dispose() },
  }
}
