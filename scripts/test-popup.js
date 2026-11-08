import { createWindowsNotifier } from '../src/modules/popup/windows.js'

if (process.platform !== 'win32') {
  console.error('请在 Windows 桌面会话中运行 npm run test:popup。')
  process.exitCode = 1
} else {
  const notifier = createWindowsNotifier({
    title: 'DSH 提醒测试', message: '上一轮任务总结（演示）\n已完成快速回复功能，关闭按钮在左侧，发送按钮在右侧。', durationSeconds: 5,
  })
  await notifier.notify({
    sessionId: 'local-popup-test',
    onReply: text => { console.log('测试回复（未发送到 DSH）：', text) },
  })
}
