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
        esp32: 'ESP32 Wi-Fi 完成提醒',
        esp32Description: '电脑和 ESP32 连接同一 Wi-Fi，或让 ESP32 连接电脑热点。在设备 Setting 中开启 Phone control，输入屏幕显示的地址和六位配对码。任务完成后立即显示会话标题及回复摘录。',
        esp32Address: 'ESP32 地址', esp32Pin: '六位配对码', esp32Pair: '配对并启用',
        esp32Test: '发送测试提醒', esp32Sound: 'ESP32 提示音',
        esp32Paired: '已配对并保存。可发送测试提醒。', esp32Tested: '设备已接收测试提醒。',
        esp32SaveError: '配对成功，但设置未保存。请再次点击配对并启用以重试保存。',
        esp32Error: '连接失败，请检查设备地址、Wi-Fi 和配对码。',
        esp32Help: '设备重启或重新开启 Phone control 后需要重新配对。同一配对会话供电脑或手机中的一个使用。提示音使用设备媒体音量；请启用媒体模块。',
        title: 'Windows 系统通知',
        taskbar: 'Windows 任务栏完成角标',
        taskbarDescription: '主会话完成时在 DSH 任务栏图标的角上显示未查看的完成数量（深色圆底白色数字，同 ChatGPT 角标）。切回目标窗口后角标清除。此开关独立于 Windows 系统通知。',
        summary: '在通知中显示任务总结',
        summaryDescription: '开启后通知正文最多显示 3 行任务总结；关闭后通知只显示会话标题，并省去一次 AI 总结调用。',
        sound: '弹窗提示音',
        soundDescription: '开启后，弹窗出现时同步播放约 1 秒的叮声。关闭后仍使用 Windows 自己的通知声音。',
        soundCustom: '当前使用自定义音效。',
        soundDefault: '当前使用默认叮声。',
        uploadSound: '上传自定义音效',
        soundHelp: '支持 wav 或 mp3，最长 5 秒。文件保存在本机插件目录，不修改 Windows 系统声音。',
        resetSound: '恢复默认叮声',
        soundSaved: '自定义音效已保存，下一条弹窗生效。',
        soundReset: '已恢复默认叮声。',
        soundError: '音效未保存，请使用 5 秒以内的 wav 或 mp3。',
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
        esp32: 'ESP32 Wi-Fi completion reminders',
        esp32Description: 'Connect the computer and ESP32 to the same Wi-Fi, or connect ESP32 to the computer hotspot. Enable Phone control in the device Setting page, then enter its address and six-digit code. Completed tasks immediately send the session title and a reply excerpt.',
        esp32Address: 'ESP32 address', esp32Pin: 'Six-digit pairing code', esp32Pair: 'Pair and enable',
        esp32Test: 'Send test reminder', esp32Sound: 'ESP32 sound',
        esp32Paired: 'Paired and saved. You can send a test reminder.', esp32Tested: 'The device accepted the test reminder.',
        esp32SaveError: 'Paired, but settings were not saved. Click Pair and enable again to retry saving.',
        esp32Error: 'Connection failed. Check the device address, Wi-Fi and pairing code.',
        esp32Help: 'Pair again after restarting the device or toggling Phone control. One pairing session is used by either the computer or phone. Sound uses the device media volume; enable a media module.',
        title: 'Windows system notifications',
        taskbar: 'Windows taskbar completion badge',
        taskbarDescription: 'Show the number of unread completed sessions on the DSH taskbar icon (dark chip with white digits, like the ChatGPT badge) when a main session finishes. Focusing the target window clears the badge. This switch is independent of Windows notifications.',
        summary: 'Show task summary in notifications',
        summaryDescription: 'When on, the notification body shows the task summary in up to three lines. When off, only the session title is shown and no summary model call is made.',
        sound: 'Notification sound',
        soundDescription: 'When on, each toast also plays a one-second ding. When off, Windows uses its own notification sound.',
        soundCustom: 'Using a custom sound.',
        soundDefault: 'Using the default ding.',
        uploadSound: 'Upload a custom sound',
        soundHelp: 'wav or mp3, up to 5 seconds. The file stays in the plugin folder and does not change Windows system sounds.',
        resetSound: 'Use the default ding',
        soundSaved: 'Custom sound saved. It applies to the next toast.',
        soundReset: 'Restored the default ding.',
        soundError: 'Could not save the sound. Use a wav or mp3 no longer than 5 seconds.',
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

    /** A background page cannot consume a click intended for the DSH window brought to the front. */
    function followSessionOpens(workspace, endpoint) {
      const lifetime = new AbortController()
      const foreground = () => document.visibilityState === 'visible' && document.hasFocus()
      let poll, acknowledgedId

      async function watch(signal) {
        const url = new URL(endpoint)
        let failures = 0
        while (!signal.aborted) {
          try {
            if (acknowledgedId) url.searchParams.set('ack', acknowledgedId)
            const response = await fetch(url.href, { signal, credentials: 'same-origin', cache: 'no-store' })
            if (!response.ok) throw new Error(`session-open route ${response.status}`)
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
        if (!foreground()) {
          poll?.abort()
          poll = undefined
        } else if (!poll) {
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

    const buttonStyle = { padding: '6px 12px', borderRadius: 6, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer' }

    function Esp32Settings({ snapshot, enabled, soundEnabled, stage, endpoint, setEsp32, onPaired, t }) {
      const [address, setAddress] = React.useState(snapshot.value?.esp32?.address ?? '')
      const [pin, setPin] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState('')
      const [error, setError] = React.useState('')
      const pendingPair = React.useRef(null)
      const addressId = React.useId(), pinId = React.useId()
      React.useEffect(() => { setAddress(snapshot.value?.esp32?.address ?? '') }, [snapshot.value?.esp32?.address])
      const available = snapshot.status === 'ready' && snapshot.writable && Boolean(endpoint)
      const call = async body => {
        const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        const value = await response.json()
        if (!response.ok) throw new Error(value.error || t('esp32Error'))
        return value
      }
      const pair = async event => {
        event.preventDefault()
        if (busy || !available) return
        setBusy(true); setError(''); setNote('')
        try {
          if (pendingPair.current?.address !== address.trim()) {
            const result = await call({ action: 'pair', address: address.trim(), pin })
            pendingPair.current = { address: address.trim(), token: result.token }
          }
          if (!await setEsp32({ ...pendingPair.current, enabled: true })) throw new Error(t('esp32SaveError'))
          pendingPair.current = null
          setPin(''); onPaired(); setNote(t('esp32Paired'))
        } catch (error) { setError(error.message || t('esp32Error')) }
        finally { setBusy(false) }
      }
      const test = async () => {
        if (busy || !available) return
        setBusy(true); setError(''); setNote('')
        try { await call({ action: 'test' }); setNote(t('esp32Tested')) }
        catch (error) { setError(error.message || t('esp32Error')) }
        finally { setBusy(false) }
      }
      const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '6px 8px', margin: '8px 0', border: '1px solid currentColor', borderRadius: 6, background: 'transparent', color: 'inherit' }
      return h('section', { 'data-reminder-module': 'esp32', style: { marginBottom: 24, borderBottom: '1px solid #8885', paddingBottom: 20 } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 } },
          h('h3', { style: { fontSize: 14, margin: 0 } }, t('esp32')),
          h(Switch, { checked: enabled, disabled: busy || !available, label: t('esp32'), onChange: value => stage('esp32Enabled', value) })),
        h('p', { style: { opacity: 0.75, fontSize: 13 } }, t('esp32Description')),
        h('form', { onSubmit: pair },
          h('label', { htmlFor: addressId }, t('esp32Address')),
          h('input', { id: addressId, value: address, type: 'url', maxLength: 100, required: true,
            placeholder: 'http://192.168.137.22:8080', disabled: busy || !available,
            onChange: event => { setAddress(event.target.value); setError(''); setNote('') }, style: inputStyle }),
          h('label', { htmlFor: pinId }, t('esp32Pin')),
          h('input', { id: pinId, value: pin, inputMode: 'numeric', autoComplete: 'off', type: 'password',
            maxLength: 6, pattern: '[0-9]{6}', required: !pendingPair.current, disabled: busy || !available,
            onChange: event => setPin(event.target.value), style: { ...inputStyle, maxWidth: 160, display: 'block' } }),
          h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap' } },
            h('button', { type: 'submit', disabled: busy || !available, style: buttonStyle }, t('esp32Pair')),
            h('button', { type: 'button', onClick: test, disabled: busy || !available || !snapshot.value?.esp32?.address, style: buttonStyle }, t('esp32Test')))),
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, marginTop: 16 } },
          h('span', null, t('esp32Sound')),
          h(Switch, { checked: soundEnabled, disabled: busy || !available, label: t('esp32Sound'), onChange: value => stage('esp32SoundEnabled', value) })),
        h('p', { style: { opacity: 0.75, fontSize: 12 } }, t('esp32Help')),
        error && h('p', { role: 'alert' }, error), note && h('p', { role: 'status' }, note))
    }

    function NotificationSettings({ usePreferences, saveOptions, setDurationSeconds, setWindowTitle, soundEndpoint, esp32Endpoint, setEsp32, t }) {
      const snapshot = usePreferences(value => value)
      const [busy, setBusy] = React.useState(false)
      const [switchFeedback, setSwitchFeedback] = React.useState('')
      const [windowFeedback, setWindowFeedback] = React.useState('')
      const [intervalFeedback, setIntervalFeedback] = React.useState('')
      const [soundCustom, setSoundCustom] = React.useState(false)
      const [soundNote, setSoundNote] = React.useState('')
      const [soundError, setSoundError] = React.useState('')
      const soundTouched = React.useRef(false)
      const [interval, setInterval] = React.useState(String(snapshot.value?.popup?.durationSeconds ?? 10))
      const [drafts, setDrafts] = React.useState({})
      const intervalId = React.useId()
      const titleId = React.useId()
      const [windowTitle, changeWindowTitle] = React.useState(snapshot.value?.taskbar?.windowTitle ?? '')
      React.useEffect(() => { changeWindowTitle(snapshot.value?.taskbar?.windowTitle ?? '') }, [snapshot.value?.taskbar?.windowTitle])
      React.useEffect(() => { setInterval(String(snapshot.value?.popup?.durationSeconds ?? 10)) }, [snapshot.value?.popup?.durationSeconds])
      React.useEffect(() => {
        if (!soundEndpoint) return undefined
        const controller = new AbortController()
        fetch(soundEndpoint, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
          .then(response => response.ok ? response.json() : { custom: false })
          .then(value => { if (!controller.signal.aborted && !soundTouched.current) setSoundCustom(Boolean(value?.custom)) })
          .catch(() => {})
        return () => controller.abort()
      }, [soundEndpoint])
      const seconds = Number(interval)
      const validInterval = interval.trim() !== '' && Number.isInteger(seconds) && seconds >= 1 && seconds <= 300
      const available = snapshot.status === 'ready' && snapshot.writable
      // Switches only edit drafts; the bar at the bottom writes every pending switch as one mutation.
      const stored = {
        esp32Enabled: snapshot.value?.esp32?.enabled === true,
        esp32SoundEnabled: snapshot.value?.esp32?.soundEnabled !== false,
        taskbarEnabled: snapshot.value?.taskbar?.enabled === true,
        popupEnabled: snapshot.value?.popup?.enabled === true,
        showSummary: snapshot.value?.popup?.showSummary !== false,
        soundEnabled: snapshot.value?.popup?.soundEnabled !== false,
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
      const uploadSound = async file => {
        if (busy || !available || !soundEndpoint) return
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
            setSoundError(typeof value.error === 'string' ? value.error : t('soundError'))
            return
          }
          setSoundCustom(true)
          setSoundNote('saved')
        } catch { setSoundError(t('soundError')) }
        finally { setBusy(false) }
      }
      const resetSound = async () => {
        if (busy || !available || !soundEndpoint) return
        soundTouched.current = true
        setBusy(true)
        setSoundNote('')
        setSoundError('')
        try {
          const response = await fetch(soundEndpoint, { method: 'DELETE', credentials: 'same-origin' })
          if (!response.ok) { setSoundError(t('soundError')); return }
          setSoundCustom(false)
          setSoundNote('reset')
        } catch { setSoundError(t('soundError')) }
        finally { setBusy(false) }
      }
      // A successful switch save is a transient confirmation; the bar itself disappears with the changes.
      React.useEffect(() => {
        if (switchFeedback !== 'saved') return undefined
        const timer = setTimeout(() => setSwitchFeedback(''), 5000)
        return () => clearTimeout(timer)
      }, [switchFeedback])
      return h('div', { style: { padding: '12px 0' }, 'data-reminder-dsh-settings': '' },
        h(Esp32Settings, { snapshot, enabled: shown('esp32Enabled'), soundEnabled: shown('esp32SoundEnabled'), stage,
          endpoint: esp32Endpoint, setEsp32, t, onPaired: () => setDrafts(current => { const next = { ...current }; delete next.esp32Enabled; return next }) }),
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
            h('button', { type: 'submit', disabled: busy || !available, style: buttonStyle }, t('saveTitle'))),
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
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, marginTop: 12 } },
            h('div', { style: { fontWeight: 600 } }, t('sound')),
            h(Switch, { checked: shown('soundEnabled'), disabled: busy || !available, label: t('sound'),
              onChange: value => stage('soundEnabled', value) })),
          h('p', { style: { opacity: 0.75, fontSize: 13, margin: '8px 0' } }, t('soundDescription')),
          shown('soundEnabled') && soundEndpoint && h('div', { 'data-reminder-sound': '' },
            h('p', { style: { opacity: 0.75, fontSize: 12, margin: '8px 0' } }, soundCustom ? t('soundCustom') : t('soundDefault')),
            h('div', { style: { display: 'flex', gap: 12, alignItems: 'center', margin: '8px 0', flexWrap: 'wrap' } },
              h('label', { style: buttonStyle },
                t('uploadSound'),
                h('input', { type: 'file', accept: '.wav,.mp3,audio/wav,audio/mpeg', disabled: busy || !available,
                  'aria-label': t('uploadSound'), style: { display: 'none' },
                  onChange: event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) uploadSound(file) } })),
              soundCustom && h('button', { type: 'button', disabled: busy || !available, onClick: resetSound, style: buttonStyle }, t('resetSound'))),
            h('p', { style: { opacity: 0.75, fontSize: 12 } }, t('soundHelp')),
            soundError && h('p', { role: 'alert' }, soundError),
            soundNote && h('p', { role: 'status' }, t(soundNote === 'saved' ? 'soundSaved' : 'soundReset'))),
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
          const endpoint = hostRoute('api/reminder-dsh/session-open')
          if (!endpoint) return
          return followSessionOpens(workspace, endpoint)
        })
        const inject = () => ({
          hooks: { preferences: form },
          // One atomic write for every pending switch so the bar cannot leave half-applied settings.
          saveOptions: changes => form.mutate([
            ...changes.esp32Enabled === undefined ? [] : [{ op: 'set', path: ['esp32', 'enabled'], value: changes.esp32Enabled }],
            ...changes.esp32SoundEnabled === undefined ? [] : [{ op: 'set', path: ['esp32', 'soundEnabled'], value: changes.esp32SoundEnabled }],
            ...changes.taskbarEnabled === undefined ? [] : [{ op: 'set', path: ['taskbar', 'enabled'], value: changes.taskbarEnabled }],
            ...changes.popupEnabled === undefined ? [] : [{ op: 'set', path: ['popup', 'enabled'], value: changes.popupEnabled }],
            ...changes.showSummary === undefined ? [] : [{ op: 'set', path: ['popup', 'showSummary'], value: changes.showSummary }],
            ...changes.soundEnabled === undefined ? [] : [{ op: 'set', path: ['popup', 'soundEnabled'], value: changes.soundEnabled }],
          ]),
          setDurationSeconds: value => form.mutate([{ op: 'set', path: ['popup', 'durationSeconds'], value }]),
          setWindowTitle: value => form.mutate([{ op: 'set', path: ['taskbar', 'windowTitle'], value }]),
          soundEndpoint: hostRoute('api/reminder-dsh/sound'),
          esp32Endpoint: hostRoute('api/reminder-dsh/esp32'),
          setEsp32: value => form.mutate(Object.entries(value).map(([key, value]) => ({ op: 'set', path: ['esp32', key], value }))),
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
