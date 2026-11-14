# reminder-dsh

Native Windows reminders for DeepSeek Harness (DSH). Completion and approval toasts use the session title, and you can reply or handle an approval from the notification. An optional taskbar badge counts completions while the DSH window is in the background.

An independent Wi-Fi output sends completed tasks to [ESP32-BOX3](https://github.com/KeS1Ke/ESP32-BOX3) for an on-device Chinese notification and chime. This output works with Windows, Linux and macOS DSH backends.

DeepSeek Harness 的 Windows 提醒插件。完成和审批通知以会话标题为标题，支持可选 AI 总结、通知内回复和审批，也可以在任务栏显示未查看的完成数。打开 **设置 → 通知** 即可配置。

[简体中文安装与使用说明](https://github.com/KeS1Ke/reminder-dsh/blob/main/README.zh-CN.md) · [npm package](https://www.npmjs.com/package/@kesike/reminder-dsh)

## Install or update / 安装或更新

Requirements are Node.js 24.9.0 or later and DSH `>=0.2.2-rc.1 <0.3.0`. Windows notifications additionally require Windows 10 or 11 with an interactive desktop session. Toasts use the built-in Windows PowerShell. The taskbar badge needs PowerShell 7 (`pwsh.exe` on PATH). Both run on the machine hosting the DSH backend. ESP32-only reminders need neither Windows nor PowerShell.

```powershell
dsh plugin --profile desktop add @kesike/reminder-dsh
```

Restart DSH Desktop after installation or an update. For DSH Web, use the profile that runs your Windows backend, for example `dsh plugin --profile web add @kesike/reminder-dsh`, then restart that backend. For a GitHub install, use `github:KeS1Ke/reminder-dsh` in place of the npm package name.

桌面版执行上面的命令后重启 DSH。Web 版请把 `desktop` 换成实际运行 Windows 后端的 profile。系统通知使用 Windows 自带的 PowerShell，任务栏角标需要 PATH 中有 PowerShell 7。

## Choose what you see

Open **Settings → Notifications** in DSH.

| Setting | Default | What it controls |
| --- | --- | --- |
| ESP32 Wi-Fi completion reminders | Off | Paired device notifications with session titles and final-answer excerpts |
| ESP32 sound | On | Two short notes at the device media volume |
| Windows system notifications | On | Native completion and approval toasts |
| Show task summary in notifications | On | A short AI summary of the final answer in completion toasts |
| Notification sound | On | A one-second ding with each toast, or a wav / mp3 upload of up to 5 seconds |
| Notification interval | 10 seconds | Minimum time between completion toast submissions, from 1 to 300 seconds |
| Taskbar completion badge | Off | Unread completion count on the DSH taskbar icon |
| Target window title contains | Blank | Automatic window matching, or a unique title substring you specify |

Apply switch changes together with **Save** at the bottom of the page. **Cancel** discards pending switch changes. The title and interval fields have separate save buttons. Saved settings apply without restarting the plugin.

## ESP32 setup

1. Update the ESP32-BOX3 firmware to a revision with `POST /api/reminder`. Join the same Wi-Fi as the computer, or connect the board to the computer's mobile hotspot. Local client traffic must be allowed; Internet access is unnecessary.
2. Enable **Setting → Phone control** on the board and use **Address mode** to read its HTTP address and six-digit code. If a phone is already paired, toggle Phone control off and on to obtain a new code.
3. In DSH **Settings → Notifications → ESP32 Wi-Fi completion reminders**, enter the address (for example `http://192.168.137.22:8080`) and code. Click **Pair and enable**, then **Send test reminder**.

Successful main-session completions send immediately, independently of Windows summaries and toast intervals. Failed/cancelled turns, subagents and restored history do not notify. The board displays the title and a final-answer excerpt for 10 seconds; **Dismiss / Next** advances early. Up to four messages wait on-device. Its existing embedded font supports simplified Chinese. The chime mixes through the existing I2S task, does not resume paused music, and needs no SD sound file. Enable a media module and use a nonzero media volume; a missing speaker still permits text notifications. Screen privacy remains in effect.

The **DSH backend computer** must reach the device's numeric private IPv4 address on port 8080. Browser requests go through the authenticated DSH backend. Re-pair after an address change, board restart or Phone control reset. Pairing uses the existing single-client phone session, so the computer or phone uses that session. Saved credentials survive a DSH restart, but not a board restart. They live in the DSH profile; use your own trusted LAN for its HTTP connection.

Each message gets at most three attempts, with a 2.5-second network deadline per attempt and the same id on retries. The board remembers sixteen recent ids to avoid duplicate chimes. No long-term offline backlog is kept; failures and full queues are reported in the DSH log. At most eight sends can be pending. A sleeping computer cannot send reminders. See the [Chinese setup guide](README.zh-CN.md#esp32-屏幕和声音提醒).

## Notifications and taskbar badge

- **Completion.** A toast follows a successful main-session turn once the session becomes idle. Concurrent completions are queued in order. Subagents, cancelled or failed turns, and restored history are excluded. The session title identifies the conversation, with a configured fallback when no title is available.
- **Several toasts at once.** The plugin rotates through its own notification identities so Windows stacks a new banner above a banner that is still visible, instead of replacing it. Nothing in Windows itself is modified. A custom sound stays in the current user's plugin folder.
- **AI summary.** The plugin makes an auxiliary request through the session's configured model and asks for a short Chinese summary of its final text reply. It can add model usage. A failed summary falls back to a labeled excerpt. Disable summaries to skip this request.
- **Quick reply.** Send one reply per completion toast back to its original session within 24 hours while the original session and backend are available.
- **Approval.** The toast shows the requesting tool and reason. **Allow** grants the current request once and **Reject** declines it. The toast and the in-session card share the same pending approval.
- **Taskbar badge.** Completed turns increase the count while the target window is in the background. Bringing it to the foreground clears the count. Counts above 99 appear as `99+`. For DSH Web, leave the DSH tab selected in its browser window.

## Opening a session from a toast

Click the body of a completion or approval toast to request its original session. The backend keeps the latest click until the focused DSH interface acknowledges it. Version 0.2.2 fixes an inherited Electron environment variable that could prevent `dsh://open` from starting Desktop in GUI mode.

Windows click delivery and foreground activation can still be intermittent. If DSH stays in the background or the session does not switch, open DSH and select the session named in the notification. Test with a fresh toast after upgrading or restarting. Existing toasts can outlive the backend and their local routes.

Windows manages banners and Notification Center. The plugin uses a per-user notification identity and, when it finds DSH Desktop, a per-user Start menu shortcut. Interaction routes run through the plugin's local activator and named pipe.

## Profile configuration and removal

Profile overrides use the `dsh-reminder` entry in `cordis.patch.yml` with separate `popup` and `taskbar` settings. See [example.patch.yml](https://github.com/KeS1Ke/reminder-dsh/blob/main/example.patch.yml). If you are migrating from `@kesike/dsh-taskbar-reminder`, remove that package and rename its `dsh-taskbar-reminder` entry while keeping its configuration. Remove a separate `dsh-winreminder` install if present to prevent duplicate notifications.

To remove this plugin, run `dsh plugin --profile desktop remove @kesike/reminder-dsh` with your actual profile name, remove any manual `dsh-reminder` override, and restart DSH.

## Development

```powershell
npm ci --ignore-scripts
npm test
npm run test:settings-ui
npm pack --dry-run
```

Use `npm run test:popup` for a sample Windows toast and `npm run test:taskbar -- "window title"` for a native badge check. Set `CHROMIUM_PATH` if the settings test needs a specific Chromium executable.

Source and icon licensing are available in the [repository](https://github.com/KeS1Ke/reminder-dsh). The plugin is distributed under [MIT](https://github.com/KeS1Ke/reminder-dsh/blob/main/LICENSE).
