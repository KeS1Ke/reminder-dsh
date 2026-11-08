/** Browser entry using DSH's published module registration protocol; no build step required. */
window.__ModuleLoader__.load({
  id: '@kesike/dsh-taskbar-reminder',
  factory(require) {
    const React = require('react')
    const { Switch } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    const dictionaries = {
      zh: {
        title: 'Windows 弹窗对话提醒',
        taskbar: 'Windows 任务栏图标闪烁',
        taskbarDescription: '主会话完成时闪烁 DSH 窗口的任务栏图标，不弹出对话框，也不调用模型生成总结。点击回到目标窗口后停止闪烁；关闭此开关不影响弹窗模块。',
        windowTitle: '目标窗口标题包含（可选）', saveTitle: '保存目标窗口',
        windowHelp: '留空自动识别 DeepSeek Harness / DSH 窗口。浏览器需显示 DSH 标签页；匹配多个窗口时，请填写更具体的标题文本。',
        description: '主会话完成后显示任务总结并支持快速回复。一次只显示一个提醒，输入时暂停切换。仅适用于 Windows 本机运行的 DSH。',
        interval: '自动切换间隔（秒）', intervalHelp: '默认 10 秒，可设为 1–300 秒。保存后立即更新当前弹窗倒计时和排队间隔。', save: '保存间隔',
        hot: '修改立即生效并自动保存。关闭会终止当前弹窗、丢弃未发送草稿并清空等待队列。',
        saved: '已保存，立即生效。',
        error: '设置未保存，请检查连接或配置覆盖后重试。',
        unavailable: '此配置暂不可编辑，请确认插件已加载且当前配置可写。',
      },
      en: {
        title: 'Windows popup reminders',
        taskbar: 'Windows taskbar flashing',
        taskbarDescription: 'Flash the DSH window taskbar icon when a main session finishes, without a popup or model summary call. Focusing the target window stops flashing. This switch is independent of the popup module.',
        windowTitle: 'Target window title contains (optional)', saveTitle: 'Save target window',
        windowHelp: 'Leave blank to detect DeepSeek Harness / DSH windows. A browser must show its DSH tab. If multiple windows match, enter a more specific title.',
        description: 'Show a task summary and quick reply when a main session finishes. One popup at a time; editing pauses rotation. Requires DSH running locally on Windows.',
        interval: 'Switch interval (seconds)', intervalHelp: 'Default: 10 seconds. Range: 1–300. Saving updates the current popup countdown and queue interval immediately.', save: 'Save interval',
        hot: 'Changes save and apply immediately. Disabling closes the current popup, discards unsent drafts and clears queued reminders.',
        saved: 'Saved and applied immediately.',
        error: 'Could not save. Check the connection or configuration overrides and retry.',
        unavailable: 'Settings are unavailable. Check that the plugin is loaded and its configuration is writable.',
      },
    }

    function SettingsRow({ usePreferences, setEnabled, setDurationSeconds, setTaskbarEnabled, setWindowTitle, t }) {
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
      return h('div', { style: { padding: '12px 0' }, 'data-winreminder-settings': '' },
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
      name: 'winreminder-settings',
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('winreminder', dictionaries))
        const form = ctx.configForms.get('dsh-taskbar-reminder')
        const inject = () => ({
          hooks: { preferences: form },
          setEnabled: value => form.mutate([{ op: 'set', path: ['popup', 'enabled'], value }]),
          setDurationSeconds: value => form.mutate([{ op: 'set', path: ['popup', 'durationSeconds'], value }]),
          setTaskbarEnabled: value => form.mutate([{ op: 'set', path: ['taskbar', 'enabled'], value }]),
          setWindowTitle: value => form.mutate([{ op: 'set', path: ['taskbar', 'windowTitle'], value }]),
        })
        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item', id: 'dsh-reminder', order: 50, locale: 'winreminder', inject,
        }, SettingsRow))
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config', key: '@kesike/dsh-taskbar-reminder', locale: 'winreminder', inject,
        }, SettingsRow))
      },
    }
  },
})
