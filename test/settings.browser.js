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
  const page = await browser.newPage({ viewport: { width: 960, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))

  await page.setContent(`
    <html lang="zh">
      <head>
        <base href="http://test.local/dsh/">
        <style>
          :root {
            --dsw-radius-sm: 8px;
            --dsw-radius-md: 12px;
            --dsw-radius-xl: 20px;
            --dsh-hairline-width: 0.5px;
            --dsw-focus-ring-width: 2px;
          }
          body {
            font-family: system-ui;
            margin: 32px;
            --dsw-alias-bg-base: rgb(255, 255, 255);
            --dsw-alias-bg-layer-1: rgb(255, 255, 255);
            --dsw-alias-bg-layer-2: rgb(249, 250, 251);
            --dsw-alias-bg-module-platform: rgb(245, 246, 247);
            --dsw-alias-settings-card-fill: var(--dsw-alias-bg-layer-2);
            --dsw-alias-settings-card-stroke: rgb(229, 231, 235);
            --dsw-alias-border-l2: rgb(235, 236, 240);
            --dsw-alias-border-l4: rgb(212, 214, 218);
            --dsw-alias-label-primary: rgb(17, 24, 39);
            --dsw-alias-label-secondary: rgb(75, 85, 99);
            --dsw-alias-label-tertiary: rgb(107, 114, 128);
            --dsw-alias-label-primary-foreground: rgb(255, 255, 255);
            --dsw-alias-state-business-primary: rgb(77, 107, 254);
            --dsw-alias-state-success-primary: rgb(22, 163, 74);
            --dsw-alias-state-warn-label: rgb(217, 119, 6);
            --dsw-alias-state-error-primary: rgb(220, 38, 38);
            --dsw-alias-interactive-bg-hover: rgba(0, 0, 0, 0.05);
            background: var(--dsw-alias-bg-base);
            color: var(--dsw-alias-label-primary);
          }
          body[data-ds-dark-theme] {
            --dsw-alias-bg-base: rgb(21, 21, 23);
            --dsw-alias-bg-layer-1: rgb(28, 29, 32);
            --dsw-alias-bg-layer-2: rgb(35, 36, 40);
            --dsw-alias-bg-module-platform: rgb(53, 54, 56);
            --dsw-alias-settings-card-fill: var(--dsw-alias-bg-layer-2);
            --dsw-alias-settings-card-stroke: rgb(62, 64, 70);
            --dsw-alias-border-l2: rgb(52, 54, 58);
            --dsw-alias-border-l4: rgb(72, 74, 80);
            --dsw-alias-label-primary: rgb(243, 244, 246);
            --dsw-alias-label-secondary: rgb(180, 184, 192);
            --dsw-alias-label-tertiary: rgb(140, 145, 155);
            --dsw-alias-state-business-primary: rgb(122, 170, 255);
            --dsw-alias-state-error-primary: rgb(248, 113, 113);
            --dsw-alias-interactive-bg-hover: rgba(255, 255, 255, 0.08);
          }
          .dsh-btn {
            display: inline-flex; align-items: center; justify-content: center;
            border-radius: var(--dsw-radius-md); font: inherit; cursor: pointer;
            height: 32px; padding: 0 14px; border: 0.5px solid transparent;
          }
          .dsh-btn[data-size="sm"] { height: 28px; padding: 0 10px; font-size: 12px; }
          .dsh-btn[data-variant="primary"] { background: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-label-primary-foreground); }
          .dsh-btn[data-variant="outline"] { background: transparent; border-color: var(--dsw-alias-border-l4); color: var(--dsw-alias-label-primary); }
          .dsh-btn[data-variant="ghost"] { background: transparent; color: var(--dsw-alias-label-secondary); }
          .dsh-btn:disabled { opacity: 0.5; cursor: default; }
          .dsh-input-wrap {
            display: inline-flex; align-items: center; height: 32px; padding: 0 8px;
            border: 0.5px solid var(--dsw-alias-border-l4);
            border-radius: var(--dsw-radius-md);
            background: var(--dsw-alias-bg-layer-1);
          }
          .dsh-input-wrap:focus-within { border-color: var(--dsw-alias-state-business-primary); }
          .dsh-input { width: 100%; border: 0; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; outline: none; }
          .dsh-tag {
            display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 999px;
            font-size: 11px; line-height: 16px; border: 0.5px solid var(--dsw-alias-border-l4);
          }
          .dsh-tag[data-tone="info"] { color: var(--dsw-alias-state-business-primary); }
          .dsh-tag[data-tone="warning"] { color: var(--dsw-alias-state-warn-label); }
          .dsh-tag[data-tone="danger"] { color: var(--dsw-alias-state-error-primary); }
        </style>
      </head>
      <body>
        <div id="icon-root"></div>
        <div id="section-root"></div>
        <div id="bundle-root"></div>
      </body>
    </html>
  `)

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
    const effects = []
    let snapshot = { status: 'ready', writable: true, value: {} }
    window.writes = []
    window.failNext = false
    window.soundDeleteError = ''
    window.opened = []
    window.fetchUrls = []
    window.polls = []
    window.soundPosts = []
    window.soundDeletes = 0
    window.sessionOpenMode = 'poll'
    window.sessionOpen404Count = 0

    let focused = false
    document.hasFocus = () => focused
    window.setDshFocus = value => {
      focused = value
      window.dispatchEvent(new Event(value ? 'focus' : 'blur'))
    }

    window.fetch = (url, options = {}) => {
      const href = String(url)
      window.fetchUrls.push(href)
      if (href.includes('api/reminder-dsh/sound')) {
        const method = options.method ?? 'GET'
        if (method === 'POST') {
          window.soundPosts.push(href)
          return Promise.resolve(new Response(JSON.stringify({ custom: true }), { status: 200 }))
        }
        if (method === 'DELETE') {
          window.soundDeletes += 1
          if (window.soundDeleteError) {
            const msg = window.soundDeleteError
            window.soundDeleteError = ''
            return Promise.resolve(new Response(JSON.stringify({ error: msg }), { status: 400 }))
          }
          return Promise.resolve(new Response(null, { status: 204 }))
        }
        return Promise.resolve(new Response(JSON.stringify({ custom: false }), { status: 200 }))
      }
      if (window.sessionOpenMode === '404') {
        window.sessionOpen404Count += 1
        return Promise.resolve(new Response('Not found', { status: 404 }))
      }
      return new Promise(resolve => {
        window.polls.push({ signal: options.signal, deliver: value => resolve(new Response(JSON.stringify(value), { status: 200 })) })
      })
    }

    const uiWorkspace = {
      openSession: sessionId => {
        window.opened.push(sessionId)
        if (sessionId === 'gone-session') throw new Error('sessions.retain: unknown session ' + sessionId)
      },
    }

    window.setSnapshot = next => {
      snapshot = next
      for (const listener of listeners) listener()
    }
    window.publish = value => {
      snapshot = {
        ...snapshot,
        value: {
          popup: { ...(snapshot.value?.popup ?? {}), ...(value.popup ?? {}) },
          taskbar: { ...(snapshot.value?.taskbar ?? {}), ...(value.taskbar ?? {}) },
        },
      }
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

    const Switch = ({ checked, onChange, label, disabled = false, title, className }) =>
      React.createElement('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked ? 'true' : 'false',
        'aria-label': label,
        title,
        disabled,
        className: ['dsh-switch', className].filter(Boolean).join(' '),
        onClick: () => onChange(!checked),
      }, React.createElement('span', { className: 'dsh-thumb' }))

    const Button = React.forwardRef(({ variant = 'ghost', size = 'md', icon, className, children, ...rest }, ref) =>
      React.createElement('button', {
        ref,
        type: 'button',
        'data-variant': variant,
        'data-size': size,
        className: ['dsh-btn', className].filter(Boolean).join(' '),
        ...rest,
      }, icon, children))

    const Input = React.forwardRef(({ icon, className, ...inputProps }, ref) =>
      React.createElement('span', { className: ['dsh-input-wrap', className].filter(Boolean).join(' ') },
        icon,
        React.createElement('input', { ref, className: 'dsh-input', ...inputProps })))

    const Tag = ({ tone = 'outline', className, children }) =>
      React.createElement('span', { className: ['dsh-tag', className].filter(Boolean).join(' '), 'data-tone': tone }, children)

    const plugin = window.pluginEntry.factory(name => {
      if (name === 'react') return React
      if (name === '@deepseek-ai/dsh-client-ui-primitives') return { Switch, Button, Input, Tag }
      throw new Error('Unexpected module ' + name)
    })

    const registered = {}
    let dictionaries
    const t = key => dictionaries.zh[key] ?? key
    const ctx = {
      effect: fn => {
        const clean = fn()
        if (typeof clean === 'function') effects.push(clean)
      },
      locale: { register: (_ns, dict) => { dictionaries = dict }, bind: () => t },
      configForms: { get: () => form },
      inject: (deps, fn) => {
        if (deps.includes('uiWorkspace')) {
          const clean = fn({ get: () => uiWorkspace })
          if (typeof clean === 'function') effects.push(clean)
        }
      },
      slots: {
        register: (meta, component) => ({ meta, component }),
        inject: (name, factory) => { registered[name] = factory() },
      },
    }
    plugin.apply(ctx)

    window.cleanupPlugin = () => { while (effects.length) effects.pop()() }
    window.mountFourZeroFourPoller = () => plugin.apply({
      effect: () => {},
      locale: { register: () => {}, bind: () => t },
      configForms: { get: () => form },
      inject: (deps, fn) => {
        if (deps.includes('uiWorkspace')) {
          const clean = fn({ get: () => uiWorkspace })
          if (typeof clean === 'function') effects.push(clean)
        }
      },
      slots: { register: (m, c) => ({ m, c }), inject: () => {} },
    })

    const usePreferences = selector => React.useSyncExternalStore(form.subscribe, () => selector(form.getSnapshot()))

    const icon = registered['settings.section.icon']
    window.ReactDOM.createRoot(document.getElementById('icon-root')).render(React.createElement(icon.component))

    const section = registered['settings.section']
    const SectionView = section.component
    window.ReactDOM.createRoot(document.getElementById('section-root')).render(
      React.createElement(SectionView, { ...section.meta.inject(), usePreferences, t }),
    )

    const bundle = registered['plugins.bundle.config']
    const BundleView = bundle.component
    window.ReactDOM.createRoot(document.getElementById('bundle-root')).render(
      React.createElement(BundleView, { ...bundle.meta.inject(), usePreferences, view: 'page', t }),
    )
  })

  // 1. Style injection, bell icon, both slot views, module order, defaults when undefined
  assert.equal(await page.locator('style[data-plugin="@kesike/reminder-dsh"]').count(), 1)
  assert.equal(await page.locator('#icon-root svg').getAttribute('viewBox'), '0 0 16 16')
  assert.equal(await page.locator('#icon-root svg path').count(), 2)

  const sectionView = page.locator('#section-root [data-reminder-dsh-settings]')
  const bundleView = page.locator('#bundle-root [data-reminder-dsh-settings]')
  await sectionView.waitFor()
  await bundleView.waitFor()
  assert.equal(await sectionView.getAttribute('data-view'), 'section')
  assert.equal(await bundleView.getAttribute('data-view'), 'page')
  assert.equal(await sectionView.locator('.reminder-page-head').count(), 1)
  assert.equal(await bundleView.locator('.reminder-page-head').count(), 0)

  const moduleOrder = await sectionView.locator('section[data-reminder-module]').evaluateAll(
    nodes => nodes.map(n => n.getAttribute('data-reminder-module')),
  )
  assert.deepEqual(moduleOrder, ['popup', 'taskbar'])

  // 2. DSH CSS token resolution in Light & Dark modes & clean CSS rules
  const injectedCss = await page.locator('style[data-plugin="@kesike/reminder-dsh"]').textContent()
  assert.equal(injectedCss.includes('corner-shape: round'), false)
  assert.equal(injectedCss.includes('.reminder-input:disabled'), false)

  const lightThemeStyles = await sectionView.evaluate(root => {
    const card = root.querySelector('section[data-reminder-module="popup"]')
    const subpanel = root.querySelector('[data-reminder-sound]')
    const intervalInput = root.querySelector('input[inputmode="numeric"]')
    const disclosureLeft = root.querySelector('.reminder-disclosure-left')
    const cardStyle = getComputedStyle(card)
    const subStyle = getComputedStyle(subpanel)
    return {
      cardBg: cardStyle.backgroundColor,
      cardRadius: cardStyle.borderTopLeftRadius,
      subBg: subStyle.backgroundColor,
      subRadius: subStyle.borderTopLeftRadius,
      intervalType: intervalInput?.getAttribute('type'),
      disclosureWrap: getComputedStyle(disclosureLeft).flexWrap,
    }
  })
  assert.deepEqual(lightThemeStyles, {
    cardBg: 'rgb(249, 250, 251)',
    cardRadius: '20px',
    subBg: 'rgb(245, 246, 247)',
    subRadius: '12px',
    intervalType: 'text',
    disclosureWrap: 'wrap',
  })

  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
  const darkCardBg = await sectionView.locator('section[data-reminder-module="popup"]').evaluate(
    el => getComputedStyle(el).backgroundColor,
  )
  assert.equal(darkCardBg, 'rgb(35, 36, 40)')
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))

  // Unmount bundleView before user interaction tests so getByLabel/getByRole stay unambiguous
  await page.evaluate(() => { document.getElementById('bundle-root').innerHTML = '' })

  const toggle = sectionView.getByRole('switch', { name: 'Windows 系统通知' })
  const summary = sectionView.getByRole('switch', { name: '在通知中显示任务总结' })
  const sound = sectionView.getByRole('switch', { name: '弹窗提示音' })
  const taskbar = sectionView.getByRole('switch', { name: 'Windows 任务栏完成角标' })
  const interval = sectionView.getByLabel('通知发送间隔（秒）')
  const windowTitleInput = sectionView.getByLabel('目标窗口标题包含（可选）')
  const saveBtn = sectionView.getByRole('button', { name: '保存', exact: true })
  const cancelBtn = sectionView.getByRole('button', { name: '取消', exact: true })
  const footerStatus = sectionView.locator('[data-reminder-actions] .reminder-status')
  const writes = () => page.evaluate(() => window.writes)

  // Default undefined -> popupEnabled true, showSummary true, soundEnabled true, durationSeconds '10', taskbar false
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  assert.equal(await summary.getAttribute('aria-checked'), 'true')
  assert.equal(await sound.getAttribute('aria-checked'), 'true')
  assert.equal(await taskbar.getAttribute('aria-checked'), 'false')
  assert.equal(await interval.inputValue(), '10')
  assert.equal(await windowTitleInput.inputValue(), '')
  assert.equal(await saveBtn.isDisabled(), true)
  assert.equal(await cancelBtn.isDisabled(), true)

  // 3. Loading / Unavailable / Read-only states
  await page.evaluate(() => window.setSnapshot({ status: 'loading', writable: false, value: undefined }))
  await sectionView.getByText('正在加载插件配置…').waitFor()
  assert.equal(await toggle.isDisabled(), true)
  assert.equal(await interval.isDisabled(), true)

  await page.evaluate(() => window.setSnapshot({ status: 'unavailable', writable: false, value: undefined }))
  await sectionView.getByText('当前配置暂不可用，请确认插件已加载且正在运行。').waitFor()
  assert.equal(await saveBtn.isDisabled(), true)

  await page.evaluate(() => window.setSnapshot({
    status: 'ready',
    writable: false,
    value: { popup: { enabled: true, durationSeconds: 20, title: '', message: '' }, taskbar: { enabled: true, windowTitle: '锁定窗口' } },
  }))
  await sectionView.getByText('只读', { exact: true }).waitFor()
  await sectionView.getByText('当前配置为只读状态（可能存在锁定或只读配置覆盖），仅可查看无法保存修改。').waitFor()
  assert.equal(await interval.inputValue(), '20')
  assert.equal(await interval.isDisabled(), true)
  assert.equal(await toggle.isDisabled(), true)
  assert.equal(await saveBtn.isDisabled(), true)
  assert.equal(await footerStatus.textContent(), '')
  assert.deepEqual(await interval.evaluate(el => ({
    wrapCursor: getComputedStyle(el.closest('.reminder-input')).cursor,
    wrapOpacity: getComputedStyle(el.closest('.reminder-input')).opacity,
    inputCursor: getComputedStyle(el).cursor,
  })), { wrapCursor: 'not-allowed', wrapOpacity: '0.65', inputCursor: 'not-allowed' })

  await page.evaluate(() => window.setSnapshot({
    status: 'ready',
    writable: true,
    value: { popup: { durationSeconds: 10, showSummary: true, soundEnabled: true }, taskbar: { enabled: false, windowTitle: '' } },
  }))
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  assert.equal(await toggle.isDisabled(), false)

  // 4. False-dirty & snap-back for windowTitle leading/trailing whitespace
  await windowTitleInput.fill('   ')
  assert.equal(await saveBtn.isDisabled(), true)
  assert.equal(await cancelBtn.isDisabled(), false)
  await cancelBtn.click()
  assert.equal(await windowTitleInput.inputValue(), '')
  assert.equal(await cancelBtn.isDisabled(), true)

  await windowTitleInput.fill('  测试会话 — DeepSeek Harness  ')
  assert.equal(await saveBtn.isDisabled(), false)
  await saveBtn.click()
  await footerStatus.filter({ hasText: '已保存，立即生效。' }).waitFor()
  assert.equal(await windowTitleInput.inputValue(), '测试会话 — DeepSeek Harness')
  assert.deepEqual(await writes(), [[{ op: 'set', path: ['taskbar', 'windowTitle'], value: '测试会话 — DeepSeek Harness' }]])
  assert.equal(await saveBtn.isDisabled(), true)
  assert.equal(await cancelBtn.isDisabled(), true)

  // Whitespace-only difference vs saved trimmed value does not enable Save
  await windowTitleInput.fill(' 测试会话 — DeepSeek Harness ')
  assert.equal(await saveBtn.isDisabled(), true)
  await cancelBtn.click()
  assert.equal(await windowTitleInput.inputValue(), '测试会话 — DeepSeek Harness')

  // 5. Collapsible Advanced Settings + validation (aria-invalid + error styling + danger Tag)
  const advToggle = sectionView.locator('[data-reminder-advanced] .reminder-disclosure')
  assert.equal(await advToggle.getAttribute('aria-expanded'), 'false')
  assert.equal(await sectionView.getByLabel('默认通知标题').count(), 0)
  await advToggle.click()
  assert.equal(await advToggle.getAttribute('aria-expanded'), 'true')

  const defaultTitle = sectionView.getByLabel('默认通知标题')
  const defaultMessage = sectionView.getByLabel('默认通知正文')
  const summaryMaxChars = sectionView.getByLabel('总结最大字数')
  const summaryTimeout = sectionView.getByLabel('AI 总结超时（秒）')
  assert.equal(await defaultTitle.inputValue(), 'DSH 任务完成')
  assert.equal(await defaultMessage.inputValue(), '主会话已完成本轮任务。')
  assert.equal(await summaryMaxChars.inputValue(), '60')
  assert.equal(await summaryTimeout.inputValue(), '15')

  await interval.fill('0')
  assert.equal(await interval.getAttribute('aria-invalid'), 'true')
  const invalidBorder = await interval.evaluate(el => getComputedStyle(el.closest('.reminder-input')).borderTopColor)
  assert.equal(invalidBorder, 'rgb(220, 38, 38)')
  await defaultTitle.fill('   ')
  await summaryMaxChars.fill('19')
  await summaryTimeout.fill('61')
  assert.equal(await saveBtn.isDisabled(), true)
  await footerStatus.filter({ hasText: '请先修正标红的无效输入后再保存。' }).waitFor()

  // Collapse advanced settings while 3 advanced inputs are invalid -> badge indicates errors
  await advToggle.click()
  await sectionView.locator('[data-reminder-advanced] .dsh-tag[data-tone="danger"]').filter({ hasText: '3 项有误' }).waitFor()
  await cancelBtn.click()
  assert.equal(await interval.inputValue(), '10')
  assert.equal(await interval.getAttribute('aria-invalid'), null)
  assert.equal(await sectionView.locator('[data-reminder-advanced] .dsh-tag[data-tone="danger"]').count(), 0)

  // 6. Unified atomic Save across popup + advanced + taskbar
  await advToggle.click()
  await toggle.click()
  await interval.fill('25')
  await summary.click()
  await defaultTitle.fill('自定义标题')
  await defaultMessage.fill('自定义正文')
  await summaryMaxChars.fill('45')
  await summaryTimeout.fill('20')
  await taskbar.click()
  assert.equal(await writes().then(w => w.length), 1)
  await footerStatus.filter({ hasText: '更改尚未保存，保存后立即生效。' }).waitFor()
  await saveBtn.click()
  await footerStatus.filter({ hasText: '已保存，立即生效。' }).waitFor()
  assert.deepEqual(await writes().then(w => w.at(-1)), [
    { op: 'set', path: ['popup', 'enabled'], value: false },
    { op: 'set', path: ['popup', 'durationSeconds'], value: 25 },
    { op: 'set', path: ['popup', 'showSummary'], value: false },
    { op: 'set', path: ['popup', 'title'], value: '自定义标题' },
    { op: 'set', path: ['popup', 'message'], value: '自定义正文' },
    { op: 'set', path: ['popup', 'summaryMaxChars'], value: 45 },
    { op: 'set', path: ['popup', 'summaryTimeoutSeconds'], value: 20 },
    { op: 'set', path: ['taskbar', 'enabled'], value: true },
  ])

  // 7. Refused write preserves drafts for retry or cancel
  await page.evaluate(() => { window.failNext = true })
  await summary.click()
  await saveBtn.click()
  await footerStatus.filter({ hasText: '设置未保存，请检查连接或配置覆盖后重试。' }).waitFor()
  assert.equal(await footerStatus.getAttribute('role'), 'alert')
  assert.equal(await summary.getAttribute('aria-checked'), 'true')
  assert.equal(await saveBtn.isDisabled(), false)
  await cancelBtn.click()
  assert.equal(await summary.getAttribute('aria-checked'), 'false')

  // 8. Sound upload (focusable Button triggers hidden file input) & DELETE JSON error surfacing
  const soundSection = sectionView.locator('[data-reminder-sound]')
  await soundSection.locator('.dsh-tag[data-tone="neutral"]').filter({ hasText: '默认叮声' }).waitFor()
  const uploadBtn = soundSection.getByRole('button', { name: '上传自定义音效' })
  assert.equal(await uploadBtn.evaluate(el => el.tagName), 'BUTTON')
  const clickTriggered = await soundSection.evaluate(() => {
    let clicked = false
    const input = document.querySelector('[data-reminder-sound] input[type="file"]')
    const orig = input.click
    input.click = () => { clicked = true }
    document.querySelector('[data-reminder-sound] button').click()
    input.click = orig
    return clicked
  })
  assert.equal(clickTriggered, true)

  await soundSection.locator('input[type="file"]').setInputFiles(fileURLToPath(new URL('../assets/ding.wav', import.meta.url)))
  await soundSection.locator('.dsh-tag[data-tone="info"]').filter({ hasText: '自定义音效' }).waitFor()
  await soundSection.getByText('自定义音效已保存，下一条弹窗生效。').waitFor()

  // Simulate DELETE returning server JSON error -> must show server error verbatim
  await page.evaluate(() => { window.soundDeleteError = '自定义音效删除失败：文件被占用。' })
  await soundSection.getByRole('button', { name: '恢复默认叮声' }).click()
  await soundSection.locator('[role="alert"]').filter({ hasText: '自定义音效删除失败：文件被占用。' }).waitFor()
  assert.equal(await soundSection.locator('.dsh-tag[data-tone="info"]').count(), 1)

  await soundSection.getByRole('button', { name: '恢复默认叮声' }).click()
  await soundSection.getByText('已恢复默认叮声。').waitFor()
  await soundSection.locator('.dsh-tag[data-tone="neutral"]').filter({ hasText: '默认叮声' }).waitFor()
  assert.equal(await page.evaluate(() => window.soundPosts.length), 1)
  assert.equal(await page.evaluate(() => window.soundDeletes), 2)

  // 9. External live update clears affected field draft (including invalid ones)
  await interval.fill('0')
  await page.evaluate(() => window.publish({ popup: { enabled: true, durationSeconds: 35, showSummary: true } }))
  await page.waitForFunction(() => document.querySelector('#section-root input[inputmode="numeric"]').value === '35')
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  assert.equal(await summary.getAttribute('aria-checked'), 'true')

  // 10. Session-open foreground follow, ack, error resilience, and 404 stop/backoff
  assert.deepEqual(await page.evaluate(() => window.fetchUrls.filter(url => url.includes('session-open'))), [])
  await page.evaluate(() => {
    window.setDshFocus(true)
    window.setDshFocus(false)
    if (!window.polls[0].signal.aborted) throw new Error('Background tab did not cancel its poll')
    window.polls[0].deliver({ id: 'stale-click', sessionId: 'other-session' })
    window.setDshFocus(true)
    window.polls[1].deliver({ id: 'gone-session-click', sessionId: 'gone-session' })
  })
  await page.waitForFunction(() => window.fetchUrls.filter(url => url.includes('session-open')).length === 3)
  await page.evaluate(() => window.polls[2].deliver({ id: 'current-click', sessionId: 'session-jump' }))
  await page.waitForFunction(() => window.fetchUrls.filter(url => url.includes('session-open')).length === 4)
  assert.deepEqual(await page.evaluate(() => window.opened), ['gone-session', 'session-jump'])
  assert.deepEqual(await page.evaluate(() => window.fetchUrls.filter(url => url.includes('session-open'))), [
    'http://test.local/dsh/api/reminder-dsh/session-open',
    'http://test.local/dsh/api/reminder-dsh/session-open',
    'http://test.local/dsh/api/reminder-dsh/session-open?ack=gone-session-click',
    'http://test.local/dsh/api/reminder-dsh/session-open?ack=current-click',
  ])

  // Cleanup active poller and verify style element removal + 404 backoff stops endless polling
  await page.evaluate(() => window.cleanupPlugin())
  assert.equal(await page.locator('style[data-plugin="@kesike/reminder-dsh"]').count(), 0)

  await page.evaluate(() => {
    window.sessionOpenMode = '404'
    window.sessionOpen404Count = 0
    window.setDshFocus(false)
    window.mountFourZeroFourPoller()
    window.setDshFocus(true)
  })
  await page.waitForTimeout(150)
  assert.equal(await page.evaluate(() => window.sessionOpen404Count), 1)
  // Refocus re-probes once; 2nd 404 permanently disables further focus probes.
  await page.evaluate(() => { window.setDshFocus(false); window.setDshFocus(true) })
  await page.waitForTimeout(150)
  assert.equal(await page.evaluate(() => window.sessionOpen404Count), 2)
  await page.evaluate(() => { window.setDshFocus(false); window.setDshFocus(true) })
  await page.waitForTimeout(150)
  assert.equal(await page.evaluate(() => window.sessionOpen404Count), 2)

  assert.deepEqual(errors, [])
  console.log('Settings browser checks passed: DSH primitives & tokens, light/dark themes, section & bundle slots, undefined defaults, loading/unavailable/readonly states, unified 10-field save/cancel, validation & aria-invalid, keyboard-accessible sound upload & DELETE error surfacing, live updates, session-open 404 stop/jump.')
} finally { await browser.close() }
