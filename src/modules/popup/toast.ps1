param([switch]$ValidateOnly, [switch]$ReplyFailed)

$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$payload = if ($ReplyFailed) {
  ConvertFrom-Json '{"title":"DSH \u56de\u590d\u672a\u786e\u8ba4","message":"\u8bf7\u56de\u5230\u539f DSH \u4f1a\u8bdd\u68c0\u67e5\u6d88\u606f\uff0c\u6216\u5728\u90a3\u91cc\u53d1\u9001\u3002"}'
} else { [Console]::ReadLine() | ConvertFrom-Json }
$icon = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../assets/deepseek-harness.png'))
if (-not [IO.File]::Exists($icon)) { throw 'The DSH notification icon is missing.' }

$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType=WindowsRuntime]
$null = [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType=WindowsRuntime]
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]

# Let the DOM escape text and remove characters that Windows cannot store in XML.
$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text hint-maxLines="1"/><text hint-maxLines="4"/></binding></visual></toast>')
$invalidXml = '[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]'
$xml.SelectSingleNode('//text[1]').InnerText = ([string]$payload.title) -replace $invalidXml, ''
$xml.SelectSingleNode('//text[2]').InnerText = ([string]$payload.message) -replace $invalidXml, ''
if ($payload.reply) {
  $actions = $xml.CreateElement('actions')
  $replyInput = $xml.CreateElement('input')
  $replyInput.SetAttribute('id', 'reply')
  $replyInput.SetAttribute('type', 'text')
  $replyInput.SetAttribute('placeHolderContent', $payload.replyPlaceholder)
  $action = $xml.CreateElement('action')
  $action.SetAttribute('content', $payload.replyLabel)
  $action.SetAttribute('arguments', $payload.reply)
  $action.SetAttribute('activationType', 'background')
  $action.SetAttribute('hint-inputId', 'reply')
  $null = $actions.AppendChild($replyInput)
  $null = $actions.AppendChild($action)
  $null = $xml.DocumentElement.AppendChild($actions)
}
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
if ($ValidateOnly) { $xml.GetXml(); return }

# Register a dedicated per-user sender so CLI and desktop installs use the same identity.
$appId = 'KeS1Ke.DSH'
$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("Software\Classes\AppUserModelId\$appId")
try {
  $key.SetValue('DisplayName', 'DSH')
  $key.SetValue('IconUri', $icon)
  if ($payload.reply) { $key.SetValue('CustomActivator', '{BD86FD58-A2BF-430E-A8D9-8D20238ED61A}') }
} finally { $key.Dispose() }

$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)
$notifier.Show($toast)
