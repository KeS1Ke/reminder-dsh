# reminder-dsh

在 Windows 上接收 DeepSeek Harness（DSH）的完成提醒和审批请求。通知带有会话标题，可以直接回复原会话或处理当前审批。需要安静一点时，可以单独使用任务栏角标，查看还有多少完成提醒未读。

[English](https://github.com/KeS1Ke/reminder-dsh/blob/main/README.md) · [npm](https://www.npmjs.com/package/@kesike/reminder-dsh)

## 安装或更新

需要 Windows 10/11 本机交互式桌面会话、Node.js 24.9.0+ 和 DSH `>=0.2.2-rc.1 <0.3.0`。系统通知使用 Windows 自带的 `powershell.exe`，任务栏角标需要 PATH 中有 PowerShell 7（`pwsh.exe`）。提醒在 DSH 后端所在的 Windows 机器上出现。

```powershell
dsh plugin --profile desktop add @kesike/reminder-dsh
```

安装或更新后完全退出并重新打开 DSH Desktop。Web 版请使用实际运行 Windows 后端的 profile，例如 `dsh plugin --profile web add @kesike/reminder-dsh`，然后重启该后端。也可把命令里的包名换成 `github:KeS1Ke/reminder-dsh` 从 GitHub 安装。

## 设置提醒方式

打开 DSH 的 **设置 → 通知**。

| 设置 | 默认值 | 用途 |
| --- | --- | --- |
| Windows 系统通知 | 开启 | 接收主会话完成和人工审批的原生通知 |
| 在通知中显示任务总结 | 开启 | 在完成通知正文中加入简短 AI 总结 |
| 通知发送间隔 | 10 秒 | 两条完成通知提交给 Windows 的最短间隔，可设 1–300 秒 |
| Windows 任务栏完成角标 | 关闭 | 在目标窗口的任务栏图标上显示未查看完成数 |
| 目标窗口标题包含 | 空 | 自动识别 DSH 窗口，或填写能唯一匹配的标题文字 |

修改开关后，点击页底的 **保存** 一次应用，点击 **取消** 丢弃未保存修改。窗口标题和发送间隔各有单独的保存按钮。设置保存到当前 profile 后立即生效。

## 完成、回复和审批

- **完成通知**使用会话标题，取不到标题时用配置的备用标题。主会话正常结束并进入空闲才触发。子会话、失败或取消的轮次以及恢复历史会话均不触发完成提醒。多个完成事件按顺序提交。
- **AI 任务总结**使用会话当前模型，对最后一轮的最终文字回复生成约 3 行的中文总结，可能产生额外模型用量。总结失败时显示带提示的摘录。关闭总结后跳过这次模型调用。
- **快速回复**把消息送回发出该通知的会话。每条完成通知可回复一次，入口保留 24 小时，要求原会话及后端仍可用。
- **人工审批**在通知正文中显示申请工具和原因。「允许」仅授予本次请求一次，「拒绝」驳回本次请求。通知按钮与会话内审批卡片处理的是同一个待决请求。
- **任务栏角标**在目标窗口位于后台时累加未查看完成数。切回目标窗口后清零，超过 99 显示 `99+`。使用 Web 版时，请让 DSH 标签页保持为该浏览器窗口的当前标签页。

## 点击通知返回会话

点击完成或审批通知正文会请求打开原会话。后端保留最近一次点击，等前台 DSH 界面确认接收。0.2.2 修复了通知激活器继承 Electron Node 模式变量、导致 `dsh://open` 无法正常唤起桌面版的问题。

实际点击仍可能遇到 Windows 回调未送达或窗口未置前。如果没有跳转，请打开 DSH，按通知显示的会话标题找到原会话。更新或重启后请使用新生成的通知，旧通知的跳转和交互入口可能随原后端退出而失效。

横幅和通知中心由 Windows 管理。插件使用当前用户的通知身份，检测到 DSH Desktop 时会创建当前用户的开始菜单快捷方式。通知交互通过本机激活器和命名管道交给插件后端。

## 配置文件与卸载

在当前 profile 的 `cordis.patch.yml` 中使用 `dsh-reminder` 条目，分开配置 `popup` 和 `taskbar`。参见 [配置示例](https://github.com/KeS1Ke/reminder-dsh/blob/main/example.patch.yml)。从 `@kesike/dsh-taskbar-reminder` 迁移时，先卸载旧包，将 `dsh-taskbar-reminder` 条目改为 `dsh-reminder` 并保留原配置。如还安装了独立的 `dsh-winreminder`，请移除旧插件以避免重复提醒。

卸载时运行 `dsh plugin --profile desktop remove @kesike/reminder-dsh`，将 `desktop` 替换为实际 profile，移除手工添加的 `dsh-reminder` 配置覆盖，然后重启 DSH。

## 开发验证

```powershell
npm ci --ignore-scripts
npm test
npm run test:settings-ui
npm pack --dry-run
```

在 Windows 上用 `npm run test:popup` 发送测试通知，或用 `npm run test:taskbar -- "窗口标题"` 检查角标。设置页浏览器测试可通过 `CHROMIUM_PATH` 指定 Chromium。

插件代码采用 [MIT](https://github.com/KeS1Ke/reminder-dsh/blob/main/LICENSE) 许可证，图标来源及许可见 [资源说明](https://github.com/KeS1Ke/reminder-dsh/blob/main/assets/README.md)。
