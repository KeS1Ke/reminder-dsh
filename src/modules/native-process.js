import { spawn } from 'node:child_process'
import { HELPER_BINARY_NAME, ensureHelperBinary, resolveHelperBinary } from '../native-helper.js'

/** Resolve an existing helper path synchronously, use an injected launcher stub in tests, or download on demand. */
export function resolveLaunchTarget(launch, helper) {
  const resolved = (helper?.resolve ?? resolveHelperBinary)()
  if (resolved) return { exe: resolved }
  if (!helper?.ensure && launch !== spawn) return { exe: HELPER_BINARY_NAME }
  return { promise: (helper?.ensure ?? ensureHelperBinary)() }
}

export function normalizeHelperSpawnError(error, role, exe) {
  if (error?.code !== 'ENOENT') return error
  return new Error(`找不到 Windows ${role} (${exe})，请重新安装插件或设置 DSH_REMINDER_HELPER_PATH。`)
}

export function captureStderr(stream, limit = 2048) {
  let stderr = ''
  stream?.setEncoding?.('utf8')
  stream?.on?.('data', chunk => { stderr = (stderr + chunk).slice(-limit) })
  return () => stderr.trim()
}

export function writeJsonLine(child, message) {
  const stdin = child?.stdin
  if (!stdin?.writable) return false
  try {
    stdin.write(JSON.stringify(message) + '\n', 'utf8')
    return true
  } catch {
    return false
  }
}
