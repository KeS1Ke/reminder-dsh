import { downloadHelperBinary, getLocalPackageHelperPath, resolveHelperBinary } from '../src/native-helper.js'

async function main() {
  if (process.env.DSH_REMINDER_SKIP_POSTINSTALL === '1') return
  if (process.platform !== 'win32' || process.arch !== 'x64') return
  if (resolveHelperBinary()) return

  try {
    await downloadHelperBinary({ targetPath: getLocalPackageHelperPath() })
  } catch (error) {
    console.warn(
      `[reminder-dsh] 未能自动下载 Windows 原生辅助程序，首次发送提醒时将重试或请设置 DSH_REMINDER_HELPER_PATH：${error?.message ?? error}`,
    )
  }
}

await main()
