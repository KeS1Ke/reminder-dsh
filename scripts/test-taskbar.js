import { createTaskbarNotifier } from '../src/modules/taskbar/windows.js'

if (process.platform !== 'win32') {
  console.error('请在 Windows 桌面会话中运行任务栏测试。')
  process.exitCode = 1
} else {
  const notifier = createTaskbarNotifier({ isEnabled: () => true, getWindowTitle: () => process.argv[2] ?? '' })
  try { await notifier.notify() }
  catch (error) { console.error(error.message); process.exitCode = 1 }
  finally { notifier.dispose() }
}
