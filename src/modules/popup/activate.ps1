$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -Path (Join-Path $PSScriptRoot 'ToastActivator.cs')
[DshReminder.ToastActivator]::Run([guid]'{BD86FD58-A2BF-430E-A8D9-8D20238ED61A}',
  (Join-Path $PSHOME 'powershell.exe'), (Join-Path $PSScriptRoot 'toast.ps1'))
