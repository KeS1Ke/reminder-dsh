param([switch]$ValidateOnly, [switch]$ReplyFailed, [switch]$ApprovalFailed)

$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$payload = if ($ApprovalFailed) {
  ConvertFrom-Json '{"title":"DeepSeek Harness \u5ba1\u6279\u672a\u63d0\u4ea4","message":"\u8bf7\u56de\u5230 DeepSeek Harness \u67e5\u770b\u5f85\u5904\u7406\u8bf7\u6c42\u3002"}'
} elseif ($ReplyFailed) {
  ConvertFrom-Json '{"title":"DSH \u56de\u590d\u672a\u786e\u8ba4","message":"\u8bf7\u56de\u5230\u539f DSH \u4f1a\u8bdd\u68c0\u67e5\u6d88\u606f\uff0c\u6216\u5728\u90a3\u91cc\u53d1\u9001\u3002"}'
} else { [Console]::ReadLine() | ConvertFrom-Json }
# Windows shows one banner per identity. Slots .2-.5 keep an older banner and stack the next one above it.
$appId = [string]$payload.appId
if (-not $appId) { $appId = 'KeS1Ke.DSH' }
if ($appId -notmatch '^KeS1Ke\.DSH(\.[2-5])?$') { throw 'Unexpected notification identity.' }
$icon = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../assets/deepseek-harness.png'))
if (-not [IO.File]::Exists($icon)) { throw 'The DSH notification icon is missing.' }
$desktop = $null
$protocol = [Microsoft.Win32.Registry]::ClassesRoot.OpenSubKey('dsh\shell\open\command')
if ($null -ne $protocol) {
  try {
    if ($protocol.GetValue('') -match '^\s*"([^"]+\\DeepSeek Harness\.exe)"' -and [IO.File]::Exists($Matches[1])) {
      $desktop = $Matches[1]
    }
  } finally { $protocol.Dispose() }
}

$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType=WindowsRuntime]
$null = [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType=WindowsRuntime]
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]

# Let the DOM escape text and remove characters that Windows cannot store in XML.
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
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
if ($ValidateOnly) { $xml.GetXml(); return }

# Register a dedicated per-user sender so CLI and desktop installs use the same identity.
$displayName = 'DeepSeek Harness'
$activator = '{BD86FD58-A2BF-430E-A8D9-8D20238ED61A}'
$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("Software\Classes\AppUserModelId\$appId")
try {
  $key.SetValue('DisplayName', $displayName)
  $key.SetValue('IconUri', $icon)
  $key.SetValue('CustomActivator', $activator)
  if ($desktop) {
    # Windows resolves the compact header from the app's Start-menu identity.
    $programs = [Environment]::GetFolderPath('Programs')
    $directory = Join-Path $programs 'DeepSeek Harness Notifications'
    $suffix = if ($appId -eq 'KeS1Ke.DSH') { '' } else { ' ' + ($appId -replace '^KeS1Ke\.DSH\.', '') }
    $link = Join-Path $directory "DeepSeek Harness$suffix.lnk"
    if (-not [IO.File]::Exists($link) -or $key.GetValue('DesktopShortcutTarget') -ne $desktop) {
      $null = [IO.Directory]::CreateDirectory($directory)
      Add-Type -Path (Join-Path $PSScriptRoot 'ToastIdentity.cs')
      $staged = Join-Path $directory ('.register-' + [guid]::NewGuid() + '.lnk')
      try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($staged)
        $shortcut.TargetPath = $desktop
        $shortcut.IconLocation = "$desktop,0"
        $shortcut.Save()
        [DshToastIdentity]::RegisterShortcut($staged, $link, $appId, [guid]$activator)
        $key.SetValue('DesktopShortcutTarget', $desktop)
      } finally { [IO.File]::Delete($staged) }
    }
  }
} finally { $key.Dispose() }

function Play-DshSound([string]$path) {
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
}
'@
    }
    $alias = 'dsh' + [guid]::NewGuid().ToString('N')
    $type = if ($path -like '*.mp3') { 'mpegvideo' } else { 'waveaudio' }
    $opened = [DshSound]::Send('open "' + $path + '" type ' + $type + ' alias ' + $alias, $null, 0, [IntPtr]::Zero)
    if ($opened -ne 0) { return }
    try { [void][DshSound]::Send('play ' + $alias + ' wait', $null, 0, [IntPtr]::Zero) }
    finally { [void][DshSound]::Send('close ' + $alias, $null, 0, [IntPtr]::Zero) }
  } catch {}
}

$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)
$notifier.Show($toast)
if ($payload.sound) { Play-DshSound ([string]$payload.sound) }
