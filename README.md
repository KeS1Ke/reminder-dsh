# reminder-dsh

Windows reminders for DeepSeek Harness, with two independently configurable modules:

- **Taskbar flashing:** flash the existing DSH window's taskbar icon.
- **Windows system notifications:** show an AI task summary in a native notification banner and Notification Center. The reply field sends a message to the original DSH session.

[完整中文说明](README.zh-CN.md)

## Install

Requires Windows 10/11, Node.js 24.9.0+, and DSH `>=0.2.2-rc.1 <0.3.0`. System notifications use the built-in Windows PowerShell. Taskbar flashing requires PowerShell 7 (`pwsh.exe` on PATH).

```powershell
dsh plugin --profile web add github:KeS1Ke/reminder-dsh
dsh --profile web
```

Replace `web` with your actual profile. Restart after installation; settings changes then apply without restarting. The existing package name remains `@kesike/dsh-taskbar-reminder` and the profile entry remains `dsh-taskbar-reminder`. Remove a separately installed `dsh-winreminder` package before migrating to avoid duplicate reminders.

## Settings

Open **Settings → Notifications** from the settings sidebar. Windows system notifications default on. Taskbar flashing has its own switch and defaults off.

The notification interval defaults to **10 seconds**, configurable from **1–300 seconds**. It controls the minimum time between consecutive submissions. Windows controls banner duration and delivery through its notification settings for **DSH Reminders**. Disabling notifications cancels pending sends.

Both modules only observe successful main-session completion. Subagents, cancelled or failed turns, restored history and duplicate idle events do not notify. Notifications are submitted in completion order.

Quick replies use a Windows activation callback and a local named pipe. Each notification accepts one reply within 24 hours while its original session and backend are running. If DSH cannot confirm delivery, check the original conversation before resending.

Taskbar flashing identifies DSH by its window title, preferring windows in the backend's ancestor process tree. A browser must have its DSH tab selected. Set a specific title substring if automatic matching fails or multiple unrelated windows match. Foreground windows do not flash. Flashing ends on focus or after about ten seconds; further completions refresh it.

Notification summaries make one auxiliary model request using the session's existing route. They summarize only its final answer and may incur model usage. Failure is labeled and falls back to an excerpt. No model request is made for taskbar-only mode.

## Modules and configuration

- `src/modules/taskbar/`: native taskbar flashing, target selection and process lifecycle.
- `src/modules/popup/`: summaries, submission queue and native Windows toast delivery.
- `src/reminder.js`: shared main-session completion detection.
- `lib/client.js`: settings for both modules, using DSH ConfigForms.

See [example.patch.yml](example.patch.yml) for the nested `taskbar` / `popup` configuration. Existing `popup` settings carry over. `popup.durationSeconds` now controls the submission interval. Switches, target window title and interval apply immediately and persist through DSH's profile configuration.

## Validation

```sh
npm ci --ignore-scripts
npm test
npm run test:settings-ui
npm pack --dry-run
```

On Windows, `npm run test:popup` sends a sample system notification and prints a test reply to the terminal. `npm run test:taskbar -- "specific window title"` checks flashing. Set `CHROMIUM_PATH` for the settings-component browser test if necessary.

Automated checks include Cordis Loader hot updates, independent module selection, queue scheduling, model-failure handling and subprocess control. Windows-only checks cover the native toast payload and Win32 helper. Notifications are delivered on the Windows backend machine.

## License

[MIT](LICENSE). The unchanged official whale icon includes its [upstream license and source](assets/README.md). This is a third-party plugin.
