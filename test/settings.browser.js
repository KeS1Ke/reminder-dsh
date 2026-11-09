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
  const page = await browser.newPage({ viewport: { width: 800, height: 580 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setContent('<html lang="zh"><body style="font-family:system-ui;margin:40px"><h2>Windows 提醒设置</h2><div id="root"></div></body></html>')
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
    let snapshot = { status: 'ready', writable: true, value: { popup: { enabled: true, durationSeconds: 10 }, taskbar: { enabled: false, windowTitle: '' } } }
    window.writes = []
    window.failNext = false
    window.publish = value => {
      snapshot = { ...snapshot, value: { popup: { ...snapshot.value.popup, ...value.popup }, taskbar: { ...snapshot.value.taskbar, ...value.taskbar } } }
      for (const listener of listeners) listener()
    }
    const form = {
      getSnapshot: () => snapshot,
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
      async mutate([{ path, value }]) {
        window.writes.push({ path, value })
        if (window.failNext) { window.failNext = false; return false }
        window.publish({ [path[0]]: { [path[1]]: value } })
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
      locale: {
        register: (_name, values) => { dictionary = values.zh; return () => {} },
        bind: () => key => dictionary[key],
      },
      configForms: { get: id => { if (id !== 'dsh-taskbar-reminder') throw new Error('Wrong config entry'); return form } },
      slots: { inject: (_name, callback) => callback(), register: (options, component) => {
        registrations.push({ options, component }); return () => {}
      } },
    })
    if (registrations.some(item => item.options.name === 'settings.general.item')) throw new Error('Notifications must have their own settings page')
    const row = registrations.find(item => item.options.name === 'settings.section')
    if (row.options.label() !== '通知') throw new Error('Wrong navigation label')
    const face = row.options.inject()
    const props = {
      ...face,
      usePreferences: select => select(React.useSyncExternalStore(form.subscribe, form.getSnapshot)),
      t: key => dictionary[key],
    }
    window.ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(row.component, props))
  })
  const toggle = page.getByRole('switch', { name: 'Windows 系统通知' })
  await toggle.waitFor()
  assert.equal(await toggle.isChecked(), true)
  const interval = page.getByLabel('通知发送间隔（秒）')
  assert.equal(await interval.inputValue(), '10')
  await toggle.click()
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor()
  assert.equal(await toggle.isChecked(), false)
  await interval.fill('25')
  await page.getByRole('button', { name: '保存间隔' }).click()
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor()
  assert.deepEqual(await page.evaluate(() => window.writes), [
    { path: ['popup', 'enabled'], value: false }, { path: ['popup', 'durationSeconds'], value: 25 },
  ])
  const taskbar = page.getByRole('switch', { name: 'Windows 任务栏图标闪烁' })
  assert.equal(await taskbar.isChecked(), false)
  await taskbar.click()
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor()
  assert.equal(await taskbar.isChecked(), true)
  assert.equal(await toggle.isChecked(), false)
  await page.getByLabel('目标窗口标题包含（可选）').fill('测试会话 — DeepSeek Harness')
  await page.getByRole('button', { name: '保存目标窗口' }).click()
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor()
  assert.deepEqual(await page.evaluate(() => window.writes.slice(-2)), [
    { path: ['taskbar', 'enabled'], value: true },
    { path: ['taskbar', 'windowTitle'], value: '测试会话 — DeepSeek Harness' },
  ])
  await interval.fill('0')
  assert.equal(await page.getByRole('button', { name: '保存间隔' }).isDisabled(), true)
  await page.evaluate(() => { window.failNext = true })
  await toggle.click()
  await page.getByRole('alert').waitFor()
  assert.equal(await toggle.isChecked(), false)
  await page.evaluate(() => window.publish({ popup: { enabled: true, durationSeconds: 35 } }))
  await page.waitForFunction(() => document.querySelector('input[type="number"]').value === '35')
  assert.equal(await toggle.isChecked(), true)
  assert.equal(await taskbar.isChecked(), true)
  assert.deepEqual(errors, [])
  console.log('Settings browser checks passed: toggle, interval save/validation, refused write, external live update.')
} finally { await browser.close() }
