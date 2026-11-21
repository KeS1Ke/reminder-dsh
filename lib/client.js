/** Browser entry using DSH's published module registration protocol; no build step required. */
window.__ModuleLoader__.load({
  id: '@kesike/reminder-dsh',
  factory(require) {
    const React = require('react')
    const { Switch, Button, Input, Tag } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const DEFAULTS = {
      popupEnabled: true,
      durationSeconds: 10,
      showSummary: true,
      soundEnabled: true,
      popupTitle: 'DSH 任务完成',
      popupMessage: '主会话已完成本轮任务。',
      summaryMaxChars: 60,
      summaryTimeoutSeconds: 15,
      taskbarEnabled: false,
      windowTitle: '',
    }

    const FIELD_SPECS = [
      { key: 'popupEnabled', path: ['popup', 'enabled'], type: 'bool' },
      { key: 'durationSeconds', path: ['popup', 'durationSeconds'], type: 'int', min: 1, max: 300, errorKey: 'intervalError' },
      { key: 'showSummary', path: ['popup', 'showSummary'], type: 'bool' },
      { key: 'soundEnabled', path: ['popup', 'soundEnabled'], type: 'bool' },
      { key: 'popupTitle', path: ['popup', 'title'], type: 'nonempty', errorKey: 'defaultTitleError', advanced: true },
      { key: 'popupMessage', path: ['popup', 'message'], type: 'nonempty', errorKey: 'defaultMessageError', advanced: true },
      { key: 'summaryMaxChars', path: ['popup', 'summaryMaxChars'], type: 'int', min: 20, max: 60, errorKey: 'summaryMaxCharsError', advanced: true },
      { key: 'summaryTimeoutSeconds', path: ['popup', 'summaryTimeoutSeconds'], type: 'int', min: 1, max: 60, errorKey: 'summaryTimeoutError', advanced: true },
      { key: 'taskbarEnabled', path: ['taskbar', 'enabled'], type: 'bool' },
      { key: 'windowTitle', path: ['taskbar', 'windowTitle'], type: 'text', maxLength: 200, errorKey: 'windowTitleError' },
    ]

    const dictionaries = {
      zh: {
        nav: '通知提醒',
        pageTitle: '通知与角标设置',
        pageDescription: '配置任务完成时的 Windows 系统通知与任务栏未读角标。',
        popupTitle: 'Windows 系统通知',
        popupDescription: '通过 Windows 通知显示任务总结和待处理审批，可直接回复原会话或处理本次审批。关闭会取消尚未发送的提醒。',
        interval: '通知发送间隔（秒）',
        intervalHelp: '默认 10 秒，范围 1–300。系统横幅停留时间由 Windows 管理。',
        intervalError: '请输入 1 到 300 之间的整数。',
        summary: '在通知中显示任务总结',
        summaryDescription: '开启后通知正文最多显示 3 行任务总结；关闭后仅显示会话标题，并省去一次 AI 总结调用。',
        sound: '弹窗提示音',
        soundDescription: '开启后，弹窗出现时同步播放约 1 秒提示音；关闭后由 Windows 处理通知声音。',
        soundTagCustom: '自定义音效',
        soundTagDefault: '默认叮声',
        soundCustom: '当前使用自定义音效。',
        soundDefault: '当前使用默认叮声。',
        uploadSound: '上传自定义音效',
        resetSound: '恢复默认叮声',
        soundHelp: '支持 wav 或 mp3（最长 5 秒），保存在插件目录中并立即生效，无需点击底部保存。',
        soundSaved: '自定义音效已保存，下一条弹窗生效。',
        soundReset: '已恢复默认叮声。',
        soundError: '音效未保存，请使用 5 秒以内的 wav 或 mp3。',
        soundResetError: '未能恢复默认叮声，请稍后重试。',
        advancedTitle: '高级设置',
        advancedHint: '默认标题、默认正文与 AI 总结参数',
        advancedInvalidTag: '{count} 项有误',
        defaultTitle: '默认通知标题',
        defaultTitleHelp: '仅在无法获取会话标题时作为后备标题（默认：DSH 任务完成）。',
        defaultTitleError: '默认通知标题不能为空。',
        defaultMessage: '默认通知正文',
        defaultMessageHelp: '没有可供总结的最终文字回复或总结未生成时使用（默认：主会话已完成本轮任务。）。',
        defaultMessageError: '默认通知正文不能为空。',
        summaryMaxChars: '总结最大字数',
        summaryMaxCharsHelp: '限制单行摘要字数上限，范围 20–60，默认 60。',
        summaryMaxCharsError: '请输入 20 到 60 之间的整数。',
        summaryTimeout: 'AI 总结超时（秒）',
        summaryTimeoutHelp: '范围 1–60 秒，默认 15 秒；超时后改用默认正文发送通知。',
        summaryTimeoutError: '请输入 1 到 60 之间的整数。',
        taskbarTitle: 'Windows 任务栏完成角标',
        taskbarDescription: '主会话结束且窗口未聚焦时，在 DSH 任务栏图标显示未读完成数；聚焦目标窗口后自动清除。此开关独立于 Windows 通知。',
        windowTitle: '目标窗口标题包含（可选）',
        windowHelp: '留空自动识别 DeepSeek Harness / DSH 窗口。浏览器需显示 DSH 标签页；匹配多个窗口时，请填写更具体的标题片段。',
        windowTitleError: '目标窗口标题不能超过 200 个字符。',
        saveChanges: '保存',
        cancelChanges: '取消',
        unsaved: '更改尚未保存，保存后立即生效。',
        validationAlert: '请先修正标红的无效输入后再保存。',
        saved: '已保存，立即生效。',
        error: '设置未保存，请检查连接或配置覆盖后重试。',
        loading: '正在加载插件配置…',
        unavailable: '当前配置暂不可用，请确认插件已加载且正在运行。',
        readOnlyTag: '只读',
        readOnly: '当前配置为只读状态（可能存在锁定或只读配置覆盖），仅可查看无法保存修改。',
      },
      en: {
        nav: 'Notifications',
        pageTitle: 'Notification & badge settings',
        pageDescription: 'Configure Windows completion notifications and the taskbar unread badge.',
        popupTitle: 'Windows system notifications',
        popupDescription: 'Show task summaries and pending approvals in Windows notifications with inline reply and decision actions. Turning this off cancels pending sends.',
        interval: 'Notification interval (seconds)',
        intervalHelp: 'Default: 10 seconds (1–300). Windows controls how long banners remain visible.',
        intervalError: 'Enter a whole number from 1 to 300.',
        summary: 'Show task summary in notifications',
        summaryDescription: 'When on, the body shows up to three lines of task summary. When off, only the session title is shown without a summary model call.',
        sound: 'Notification sound',
        soundDescription: 'Play a short ding when a notification arrives. When off, Windows uses its own notification sound.',
        soundTagCustom: 'Custom sound',
        soundTagDefault: 'Default ding',
        soundCustom: 'Using a custom sound.',
        soundDefault: 'Using the default ding.',
        uploadSound: 'Upload custom sound',
        resetSound: 'Use default ding',
        soundHelp: 'wav or mp3 up to 5 seconds. Stored in the plugin folder and applied immediately without clicking Save below.',
        soundSaved: 'Custom sound saved. Applies to the next toast.',
        soundReset: 'Restored the default ding.',
        soundError: 'Could not save sound. Use a wav or mp3 no longer than 5 seconds.',
        soundResetError: 'Could not restore the default ding.',
        advancedTitle: 'Advanced settings',
        advancedHint: 'Fallback copy and AI summary limits',
        advancedInvalidTag: '{count} invalid',
        defaultTitle: 'Default notification title',
        defaultTitleHelp: 'Used only when the session title is unavailable (default: DSH 任务完成).',
        defaultTitleError: 'Default title cannot be empty.',
        defaultMessage: 'Default notification message',
        defaultMessageHelp: 'Used when there is no final text reply to summarize.',
        defaultMessageError: 'Default message cannot be empty.',
        summaryMaxChars: 'Max summary characters',
        summaryMaxCharsHelp: 'Range: 20–60 characters (default: 60).',
        summaryMaxCharsError: 'Enter a whole number from 20 to 60.',
        summaryTimeout: 'Summary timeout (seconds)',
        summaryTimeoutHelp: 'Range: 1–60 seconds (default: 15). Falls back to the default message on timeout.',
        summaryTimeoutError: 'Enter a whole number from 1 to 60.',
        taskbarTitle: 'Windows taskbar completion badge',
        taskbarDescription: 'Show the unread completed-session count on the DSH taskbar icon when a main session finishes. Focusing the target window clears it. Independent of Windows notifications.',
        windowTitle: 'Target window title contains (optional)',
        windowHelp: 'Leave blank to detect DeepSeek Harness / DSH windows automatically. A browser must show its DSH tab; enter a more specific title if multiple windows match.',
        windowTitleError: 'Target window title must be 200 characters or fewer.',
        saveChanges: 'Save',
        cancelChanges: 'Cancel',
        unsaved: 'Changes are not saved yet. Save to apply immediately.',
        validationAlert: 'Fix the highlighted inputs before saving.',
        saved: 'Saved and applied immediately.',
        error: 'Could not save. Check the connection or configuration overrides and retry.',
        loading: 'Loading plugin settings…',
        unavailable: 'Settings are unavailable. Check that the plugin is loaded and running.',
        readOnlyTag: 'Read-only',
        readOnly: 'Configuration is read-only (locked or overridden by host settings) and cannot be modified here.',
      },
    }

    const SETTINGS_CSS = `
[data-reminder-dsh-settings] {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0 4px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
[data-reminder-dsh-settings][data-view="page"] {
  padding-top: 0;
}
[data-reminder-dsh-settings] *,
[data-reminder-dsh-settings] *::before,
[data-reminder-dsh-settings] *::after {
  box-sizing: border-box;
}
[data-reminder-dsh-settings] .reminder-page-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
[data-reminder-dsh-settings] .reminder-page-title {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
[data-reminder-dsh-settings] .reminder-page-desc {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
[data-reminder-dsh-settings] .reminder-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
}
[data-reminder-dsh-settings] .reminder-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
[data-reminder-dsh-settings] .reminder-card {
  display: flex;
  flex-direction: column;
  padding: 4px 16px;
  border: var(--dsh-hairline-width, 0.5px) solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l4));
  border-radius: var(--dsw-radius-xl, 20px);
  background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2));
}
[data-reminder-dsh-settings] .reminder-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 0;
}
[data-reminder-dsh-settings] .reminder-row + .reminder-row {
  border-top: var(--dsh-hairline-width, 0.5px) solid var(--dsw-alias-border-l2);
}
[data-reminder-dsh-settings] .reminder-row-split {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
[data-reminder-dsh-settings] .reminder-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
[data-reminder-dsh-settings] .reminder-row-title {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
[data-reminder-dsh-settings] .reminder-label {
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
[data-reminder-dsh-settings] .reminder-row-desc {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
[data-reminder-dsh-settings] .reminder-switch-cell {
  flex: none;
  padding-top: 1px;
}
[data-reminder-dsh-settings] .reminder-field-vertical {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
[data-reminder-dsh-settings] .reminder-input {
  width: 100%;
}
[data-reminder-dsh-settings] .reminder-input-numeric {
  width: 108px;
  flex: none;
}
[data-reminder-dsh-settings] .reminder-input-numeric input {
  text-align: end;
  font-variant-numeric: tabular-nums;
}
[data-reminder-dsh-settings] .reminder-input.is-invalid,
[data-reminder-dsh-settings] .reminder-input.is-invalid:focus-within {
  border-color: var(--dsw-alias-state-error-primary);
}
[data-reminder-dsh-settings] .reminder-input.is-disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
[data-reminder-dsh-settings] .reminder-input.is-disabled input {
  cursor: not-allowed;
}
[data-reminder-dsh-settings] .reminder-field-error {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-error-primary);
}
[data-reminder-dsh-settings] .reminder-subpanel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
  padding: 12px 14px;
  border: var(--dsh-hairline-width, 0.5px) solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-module-platform);
}
[data-reminder-dsh-settings] .reminder-sound-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
[data-reminder-dsh-settings] .reminder-sound-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
[data-reminder-dsh-settings] .reminder-sound-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
[data-reminder-dsh-settings] .reminder-sr-file {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
  pointer-events: none;
}
[data-reminder-dsh-settings] .reminder-disclosure {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 2px 0;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  text-align: start;
  cursor: pointer;
}
[data-reminder-dsh-settings] .reminder-disclosure:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 4px;
}
@media (hover: hover) {
  [data-reminder-dsh-settings] .reminder-disclosure:hover .reminder-disclosure-title {
    color: var(--dsw-alias-state-business-primary);
  }
}
[data-reminder-dsh-settings] .reminder-disclosure-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  min-width: 0;
}
[data-reminder-dsh-settings] .reminder-disclosure-title {
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
[data-reminder-dsh-settings] .reminder-disclosure-hint {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
[data-reminder-dsh-settings] .reminder-disclosure-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
  color: var(--dsw-alias-label-tertiary);
}
[data-reminder-dsh-settings] .reminder-chevron {
  display: inline-flex;
  transition: transform 150ms ease;
}
[data-reminder-dsh-settings] .reminder-disclosure[aria-expanded="true"] .reminder-chevron {
  transform: rotate(90deg);
}
[data-reminder-dsh-settings] .reminder-advanced-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 6px;
  padding: 12px 14px;
  border: var(--dsh-hairline-width, 0.5px) solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-module-platform);
}
[data-reminder-dsh-settings] .reminder-advanced-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
[data-reminder-dsh-settings] .reminder-advanced-item + .reminder-advanced-item {
  padding-top: 12px;
  border-top: var(--dsh-hairline-width, 0.5px) solid var(--dsw-alias-border-l2);
}
[data-reminder-dsh-settings] .reminder-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 14px;
  border-top: var(--dsh-hairline-width, 0.5px) solid var(--dsw-alias-border-l2);
}
[data-reminder-dsh-settings] .reminder-status {
  margin: 0;
  flex: 1 1 220px;
  min-width: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
[data-reminder-dsh-settings] .reminder-status[data-tone="error"] {
  color: var(--dsw-alias-state-error-primary);
}
[data-reminder-dsh-settings] .reminder-status[data-tone="success"] {
  color: var(--dsw-alias-state-success-primary);
}
[data-reminder-dsh-settings] .reminder-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
`

    /** 16 px outline bell matching the DSH medium icon weight (1.3 px stroke, currentColor). */
    function BellIcon({ size = 16 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false',
      },
      h('path', { d: 'M12 5.33A4 4 0 0 0 4 5.33c0 4.67-2 6-2 6h12s-2-1.33-2-6' }),
      h('path', { d: 'M9.15 14a1.33 1.33 0 0 1-2.3 0' }))
    }

    function ChevronIcon() {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false',
      },
      h('path', { d: 'M6 4l4 4-4 4' }))
    }

    /** Resolve one of the plugin's host routes under the page base (prefix-safe for the desktop shell). */
    function hostRoute(path) {
      try {
        const base = typeof document !== 'undefined' && typeof document.baseURI === 'string' ? document.baseURI : ''
        if (!base) return undefined
        const url = new URL(base)
        url.search = ''
        url.hash = ''
        if (!url.pathname.endsWith('/')) url.pathname += '/'
        return new URL(path.replace(/^\/+/, ''), url.href).href
      } catch { return undefined }
    }

    /** A background page cannot consume a click intended for the DSH window brought to the front. */
    function followSessionOpens(workspace, endpoint) {
      const lifetime = new AbortController()
      const foreground = () => document.visibilityState === 'visible' && document.hasFocus()
      let poll
      let acknowledgedId
      let notFoundCount = 0
      let pausedOn404 = false
      let stoppedOn404 = false

      async function watch(signal) {
        const url = new URL(endpoint)
        let failures = 0
        while (!signal.aborted) {
          try {
            if (acknowledgedId) url.searchParams.set('ack', acknowledgedId)
            const response = await fetch(url.href, { signal, credentials: 'same-origin', cache: 'no-store' })
            if (response.status === 404) {
              // Non-Windows hosts do not expose session-open; pause after 404 and re-probe once on refocus.
              notFoundCount += 1
              if (notFoundCount >= 2) {
                stoppedOn404 = true
                lifetime.abort()
              } else {
                pausedOn404 = true
              }
              return
            }
            if (!response.ok) throw new Error(`session-open route ${response.status}`)
            notFoundCount = 0
            pausedOn404 = false
            if (response.status === 200) {
              const value = await response.json()
              if (signal.aborted || !foreground()) return
              if (typeof value?.id !== 'string' || typeof value.sessionId !== 'string' || !value.sessionId) {
                throw new Error('Invalid session-open response')
              }
              // A notification outlives its session: opening an id DSH no longer knows must not stop the poll.
              try { workspace.openSession(value.sessionId) } catch {}
              acknowledgedId = value.id
            }
            failures = 0
          } catch {
            if (signal.aborted) return
            const delay = Math.min(10_000, 500 * 2 ** Math.min(++failures, 5))
            await new Promise(resolve => {
              const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
              const timer = setTimeout(done, delay)
              signal.addEventListener('abort', done, { once: true })
            })
          }
        }
      }

      function update() {
        if (stoppedOn404) return
        if (!foreground()) {
          pausedOn404 = false
          poll?.abort()
          poll = undefined
        } else if (!poll && !pausedOn404) {
          const current = new AbortController()
          poll = current
          void watch(current.signal).finally(() => { if (poll === current) poll = undefined })
        }
      }
      window.addEventListener('focus', update, { signal: lifetime.signal })
      window.addEventListener('blur', update, { signal: lifetime.signal })
      document.addEventListener('visibilitychange', update, { signal: lifetime.signal })
      update()
      return () => { lifetime.abort(); poll?.abort() }
    }

    function readInteger(raw, fallback, min, max) {
      return typeof raw === 'number' && Number.isInteger(raw) && raw >= min && raw <= max ? raw : fallback
    }

    function readStored(value) {
      const popup = value?.popup ?? {}
      const taskbar = value?.taskbar ?? {}
      return {
        popupEnabled: popup.enabled !== false,
        durationSeconds: readInteger(popup.durationSeconds, DEFAULTS.durationSeconds, 1, 300),
        showSummary: popup.showSummary !== false,
        soundEnabled: popup.soundEnabled !== false,
        popupTitle: typeof popup.title === 'string' ? popup.title : DEFAULTS.popupTitle,
        popupMessage: typeof popup.message === 'string' ? popup.message : DEFAULTS.popupMessage,
        summaryMaxChars: readInteger(popup.summaryMaxChars, DEFAULTS.summaryMaxChars, 20, 60),
        summaryTimeoutSeconds: readInteger(popup.summaryTimeoutSeconds, DEFAULTS.summaryTimeoutSeconds, 1, 60),
        taskbarEnabled: taskbar.enabled === true,
        windowTitle: typeof taskbar.windowTitle === 'string' ? taskbar.windowTitle : DEFAULTS.windowTitle,
      }
    }

    function toRawValue(storedValue) {
      return typeof storedValue === 'boolean' ? storedValue : String(storedValue)
    }

    function analyzeDraft(stored, drafts, t) {
      const raw = {}
      const errors = {}
      const ops = []
      let hasErrors = false
      let hasRawEdits = false
      let advancedErrorCount = 0

      for (const spec of FIELD_SPECS) {
        const initial = toRawValue(stored[spec.key])
        const hasDraft = Object.hasOwn(drafts, spec.key)
        const currentRaw = hasDraft ? drafts[spec.key] : initial
        raw[spec.key] = currentRaw
        if (hasDraft && currentRaw !== initial) hasRawEdits = true

        let normalized = currentRaw
        let error = ''
        if (spec.type === 'int') {
          const trimmed = String(currentRaw).trim()
          if (!/^\d+$/.test(trimmed)) error = t(spec.errorKey)
          else {
            const parsed = Number(trimmed)
            if (!Number.isInteger(parsed) || parsed < spec.min || parsed > spec.max) error = t(spec.errorKey)
            else normalized = parsed
          }
        } else if (spec.type === 'nonempty') {
          const trimmed = String(currentRaw).trim()
          if (!trimmed) error = t(spec.errorKey)
          else normalized = trimmed
        } else if (spec.type === 'text') {
          const trimmed = String(currentRaw).trim()
          if (trimmed.length > spec.maxLength) error = t(spec.errorKey)
          else normalized = trimmed
        }

        if (error) {
          errors[spec.key] = error
          hasErrors = true
          if (spec.advanced) advancedErrorCount += 1
        } else if (Object.hasOwn(drafts, spec.key) && normalized !== stored[spec.key]) {
          ops.push({ op: 'set', path: spec.path, value: normalized })
        }
      }

      return { raw, errors, ops, dirty: ops.length > 0, hasErrors, hasRawEdits, advancedErrorCount }
    }

    function useFormSnapshot(usePreferences, preferencesForm) {
      if (typeof usePreferences === 'function') return usePreferences(value => value)
      return React.useSyncExternalStore(
        preferencesForm.subscribe,
        () => preferencesForm.getSnapshot(),
        () => preferencesForm.getSnapshot(),
      )
    }

    function NotificationSettings({ usePreferences, hooks, saveSettings, soundEndpoint, view, t: slotT }) {
      const t = slotT ?? (key => dictionaries.zh[key] ?? key)
      const snapshot = useFormSnapshot(usePreferences, hooks?.preferences)
      const commit = saveSettings ?? (ops => hooks?.preferences?.mutate(ops))
      const stored = readStored(snapshot?.value)
      const prevStoredRef = React.useRef(stored)

      const [drafts, setDrafts] = React.useState({})
      const [busy, setBusy] = React.useState(false)
      const [saveFeedback, setSaveFeedback] = React.useState('')
      const [advancedOpen, setAdvancedOpen] = React.useState(false)
      const [soundCustom, setSoundCustom] = React.useState(false)
      const [soundNote, setSoundNote] = React.useState('')
      const [soundError, setSoundError] = React.useState('')
      const soundTouched = React.useRef(false)
      const fileInputRef = React.useRef(null)

      const intervalId = React.useId()
      const titleId = React.useId()
      const defaultTitleId = React.useId()
      const defaultMessageId = React.useId()
      const summaryMaxCharsId = React.useId()
      const summaryTimeoutId = React.useId()
      const advancedPanelId = React.useId()

      // Clear any staged edit whose underlying Host value changed externally (live reload).
      React.useEffect(() => {
        const previous = prevStoredRef.current
        prevStoredRef.current = stored
        const changedKeys = FIELD_SPECS.filter(spec => previous[spec.key] !== stored[spec.key]).map(spec => spec.key)
        if (changedKeys.length === 0) return
        setDrafts(current => {
          let next
          for (const key of changedKeys) {
            if (Object.hasOwn(current, key)) {
              next ??= { ...current }
              delete next[key]
            }
          }
          return next ?? current
        })
      })

      React.useEffect(() => {
        if (!soundEndpoint) return undefined
        const controller = new AbortController()
        fetch(soundEndpoint, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
          .then(response => response.ok ? response.json() : { custom: false })
          .then(value => { if (!controller.signal.aborted && !soundTouched.current) setSoundCustom(Boolean(value?.custom)) })
          .catch(() => {})
        return () => controller.abort()
      }, [soundEndpoint])

      React.useEffect(() => {
        if (saveFeedback !== 'saved') return undefined
        const timer = setTimeout(() => setSaveFeedback(''), 5000)
        return () => clearTimeout(timer)
      }, [saveFeedback])

      const status = snapshot?.status ?? 'unavailable'
      const available = status === 'ready' && snapshot?.writable === true
      const readOnly = status === 'ready' && snapshot?.writable === false
      const controlsDisabled = busy || !available
      const state = analyzeDraft(stored, drafts, t)

      const stage = (key, value) => {
        if (controlsDisabled) return
        setSaveFeedback('')
        setDrafts(current => {
          const initial = toRawValue(stored[key])
          if (value === initial) {
            if (!Object.hasOwn(current, key)) return current
            const next = { ...current }
            delete next[key]
            return next
          }
          return { ...current, [key]: value }
        })
      }

      const saveAll = async () => {
        if (controlsDisabled || !state.dirty || state.hasErrors || typeof commit !== 'function') return
        setBusy(true)
        setSaveFeedback('')
        try {
          if (await commit(state.ops)) {
            setDrafts({})
            setSaveFeedback('saved')
          } else {
            setSaveFeedback('error')
          }
        } catch {
          setSaveFeedback('error')
        } finally {
          setBusy(false)
        }
      }

      const cancelAll = () => {
        if (busy) return
        setDrafts({})
        setSaveFeedback('')
      }

      const uploadSound = async file => {
        if (controlsDisabled || !soundEndpoint) return
        soundTouched.current = true
        setBusy(true)
        setSoundNote('')
        setSoundError('')
        try {
          const response = await fetch(`${soundEndpoint}?name=${encodeURIComponent(file.name)}`, {
            method: 'POST', body: file, credentials: 'same-origin',
          })
          const value = await response.json().catch(() => ({}))
          if (!response.ok) {
            setSoundError(typeof value?.error === 'string' && value.error ? value.error : t('soundError'))
            return
          }
          setSoundCustom(true)
          setSoundNote('saved')
        } catch {
          setSoundError(t('soundError'))
        } finally {
          setBusy(false)
        }
      }

      const resetSound = async () => {
        if (controlsDisabled || !soundEndpoint) return
        soundTouched.current = true
        setBusy(true)
        setSoundNote('')
        setSoundError('')
        try {
          const response = await fetch(soundEndpoint, { method: 'DELETE', credentials: 'same-origin' })
          const value = await response.json().catch(() => ({}))
          if (!response.ok) {
            setSoundError(typeof value?.error === 'string' && value.error ? value.error : t('soundResetError'))
            return
          }
          setSoundCustom(false)
          setSoundNote('reset')
        } catch {
          setSoundError(t('soundResetError'))
        } finally {
          setBusy(false)
        }
      }

      const renderSwitchRow = ({ fieldKey, titleKey, descriptionKey, heading = false, extra = null }) =>
        h('div', { className: 'reminder-row' },
          h('div', { className: 'reminder-row-split' },
            h('div', { className: 'reminder-copy' },
              h(heading ? 'h3' : 'div', { className: 'reminder-row-title' }, t(titleKey)),
              h('p', { className: 'reminder-row-desc' }, t(descriptionKey))),
            h('div', { className: 'reminder-switch-cell' },
              h(Switch, {
                checked: state.raw[fieldKey],
                disabled: controlsDisabled,
                label: t(titleKey),
                onChange: value => stage(fieldKey, value),
              }))),
          extra)

      const renderTextField = ({ id, fieldKey, labelKey, helpKey, numeric = false, maxLength }) => {
        const error = available ? state.errors[fieldKey] : ''
        const helpId = `${id}-help`
        const errorId = `${id}-error`
        const className = [
          'reminder-input',
          numeric ? 'reminder-input-numeric' : '',
          error ? 'is-invalid' : '',
          controlsDisabled ? 'is-disabled' : '',
        ].filter(Boolean).join(' ')
        return h('div', { className: numeric ? 'reminder-row-split' : 'reminder-field-vertical' },
          numeric
            ? h('div', { className: 'reminder-copy' },
              h('label', { className: 'reminder-label', htmlFor: id }, t(labelKey)),
              h('p', { id: helpId, className: 'reminder-row-desc' }, t(helpKey)),
              error && h('p', { id: errorId, role: 'alert', className: 'reminder-field-error' }, error))
            : h('label', { className: 'reminder-label', htmlFor: id }, t(labelKey)),
          h(Input, {
            id,
            type: 'text',
            inputMode: numeric ? 'numeric' : undefined,
            maxLength,
            className,
            value: state.raw[fieldKey],
            disabled: controlsDisabled,
            'aria-invalid': error ? 'true' : undefined,
            'aria-describedby': error ? `${helpId} ${errorId}` : helpId,
            onChange: event => stage(fieldKey, event.target.value),
          }),
          !numeric && h('p', { id: helpId, className: 'reminder-row-desc' }, t(helpKey)),
          !numeric && error && h('p', { id: errorId, role: 'alert', className: 'reminder-field-error' }, error))
      }

      let footerText = ''
      let footerTone = 'neutral'
      let footerRole = 'status'
      if (saveFeedback === 'error') {
        footerText = t('error'); footerTone = 'error'; footerRole = 'alert'
      } else if (available && state.hasErrors) {
        footerText = t('validationAlert'); footerTone = 'error'; footerRole = 'alert'
      } else if (state.dirty) {
        footerText = t('unsaved'); footerTone = 'neutral'
      } else if (saveFeedback === 'saved') {
        footerText = t('saved'); footerTone = 'success'
      }

      const isBundlePage = view === 'page'
      const invalidAdvancedBadge = available && state.advancedErrorCount > 0 && !advancedOpen
        ? t('advancedInvalidTag').replace('{count}', String(state.advancedErrorCount))
        : ''

      return h('div', { 'data-reminder-dsh-settings': '', 'data-view': isBundlePage ? 'page' : 'section' },
        !isBundlePage && h('header', { className: 'reminder-page-head' },
          h('h2', { className: 'reminder-page-title' }, t('pageTitle')),
          h('p', { className: 'reminder-page-desc' }, t('pageDescription'))),
        status === 'loading' && h('p', { className: 'reminder-notice', role: 'status' }, t('loading')),
        status === 'unavailable' && h('p', { className: 'reminder-notice', role: 'status' }, t('unavailable')),
        readOnly && h('p', { className: 'reminder-notice', role: 'status' },
          h(Tag, { tone: 'warning' }, t('readOnlyTag')),
          t('readOnly')),
        h('form', { className: 'reminder-form', noValidate: true, onSubmit: event => { event.preventDefault(); void saveAll() } },
          h('section', { className: 'reminder-card', 'data-reminder-module': 'popup' },
            renderSwitchRow({ fieldKey: 'popupEnabled', titleKey: 'popupTitle', descriptionKey: 'popupDescription', heading: true }),
            h('div', { className: 'reminder-row' },
              renderTextField({ id: intervalId, fieldKey: 'durationSeconds', labelKey: 'interval', helpKey: 'intervalHelp', numeric: true })),
            renderSwitchRow({ fieldKey: 'showSummary', titleKey: 'summary', descriptionKey: 'summaryDescription' }),
            renderSwitchRow({
              fieldKey: 'soundEnabled',
              titleKey: 'sound',
              descriptionKey: 'soundDescription',
              extra: state.raw.soundEnabled && soundEndpoint && h('div', { className: 'reminder-subpanel', 'data-reminder-sound': '' },
                h('div', { className: 'reminder-sound-head' },
                  h('div', { className: 'reminder-sound-status' },
                    h(Tag, { tone: soundCustom ? 'info' : 'neutral' }, soundCustom ? t('soundTagCustom') : t('soundTagDefault')),
                    h('span', null, soundCustom ? t('soundCustom') : t('soundDefault'))),
                  h('div', { className: 'reminder-sound-actions' },
                    h('input', {
                      ref: fileInputRef,
                      type: 'file',
                      accept: '.wav,.mp3,audio/wav,audio/mpeg',
                      'aria-hidden': 'true',
                      tabIndex: -1,
                      className: 'reminder-sr-file',
                      disabled: controlsDisabled,
                      onChange: event => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (file) void uploadSound(file)
                      },
                    }),
                    h(Button, {
                      variant: 'outline',
                      size: 'sm',
                      disabled: controlsDisabled,
                      onClick: () => fileInputRef.current?.click(),
                    }, t('uploadSound')),
                    soundCustom && h(Button, {
                      variant: 'ghost',
                      size: 'sm',
                      disabled: controlsDisabled,
                      onClick: resetSound,
                    }, t('resetSound')))),
                h('p', { className: 'reminder-row-desc' }, t('soundHelp')),
                soundError && h('p', { role: 'alert', className: 'reminder-field-error' }, soundError),
                soundNote && h('p', { role: 'status', className: 'reminder-status', 'data-tone': 'success' }, t(soundNote === 'saved' ? 'soundSaved' : 'soundReset'))),
            }),
            h('div', { className: 'reminder-row', 'data-reminder-advanced': '' },
              h('button', {
                type: 'button',
                className: 'reminder-disclosure',
                'aria-expanded': advancedOpen ? 'true' : 'false',
                'aria-controls': advancedPanelId,
                onClick: () => setAdvancedOpen(open => !open),
              },
              h('span', { className: 'reminder-disclosure-left' },
                h('span', { className: 'reminder-disclosure-title' }, t('advancedTitle')),
                h('span', { className: 'reminder-disclosure-hint' }, t('advancedHint'))),
              h('span', { className: 'reminder-disclosure-right' },
                invalidAdvancedBadge && h(Tag, { tone: 'danger' }, invalidAdvancedBadge),
                h('span', { className: 'reminder-chevron' }, h(ChevronIcon)))),
              advancedOpen && h('div', { id: advancedPanelId, className: 'reminder-advanced-body' },
                h('div', { className: 'reminder-advanced-item' },
                  renderTextField({ id: defaultTitleId, fieldKey: 'popupTitle', labelKey: 'defaultTitle', helpKey: 'defaultTitleHelp' })),
                h('div', { className: 'reminder-advanced-item' },
                  renderTextField({ id: defaultMessageId, fieldKey: 'popupMessage', labelKey: 'defaultMessage', helpKey: 'defaultMessageHelp' })),
                h('div', { className: 'reminder-advanced-item' },
                  renderTextField({ id: summaryMaxCharsId, fieldKey: 'summaryMaxChars', labelKey: 'summaryMaxChars', helpKey: 'summaryMaxCharsHelp', numeric: true })),
                h('div', { className: 'reminder-advanced-item' },
                  renderTextField({ id: summaryTimeoutId, fieldKey: 'summaryTimeoutSeconds', labelKey: 'summaryTimeout', helpKey: 'summaryTimeoutHelp', numeric: true }))))),
          h('section', { className: 'reminder-card', 'data-reminder-module': 'taskbar' },
            renderSwitchRow({ fieldKey: 'taskbarEnabled', titleKey: 'taskbarTitle', descriptionKey: 'taskbarDescription', heading: true }),
            h('div', { className: 'reminder-row' },
              renderTextField({ id: titleId, fieldKey: 'windowTitle', labelKey: 'windowTitle', helpKey: 'windowHelp', maxLength: 200 }))),
          h('footer', { className: 'reminder-footer', 'data-reminder-actions': '' },
            h('p', {
              className: 'reminder-status',
              role: footerText ? footerRole : undefined,
              'data-tone': footerTone,
            }, footerText),
            h('div', { className: 'reminder-actions' },
              h(Button, {
                variant: 'outline',
                size: 'md',
                disabled: busy || !state.hasRawEdits,
                onClick: cancelAll,
              }, t('cancelChanges')),
              h(Button, {
                variant: 'primary',
                size: 'md',
                disabled: controlsDisabled || !state.dirty || state.hasErrors,
                onClick: saveAll,
              }, t('saveChanges'))))))
    }

    return {
      name: 'reminder-dsh-settings',
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        ctx.effect(() => {
          if (typeof document === 'undefined') return undefined
          const style = document.createElement('style')
          style.setAttribute('data-plugin', '@kesike/reminder-dsh')
          style.setAttribute('data-plugin-css', 'settings')
          style.textContent = SETTINGS_CSS
          ;(document.head ?? document.documentElement).appendChild(style)
          return () => style.remove()
        })
        ctx.effect(() => ctx.locale.register('reminder-dsh', dictionaries))
        const t = ctx.locale.bind('reminder-dsh')
        const form = ctx.configForms.get('dsh-reminder')
        ctx.inject(['uiWorkspace'], scope => {
          const workspace = scope.get('uiWorkspace')
          if (!workspace || typeof workspace.openSession !== 'function') return
          const endpoint = hostRoute('api/reminder-dsh/session-open')
          if (!endpoint) return
          return followSessionOpens(workspace, endpoint)
        })
        const inject = () => ({
          hooks: { preferences: form },
          saveSettings: ops => form.mutate(ops),
          soundEndpoint: hostRoute('api/reminder-dsh/sound'),
        })
        ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
          name: 'settings.section.icon', id: 'dsh-reminder', order: 50, locale: 'reminder-dsh',
        }, BellIcon))
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: 'dsh-reminder', order: 50, label: () => t('nav'), locale: 'reminder-dsh', inject,
        }, NotificationSettings))
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config', key: '@kesike/reminder-dsh', locale: 'reminder-dsh', inject,
        }, NotificationSettings))
      },
    }
  },
})
