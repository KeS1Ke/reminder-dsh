import Schema from '@deepseek-ai/schemastery'
import { attachReminder } from './reminder.js'
import { Config as PopupConfig, createPopupModule } from './modules/popup/index.js'
import { attachApprovalNotifications } from './modules/popup/approval.js'
import { Config as TaskbarConfig, createTaskbarModule } from './modules/taskbar/index.js'
import { Config as Esp32Config, createEsp32Module } from './modules/esp32/index.js'

export const name = 'dsh-reminder'
export const inject = ['llm']
export const Config = Schema.object({
  taskbar: TaskbarConfig.default({}).description('任务栏完成角标模块'),
  popup: PopupConfig.default({}).description('Windows 系统通知模块'),
  esp32: Esp32Config.default({}).description('ESP32 Wi-Fi 完成提醒'),
})

/** Mount independently controlled outputs behind one main-session completion observer. */
export function apply(ctx, config = Config({})) {
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
  if (process.platform !== 'win32') {
    ctx.logger(name).warn('Windows 提醒仅在 Windows 本机后端生效；ESP32 Wi-Fi 提醒仍可使用。')
  }
  startReminderRuntime(ctx, config)
}

/** Share only completion detection; each module keeps its own configuration and lifecycle. */
export function startReminderRuntime(ctx, config, modules = {
  ...(process.platform === 'win32' ? {
    taskbar: createTaskbarModule(config.taskbar), popup: createPopupModule(ctx, config.popup),
  } : {}),
  esp32: createEsp32Module(ctx, config.esp32),
}) {
  const logger = ctx.logger(name)
  ctx.effect(() => () => { for (const module of Object.values(modules)) module.dispose() })
  ctx.on('loader/volatile-update', () => { for (const module of Object.values(modules)) module.update() })
  if (modules.popup?.notifyApproval) {
    ctx.inject(['approval', 'typertGateway'], scope => attachApprovalNotifications(scope, modules.popup.notifyApproval))
  }
  attachReminder(ctx, options => Promise.all(Object.entries(modules).map(async ([name, module]) => {
    try { await module.notify(options) }
    catch (error) {
      if (!options.signal.aborted) logger.warn(`${name} 提醒失败：${error instanceof Error ? error.message : String(error)}`)
    }
  })), error => logger.warn(`会话提醒失败：${error instanceof Error ? error.message : String(error)}`))
}
