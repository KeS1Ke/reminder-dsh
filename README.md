# reminder-dsh

Windows reminders for DeepSeek Harness, with two independently configurable modules:

- **Taskbar completion badge:** show the number of unread completed sessions on the lower-right corner of the DSH taskbar icon.
- **Windows system notifications:** show an AI task summary in a native notification banner and Notification Center. The reply field sends a message to the original DSH session.

[完整中文说明](README.zh-CN.md)

## Install

Requires Windows 10/11, Node.js 24.9.0+, and DSH `>=0.2.2-rc.1 <0.3.0`. System notifications use the built-in Windows PowerShell. The taskbar badge requires PowerShell 7 (`pwsh.exe` on PATH).

```powershell
dsh plugin --profile web add @kesike/reminder-dsh
dsh --profile web
```

`@kesike/reminder-dsh` is published on [npm](https://www.npmjs.com/package/@kesike/reminder-dsh). The same version installs straight from GitHub with `dsh plugin --profile web add github:KeS1Ke/reminder-dsh`.

Replace `web` with your actual profile. Restart after installation; settings changes then apply without restarting. The plugin installs as package `@kesike/reminder-dsh` and registers the profile entry `dsh-reminder`.

### Upgrading from older names

Versions before 0.2.0 shipped as package `@kesike/dsh-taskbar-reminder` with the profile entry `dsh-taskbar-reminder`. To migrate, remove the old package, rename that entry in your profile's `cordis.patch.yml` to `dsh-reminder` (keep its `config`), then install the current version and restart DSH. Remove any separately installed `dsh-winreminder` package to avoid duplicate reminders.

## Settings

Open **Settings → Notifications** from the settings sidebar. Windows system notifications default on. The taskbar completion badge has its own switch and defaults off.

The notification interval defaults to **10 seconds**, configurable from **1–300 seconds**. It controls the minimum time between consecutive completion notifications. Windows controls banner duration and delivery through its notification settings for **DeepSeek Harness**.

Clicking the notification body switches back to DSH **and opens the session that notification belongs to**, instead of whichever session is currently shown. The click is a local background activation: the plugin posts the session id to the backend, the GUI picks it up through a host long poll and calls `uiWorkspace.openSession`, then the activator launches `dsh://open` to focus the desktop window. The jump therefore requires the reminder backend to be running (same as the reply and approval buttons); when the backend has exited, clicking does not open DSH.

**Show task summary in notifications** defaults on: the notification shows the session title plus a task summary compressed to three lines. Turning it off shows only the session title and skips the summary model request. The session title comes from DSH's session-title service; when that service is unavailable the configured title is used.

Both modules only observe successful main-session completion. Subagents, cancelled or failed turns, restored history and duplicate idle events do not notify. Notifications are submitted in completion order.

Quick replies use a Windows activation callback and a local named pipe. Each notification accepts one reply within 24 hours while its original session and backend are running. If DSH cannot confirm delivery, check the original conversation before resending.

Approval notifications show the requesting tool and reason with **Allow** and **Reject** buttons. Allow grants only the current request. The notification and the DSH approval card share the same pending decision, so the buttons expire once the request is handled or withdrawn.

Taskbar badges identify DSH by its window title, preferring windows in the backend's ancestor process tree. A browser must have its DSH tab selected. Set a specific title substring if automatic matching fails or multiple unrelated windows match. Foreground windows show no badge. Each completed main session increments the unread count; focusing the target window clears the badge and the count. Counts above 99 display as **99+**. The helper process clears the badge after two hours as a safety net.

Notification summaries make one auxiliary model request using the session's existing route. They summarize only its final answer and may incur model usage. Failure is labeled and falls back to an excerpt. The summary is compressed to a three-line budget (about 60 characters); some Windows 11 builds ignore `hint-maxLines`, so the text itself is truncated to that budget. No model request is made for taskbar-only mode or when the summary switch is off.

## Modules and configuration

- `src/modules/taskbar/`: native taskbar completion badge, target selection and process lifecycle.
- `src/modules/popup/`: summaries, submission queue, session-open mailbox and native Windows toast delivery.
- `src/reminder.js`: shared main-session completion detection and session-title lookup.
- `lib/client.js`: settings for both modules, using DSH ConfigForms.

See [example.patch.yml](example.patch.yml) for the nested `taskbar` / `popup` configuration. Existing `popup` settings carry over. `popup.durationSeconds` now controls the submission interval. Switches, target window title and interval apply immediately and persist through DSH's profile configuration.

## Validation

```sh
npm ci --ignore-scripts
npm test
npm run test:settings-ui
npm pack --dry-run
```

On Windows, `npm run test:popup` sends a sample system notification and prints a test reply to the terminal. `npm run test:taskbar -- "specific window title"` checks the taskbar badge; switch away from DSH to see it. Set `CHROMIUM_PATH` for the settings-component browser test if necessary.

Automated checks include Cordis Loader hot updates, independent module selection, queue scheduling, model-failure handling and subprocess control. Windows-only checks cover the native toast payload and Win32 helper. Notifications are delivered on the Windows backend machine.

Publish a release with `npm publish --access public --registry=https://registry.npmjs.org`; the explicit registry is required whenever the configured default is a mirror.

## License

[MIT](LICENSE). The unchanged official whale icon includes its [upstream license and source](assets/README.md). This is a third-party plugin.
