# reminder-dsh

DeepSeek Harness 的 Windows 提醒插件，包含两个独立模块：**任务栏图标闪烁**和**带 AI 总结、快速回复的弹窗**。在 DSH 设置中分别开关，可单独开启、同时开启或全部关闭；修改即时生效。

[English](README.md)

## 要求与安装

- Windows 10/11 本机交互式桌面会话。
- PowerShell 7，`pwsh.exe` 必须在 PATH 中；不会回退到 Windows PowerShell 5.1。
- Node.js **24.9.0+**，DSH **`>=0.2.2-rc.1 <0.3.0`**。

原仓库骨架提到的 DSH `0.1.1-rc.2` 不支持本版采用的动态配置接口，需要升级。实现依据官方源码 [`fcc0ad4`](https://github.com/deepseek-ai/deepseek-harness/tree/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159)。

```powershell
winget install --id Microsoft.PowerShell --source winget
pwsh --version

dsh plugin --profile web add github:KeS1Ke/reminder-dsh
dsh --profile web
```

将 `web` 替换成你实际使用的 profile。首次安装后重启对应 DSH；之后调整提醒开关和间隔无需重启。如果安装 PowerShell 后仍找不到 pwsh，请重启终端和 DSH，使 PATH 更新。

包名保留为 `@kesike/dsh-taskbar-reminder`，配置条目 ID 保留为 `dsh-taskbar-reminder`。旧骨架补丁里错误的非 scoped 包名已修正。不要修改条目 ID，也不要在每个 agent 内重复安装。

如果安装过独立的 `dsh-winreminder`，请先从该 profile 移除它及其 `id: winreminder` 配置覆盖，避免重复提醒。新版的弹窗配置位于 `popup` 下，任务栏配置位于 `taskbar` 下。

## 在设置中选择提醒功能

打开 **设置 → 通用**，也可进入本插件的详情配置页。

| 模块 / 字段 | 默认值 | 行为 |
| --- | --- | --- |
| Windows 任务栏图标闪烁 | 关闭 | 主会话完成后闪烁 DSH 窗口的任务栏图标，不显示弹窗，不调用模型总结。 |
| 目标窗口标题包含 | 空 | 自动识别 DSH 窗口；可填写更具体的标题文字。 |
| Windows 弹窗对话提醒 | 开启 | 显示 AI 任务总结、快速回复输入框，左侧“关闭”、右侧“发送”。 |
| 自动切换间隔 | 10 秒 | 可设为 1–300 秒整数，点击“保存间隔”后立即生效。 |

设置使用 DSH 原生 ConfigForm 和 `.volatile()` 动态引用，保存到当前 profile 的配置覆盖层，不重新挂载插件。只读配置、上层覆盖或网络错误导致保存被拒绝时，会显示失败反馈。

两个模块独立运行：关闭任务栏模块只停止闪烁；关闭弹窗模块会取消其摘要、关闭其窗口、丢弃未发送草稿并清空其队列。重新开启后仅处理新的任务完成事件，不补发关闭期间的提醒。提醒开关不影响 DSH 任务本身。

## 模块一：任务栏闪烁

通过 `pwsh` 调用 Windows `FlashWindowEx`，只闪烁任务栏，不抢占焦点。已在前台的目标窗口不闪烁；切回目标窗口或约 10 秒后停止。同时完成的多个主会话会合并为一次闪烁，后续完成会刷新闪烁时间。

默认识别标题中的 `DeepSeek Harness`、`DSH` 或 `DSH Local Build` 产品名，优先选择属于当前 DSH 后端进程祖先的匹配窗口。如果只能通过标题找到多个窗口，不会任意选择，而是记录提示，要求设置更具体的目标窗口标题。

浏览器使用场景中，DSH 标签页需要是该浏览器窗口当前显示的标签页，窗口本身可以在后台或最小化。若浏览器已经切到别的标签，自动识别通常找不到 DSH；可填写目标窗口标题，但请保证该文字能唯一定位你要提醒的窗口。该模块不能可靠地通过窗口标题区分同名的多个独立 DSH 实例。

找不到窗口、匹配不唯一、缺少 pwsh 或系统策略阻止原生调用时，原因会记录在 DSH 日志中，弹窗模块不受影响。关闭任务栏模块会请求子进程停止闪烁并退出；进程异常时有超时和有限闪烁次数作为上限。

## 模块二：弹窗与快速回复

主会话正常结束并进入空闲后，在主屏幕右下角显示白底 WPF 窗口，使用官方黑鲸鱼图标。正文是 AI 生成的上一轮任务总结，其下为会话 ID 和快速回复输入框；底部左侧“关闭”，右侧“发送”。这是独立窗口，不存入 Windows 通知中心。

点击“发送”或按 **Ctrl+Enter** 回复原主会话，Enter 换行。空白输入不可发送，每条最多 8000 字符。输入框获得焦点或文字变化后暂停自动切换，保留草稿，直到发送或手动关闭。

回复通过本地进程管道交给原 agent 的 `followup()`，不使用剪贴板、模拟按键或额外网络服务。原会话正在运行时进入下一轮队列；DSH 接受回复后才关闭弹窗。重复点击只提交一次，失败时显示原因并保留文字。确认超时会禁用再次发送，请回到 DSH 检查是否送达，避免重复操作。手动关闭丢弃草稿，不会撤回已提交的消息。

### 单窗口队列

一次只显示一个主会话提醒，子代理会话不入队。多个主会话同时完成时按完成事件顺序展示，即使摘要生成速度不同也不改变顺序。

默认间隔 10 秒时，第一条未操作则在 10 秒后关闭并接着展示第二条；提前关闭或发送时，第二条仍要等第一条显示满 10 秒。两条之间不额外空等 10 秒。摘要生成或 pwsh 启动较慢可能延后显示，但不会同时打开两个窗口。

修改间隔会即时更新未编辑窗口及等待队列。时间从当前/上一条窗口最初显示时计算：缩短后已到期则关闭未编辑窗口并继续；延长则继续等待。正在输入的窗口不因修改间隔而关闭。原会话关闭时会取消其未展示或正在展示的提醒。不同 DSH 进程不共享队列。

### AI 任务总结

取本次运行最后一轮的最终文字回复，用完成时的会话模型生成简短中文总结，要求保留失败、未完成事项和验证限制。不会使用其他轮次、子会话、思考过程或工具参数。

每次有最终文字回复的正常完成会多一次模型调用，使用 DSH 已配置的提供商和凭据，可能产生额外用量；仅开启任务栏模块时不会发生这次调用。摘要是辅助请求，不追加原会话的用户消息，也不启动新 agent 轮次。

默认等待最多 15 秒、总结最多 180 字符；超长回复只取首尾合计 12000 字符。超时或失败时明确显示“AI 总结暂不可用”并附最终回复摘录；没有最终文字回复时说明原因并使用备用文案。模型摘要不能替代对实际完成情况的检查。

## 提醒触发条件

两个模块共用主会话完成检测：观察到 `running`，最后一个 `turn/end` 为 `completed`，再进入 `idle`。子代理（`origin: subagent` 或 `delegationDepth > 0`）、取消、报错、阻止执行、输出长度达到上限、历史恢复和重复空闲事件不提醒。普通会话分叉仍算主会话。

这里只表示本轮正常结束并空闲，不保证任务业务目标全部完成。后台工作随后唤醒主会话并再次正常完成时，会产生新的完成事件。

## 文件配置

在当前 profile 的 `cordis.patch.yml` 添加覆盖项：

```yaml
- id: dsh-taskbar-reminder
  config:
    taskbar:
      enabled: false
      windowTitle: ''
    popup:
      enabled: true
      durationSeconds: 10
      title: DSH 任务完成
      message: 主会话已完成本轮任务。
      summaryMaxChars: 180
      summaryTimeoutSeconds: 15
```

`taskbar.enabled`、`taskbar.windowTitle`、`popup.enabled`、`popup.durationSeconds` 支持热更新；其余为普通配置，修改时遵循插件重载。`summaryMaxChars` 为 60–1000，`summaryTimeoutSeconds` 为 1–60。

## 模块目录

```text
src/index.js                 组合两个模块、注册热更新
src/reminder.js              共用主会话完成检测和回复绑定
src/modules/taskbar/         原生任务栏闪烁、窗口定位、子进程管理
src/modules/popup/           AI 总结、单窗口队列、WPF 弹窗、快速回复
lib/index.js                兼容原包入口
lib/client.js               DSH 设置界面的两个模块配置
```

## 验证与开发

```powershell
git clone https://github.com/KeS1Ke/reminder-dsh.git
cd reminder-dsh
npm ci --ignore-scripts
npm test
npm run test:settings-ui
npm run test:popup
npm run test:taskbar
```

`test:popup` 的回复只输出到测试终端，不发给 DSH，也不调用模型。`test:taskbar` 需要有可匹配的 DSH 窗口，可通过 `npm run test:taskbar -- "具体窗口标题"` 指定匹配文字。

自动测试覆盖真实 Cordis Loader 动态更新、模块独立开关、排队和间隔重算、回复绑定、摘要回退及子进程行为。Chromium 测试验证设置组件与保存反馈，其服务由测试夹具提供；可用 `CHROMIUM_PATH` 指定浏览器。Windows 专用测试验证 pwsh、WPF 和 Win32 辅助代码；Linux 会跳过这些测试。真实任务栏可见效果、完整 DSH 设置和模型服务仍应在目标 Windows 桌面验证。

提醒发生在 **DSH 后端所在 Windows 机器**。WSL/Linux 后端、远程 Windows 浏览器连接到别处后端、Windows 服务或无人登录会话不保证有可见提醒。

## 卸载

```powershell
dsh plugin --profile web remove @kesike/dsh-taskbar-reminder
```

删除手工添加的 `id: dsh-taskbar-reminder` 覆盖项并重启 DSH。

## 许可证

插件代码采用 [MIT](LICENSE)。官方图标来源和 DeepSeek 许可见 [assets/README.md](assets/README.md)。这是第三方插件，不是 DeepSeek 官方产品。
