# reminder-dsh

Windows reminders for DeepSeek Harness, with two independently configurable modules:

- **Taskbar flashing:** flash the existing DSH window's taskbar icon. No popup or model call.
- **Popup and quick reply:** a white whale-branded window with an AI task summary, reply input, Close on the left and Send on the right.

[完整中文说明](README.zh-CN.md)

## Install

Requires Windows 10/11, PowerShell 7 (`pwsh.exe` on PATH), Node.js 24.9.0+, and DSH `>=0.2.2-rc.1 <0.3.0`. The original skeleton's DSH 0.1.1 version is not supported by these live configuration APIs.

```powershell
dsh plugin --profile web add github:KeS1Ke/reminder-dsh
dsh --profile web
```

Replace `web` with your actual profile. Restart after installation; settings changes then apply without restarting. The existing package name remains `@kesike/dsh-taskbar-reminder` and the profile entry remains `dsh-taskbar-reminder`. Remove a separately installed `dsh-winreminder` package before migrating to avoid duplicate reminders.

## Settings

Open **Settings → General**, or this plugin's configuration page. Taskbar flashing and popup reminders have separate switches; either, both, or neither may be enabled. Taskbar flashing defaults off; popup reminders default on.

The popup switch interval defaults to **10 seconds**, configurable from **1–300 seconds**. Saves immediately update the active unedited popup and queue timing. Editing a reply pauses rotation until the user sends or closes it. Disabling popups cancels summaries, closes the popup and discards its queue and draft; disabling taskbar flashing leaves popups untouched.

Both modules only observe successful main-session completion. Subagents, cancelled or failed turns, restored history and duplicate idle events do not notify. Popups are FIFO, with one window at a time. Replies are delivered once to the originating session using the official user-message API.

Taskbar flashing identifies DSH by its window title, preferring windows in the backend's ancestor process tree. A browser must have its DSH tab selected. Set a specific title substring if automatic matching fails or multiple unrelated windows match. Foreground windows do not flash. Flashing ends on focus or after about ten seconds; further completions refresh it.

Popup summaries make one auxiliary model request using the session's existing route. They summarize only its final answer and may incur model usage. Failure is labeled and falls back to an excerpt. No model request is made for taskbar-only mode.

## Modules and configuration

- `src/modules/taskbar/`: native taskbar flashing, target selection and process lifecycle.
- `src/modules/popup/`: summaries, queue, WPF UI and quick replies.
- `src/reminder.js`: shared main-session completion detection.
- `lib/client.js`: settings for both modules, using DSH ConfigForms.

See [example.patch.yml](example.patch.yml) for the nested `taskbar` / `popup` configuration. The switches, target window title and popup interval are volatile settings persisted through DSH's profile configuration.

## Validation

```sh
npm ci --ignore-scripts
npm test
npm run test:settings-ui
npm pack --dry-run
```

On Windows, use `npm run test:popup` and `npm run test:taskbar -- "specific window title"` for manual checks. The standalone popup only prints replies to its terminal. Set `CHROMIUM_PATH` for the settings-component browser test if necessary.

Automated checks include real Cordis Loader hot updates, independent module selection, queue scheduling, reply delivery, model-failure handling and subprocess control. Windows-only checks cover pwsh, WPF and Win32 helper compilation. Actual desktop visibility, the complete DSH UI and a real model provider still need validation on the target machine. Notifications run on the backend machine, not on a remote browser computer.

## License

[MIT](LICENSE). The unchanged official whale icon includes its [upstream license and source](assets/README.md). This is a third-party plugin.
