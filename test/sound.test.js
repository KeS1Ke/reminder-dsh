import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { Config, createPopupModule } from '../src/modules/popup/index.js'
import { customSoundPath, removeCustomSound, saveCustomSound, soundDurationSeconds } from '../src/modules/popup/sound.js'

function wavClip(seconds, sampleRate = 8000) {
  const samples = Math.floor(sampleRate * seconds)
  const data = Buffer.alloc(44 + samples * 2)
  data.write('RIFF', 0)
  data.writeUInt32LE(36 + samples * 2, 4)
  data.write('WAVE', 8)
  data.write('fmt ', 12)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(1, 22)
  data.writeUInt32LE(sampleRate, 24)
  data.writeUInt32LE(sampleRate * 2, 28)
  data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34)
  data.write('data', 36)
  data.writeUInt32LE(samples * 2, 40)
  return data
}

function mp3Clip(frames) {
  const frame = Buffer.alloc(417, 0)
  frame[0] = 0xff
  frame[1] = 0xfb
  frame[2] = 0x90
  return Buffer.concat(Array.from({ length: frames }, () => frame))
}

test('the built-in ding lasts about one second', () => {
  const ding = readFileSync(fileURLToPath(new URL('../assets/ding.wav', import.meta.url)))
  assert.ok(Math.abs(soundDurationSeconds('ding.wav', ding) - 1) < 0.05)
})

test('a wav header cannot claim more samples than the file contains', () => {
  const clip = wavClip(1)
  clip.writeUInt32LE(0x7fffffff, 40)
  assert.throws(() => soundDurationSeconds('bad.wav', clip), /无法读取 wav/)
})

test('wav and mp3 clips over five seconds are rejected, and other formats are rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reminder-sound-'))
  try {
    assert.ok(soundDurationSeconds('short.wav', wavClip(1)) < 5)
    assert.throws(() => saveCustomSound('long.wav', wavClip(6), dir), /5 秒/)
    assert.ok(soundDurationSeconds('short.mp3', mp3Clip(10)) < 5)
    assert.throws(() => saveCustomSound('long.mp3', mp3Clip(200), dir), /5 秒/)
    assert.throws(() => saveCustomSound('note.ogg', wavClip(1), dir), /wav 或 mp3/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a custom sound replaces the previous file in the plugin directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reminder-sound-'))
  try {
    saveCustomSound('a.wav', wavClip(1), dir)
    assert.match(customSoundPath(dir), /\.wav$/)
    saveCustomSound('a.mp3', mp3Clip(10), dir)
    assert.match(customSoundPath(dir), /\.mp3$/)
    assert.equal(existsSync(join(dir, 'notification-sound.wav')), false)
    removeCustomSound(dir)
    assert.equal(customSoundPath(dir), undefined)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the sound route stores a short clip and rejects a clip longer than five seconds', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'reminder-sound-'))
  const previous = process.env.LOCALAPPDATA
  process.env.LOCALAPPDATA = dir
  t.after(() => {
    if (previous === undefined) delete process.env.LOCALAPPDATA
    else process.env.LOCALAPPDATA = previous
    rmSync(dir, { recursive: true, force: true })
  })
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const routes = []
  ctx.provide('llm', {})
  ctx.provide('connection', { fetch: { register: route => { routes.push(route); return () => {} } } })
  const popup = createPopupModule(ctx, Config({ showSummary: false }), { notify() {}, dispose() {} })
  t.after(() => popup.dispose())
  await new Promise(resolve => setImmediate(resolve))
  const route = routes.find(item => item.path === '/api/reminder-dsh/sound')
  assert.deepEqual(route.methods, ['GET', 'POST', 'DELETE'])
  const saved = await route.fetch(new Request('http://localhost/api/reminder-dsh/sound?name=clip.wav', {
    method: 'POST', body: wavClip(1),
  }))
  assert.equal(saved.status, 200)
  assert.equal((await (await route.fetch(new Request('http://localhost/api/reminder-dsh/sound'))).json()).custom, true)
  assert.equal((await route.fetch(new Request('http://localhost/api/reminder-dsh/sound', { method: 'DELETE' }))).status, 204)
  assert.equal((await (await route.fetch(new Request('http://localhost/api/reminder-dsh/sound'))).json()).custom, false)
  const rejected = await route.fetch(new Request('http://localhost/api/reminder-dsh/sound?name=long.wav', {
    method: 'POST', body: wavClip(6),
  }))
  assert.equal(rejected.status, 400)
  assert.match((await rejected.json()).error, /5 秒/)
})

test('a sound that cannot be removed becomes an error response', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'reminder-sound-'))
  const previous = process.env.LOCALAPPDATA
  process.env.LOCALAPPDATA = dir
  t.after(() => {
    if (previous === undefined) delete process.env.LOCALAPPDATA
    else process.env.LOCALAPPDATA = previous
    rmSync(dir, { recursive: true, force: true })
  })
  mkdirSync(join(dir, 'KeS1Ke', 'reminder-dsh', 'notification-sound.wav'), { recursive: true })
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const routes = []
  ctx.provide('llm', {})
  ctx.provide('connection', { fetch: { register: route => { routes.push(route); return () => {} } } })
  const popup = createPopupModule(ctx, Config({ showSummary: false }), { notify() {}, dispose() {} })
  t.after(() => popup.dispose())
  await new Promise(resolve => setImmediate(resolve))
  const route = routes.find(item => item.path === '/api/reminder-dsh/sound')
  const response = await route.fetch(new Request('http://localhost/api/reminder-dsh/sound', { method: 'DELETE' }))
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /.+/)
})

test('unloading the plugin removes the sound and session routes', async () => {
  const ctx = new Context()
  const removed = []
  ctx.provide('llm', {})
  ctx.provide('connection', { fetch: { register: route => () => { removed.push(route.path) } } })
  const popup = createPopupModule(ctx, Config({ showSummary: false }), { notify() {}, dispose() {} })
  await new Promise(resolve => setImmediate(resolve))
  await ctx.fiber.dispose()
  popup.dispose()
  assert.deepEqual(removed.sort(), ['/api/reminder-dsh/session-open', '/api/reminder-dsh/sound'])
})
