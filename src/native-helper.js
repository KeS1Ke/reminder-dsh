import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const require = createRequire(import.meta.url)

export const HELPER_BINARY_NAME = 'dsh-reminder-helper.exe'
export const HELPER_RELEASE_ASSET = 'dsh-reminder-helper-win32-x64.exe'
export const HELPER_SHA256_ASSET = `${HELPER_RELEASE_ASSET}.sha256`

let inflightDownload

export function getPackageVersion() {
  return packageJson.version
}

export function getHelperAssetUrls(version = getPackageVersion(), repo = 'KeS1Ke/reminder-dsh') {
  const base = `https://github.com/${repo}/releases/download/v${version}`
  return {
    binaryUrl: `${base}/${HELPER_RELEASE_ASSET}`,
    shaUrl: `${base}/${HELPER_SHA256_ASSET}`,
  }
}

export function parseSha256(text) {
  const match = String(text ?? '').trim().match(/^([a-fA-F0-9]{64})(?:\s|$)/)
  if (!match) {
    throw new Error('无效的 SHA-256 校验文件格式')
  }
  return match[1].toLowerCase()
}

export function verifySha256(data, expectedHex) {
  const expected = String(expectedHex ?? '').trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error('无效的预期 SHA-256 摘要')
  }
  const actual = createHash('sha256').update(data).digest('hex')
  if (actual !== expected) {
    throw new Error(`原生辅助程序 SHA-256 校验失败：期望 ${expected}，实际 ${actual}`)
  }
  return actual
}

export function getCachedHelperPath({ version = getPackageVersion(), env = process.env } = {}) {
  const cacheBase = env.LOCALAPPDATA
    ? join(env.LOCALAPPDATA, 'kesike-reminder-dsh')
    : join(homedir(), '.cache', 'kesike-reminder-dsh')
  return join(cacheBase, 'bin', version, HELPER_BINARY_NAME)
}

export function getLocalPackageHelperPath() {
  return join(repoRoot, 'bin', HELPER_BINARY_NAME)
}

export function resolveHelperBinary({
  env = process.env,
  platform = process.platform,
  arch = process.arch,
  exists = existsSync,
  version = getPackageVersion(),
  resolvePkg = id => require.resolve(id),
} = {}) {
  const override = env?.DSH_REMINDER_HELPER_PATH?.trim()
  if (override) {
    return override
  }
  if (platform !== 'win32' || arch !== 'x64') {
    return undefined
  }

  try {
    const optionalPkgJson = resolvePkg('@kesike/reminder-dsh-win32-x64/package.json')
    const candidate = join(dirname(optionalPkgJson), 'bin', HELPER_BINARY_NAME)
    if (exists(candidate)) return candidate
  } catch {}

  const candidates = [
    join(repoRoot, 'packages', 'helper-win32-x64', 'bin', HELPER_BINARY_NAME),
    getLocalPackageHelperPath(),
    getCachedHelperPath({ version, env }),
    join(repoRoot, 'native', 'target', 'release', HELPER_BINARY_NAME),
    join(repoRoot, 'native', 'target', 'debug', HELPER_BINARY_NAME),
  ]
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate
  }
  return undefined
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  timer.unref?.()
  try {
    const response = await fetchImpl(url, { redirect: 'follow', signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} (${url})`)
    }
    return response
  } finally {
    clearTimeout(timer)
  }
}

export async function downloadHelperBinary({
  targetPath = getLocalPackageHelperPath(),
  version = getPackageVersion(),
  repo = 'KeS1Ke/reminder-dsh',
  fetchImpl = fetch,
  timeoutMs = 30_000,
} = {}) {
  const { binaryUrl, shaUrl } = getHelperAssetUrls(version, repo)
  const shaRes = await fetchWithTimeout(fetchImpl, shaUrl, timeoutMs)
  const expectedSha = parseSha256(await shaRes.text())

  const binRes = await fetchWithTimeout(fetchImpl, binaryUrl, timeoutMs)
  const buffer = Buffer.from(await binRes.arrayBuffer())
  verifySha256(buffer, expectedSha)

  mkdirSync(dirname(targetPath), { recursive: true })
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`
  try {
    writeFileSync(tempPath, buffer)
    renameSync(tempPath, targetPath)
  } catch (error) {
    try { rmSync(tempPath, { force: true }) } catch {}
    throw error
  }
  return targetPath
}

export async function ensureHelperBinary(options = {}) {
  const resolved = resolveHelperBinary(options)
  if (resolved) return resolved

  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  if (platform !== 'win32' || arch !== 'x64') {
    throw new Error(`DSH Windows 原生提醒辅助程序仅支持 win32-x64（当前为 ${platform}-${arch}）。`)
  }

  inflightDownload ??= (async () => {
    const version = options.version ?? getPackageVersion()
    const env = options.env ?? process.env
    const preferred = options.targetPath ?? getLocalPackageHelperPath()
    try {
      return await downloadHelperBinary({ ...options, targetPath: preferred, version })
    } catch {
      const fallback = getCachedHelperPath({ version, env })
      if (fallback === preferred) throw new Error('下载 Windows 提醒辅助程序失败')
      return await downloadHelperBinary({ ...options, targetPath: fallback, version })
    }
  })().finally(() => {
    inflightDownload = undefined
  })

  return inflightDownload
}
