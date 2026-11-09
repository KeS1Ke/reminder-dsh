import Schema from '@deepseek-ai/schemastery'
import { createTaskbarNotifier } from './windows.js'

export const Config = Schema.object({
  enabled: Schema.boolean().default(false).description('启用 Windows 任务栏完成角标').volatile(),
  windowTitle: Schema.string().max(200).default('').description('目标窗口标题包含；留空自动识别 DSH').volatile(),
})

/** Taskbar badges do not create summaries or popup windows. */
export function createTaskbarModule(config, notifier = createTaskbarNotifier({
  isEnabled: () => config.enabled.get(), getWindowTitle: () => config.windowTitle.get(),
})) {
  let title = config.windowTitle.get()
  return {
    notify: options => config.enabled.get() ? notifier.notify(options) : Promise.resolve(),
    update() {
      if (!config.enabled.get() || title !== config.windowTitle.get()) notifier.stop()
      title = config.windowTitle.get()
    },
    dispose: () => notifier.dispose(),
  }
}
