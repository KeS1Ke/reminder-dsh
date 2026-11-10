# reminder-dsh

Windows native notifications and a taskbar completion badge for DeepSeek Harness. The two modules can be configured independently in **Settings → Notifications**.

- **Completion notifications:** use the session title as the heading and optionally show an AI summary of the final answer, compressed to three lines. Reply directly to the original session from the notification.
- **Approval notifications:** show the session title, requesting tool and reason, with **Allow** and **Reject** buttons for the current request.
- **Taskbar completion badge:** show an unread completion count as a dark badge with white digits. Focusing the target window clears the count. This module defaults off and requires PowerShell 7.
- **Settings:** independently control notifications, the taskbar badge and AI summaries. Save switch changes with the bottom **Save** button; changes apply without restarting DSH.

[完整中文说明](README.zh-CN.md)

## Known issues

- **Clicking a Windows notification does not yet reliably return to the session that notification belongs to.** The source includes a session-open callback, but this interaction is not working correctly in actual use. Open DSH manually and select the session named in the notification. Do not rely on clicking a completion or approval notification to navigate to its session.

## Install

Requires Windows 10/11, Node.js 24.9.0+, and DSH `>=0.2.2-rc.1 <0.3.0`. System notifications use the built-in Windows PowerShell. The taskbar badge requires PowerShell 7 (`pwsh.exe` on PATH).

Notifications and badges run on the Windows machine hosting the DSH backend, in an interactive desktop session. Opening a remote or WSL/Linux-hosted DSH in a Windows browser does not move notification delivery to that browser's machine.

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

To inspect a completion or approval in context, open DSH manually and select the session named in the notification. Notification-body navigation is a [known issue](#known-issues).

**Show task summary in notifications** defaults on: the notification shows the session title plus a task summary compressed to three lines. Turning it off shows only the session title and skips the summary model request. The session title comes from DSH's session-title service and heads every notification, approvals included; when that service has no title for the session the configured title is used.

Completion notifications and taskbar badges only observe successful main-session completion. Subagents, cancelled or failed turns, restored history and duplicate idle events do not trigger completion reminders. Completion notifications are submitted in completion order; approval requests also produce their own notifications.

Quick replies use a Windows activation callback and a local named pipe. Each notification accepts one reply within 24 hours while its original session and backend are running. If DSH cannot confirm delivery, check the original conversation before resending.

Approval notifications use the same session title as their heading (falling back to `Needs approval · <tool>`), show the requesting tool and reason in the body, and offer **Allow** and **Reject** buttons. Allow grants only the current request. The notification and the DSH approval card share the same pending decision, so the buttons expire once the request is handled or withdrawn.

Taskbar badges identify DSH by its window title, preferring windows in the backend's ancestor process tree. A browser must have its DSH tab selected. Set a specific title substring if automatic matching fails or multiple unrelated windows match. Foreground windows show no badge. Each completed main session increments the unread count; focusing the target window clears the badge and the count. Counts above 99 display as **99+**. The helper process clears the badge after two hours as a safety net.

Notification summaries make one auxiliary model request using the session's existing route. They summarize only its final answer and may incur model usage. Failure is labeled and falls back to an excerpt. The summary is compressed to a three-line budget (about 60 characters); some Windows 11 builds ignore `hint-maxLines`, so the text itself is truncated to that budget. No model request is made for taskbar-only mode or when the summary switch is off.

## Modules and configuration

- `src/modules/taskbar/`: native taskbar completion badge, target selection and process lifecycle.
- `src/modules/popup/`: summaries, submission queue, session-open mailbox and native Windows toast delivery.
- `src/reminder.js`: shared main-session completion detection and session-title lookup.
- `lib/client.js`: settings for both modules, using DSH ConfigForms.

See [example.patch.yml](example.patch.yml) for the nested `taskbar` / `popup` configuration. Existing `popup` settings carry over, and `popup.durationSeconds` now controls the submission interval. The three switches only change the values shown on the page. Click **Save** at the bottom of the page to write them (every pending switch is submitted as one atomic change), or **Cancel** to discard them. A successful save briefly confirms itself; a refused save keeps the pending values and shows the error so you can retry or cancel. The target window title and the notification interval keep their own save buttons. All writes persist through DSH's profile configuration without remounting the plugin.

## Validation

```sh
npm ci --ignore-scripts
npm test
npm run test:settings-ui
npm pack --dry-run
```

On Windows, `npm run test:popup` sends a sample system notification and prints a test reply to the terminal. `npm run test:taskbar -- "specific window title"` checks the taskbar badge; switch away from DSH to see it. Set `CHROMIUM_PATH` for the settings-component browser test if necessary.

Automated checks include Cordis Loader hot updates, independent module selection, queue scheduling, notification title selection, model-failure handling and subprocess control. The browser check covers the staged switch save/cancel bar, its atomic write and refused writes. Windows-only checks cover the native toast payload and Win32 helper. Notifications are delivered on the Windows backend machine.

Publish a release with `npm publish --access public --registry=https://registry.npmjs.org`; the explicit registry is required whenever the configured default is a mirror.

## License

[MIT](LICENSE). The unchanged official whale icon includes its [upstream license and source](assets/README.md). This is a third-party plugin.
