# reminder-dsh

DeepSeek Harness 的 Windows 提醒插件提供**原生系统通知**和**任务栏图标闪烁**。在 DSH 的「设置 → 通知」中可分别开关，修改即时生效。

[English](README.md)

## 要求与安装

- Windows 10/11 本机交互式桌面会话。
- 系统通知使用 Windows 自带的 `powershell.exe`。任务栏闪烁需要 PowerShell 7，`pwsh.exe` 须在 PATH 中。
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

如果安装过独立的 `dsh-winreminder`，请先从该 profile 移除它及其 `id: winreminder` 配置覆盖，避免重复提醒。系统通知沿用 `popup` 配置，任务栏配置位于 `taskbar` 下。

## 在设置中选择提醒功能

打开设置，在左侧选择 **通知**。

| 模块 / 字段 | 默认值 | 行为 |
| --- | --- | --- |
| Windows 任务栏图标闪烁 | 关闭 | 主会话完成后闪烁 DSH 窗口的任务栏图标。 |
| 目标窗口标题包含 | 空 | 自动识别 DSH 窗口；可填写更具体的标题文字。 |
| Windows 系统通知 | 开启 | 通过原生通知横幅和通知中心显示任务总结。 |
| 通知发送间隔 | 10 秒 | 控制连续发送的最短间隔，可设为 1–300 秒整数。 |

设置使用 DSH 原生 ConfigForm 和 `.volatile()` 动态引用，保存到当前 profile 的配置覆盖层，不重新挂载插件。只读配置、上层覆盖或网络错误导致保存被拒绝时，会显示失败反馈。

两个模块独立运行。关闭任务栏闪烁会停止闪烁，关闭系统通知会取消尚未发送的提醒。重新开启后仅处理新的任务完成事件。

## 模块一：任务栏闪烁

通过 `pwsh` 调用 Windows `FlashWindowEx`，只闪烁任务栏，不抢占焦点。已在前台的目标窗口不闪烁；切回目标窗口或约 10 秒后停止。同时完成的多个主会话会合并为一次闪烁，后续完成会刷新闪烁时间。

默认识别标题中的 `DeepSeek Harness`、`DSH` 或 `DSH Local Build` 产品名，优先选择属于当前 DSH 后端进程祖先的匹配窗口。如果只能通过标题找到多个窗口，不会任意选择，而是记录提示，要求设置更具体的目标窗口标题。

浏览器使用场景中，DSH 标签页需要是该浏览器窗口当前显示的标签页，窗口本身可以在后台或最小化。若浏览器已经切到别的标签，自动识别通常找不到 DSH；可填写目标窗口标题，但请保证该文字能唯一定位你要提醒的窗口。该模块不能可靠地通过窗口标题区分同名的多个独立 DSH 实例。

找不到窗口、匹配不唯一、缺少 pwsh 或系统策略阻止原生调用时，原因会记录在 DSH 日志中。关闭任务栏模块会请求子进程停止闪烁并退出；进程异常时有超时和有限闪烁次数作为上限。

## 模块二：Windows 系统通知

主会话正常结束并进入空闲后，插件以 **DSH Reminders** 为发送来源提交原生 Toast。顶部显示应用图标和名称，正文显示单行标题、最多四行任务总结和快速回复框。横幅外观、显示时间和通知中心收录由 Windows 管理，受系统通知与勿扰设置控制。

在通知中输入内容并点击「发送」，Windows 回调会通过本机命名管道将回复交给触发该通知的 DSH 会话。每条通知可回复一次，回复入口在发送后 24 小时内有效，并要求原会话和 DSH 后端仍在运行。遇到回复未确认的提示时，请回到原会话核对后再发送。

多个主会话同时完成时，按完成事件顺序提交。发送间隔从上一条提交成功后开始计算，修改后立即重算等待时间。原会话关闭会取消该会话尚未提交的提醒。已提交的通知由 Windows 通知中心管理。

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

`taskbar.enabled`、`taskbar.windowTitle`、`popup.enabled`、`popup.durationSeconds` 支持热更新。`popup.durationSeconds` 现在表示连续通知的发送间隔。其余为普通配置，修改时遵循插件重载。`summaryMaxChars` 为 60–1000，`summaryTimeoutSeconds` 为 1–60。

## 模块目录

```text
src/index.js                 组合两个模块、注册热更新
src/reminder.js              共用主会话完成检测
src/modules/taskbar/         原生任务栏闪烁、窗口定位、子进程管理
src/modules/popup/           AI 总结、发送队列、Windows 原生通知
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

`test:popup` 发送一条示例系统通知，并将测试回复打印到终端。`test:taskbar` 需要有可匹配的 DSH 窗口，可通过 `npm run test:taskbar -- "具体窗口标题"` 指定匹配文字。

自动测试覆盖真实 Cordis Loader 动态更新、模块独立开关、排队和间隔重算、摘要回退及子进程行为。Chromium 测试通过测试夹具验证「通知」注册和设置保存，可用 `CHROMIUM_PATH` 指定浏览器。Windows 专用测试验证原生通知载荷和 Win32 辅助代码。

提醒发生在 **DSH 后端所在 Windows 机器**。WSL/Linux 后端、远程 Windows 浏览器连接到别处后端、Windows 服务或无人登录会话不保证有可见提醒。

## 卸载

```powershell
dsh plugin --profile web remove @kesike/dsh-taskbar-reminder
```

删除手工添加的 `id: dsh-taskbar-reminder` 覆盖项并重启 DSH。

## 许可证

插件代码采用 [MIT](LICENSE)。官方图标来源和 DeepSeek 许可见 [assets/README.md](assets/README.md)。这是第三方插件，不是 DeepSeek 官方产品。
