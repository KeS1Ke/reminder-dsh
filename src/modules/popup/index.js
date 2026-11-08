import Schema from '@deepseek-ai/schemastery'
import { createWindowsNotifier } from './windows.js'
import { summarizeCompletion } from './summary.js'
import { createReminderQueue } from './queue.js'

export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('启用 Windows 弹窗对话提醒').volatile(),
  durationSeconds: Schema.number().min(1).max(300).step(1).default(10)
    .description('弹窗自动切换间隔（秒，输入时暂停）').volatile(),
  title: Schema.string().default('DSH 任务完成').description('弹窗标题'),
  message: Schema.string().default('主会话已完成本轮任务。').description('没有最终文字回复时的备用提示'),
  summaryMaxChars: Schema.number().min(60).max(1000).step(1).default(180).description('AI 总结最大字符数'),
  summaryTimeoutSeconds: Schema.number().min(1).max(60).step(1).default(15).description('AI 总结超时秒数'),
})

/** Popup module owns summaries, quick replies and its single-window queue. */
export function createPopupModule(ctx, config, notifier = createWindowsNotifier({
  ...config, durationSeconds: config.durationSeconds.get(),
})) {
  const logger = ctx.logger('reminder-popup')
  const queue = createReminderQueue({
    enabled: config.enabled.get(), intervalSeconds: config.durationSeconds.get(),
    prepare: async options => ({ message: await summarizeCompletion(ctx.llm, config, options, error => {
      logger.warn(`AI 任务总结失败：${error instanceof Error ? error.message : String(error)}`)
    }) }),
    show: options => notifier.notify({ ...options, durationSeconds: config.durationSeconds.get() }),
  })
  return {
    notify: options => queue.enqueue(options),
    update() {
      queue.setEnabled(config.enabled.get())
      queue.setIntervalSeconds(config.durationSeconds.get())
      notifier.setDurationSeconds(config.durationSeconds.get())
    },
    dispose() { queue.dispose(); notifier.dispose() },
  }
}
