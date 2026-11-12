$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -Path (Join-Path $PSScriptRoot 'ToastActivator.cs')
# Manual COM server. The normal path is toast.ps1 -HostMode, which serves toasts and this activator together.
[DshReminder.ToastActivator]::Serve([guid]'{BD86FD58-A2BF-430E-A8D9-8D20238ED61A}',
  (Join-Path $PSHOME 'powershell.exe'), (Join-Path $PSScriptRoot 'toast.ps1'))
try {
  [Console]::Out.WriteLine('ready')
  [Console]::Out.Flush()
  while (($line = [Console]::ReadLine()) -ne $null) {
    if ($line -eq 'reply-keys') { [DshReminder.ReplyKeys]::Arm() }
    elseif ($line -eq 'reply-keys-off') { [DshReminder.ReplyKeys]::Disarm() }
  }
} finally { [DshReminder.ToastActivator]::Shutdown() }
