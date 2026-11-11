import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const executablePath = process.env.CHROMIUM_PATH ?? [
  '/usr/bin/chromium', '/usr/bin/google-chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find(existsSync)
if (!executablePath) throw new Error('Set CHROMIUM_PATH to an installed Chromium or Chrome executable')
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setContent('<html lang="zh"><head><base href="http://test.local/dsh/"></head><body style="font-family:system-ui;margin:40px"><h2>Windows 提醒设置</h2><div id="root"></div></body></html>')
  for (const script of ['react/umd/react.development.js', 'react-dom/umd/react-dom.development.js']) {
    await page.addScriptTag({ path: fileURLToPath(new URL('../node_modules/' + script, import.meta.url)) })
  }
  await page.evaluate(() => {
    window.__ModuleLoader__ = { load: entry => { window.pluginEntry = entry } }
  })
  await page.addScriptTag({ path: fileURLToPath(new URL('../lib/client.js', import.meta.url)) })
  await page.evaluate(() => {
    const React = window.React
    const listeners = new Set()
    let snapshot = { status: 'ready', writable: true, value: { popup: { enabled: true, durationSeconds: 10, showSummary: true }, taskbar: { enabled: false, windowTitle: '' } } }
    window.writes = []
    window.failNext = false
    window.opened = []
    window.fetchUrls = []
    window.polls = []
    let focused = false
    document.hasFocus = () => focused
    window.setDshFocus = value => {
      focused = value
      window.dispatchEvent(new Event(value ? 'focus' : 'blur'))
    }
    window.fetch = (url, { signal }) => new Promise(resolve => {
      window.fetchUrls.push(String(url))
      window.polls.push({ signal, deliver: value => resolve(new Response(JSON.stringify(value), { status: 200 })) })
    })
    const uiWorkspace = {
      openSession: sessionId => {
        window.opened.push(sessionId)
        // DSH throws for an id that is no longer in the session catalog; the click must not break the poll.
        if (sessionId === 'gone-session') throw new Error('sessions.retain: unknown session ' + sessionId)
      },
    }
    window.publish = value => {
      snapshot = { ...snapshot, value: { popup: { ...snapshot.value.popup, ...value.popup }, taskbar: { ...snapshot.value.taskbar, ...value.taskbar } } }
      for (const listener of listeners) listener()
    }
    const form = {
      getSnapshot: () => snapshot,
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
      async mutate(ops) {
        window.writes.push(ops)
        if (window.failNext) { window.failNext = false; return false }
        for (const { path, value } of ops) window.publish({ [path[0]]: { [path[1]]: value } })
        return true
      },
    }
    const plugin = window.pluginEntry.factory(name => {
      if (name === 'react') return React
      if (name === '@deepseek-ai/dsh-client-ui-primitives') return {
        Switch: ({ checked, disabled, label, onChange }) => React.createElement('input', {
          type: 'checkbox', role: 'switch', 'aria-label': label, checked, disabled,
          onChange: event => onChange(event.target.checked),
        }),
      }
      throw new Error('Unexpected module ' + name)
    })
    const registrations = []
    let dictionary
    plugin.apply({
      effect: callback => callback(),
      inject: (names, callback) => {
        if (names.includes('uiWorkspace')) callback({ get: name => name === 'uiWorkspace' ? uiWorkspace : undefined })
        return () => {}
      },
      locale: {
        register: (_name, values) => { dictionary = values.zh; return () => {} },
        bind: () => key => dictionary[key],
      },
      configForms: { get: id => { if (id !== 'dsh-reminder') throw new Error('Wrong config entry'); return form } },
      slots: { inject: (_name, callback) => callback(), register: (options, component) => {
        registrations.push({ options, component }); return () => {}
      } },
    })
    if (registrations.some(item => item.options.name === 'settings.general.item')) throw new Error('Notifications must have their own settings page')
    const row = registrations.find(item => item.options.name === 'settings.section')
    if (row.options.label() !== '通知') throw new Error('Wrong navigation label')
    if (!registrations.some(item => item.options.name === 'settings.section.icon' && item.options.id === 'dsh-reminder')) {
      throw new Error('Notifications must register a bell navigation icon')
    }
    const bell = registrations.find(item => item.options.name === 'settings.section.icon')
    const iconRoot = document.createElement('div')
    iconRoot.id = 'icon-root'
    document.body.appendChild(iconRoot)
    window.ReactDOM.createRoot(iconRoot).render(React.createElement(bell.component, { size: 16 }))
    const face = row.options.inject()
    const props = {
      ...face,
      usePreferences: select => select(React.useSyncExternalStore(form.subscribe, form.getSnapshot)),
      t: key => dictionary[key],
    }
    window.ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(row.component, props))
  })
  const bellPaths = page.locator('#icon-root svg path')
  assert.equal(await page.locator('#icon-root svg').getAttribute('viewBox'), '0 0 16 16')
  assert.equal(await bellPaths.count(), 2)

  const toggle = page.getByRole('switch', { name: 'Windows 系统通知' })
  const summary = page.getByRole('switch', { name: '在通知中显示任务总结' })
  const taskbar = page.getByRole('switch', { name: 'Windows 任务栏完成角标' })
  const interval = page.getByLabel('通知发送间隔（秒）')
  const bar = page.locator('[data-reminder-switch-changes]')
  const barStatus = bar.locator('[role="status"]')
  const popupStatus = page.locator('section[data-reminder-module="popup"] [role="status"]')
  const taskbarStatus = page.locator('section[data-reminder-module="taskbar"] [role="status"]')
  const saveSwitches = page.getByRole('button', { name: '保存', exact: true })
  const cancelSwitches = page.getByRole('button', { name: '取消', exact: true })
  const writes = () => page.evaluate(() => window.writes)

  await toggle.waitFor()
  assert.equal(await toggle.isChecked(), true)
  assert.equal(await summary.isChecked(), true)
  assert.equal(await taskbar.isChecked(), false)
  assert.equal(await interval.inputValue(), '10')
  // Nothing is pending until a switch is toggled, and no write happens on toggle.
  assert.equal(await bar.count(), 0)
  assert.equal(await page.getByText('已保存，立即生效。').count(), 0)

  await toggle.click()
  assert.deepEqual(await writes(), [])
  assert.equal(await toggle.isChecked(), false)
  await barStatus.filter({ hasText: '开关更改尚未保存，保存后立即生效。' }).waitFor()
  await saveSwitches.click()
  await barStatus.filter({ hasText: '已保存，立即生效。' }).waitFor()
  assert.equal(await toggle.isChecked(), false)
  assert.deepEqual(await writes(), [[{ op: 'set', path: ['popup', 'enabled'], value: false }]])
  // The confirmation is transient and the buttons are gone until the next change.
  assert.equal(await saveSwitches.count(), 0)
  assert.equal(await cancelSwitches.count(), 0)

  await summary.click()
  await taskbar.click()
  assert.equal(await writes().then(list => list.length), 1)
  await barStatus.filter({ hasText: '开关更改尚未保存，保存后立即生效。' }).waitFor()
  await cancelSwitches.click()
  assert.equal(await summary.isChecked(), true)
  assert.equal(await taskbar.isChecked(), false)
  assert.equal(await bar.count(), 0)
  assert.equal(await writes().then(list => list.length), 1)

  await summary.click()
  await taskbar.click()
  await saveSwitches.click()
  await barStatus.filter({ hasText: '已保存，立即生效。' }).waitFor()
  assert.equal(await summary.isChecked(), false)
  assert.equal(await taskbar.isChecked(), true)
  assert.deepEqual(await writes().then(list => list.at(-1)), [
    { op: 'set', path: ['taskbar', 'enabled'], value: true },
    { op: 'set', path: ['popup', 'showSummary'], value: false },
  ])

  await interval.fill('25')
  await page.getByRole('button', { name: '保存间隔' }).click()
  await popupStatus.filter({ hasText: '已保存，立即生效。' }).waitFor()
  assert.deepEqual(await writes().then(list => list.at(-1)), [{ op: 'set', path: ['popup', 'durationSeconds'], value: 25 }])

  await page.getByLabel('目标窗口标题包含（可选）').fill('测试会话 — DeepSeek Harness')
  await page.getByRole('button', { name: '保存目标窗口' }).click()
  await taskbarStatus.filter({ hasText: '已保存，立即生效。' }).waitFor()
  assert.deepEqual(await writes().then(list => list.at(-1)), [{ op: 'set', path: ['taskbar', 'windowTitle'], value: '测试会话 — DeepSeek Harness' }])

  // A refused write keeps the pending switch and offers retry or cancel.
  await page.evaluate(() => { window.failNext = true })
  await summary.click()
  await saveSwitches.click()
  const alert = bar.locator('[role="alert"]')
  await alert.filter({ hasText: '设置未保存，请检查连接或配置覆盖后重试。' }).waitFor()
  assert.equal(await summary.isChecked(), true)
  assert.equal(await saveSwitches.count(), 1)
  await cancelSwitches.click()
  assert.equal(await summary.isChecked(), false)
  assert.equal(await bar.count(), 0)

  await interval.fill('0')
  assert.equal(await page.getByRole('button', { name: '保存间隔' }).isDisabled(), true)
  await page.evaluate(() => window.publish({ popup: { enabled: true, durationSeconds: 35, showSummary: true } }))
  await page.waitForFunction(() => document.querySelector('input[type="number"]').value === '35')
  assert.equal(await toggle.isChecked(), true)
  assert.equal(await summary.isChecked(), true)
  assert.equal(await taskbar.isChecked(), true)
  assert.deepEqual(await page.evaluate(() => window.fetchUrls), [])
  await page.evaluate(() => {
    window.setDshFocus(true)
    window.setDshFocus(false)
    if (!window.polls[0].signal.aborted) throw new Error('Background tab did not cancel its poll')
    window.polls[0].deliver({ id: 'stale-click', sessionId: 'other-session' })
    window.setDshFocus(true)
    window.polls[1].deliver({ id: 'gone-session-click', sessionId: 'gone-session' })
  })
  await page.waitForFunction(() => window.fetchUrls.length === 3)
  // A notification outliving its session must be acknowledged without stopping the follow loop.
  await page.evaluate(() => window.polls[2].deliver({ id: 'current-click', sessionId: 'session-jump' }))
  await page.waitForFunction(() => window.fetchUrls.length === 4)
  assert.deepEqual(await page.evaluate(() => window.opened), ['gone-session', 'session-jump'])
  assert.deepEqual(await page.evaluate(() => window.fetchUrls), [
    'http://test.local/dsh/api/reminder-dsh/session-open',
    'http://test.local/dsh/api/reminder-dsh/session-open',
    'http://test.local/dsh/api/reminder-dsh/session-open?ack=gone-session-click',
    'http://test.local/dsh/api/reminder-dsh/session-open?ack=current-click',
  ])
  assert.deepEqual(errors, [])
  console.log('Settings browser checks passed: bell icon, staged switch save/cancel, atomic write, per-field feedback, refused write, external live update, toast session jump.')
} finally { await browser.close() }
