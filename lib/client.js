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
        taskbar: 'Windows 任务栏图标闪烁',
        taskbarDescription: '主会话完成时闪烁 DSH 窗口的任务栏图标。切回目标窗口后停止闪烁。此开关独立于 Windows 系统通知。',
        windowTitle: '目标窗口标题包含（可选）', saveTitle: '保存目标窗口',
        windowHelp: '留空自动识别 DeepSeek Harness / DSH 窗口。浏览器需显示 DSH 标签页；匹配多个窗口时，请填写更具体的标题文本。',
        description: '主会话完成后通过 Windows 通知显示任务总结。可在通知中直接回复原会话。',
        interval: '通知发送间隔（秒）', intervalHelp: '默认 10 秒，可设为 1–300 秒。横幅显示时间由 Windows 管理。', save: '保存间隔',
        hot: '修改立即生效并自动保存。关闭后取消尚未发送的通知。',
        saved: '已保存，立即生效。',
        error: '设置未保存，请检查连接或配置覆盖后重试。',
        unavailable: '此配置暂不可编辑，请确认插件已加载且当前配置可写。',
      },
      en: {
        nav: 'Notifications',
        title: 'Windows system notifications',
        taskbar: 'Windows taskbar flashing',
        taskbarDescription: 'Flash the DSH window taskbar icon when a main session finishes. Focusing the target window stops flashing. This switch is independent of Windows notifications.',
        windowTitle: 'Target window title contains (optional)', saveTitle: 'Save target window',
        windowHelp: 'Leave blank to detect DeepSeek Harness / DSH windows. A browser must show its DSH tab. If multiple windows match, enter a more specific title.',
        description: 'Show a task summary in Windows notifications when a main session finishes. Reply to the original session from the notification.',
        interval: 'Notification interval (seconds)', intervalHelp: 'Default: 10 seconds. Range: 1–300. Windows controls how long banners stay visible.', save: 'Save interval',
        hot: 'Changes save and apply immediately. Turning off notifications cancels pending sends.',
        saved: 'Saved and applied immediately.',
        error: 'Could not save. Check the connection or configuration overrides and retry.',
        unavailable: 'Settings are unavailable. Check that the plugin is loaded and its configuration is writable.',
      },
    }

    function NotificationSettings({ usePreferences, setEnabled, setDurationSeconds, setTaskbarEnabled, setWindowTitle, t }) {
      const snapshot = usePreferences(value => value)
      const [busy, setBusy] = React.useState(false)
      const [feedback, setFeedback] = React.useState('')
      const [interval, setInterval] = React.useState(String(snapshot.value?.popup?.durationSeconds ?? 10))
      const intervalId = React.useId()
      const titleId = React.useId()
      const [windowTitle, changeWindowTitle] = React.useState(snapshot.value?.taskbar?.windowTitle ?? '')
      React.useEffect(() => { changeWindowTitle(snapshot.value?.taskbar?.windowTitle ?? '') }, [snapshot.value?.taskbar?.windowTitle])
      React.useEffect(() => { setInterval(String(snapshot.value?.popup?.durationSeconds ?? 10)) }, [snapshot.value?.popup?.durationSeconds])
      const seconds = Number(interval)
      const validInterval = interval.trim() !== '' && Number.isInteger(seconds) && seconds >= 1 && seconds <= 300
      const available = snapshot.status === 'ready' && snapshot.writable
      const enabled = snapshot.value?.popup?.enabled === true
      return h('div', { style: { padding: '12px 0' }, 'data-reminder-dsh-settings': '' },
        h('section', { 'data-reminder-module': 'taskbar', style: { marginBottom: 24, borderBottom: '1px solid #8885', paddingBottom: 20 } },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 } },
            h('h3', { style: { fontSize: 14, margin: 0 } }, t('taskbar')),
            h(Switch, { checked: snapshot.value?.taskbar?.enabled === true, disabled: busy || !available, label: t('taskbar'),
              onChange: async value => {
                setBusy(true); setFeedback('')
                try { setFeedback(await setTaskbarEnabled(value) ? 'saved' : 'error') }
                catch { setFeedback('error') }
                finally { setBusy(false) }
              },
            })),
          h('p', { style: { opacity: 0.75, fontSize: 13 } }, t('taskbarDescription')),
          h('form', { onSubmit: async event => {
            event.preventDefault()
            if (busy || !available || windowTitle.length > 200) return
            setBusy(true); setFeedback('')
            try { setFeedback(await setWindowTitle(windowTitle.trim()) ? 'saved' : 'error') }
            catch { setFeedback('error') }
            finally { setBusy(false) }
          } },
          h('label', { htmlFor: titleId }, t('windowTitle')),
          h('div', { style: { display: 'flex', gap: 12, margin: '8px 0' } },
            h('input', { id: titleId, type: 'text', maxLength: 200, value: windowTitle, disabled: busy || !available,
              onChange: event => changeWindowTitle(event.target.value),
              style: { flex: 1, minWidth: 100, padding: '6px 8px', border: '1px solid currentColor', borderRadius: 6, background: 'transparent', color: 'inherit' } }),
            h('button', { type: 'submit', disabled: busy || !available, style: { padding: '6px 12px' } }, t('saveTitle'))),
          h('p', { style: { opacity: 0.75, fontSize: 12 } }, t('windowHelp')))),
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 } },
          h('div', { style: { fontWeight: 600 } }, t('title')),
          h(Switch, { checked: enabled, disabled: busy || !available, label: t('title'),
            onChange: async value => {
              setBusy(true)
              setFeedback('')
              try { setFeedback(await setEnabled(value) ? 'saved' : 'error') }
              catch { setFeedback('error') }
              finally { setBusy(false) }
            },
          })),
        h('p', { style: { opacity: 0.75, fontSize: 13, margin: '8px 0' } }, t('description')),
        h('p', { style: { opacity: 0.75, fontSize: 12, margin: '8px 0' } }, t('hot')),
        h('form', { onSubmit: async event => {
          event.preventDefault()
          if (!validInterval || busy || !available) return
          setBusy(true)
          setFeedback('')
          try { setFeedback(await setDurationSeconds(seconds) ? 'saved' : 'error') }
          catch { setFeedback('error') }
          finally { setBusy(false) }
        } },
        h('label', { htmlFor: intervalId }, t('interval')),
        h('div', { style: { display: 'flex', gap: 12, alignItems: 'center', margin: '8px 0' } },
          h('input', { id: intervalId, type: 'number', min: 1, max: 300, step: 1, value: interval,
            disabled: busy || !available, onChange: event => { setInterval(event.target.value); setFeedback('') },
            style: { width: 90, padding: '6px 8px', border: '1px solid currentColor', borderRadius: 6, background: 'transparent', color: 'inherit' } }),
          h('button', { type: 'submit', disabled: busy || !available || !validInterval,
            style: { padding: '6px 12px', borderRadius: 6, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer' } }, t('save'))),
        h('p', { style: { opacity: 0.75, fontSize: 12 } }, t('intervalHelp'))),
        !available && h('p', { role: 'status' }, t('unavailable')),
        feedback && h('p', { role: feedback === 'error' ? 'alert' : 'status' }, t(feedback)))
    }

    return {
      name: 'reminder-dsh-settings',
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('reminder-dsh', dictionaries))
        const t = ctx.locale.bind('reminder-dsh')
        const form = ctx.configForms.get('dsh-reminder')
        const inject = () => ({
          hooks: { preferences: form },
          setEnabled: value => form.mutate([{ op: 'set', path: ['popup', 'enabled'], value }]),
          setDurationSeconds: value => form.mutate([{ op: 'set', path: ['popup', 'durationSeconds'], value }]),
          setTaskbarEnabled: value => form.mutate([{ op: 'set', path: ['taskbar', 'enabled'], value }]),
          setWindowTitle: value => form.mutate([{ op: 'set', path: ['taskbar', 'windowTitle'], value }]),
        })
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
