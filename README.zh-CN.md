# reminder-dsh

在 Windows 上接收 DeepSeek Harness（DSH）的完成提醒和审批请求。通知带有会话标题，可以直接回复原会话或处理当前审批。需要安静一点时，可以单独使用任务栏角标，查看还有多少完成提醒未读。

也可以将任务完成消息通过局域网 Wi-Fi 发送给 [ESP32-BOX3](https://github.com/KeS1Ke/ESP32-BOX3)，由设备显示中文提醒并播放提示音。ESP32 提醒独立于 Windows 弹窗，可用于 Windows、Linux 或 macOS 上的 DSH 后端。

[English](https://github.com/KeS1Ke/reminder-dsh/blob/main/README.md) · [npm](https://www.npmjs.com/package/@kesike/reminder-dsh)

## 安装或更新

需要 Node.js 24.9.0+ 和 DSH `>=0.2.2-rc.1 <0.3.0`。Windows 提醒还需要 Windows 10/11 本机交互式桌面会话；系统通知使用 Windows 自带的 `powershell.exe`，任务栏角标需要 PATH 中有 PowerShell 7（`pwsh.exe`）。Windows 提醒在 DSH 后端所在的 Windows 机器上出现，单独使用 ESP32 提醒无需 Windows 或 PowerShell。

```powershell
dsh plugin --profile desktop add @kesike/reminder-dsh
```

安装或更新后完全退出并重新打开 DSH Desktop。Web 版请使用实际运行 Windows 后端的 profile，例如 `dsh plugin --profile web add @kesike/reminder-dsh`，然后重启该后端。也可把命令里的包名换成 `github:KeS1Ke/reminder-dsh` 从 GitHub 安装。

## 设置提醒方式

打开 DSH 的 **设置 → 通知**。

| 设置 | 默认值 | 用途 |
| --- | --- | --- |
| ESP32 Wi-Fi 完成提醒 | 关闭 | 配对后向 ESP32 推送会话标题和最终回复摘录 |
| ESP32 提示音 | 开启 | 在设备现有媒体音量下播放两声短提示音 |
| Windows 系统通知 | 开启 | 接收主会话完成和人工审批的原生通知 |
| 在通知中显示任务总结 | 开启 | 在完成通知正文中加入简短 AI 总结 |
| 弹窗提示音 | 开启 | 弹窗出现时播放约 1 秒的默认叮声，或上传最长 5 秒的 wav / mp3 |
| 通知发送间隔 | 10 秒 | 两条完成通知提交给 Windows 的最短间隔，可设 1–300 秒 |
| Windows 任务栏完成角标 | 关闭 | 在目标窗口的任务栏图标上显示未查看完成数 |
| 目标窗口标题包含 | 空 | 自动识别 DSH 窗口，或填写能唯一匹配的标题文字 |

修改开关后，点击页底的 **保存** 一次应用，点击 **取消** 丢弃未保存修改。窗口标题和发送间隔各有单独的保存按钮。设置保存到当前 profile 后立即生效。

## ESP32 屏幕和声音提醒

1. 将 ESP32-BOX3 更新到包含 `/api/reminder` 的配套固件。电脑和设备连接同一个 Wi-Fi，或在电脑开启移动热点后让 ESP32 连接它。网络需要允许客户端互访；不要求连接互联网。
2. 在设备 **Setting → Phone control** 开启控制，使用 **Address mode** 查看形如 `http://192.168.137.22:8080` 的地址与六位配对码。若已和手机配对，先关闭再开启 Phone control 以生成新码。
3. 打开电脑 DSH 的 **设置 → 通知 → ESP32 Wi-Fi 完成提醒**，输入设备地址和配对码，点击 **配对并启用**。这会立即保存地址、凭据和启用状态，无需手动填写 token。
4. 点击 **发送测试提醒**，检查设备是否显示中文弹窗并发出提示音。随后 DSH 主会话成功完成并进入空闲时自动推送。失败、取消、子会话和历史恢复不会触发。

设备展示会话标题和最终回复的开头摘录，不调用 AI 生成总结，也不等待 Windows 弹窗的发送间隔。单条弹窗显示 10 秒，可点击 **Dismiss / Next** 提前关闭并查看下一条；最多排队 4 条。提示音由现有音频任务混入，不恢复暂停的音乐、不需要 SD 卡音效文件。设备须启用至少一个媒体模块并成功初始化扬声器，媒体音量为 0 时不会出声。扬声器不可用时仍显示文字。

请求从 **DSH 后端所在的电脑** 发出，浏览器只连接 DSH 自己的设置接口。使用 Web 版时，设备必须能被后端电脑访问。设备地址仅接受私有局域网 IPv4 和端口 8080；地址变化后需要重新配对。可在路由器设置 DHCP 地址保留。

配对沿用设备现有手机控制会话，同一会话由电脑或手机中的一个使用。重启设备、关闭再开启 Phone control 后凭据失效，需要重新配对；只重启 DSH 可继续使用已保存的有效凭据。凭据保存在当前 DSH profile，请勿分享配置文件。连接使用局域网 HTTP，请在自己的可信 Wi-Fi 上使用。屏幕隐私模式仍保持黑屏。

发送失败最多尝试 3 次（每次网络期限 2.5 秒），重试使用相同消息 ID；设备缓存最近 16 个 ID，避免因应答丢失重复显示或响铃。不会长期积压离线提醒，失败会记录到 DSH 日志；电脑休眠期间无法推送。最多同时发送 8 条，超出队列或重试预算的消息会报错。

## 完成、回复和审批

- **完成通知**使用会话标题，取不到标题时用配置的备用标题。主会话正常结束并进入空闲才触发。子会话、失败或取消的轮次以及恢复历史会话均不触发完成提醒。多个完成事件按顺序提交。
- **同时出现的多条弹窗**会轮流使用插件自己的通知身份。Windows 因此把新弹窗叠在仍显示的旧弹窗上方，而不是顶掉旧弹窗。插件不修改 Windows 系统文件；自定义音效只保存在当前用户的插件目录。
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
