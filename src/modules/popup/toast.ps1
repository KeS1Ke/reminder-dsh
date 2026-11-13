param([switch]$ValidateOnly, [switch]$HostMode, [switch]$ReplyFailed, [switch]$ApprovalFailed)

$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$script:desktopChecked = $false
$script:desktopPath = $null
$script:registered = @{}

function Get-DesktopPath {
  if ($script:desktopChecked) { return $script:desktopPath }
  $script:desktopChecked = $true
  $protocol = [Microsoft.Win32.Registry]::ClassesRoot.OpenSubKey('dsh\shell\open\command')
  if ($null -ne $protocol) {
    try {
      if ($protocol.GetValue('') -match '^\s*"([^"]+\\DeepSeek Harness\.exe)"' -and [IO.File]::Exists($Matches[1])) {
        $script:desktopPath = $Matches[1]
      }
    } finally { $protocol.Dispose() }
  }
  return $script:desktopPath
}

function New-ToastDocument($payload) {
  $appId = [string]$payload.appId
  if (-not $appId) { $appId = 'KeS1Ke.DSH' }
  if ($appId -notmatch '^KeS1Ke\.DSH(\.[2-5])?$') { throw 'Unexpected notification identity.' }
  $icon = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../assets/deepseek-harness.png'))
  if (-not [IO.File]::Exists($icon)) { throw 'The DSH notification icon is missing.' }
  $desktop = Get-DesktopPath
  # Without a task summary the toast keeps a single text node and shows only the session title.
  $message = [string]$payload.message
  $xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
  $xml.LoadXml($(if ($message) {
    '<toast><visual><binding template="ToastGeneric"><text hint-maxLines="1"/><text hint-maxLines="3"/></binding></visual></toast>'
  } else {
    '<toast><visual><binding template="ToastGeneric"><text hint-maxLines="1"/></binding></visual></toast>'
  }))
  # A body click that must open a specific session is a background activation: our activator notifies the
  # backend (which navigates the GUI) and then opens DSH itself. Without a session route, keep the protocol.
  if ($payload.open) {
    $xml.DocumentElement.SetAttribute('activationType', 'background')
    $xml.DocumentElement.SetAttribute('launch', [string]$payload.open)
  } elseif ($desktop) {
    $xml.DocumentElement.SetAttribute('activationType', 'protocol')
    $xml.DocumentElement.SetAttribute('launch', 'dsh://open')
  }
  $invalidXml = '[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]'
  $xml.SelectSingleNode('//text[1]').InnerText = ([string]$payload.title) -replace $invalidXml, ''
  if ($message) { $xml.SelectSingleNode('//text[2]').InnerText = $message -replace $invalidXml, '' }
  if (-not $desktop) {
    $image = $xml.CreateElement('image')
    $image.SetAttribute('placement', 'appLogoOverride')
    $image.SetAttribute('src', ([uri]::new($icon)).AbsoluteUri)
    $null = $xml.SelectSingleNode('//binding').AppendChild($image)
  }
  if ($payload.reply -or $payload.approval) {
    $actions = $xml.CreateElement('actions')
    if ($payload.reply) {
      $replyInput = $xml.CreateElement('input')
      $replyInput.SetAttribute('id', 'reply')
      $replyInput.SetAttribute('type', 'text')
      $replyInput.SetAttribute('placeHolderContent', $payload.replyPlaceholder)
      $null = $actions.AppendChild($replyInput)
      $buttons = @(@{ label = $payload.replyLabel; argument = $payload.reply; inputId = 'reply' })
    } else { $buttons = @($payload.approval) }
    foreach ($button in $buttons) {
      $action = $xml.CreateElement('action')
      $action.SetAttribute('content', $button.label)
      $action.SetAttribute('arguments', $button.argument)
      $action.SetAttribute('activationType', 'background')
      if ($button.inputId) { $action.SetAttribute('hint-inputId', $button.inputId) }
      $null = $actions.AppendChild($action)
    }
    $null = $xml.DocumentElement.AppendChild($actions)
  }
  if ($payload.sound) {
    # The plugin plays its own clip. Silence the Windows toast sound so the two do not stack.
    $audio = $xml.CreateElement('audio')
    $audio.SetAttribute('silent', 'true')
    $null = $xml.DocumentElement.AppendChild($audio)
  }
  return $xml
}

function Register-ToastIdentity([string]$appId) {
  $desktop = Get-DesktopPath
  $marker = "$appId|$desktop"
  if ($script:registered.ContainsKey($marker)) { return }
  $displayName = 'DeepSeek Harness'
  $activator = '{BD86FD58-A2BF-430E-A8D9-8D20238ED61A}'
  $icon = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../assets/deepseek-harness.png'))
  $iconFile = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../assets/deepseek-harness.ico'))
  if (-not [IO.File]::Exists($iconFile)) { $iconFile = $null }
  $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("Software\Classes\AppUserModelId\$appId")
  try {
    $key.SetValue('DisplayName', $displayName)
    $key.SetValue('IconUri', $icon)
    $key.SetValue('CustomActivator', $activator)
    if ($desktop) {
      # Windows resolves the compact header from the app's Start-menu identity.
      # The executable icon is only 32px and looks soft in the toast header. Use the multi-size icon.
      $programs = [Environment]::GetFolderPath('Programs')
      $directory = Join-Path $programs 'DeepSeek Harness Notifications'
      $suffix = if ($appId -eq 'KeS1Ke.DSH') { '' } else { ' ' + ($appId -replace '^KeS1Ke\.DSH\.', '') }
      $link = Join-Path $directory "DeepSeek Harness$suffix.lnk"
      $expectedIcon = if ($iconFile) { "$iconFile,0" } else { "$desktop,0" }
      $currentIcon = $null
      if ([IO.File]::Exists($link)) {
        $existing = New-Object -ComObject WScript.Shell
        $currentIcon = $existing.CreateShortcut($link).IconLocation
      }
      $sameIcon = $currentIcon -and [string]::Equals($currentIcon, $expectedIcon, [StringComparison]::OrdinalIgnoreCase)
      if (-not [IO.File]::Exists($link) -or $key.GetValue('DesktopShortcutTarget') -ne $desktop -or -not $sameIcon) {
        $null = [IO.Directory]::CreateDirectory($directory)
        if (-not ('DshToastIdentity' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'ToastIdentity.cs') }
        $staged = Join-Path $directory ('.register-' + [guid]::NewGuid() + '.lnk')
        try {
          $shell = New-Object -ComObject WScript.Shell
          $shortcut = $shell.CreateShortcut($staged)
          $shortcut.TargetPath = $desktop
          $shortcut.IconLocation = $expectedIcon
          $shortcut.Save()
          [DshToastIdentity]::RegisterShortcut($staged, $link, $appId, [guid]$activator)
          $key.SetValue('DesktopShortcutTarget', $desktop)
        } finally { [IO.File]::Delete($staged) }
      }
    }
  } finally { $key.Dispose() }
  $script:registered[$marker] = $true
}

function Play-DshSound([string]$path, [bool]$async) {
  try {
    if ($path -match '[\r\n"]' -or -not [IO.File]::Exists($path)) { return }
    if (-not ('DshSound' -as [type])) {
      Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class DshSound {
  [DllImport("winmm.dll", CharSet = CharSet.Unicode, EntryPoint = "mciSendStringW")]
  public static extern int Send(string command, StringBuilder buffer, int bufferSize, IntPtr callback);
  // MCI device aliases belong to the thread that opened them, so play and close stay together.
  public static void Play(string openCommand, string alias) {
    if (Send(openCommand, null, 0, System.IntPtr.Zero) != 0) return;
    try { Send("play " + alias + " wait", null, 0, System.IntPtr.Zero); }
    finally { Send("close " + alias, null, 0, System.IntPtr.Zero); }
  }
  public static void PlayLater(string openCommand, string alias) {
    System.Threading.ThreadPool.QueueUserWorkItem(delegate { Play(openCommand, alias); });
  }
}
'@
    }
    $alias = 'dsh' + [guid]::NewGuid().ToString('N')
    $type = if ($path -like '*.mp3') { 'mpegvideo' } else { 'waveaudio' }
    $open = 'open "' + $path + '" type ' + $type + ' alias ' + $alias
    if ($async) { [DshSound]::PlayLater($open, $alias); return }
    [DshSound]::Play($open, $alias)
  } catch {}
}

function Show-ToastPayload($payload, [bool]$asyncSound) {
  $appId = [string]$payload.appId
  if (-not $appId) { $appId = 'KeS1Ke.DSH' }
  $xml = New-ToastDocument $payload
  $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
  Register-ToastIdentity $appId
  $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)
  $notifier.Show($toast)
  if ($payload.sound) { Play-DshSound ([string]$payload.sound) $asyncSound }
}

$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType=WindowsRuntime]
$null = [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType=WindowsRuntime]
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]

if ($HostMode) {
  Add-Type -Path (Join-Path $PSScriptRoot 'ToastActivator.cs')
  $powershell = Join-Path $PSHOME 'powershell.exe'
  [DshReminder.ToastActivator]::Serve([guid]'{BD86FD58-A2BF-430E-A8D9-8D20238ED61A}', $powershell, $PSCommandPath)
  try {
    [Console]::Out.WriteLine('ready')
    [Console]::Out.Flush()
    while (($line = [Console]::ReadLine()) -ne $null) {
      if ($line -eq 'reply-keys') { [DshReminder.ReplyKeys]::Arm(); continue }
      if ($line -eq 'reply-keys-off') { [DshReminder.ReplyKeys]::Disarm(); continue }
      if (-not $line) { continue }
      try {
        Show-ToastPayload ($line | ConvertFrom-Json) $true
        [Console]::Out.WriteLine('ok')
      } catch {
        [Console]::Out.WriteLine('error ' + $_.Exception.Message)
      }
      [Console]::Out.Flush()
    }
  } finally { [DshReminder.ToastActivator]::Shutdown() }
  return
}

$payload = if ($ApprovalFailed) {
  ConvertFrom-Json '{"title":"DeepSeek Harness \u5ba1\u6279\u672a\u63d0\u4ea4","message":"\u8bf7\u56de\u5230 DeepSeek Harness \u67e5\u770b\u5f85\u5904\u7406\u8bf7\u6c42\u3002"}'
} elseif ($ReplyFailed) {
  ConvertFrom-Json '{"title":"DSH \u56de\u590d\u672a\u786e\u8ba4","message":"\u8bf7\u56de\u5230\u539f DSH \u4f1a\u8bdd\u68c0\u67e5\u6d88\u606f\uff0c\u6216\u5728\u90a3\u91cc\u53d1\u9001\u3002"}'
} else { [Console]::ReadLine() | ConvertFrom-Json }
if ($ValidateOnly) { (New-ToastDocument $payload).GetXml(); return }
Show-ToastPayload $payload $false
