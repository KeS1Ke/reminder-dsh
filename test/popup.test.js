import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { Config, createPopupModule } from '../src/modules/popup/index.js'

test('completion notifications use the session title and fall back to the configured title', async t => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const shown = []
  const popup = createPopupModule(ctx, Config({ showSummary: false, durationSeconds: 1 }), {
    notify: async options => { shown.push(options) },
    dispose() {},
  })
  t.after(() => popup.dispose())
  await popup.notify({ sessionId: 'titled', sessionTitle: '修复登录流程' })
  await popup.notify({ sessionId: 'untitled' })
  assert.deepEqual(shown.map(item => item.title), ['修复登录流程', Config({}).title])
  assert.deepEqual(shown.map(item => item.message), ['', ''])
  assert.match(shown[0].sound, /ding\.wav$|notification-sound\.(wav|mp3)$/)
})

test('turning notification sound off leaves the Windows sound unchanged', async t => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const shown = []
  const popup = createPopupModule(ctx, Config({ showSummary: false, soundEnabled: false }), {
    notify: async options => { shown.push(options) },
    dispose() {},
  })
  t.after(() => popup.dispose())
  await popup.notify({ sessionId: 'quiet' })
  assert.equal(shown[0].sound, undefined)
})
