import { createWindowsToast } from '../src/modules/popup/toast.js'

if (process.platform !== 'win32') {
  console.error('请在 Windows 桌面会话中运行 npm run test:popup。')
  process.exitCode = 1
} else {
  const notifier = createWindowsToast({
    title: 'DSH 通知测试', message: '任务总结（演示）：Windows 系统通知已就绪。',
  })
  let done, timeout
  const reply = new Promise(resolve => { done = resolve })
  try {
    await notifier.notify({ onReply: text => { console.log('收到测试回复', text); done() } })
    await Promise.race([reply, new Promise(resolve => { timeout = setTimeout(resolve, 60_000) })])
  } finally {
    clearTimeout(timeout)
    notifier.dispose()
  }
}
