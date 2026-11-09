/** Browser entry using DSH's published module registration protocol; no build step required. */
window.__ModuleLoader__.load({
  id: '@kesike/reminder-dsh',
  factory(require) {
    const React = require('react')
    const { Switch } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    const dictionaries = {
      zh: {
        nav: '通知',
        title: 'Windows 系统通知',
        taskbar: 'Windows 任务栏完成角标',
        taskbarDescription: '主会话完成时在 DSH 任务栏图标的角上显示未查看的完成数量（深色圆底白色数字，同 ChatGPT 角标）。切回目标窗口后角标清除。此开关独立于 Windows 系统通知。',
        summary: '在通知中显示任务总结',
        summaryDescription: '开启后通知正文最多显示 3 行任务总结；关闭后通知只显示会话标题，并省去一次 AI 总结调用。',
        windowTitle: '目标窗口标题包含（可选）', saveTitle: '保存目标窗口',
        windowHelp: '留空自动识别 DeepSeek Harness / DSH 窗口。浏览器需显示 DSH 标签页；匹配多个窗口时，请填写更具体的标题文本。',
        description: '通过 Windows 通知显示任务总结和待处理审批。可直接回复原会话或处理本次审批。',
        interval: '通知发送间隔（秒）', intervalHelp: '默认 10 秒，可设为 1–300 秒。横幅显示时间由 Windows 管理。', save: '保存间隔',
        hot: '开关更改需点击本页底部的保存才生效；关闭 Windows 系统通知会取消尚未发送的提醒。',
        saveChanges: '保存', cancelChanges: '取消',
        switchUnsaved: '开关更改尚未保存，保存后立即生效。',
        saved: '已保存，立即生效。',
        error: '设置未保存，请检查连接或配置覆盖后重试。',
        unavailable: '此配置暂不可编辑，请确认插件已加载且当前配置可写。',
      },
      en: {
        nav: 'Notifications',
        title: 'Windows system notifications',
        taskbar: 'Windows taskbar completion badge',
        taskbarDescription: 'Show the number of unread completed sessions on the DSH taskbar icon (dark chip with white digits, like the ChatGPT badge) when a main session finishes. Focusing the target window clears the badge. This switch is independent of Windows notifications.',
        summary: 'Show task summary in notifications',
        summaryDescription: 'When on, the notification body shows the task summary in up to three lines. When off, only the session title is shown and no summary model call is made.',
        windowTitle: 'Target window title contains (optional)', saveTitle: 'Save target window',
        windowHelp: 'Leave blank to detect DeepSeek Harness / DSH windows. A browser must show its DSH tab. If multiple windows match, enter a more specific title.',
        description: 'Show task summaries and pending approvals in Windows notifications. Reply to the original session or decide the current approval from the notification.',
        interval: 'Notification interval (seconds)', intervalHelp: 'Default: 10 seconds. Range: 1–300. Windows controls how long banners stay visible.', save: 'Save interval',
        hot: 'Switch changes apply only after you save them at the bottom of this page. Turning notifications off cancels pending sends.',
        saveChanges: 'Save', cancelChanges: 'Cancel',
        switchUnsaved: 'Switch changes are not saved yet. Saving applies them immediately.',
        saved: 'Saved and applied immediately.',
        error: 'Could not save. Check the connection or configuration overrides and retry.',
        unavailable: 'Settings are unavailable. Check that the plugin is loaded and its configuration is writable.',
      },
    }

    /** 16 px outline bell matching the DSH medium icon weight (1.3 px stroke, currentColor). */
    function BellIcon({ size = 16 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false',
      },
      h('path', { d: 'M12 5.33A4 4 0 0 0 4 5.33c0 4.67-2 6-2 6h12s-2-1.33-2-6' }),
      h('path', { d: 'M9.15 14a1.33 1.33 0 0 1-2.3 0' }))
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

    /** Follow the host's session-open mailbox so a clicked toast navigates to its own session. */
    async function watchSessionOpen(workspace, endpoint, signal) {
      let failures = 0
      while (!signal.aborted) {
        let delay = 0
        try {
          const response = await fetch(endpoint, { signal, credentials: 'same-origin', cache: 'no-store' })
          if (!response.ok) throw new Error(`session-open route ${response.status}`)
          failures = 0
          if (response.status === 200) {
            const value = await response.json()
            if (typeof value?.sessionId === 'string' && value.sessionId !== '') {
              try { workspace.openSession(value.sessionId) } catch {}
            }
          }
        } catch {
          if (signal.aborted) return
          failures += 1
          delay = Math.min(30_000, 1000 * 2 ** Math.min(failures, 5))
        }
        if (delay) await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    const buttonStyle = { padding: '6px 12px', borderRadius: 6, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer' }

    function NotificationSettings({ usePreferences, saveOptions, setDurationSeconds, setWindowTitle, t }) {
      const snapshot = usePreferences(value => value)
      const [busy, setBusy] = React.useState(false)
      const [switchFeedback, setSwitchFeedback] = React.useState('')
      const [windowFeedback, setWindowFeedback] = React.useState('')
      const [intervalFeedback, setIntervalFeedback] = React.useState('')
      const [interval, setInterval] = React.useState(String(snapshot.value?.popup?.durationSeconds ?? 10))
      const [drafts, setDrafts] = React.useState({})
      const intervalId = React.useId()
      const titleId = React.useId()
      const [windowTitle, changeWindowTitle] = React.useState(snapshot.value?.taskbar?.windowTitle ?? '')
      React.useEffect(() => { changeWindowTitle(snapshot.value?.taskbar?.windowTitle ?? '') }, [snapshot.value?.taskbar?.windowTitle])
      React.useEffect(() => { setInterval(String(snapshot.value?.popup?.durationSeconds ?? 10)) }, [snapshot.value?.popup?.durationSeconds])
      const seconds = Number(interval)
      const validInterval = interval.trim() !== '' && Number.isInteger(seconds) && seconds >= 1 && seconds <= 300
      const available = snapshot.status === 'ready' && snapshot.writable
      // Switches only edit drafts; the bar at the bottom writes every pending switch as one mutation.
      const stored = {
        taskbarEnabled: snapshot.value?.taskbar?.enabled === true,
        popupEnabled: snapshot.value?.popup?.enabled === true,
        showSummary: snapshot.value?.popup?.showSummary !== false,
      }
      const shown = name => drafts[name] ?? stored[name]
      const changes = {}
      for (const name of Object.keys(stored)) if (shown(name) !== stored[name]) changes[name] = shown(name)
      const dirty = Object.keys(changes).length > 0
      const stage = (name, value) => {
        if (busy || !available) return
        setSwitchFeedback('')
        setDrafts(current => ({ ...current, [name]: value }))
      }
      const saveSwitches = async () => {
        if (busy || !available || !dirty) return
        setBusy(true)
        setSwitchFeedback('')
        try {
          if (await saveOptions(changes)) { setDrafts({}); setSwitchFeedback('saved') }
          else setSwitchFeedback('error')
        } catch { setSwitchFeedback('error') } finally { setBusy(false) }
      }
      const cancelSwitches = () => {
        if (busy) return
        setDrafts({})
        setSwitchFeedback('')
      }
      // A successful switch save is a transient confirmation; the bar itself disappears with the changes.
      React.useEffect(() => {
        if (switchFeedback !== 'saved') return undefined
        const timer = setTimeout(() => setSwitchFeedback(''), 5000)
        return () => clearTimeout(timer)
      }, [switchFeedback])
      return h('div', { style: { padding: '12px 0' }, 'data-reminder-dsh-settings': '' },
        h('section', { 'data-reminder-module': 'taskbar', style: { marginBottom: 24, borderBottom: '1px solid #8885', paddingBottom: 20 } },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 } },
            h('h3', { style: { fontSize: 14, margin: 0 } }, t('taskbar')),
            h(Switch, { checked: shown('taskbarEnabled'), disabled: busy || !available, label: t('taskbar'),
              onChange: value => stage('taskbarEnabled', value) })),
          h('p', { style: { opacity: 0.75, fontSize: 13 } }, t('taskbarDescription')),
          h('form', { onSubmit: async event => {
            event.preventDefault()
            if (busy || !available || windowTitle.length > 200) return
            setBusy(true); setWindowFeedback('')
            try { setWindowFeedback(await setWindowTitle(windowTitle.trim()) ? 'saved' : 'error') }
            catch { setWindowFeedback('error') }
            finally { setBusy(false) }
          } },
          h('label', { htmlFor: titleId }, t('windowTitle')),
          h('div', { style: { display: 'flex', gap: 12, margin: '8px 0' } },
            h('input', { id: titleId, type: 'text', maxLength: 200, value: windowTitle, disabled: busy || !available,
              onChange: event => { changeWindowTitle(event.target.value); setWindowFeedback('') },
              style: { flex: 1, minWidth: 100, padding: '6px 8px', border: '1px solid currentColor', borderRadius: 6, background: 'transparent', color: 'inherit' } }),
            h('button', { type: 'submit', disabled: busy || !available, style: { padding: '6px 12px' } }, t('saveTitle'))),
          h('p', { style: { opacity: 0.75, fontSize: 12 } }, t('windowHelp')),
          windowFeedback && h('p', { role: windowFeedback === 'error' ? 'alert' : 'status' }, t(windowFeedback)))),
        h('section', { 'data-reminder-module': 'popup' },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 } },
            h('div', { style: { fontWeight: 600 } }, t('title')),
            h(Switch, { checked: shown('popupEnabled'), disabled: busy || !available, label: t('title'),
              onChange: value => stage('popupEnabled', value) })),
          h('p', { style: { opacity: 0.75, fontSize: 13, margin: '8px 0' } }, t('description')),
          h('p', { style: { opacity: 0.75, fontSize: 12, margin: '8px 0' } }, t('hot')),
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, marginTop: 12 } },
            h('div', { style: { fontWeight: 600 } }, t('summary')),
            h(Switch, { checked: shown('showSummary'), disabled: busy || !available, label: t('summary'),
              onChange: value => stage('showSummary', value) })),
          h('p', { style: { opacity: 0.75, fontSize: 13, margin: '8px 0' } }, t('summaryDescription')),
          h('form', { onSubmit: async event => {
            event.preventDefault()
            if (!validInterval || busy || !available) return
            setBusy(true)
            setIntervalFeedback('')
            try { setIntervalFeedback(await setDurationSeconds(seconds) ? 'saved' : 'error') }
            catch { setIntervalFeedback('error') }
            finally { setBusy(false) }
          } },
          h('label', { htmlFor: intervalId }, t('interval')),
          h('div', { style: { display: 'flex', gap: 12, alignItems: 'center', margin: '8px 0' } },
            h('input', { id: intervalId, type: 'number', min: 1, max: 300, step: 1, value: interval,
              disabled: busy || !available, onChange: event => { setInterval(event.target.value); setIntervalFeedback('') },
              style: { width: 90, padding: '6px 8px', border: '1px solid currentColor', borderRadius: 6, background: 'transparent', color: 'inherit' } }),
            h('button', { type: 'submit', disabled: busy || !available || !validInterval, style: buttonStyle }, t('save'))),
          h('p', { style: { opacity: 0.75, fontSize: 12 } }, t('intervalHelp')),
          intervalFeedback && h('p', { role: intervalFeedback === 'error' ? 'alert' : 'status' }, t(intervalFeedback)))),
        !available && h('p', { role: 'status' }, t('unavailable')),
        (dirty || switchFeedback) && h('section', { 'data-reminder-switch-changes': '', style: { marginTop: 24, paddingTop: 20, borderTop: '1px solid #8885', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } },
          dirty && h('button', { type: 'button', disabled: busy || !available, onClick: saveSwitches, style: buttonStyle }, t('saveChanges')),
          dirty && h('button', { type: 'button', disabled: busy || !available, onClick: cancelSwitches, style: buttonStyle }, t('cancelChanges')),
          h('p', { role: switchFeedback === 'error' ? 'alert' : 'status', style: { margin: 0, opacity: 0.75, fontSize: 12 } },
            switchFeedback === 'error' ? t('error') : dirty ? t('switchUnsaved') : t('saved'))))
    }

    return {
      name: 'reminder-dsh-settings',
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('reminder-dsh', dictionaries))
        const t = ctx.locale.bind('reminder-dsh')
        const form = ctx.configForms.get('dsh-reminder')
        ctx.inject(['uiWorkspace'], scope => {
          const workspace = scope.get('uiWorkspace')
          if (!workspace || typeof workspace.openSession !== 'function') return
          const endpoint = hostRoute('reminder-dsh/session-open')
          if (!endpoint) return
          const controller = new AbortController()
          void watchSessionOpen(workspace, endpoint, controller.signal)
          return () => controller.abort()
        })
        const inject = () => ({
          hooks: { preferences: form },
          // One atomic write for every pending switch so the bar cannot leave half-applied settings.
          saveOptions: changes => form.mutate([
            ...changes.taskbarEnabled === undefined ? [] : [{ op: 'set', path: ['taskbar', 'enabled'], value: changes.taskbarEnabled }],
            ...changes.popupEnabled === undefined ? [] : [{ op: 'set', path: ['popup', 'enabled'], value: changes.popupEnabled }],
            ...changes.showSummary === undefined ? [] : [{ op: 'set', path: ['popup', 'showSummary'], value: changes.showSummary }],
          ]),
          setDurationSeconds: value => form.mutate([{ op: 'set', path: ['popup', 'durationSeconds'], value }]),
          setWindowTitle: value => form.mutate([{ op: 'set', path: ['taskbar', 'windowTitle'], value }]),
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
