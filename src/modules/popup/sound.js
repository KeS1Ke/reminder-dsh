import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const maxSoundSeconds = 5
const maxSoundBytes = 2 * 1024 * 1024
const fileNames = ['notification-sound.wav', 'notification-sound.mp3']

/** Per-user plugin data. This is not a Windows system sound folder. */
export function soundDirectory() {
  return join(process.env.LOCALAPPDATA || homedir(), 'KeS1Ke', 'reminder-dsh')
}

export function customSoundPath(dir = soundDirectory()) {
  return fileNames.map(name => join(dir, name)).find(file => existsSync(file))
}

export function removeCustomSound(dir = soundDirectory()) {
  for (const name of fileNames) rmSync(join(dir, name), { force: true })
}

function extension(name) {
  const match = /\.([a-z0-9]+)$/i.exec(String(name ?? ''))
  return match ? match[1].toLowerCase() : ''
}

function wavSeconds(bytes) {
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('无法读取 wav 音效')
  }
  let offset = 12, byteRate = 0, dataSize = 0
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4)
    const size = bytes.readUInt32LE(offset + 4)
    const start = offset + 8
    if (id === 'fmt ' && size >= 16 && start + 16 <= bytes.length) byteRate = bytes.readUInt32LE(start + 8)
    else if (id === 'data') { dataSize = size; break }
    offset = start + size + (size % 2)
    if (offset < start) break
  }
  if (!byteRate || !dataSize) throw new Error('无法读取 wav 音效')
  return dataSize / byteRate
}

function id3End(bytes) {
  if (bytes.length < 10 || bytes.toString('ascii', 0, 3) !== 'ID3') return 0
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)
  return Math.min(bytes.length, 10 + size)
}

function mp3Seconds(bytes) {
  const bitrateTable = {
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
    0: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  }
  const sampleTable = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }
  let offset = id3End(bytes), frames = 0, seconds = 0
  while (offset + 4 <= bytes.length && frames < 20_000) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) { offset++; continue }
    const header = bytes.readUInt32BE(offset)
    const version = (header >> 19) & 3
    const layer = (header >> 17) & 3
    const bitrateIndex = (header >> 12) & 0xf
    const sampleIndex = (header >> 10) & 3
    const padding = (header >> 9) & 1
    const bitrate = bitrateTable[version]?.[bitrateIndex]
    const sampleRate = sampleTable[version]?.[sampleIndex]
    if (version === 1 || layer !== 1 || !bitrate || sampleRate === undefined) { offset++; continue }
    const samples = version === 3 ? 1152 : 576
    const frameLength = Math.floor((samples / 8) * bitrate * 1000 / sampleRate) + padding
    if (frameLength < 4 || offset + frameLength > bytes.length) { offset++; continue }
    seconds += samples / sampleRate
    frames++
    offset += frameLength
  }
  if (!frames) throw new Error('无法读取 mp3 音效')
  return seconds
}

/** Reject anything except a wav or mp3 that plays for at most five seconds. */
export function soundDurationSeconds(name, bytes) {
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  const ext = extension(name)
  if (ext === 'wav') return wavSeconds(body)
  if (ext === 'mp3') return mp3Seconds(body)
  throw new Error('仅支持 wav 或 mp3')
}

export function saveCustomSound(name, bytes, dir = soundDirectory()) {
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (body.length === 0 || body.length > maxSoundBytes) throw new Error('音效文件过大或为空')
  const seconds = soundDurationSeconds(name, body)
  if (!(seconds > 0) || seconds > maxSoundSeconds + 0.05) throw new Error('音效不能超过 5 秒')
  const ext = extension(name)
  mkdirSync(dir, { recursive: true })
  const target = join(dir, `notification-sound.${ext}`)
  const temporary = `${target}.tmp`
  writeFileSync(temporary, body)
  try { copyFileSync(temporary, target) }
  finally { rmSync(temporary, { force: true }) }
  for (const fileName of fileNames) {
    const file = join(dir, fileName)
    if (file !== target) rmSync(file, { force: true })
  }
  return target
}
