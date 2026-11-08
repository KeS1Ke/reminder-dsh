#requires -Version 7.0
#requires -PSEdition Core
param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
$timer = $null
$window = $null
$ackTimer = $null
$exitCode = 0
try {
    [Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $inputReader = [IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.UTF8Encoding]::new($false))
    $payload = $inputReader.ReadLine() | ConvertFrom-Json
    $seconds = [int]$payload.durationSeconds
    if ($seconds -lt 1 -or $seconds -gt 300) { throw 'Invalid popup duration' }
    Add-Type -AssemblyName PresentationFramework

    # User text is assigned to properties, never interpolated into XAML.
    [xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Width="440" SizeToContent="Height" MaxHeight="620"
        ResizeMode="NoResize" WindowStartupLocation="Manual"
        Background="White" Foreground="#171717" Topmost="True"
        FontFamily="Microsoft YaHei UI, Segoe UI" FontSize="14">
  <Grid Margin="24">
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
    </Grid.RowDefinitions>
    <Grid>
      <Grid.ColumnDefinitions>
        <ColumnDefinition Width="88"/>
        <ColumnDefinition Width="*"/>
      </Grid.ColumnDefinitions>
      <Image x:Name="Whale" Width="72" Height="72" VerticalAlignment="Top"/>
      <StackPanel Grid.Column="1">
        <TextBlock x:Name="Heading" FontWeight="SemiBold" FontSize="18" TextWrapping="Wrap" MaxHeight="80"/>
        <ScrollViewer MaxHeight="150" VerticalScrollBarVisibility="Auto" Margin="0,10,0,0">
          <TextBlock x:Name="Message" TextWrapping="Wrap"/>
        </ScrollViewer>
      </StackPanel>
    </Grid>
    <StackPanel Grid.Row="1" Margin="0,16,0,0">
      <TextBlock x:Name="SessionLabel" Foreground="#666666" FontSize="11" TextTrimming="CharacterEllipsis"/>
      <StackPanel x:Name="ReplyPanel" Margin="0,8,0,0">
        <Label Content="快速回复" Target="{Binding ElementName=Reply}" Padding="0,0,0,5"/>
        <TextBox x:Name="Reply" Height="76" MaxLength="8000" AcceptsReturn="True"
                 TextWrapping="Wrap" VerticalScrollBarVisibility="Auto" Padding="8"
                 AutomationProperties.Name="快速回复"/>
        <TextBlock Text="Ctrl+Enter 发送 · Enter 换行" Foreground="#666666" FontSize="11" Margin="0,5,0,0"/>
      </StackPanel>
      <TextBlock x:Name="Status" TextWrapping="Wrap" Foreground="#B42318" Margin="0,8,0,0"/>
    </StackPanel>
    <Grid Grid.Row="2" Margin="0,16,0,0">
      <Button x:Name="Dismiss" Content="关闭" Width="80" Height="32" HorizontalAlignment="Left" IsCancel="True"/>
      <Button x:Name="Send" Content="发送" Width="80" Height="32" HorizontalAlignment="Right" IsEnabled="False"/>
    </Grid>
  </Grid>
</Window>
'@
    $reader = [System.Xml.XmlNodeReader]::new($xaml)
    try { $window = [Windows.Markup.XamlReader]::Load($reader) }
    finally { $reader.Dispose() }

    $iconPath = Join-Path $PSScriptRoot '../../../assets/deepseek-harness.png'
    $bitmap = [Windows.Media.Imaging.BitmapImage]::new()
    $bitmap.BeginInit()
    $bitmap.CacheOption = [Windows.Media.Imaging.BitmapCacheOption]::OnLoad
    $bitmap.UriSource = [Uri]::new([IO.Path]::GetFullPath($iconPath))
    $bitmap.EndInit()
    $bitmap.Freeze()
    $window.Icon = $bitmap
    $window.FindName('Whale').Source = $bitmap
    $window.Title = [string]$payload.title
    $window.FindName('Heading').Text = [string]$payload.title
    $window.FindName('Message').Text = [string]$payload.message
    $window.FindName('SessionLabel').Text = '会话：' + [string]$payload.sessionId
    $window.FindName('SessionLabel').ToolTip = [string]$payload.sessionId
    $window.FindName('Dismiss').Add_Click({ $window.Close() })

    $replyBox = $window.FindName('Reply')
    $sendButton = $window.FindName('Send')
    $statusLabel = $window.FindName('Status')
    $state = @{ pending = $false; incoming = $null; started = $null; uncertain = $false
                edited = $false; shownAt = $null; duration = $seconds }
    if (-not $payload.canReply) {
        $window.FindName('ReplyPanel').Visibility = 'Collapsed'
        $sendButton.Visibility = 'Collapsed'
    }

    $timer = [Windows.Threading.DispatcherTimer]::new()
    $timer.Interval = [TimeSpan]::FromSeconds($seconds)
    $timer.Add_Tick({ $timer.Stop(); $window.Close() })
    $replyBox.Add_GotKeyboardFocus({
        if ($null -ne $state.shownAt) { $state.edited = $true; $timer.Stop() }
    })
    $replyBox.Add_TextChanged({
        $timer.Stop()
        $state.edited = $true
        $sendButton.IsEnabled = -not $state.pending -and -not $state.uncertain -and -not [string]::IsNullOrWhiteSpace($replyBox.Text)
    })
    $submit = {
        if ($state.pending -or $state.uncertain -or [string]::IsNullOrWhiteSpace($replyBox.Text)) { return }
        $timer.Stop()
        $state.pending = $true
        $sendButton.IsEnabled = $false
        $replyBox.IsReadOnly = $true
        $statusLabel.Text = '正在发送…'
        [Console]::Out.WriteLine((@{ type = 'reply'; text = $replyBox.Text } | ConvertTo-Json -Compress))
        [Console]::Out.Flush()
        $state.started = [DateTime]::UtcNow
    }
    $sendButton.Add_Click($submit)
    $replyBox.Add_PreviewKeyDown({
        param($sender, $event)
        if ($event.Key -eq 'Return' -and ([Windows.Input.Keyboard]::Modifiers -band [Windows.Input.ModifierKeys]::Control)) {
            $event.Handled = $true
            & $submit
        }
    })
    $ackTimer = [Windows.Threading.DispatcherTimer]::new()
    $ackTimer.Interval = [TimeSpan]::FromMilliseconds(100)
    $ackTimer.Add_Tick({
        if ($state.incoming.IsCompleted) {
            try {
                $line = $state.incoming.GetAwaiter().GetResult()
                if ($null -eq $line) { throw 'DSH 连接已关闭，请回到 DSH 检查回复是否送达。' }
                $ack = $line | ConvertFrom-Json
                $state.incoming = $inputReader.ReadLineAsync()
                if ($ack.type -eq 'config') {
                    $duration = [int]$ack.durationSeconds
                    if ($duration -lt 1 -or $duration -gt 300) { throw 'Invalid popup duration' }
                    $state.duration = $duration
                    if (-not $state.edited -and -not $state.pending) {
                        $remaining = $duration - ([DateTime]::UtcNow - $state.shownAt).TotalSeconds
                        $timer.Stop()
                        if ($remaining -le 0) { $window.Close(); return }
                        $timer.Interval = [TimeSpan]::FromSeconds($remaining)
                        $timer.Start()
                    }
                } elseif ($state.pending) {
                    if ($ack.ok -eq $true) {
                        if (-not $state.uncertain) { $window.Close(); return }
                        $statusLabel.Text = '原回复已送达。当前文字已保留，可复制后关闭。'
                        $state.pending = $false
                    } else {
                        if ($ack.ok -ne $false) { throw '未收到有效的发送确认，请回到 DSH 检查。' }
                        $statusLabel.Text = [string]$ack.error
                        $state.pending = $false
                        $replyBox.IsReadOnly = $false
                        $sendButton.IsEnabled = -not $state.uncertain -and -not [string]::IsNullOrWhiteSpace($replyBox.Text)
                    }
                }
            } catch {
                $ackTimer.Stop()
                $timer.Stop()
                $statusLabel.Text = $_.Exception.Message
                $state.uncertain = $true
                $sendButton.IsEnabled = $false
                $replyBox.IsReadOnly = $false
            }
        }
        if ($state.pending -and -not $state.uncertain -and ([DateTime]::UtcNow - $state.started).TotalSeconds -gt 15) {
            $state.uncertain = $true
            $replyBox.IsReadOnly = $false
            $statusLabel.Text = '发送确认超时，请回到 DSH 检查，避免重复发送。文字已保留。'
        }
    })
    $window.Add_ContentRendered({
        if ($null -ne $state.shownAt) { return }
        $area = [Windows.SystemParameters]::WorkArea
        $window.Left = [Math]::Max($area.Left, $area.Right - $window.ActualWidth - 16)
        $window.Top = [Math]::Max($area.Top, $area.Bottom - $window.ActualHeight - 16)
        $null = [Windows.Input.Keyboard]::Focus($window.FindName('Dismiss'))
        $state.shownAt = [DateTime]::UtcNow
        $state.incoming = $inputReader.ReadLineAsync()
        $ackTimer.Start()
        $timer.Start()
        [Console]::Out.WriteLine('{"type":"ready"}')
        [Console]::Out.Flush()
    })
    if (-not $ValidateOnly) { $null = $window.ShowDialog() }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    $exitCode = 1
} finally {
    if ($null -ne $timer) { $timer.Stop() }
    if ($null -ne $ackTimer) { $ackTimer.Stop() }
    if ($null -ne $window) { $window.Close() }
}
exit $exitCode
