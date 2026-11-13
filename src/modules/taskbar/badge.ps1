#requires -Version 7.0
#requires -PSEdition Core
param([switch]$ValidateOnly, [switch]$DrainSelfTest)

$ErrorActionPreference = 'Stop'

# Lines that arrived while the parent-process walk was running must update the count before the first paint.
function Import-BadgeControl {
    param(
        [IO.StreamReader]$Reader,
        [ref]$Control,
        [ref]$Count
    )
    while ($Control.Value.IsCompleted) {
        $line = $Control.Value.GetAwaiter().GetResult()
        if ($null -eq $line) { return $true }
        $command = $line | ConvertFrom-Json
        if ($command.type -eq 'stop') { return $true }
        if ($command.type -eq 'set') {
            $next = [int]$command.count
            if ($next -lt 1 -or $next -gt 999) { throw 'Invalid badge count' }
            $Count.Value = $next
        }
        $Control.Value = $Reader.ReadLineAsync()
    }
    return $false
}

if ($DrainSelfTest) {
    function Assert-Drain([string]$label, [string]$inputText, [int]$expectedCount, [bool]$expectedStop) {
        $server = [IO.Pipes.AnonymousPipeServerStream]::new([IO.Pipes.PipeDirection]::Out)
        try {
            $client = [IO.Pipes.AnonymousPipeClientStream]::new([IO.Pipes.PipeDirection]::In, $server.GetClientHandle())
            $server.DisposeLocalCopyOfClientHandle()
            $reader = [IO.StreamReader]::new($client, [Text.UTF8Encoding]::new($false))
            $writer = [IO.StreamWriter]::new($server, [Text.UTF8Encoding]::new($false))
            $writer.AutoFlush = $true
            $writer.Write($inputText)
            $count = 1
            $control = $reader.ReadLineAsync()
            $deadline = [DateTime]::UtcNow.AddSeconds(2)
            while (-not $control.IsCompleted -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 10 }
            if (-not $control.IsCompleted) { throw "$label did not buffer the first line" }
            $stop = Import-BadgeControl -Reader $reader -Control ([ref]$control) -Count ([ref]$count)
            if ($stop -ne $expectedStop -or $count -ne $expectedCount) {
                throw "$label stop=$stop count=$count"
            }
        } finally { try { $server.Dispose() } catch {} }
    }
    Assert-Drain 'queued sets' "{`"type`":`"set`",`"count`":2}`n{`"type`":`"set`",`"count`":4}`n" 4 $false
    Assert-Drain 'set then stop' "{`"type`":`"set`",`"count`":3}`n{`"type`":`"stop`"}`n" 3 $true
    Assert-Drain 'stop first' "{`"type`":`"stop`"}`n{`"type`":`"set`",`"count`":9}`n" 1 $true
    exit 0
}
$targets = @()
$badgeIcon = [IntPtr]::Zero
$exitCode = 0
try {
    Add-Type -AssemblyName System.Drawing
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

[ComImport, Guid("56FDF344-FD6D-11d0-958A-006097C9A090")]
[ClassInterface(ClassInterfaceType.None)]
public class TaskbarList { }

[ComImport, Guid("ea1afb91-9e28-4b86-90e9-9e9f8a5eeb0e"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ITaskbarList3 {
    void HrInit();
    void AddTab(IntPtr hwnd);
    void DeleteTab(IntPtr hwnd);
    void ActivateTab(IntPtr hwnd);
    void SetActiveAlt(IntPtr hwnd);
    void MarkFullscreenWindow(IntPtr hwnd, [MarshalAs(UnmanagedType.Bool)] bool fFullscreen);
    void SetProgressValue(IntPtr hwnd, ulong ullCompleted, ulong ullTotal);
    void SetProgressState(IntPtr hwnd, int tbpFlags);
    void RegisterTab(IntPtr hwndTab, IntPtr hwndMDI);
    void UnregisterTab(IntPtr hwndTab);
    void SetTabOrder(IntPtr hwndTab, IntPtr hwndInsertBefore);
    void SetTabActive(IntPtr hwndTab, IntPtr hwndMDI, uint dwReserved);
    void ThumbBarAddButtons(IntPtr hwnd, uint cButtons, IntPtr pButtons);
    void ThumbBarUpdateButtons(IntPtr hwnd, uint cButtons, IntPtr pButtons);
    void ThumbBarSetImageList(IntPtr hwnd, IntPtr himl);
    void SetOverlayIcon(IntPtr hwnd, IntPtr hIcon, [MarshalAs(UnmanagedType.LPWStr)] string pszDescription);
    void SetThumbnailTooltip(IntPtr hwnd, [MarshalAs(UnmanagedType.LPWStr)] string pszTip);
    void SetThumbnailClip(IntPtr hwnd, IntPtr prcClip);
}

[ComImport, Guid("c43dc798-95d1-4bea-9030-bb99e2983a1a"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ITaskbarList4 {
    void HrInit();
    void AddTab(IntPtr hwnd);
    void DeleteTab(IntPtr hwnd);
    void ActivateTab(IntPtr hwnd);
    void SetActiveAlt(IntPtr hwnd);
    void MarkFullscreenWindow(IntPtr hwnd, [MarshalAs(UnmanagedType.Bool)] bool fFullscreen);
    void SetProgressValue(IntPtr hwnd, ulong ullCompleted, ulong ullTotal);
    void SetProgressState(IntPtr hwnd, int tbpFlags);
    void RegisterTab(IntPtr hwndTab, IntPtr hwndMDI);
    void UnregisterTab(IntPtr hwndTab);
    void SetTabOrder(IntPtr hwndTab, IntPtr hwndInsertBefore);
    void SetTabActive(IntPtr hwndTab, IntPtr hwndMDI, uint dwReserved);
    void ThumbBarAddButtons(IntPtr hwnd, uint cButtons, IntPtr pButtons);
    void ThumbBarUpdateButtons(IntPtr hwnd, uint cButtons, IntPtr pButtons);
    void ThumbBarSetImageList(IntPtr hwnd, IntPtr himl);
    void SetOverlayIcon(IntPtr hwnd, IntPtr hIcon, [MarshalAs(UnmanagedType.LPWStr)] string pszDescription);
    void SetThumbnailTooltip(IntPtr hwnd, [MarshalAs(UnmanagedType.LPWStr)] string pszTip);
    void SetThumbnailClip(IntPtr hwnd, IntPtr prcClip);
    void SetTabProperties(IntPtr hwndTab, int stpFlags);
}

public static class DshTaskbarBadge {
    private static ITaskbarList3 list3;
    private static ITaskbarList4 list4;

    private static void EnsureList() {
        if (list3 != null || list4 != null) return;
        var raw = new TaskbarList();
        // Windows 11 builds may expose only one of the two cumulative interfaces.
        try { list4 = (ITaskbarList4)raw; list4.HrInit(); return; } catch (InvalidCastException) { }
        list3 = (ITaskbarList3)raw;
        list3.HrInit();
    }

    public static void SetOverlay(IntPtr window, IntPtr icon, string description) {
        EnsureList();
        if (list4 != null) list4.SetOverlayIcon(window, icon, description);
        else list3.SetOverlayIcon(window, icon, description);
    }

    [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr icon);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();

    private delegate bool EnumProc(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);

    public static IntPtr[] Find(string title, int[] owners) {
        var matches = new List<IntPtr>();
        var owned = new List<IntPtr>();
        var ancestorIds = new HashSet<int>(owners);
        EnumWindows((window, parameter) => {
            if (!IsWindowVisible(window)) return true;
            var text = new StringBuilder(2048);
            GetWindowText(window, text, text.Capacity);
            var name = text.ToString();
            bool match = title.Length > 0 ? name.IndexOf(title, StringComparison.OrdinalIgnoreCase) >= 0
                : Regex.IsMatch(name, @"(?:^|\s[—–-]\s)(?:DeepSeek Harness|DSH(?: Local Build)?)(?:$|\s[-—–]\s)", RegexOptions.IgnoreCase);
            if (!match) return true;
            uint process; GetWindowThreadProcessId(window, out process);
            matches.Add(window);
            if (ancestorIds.Contains((int)process)) owned.Add(window);
            return true;
        }, IntPtr.Zero);
        if (owned.Count > 0) return owned.ToArray();
        if (matches.Count > 1) throw new InvalidOperationException("匹配到多个 DSH 窗口，请在提醒设置中填写更具体的目标窗口标题。");
        if (matches.Count == 0) throw new InvalidOperationException("未找到 DSH 窗口。请让浏览器显示 DSH 标签页，或在提醒设置中填写目标窗口标题。");
        return matches.ToArray();
    }
}
'@
    if (-not $ValidateOnly) {
        function New-BadgeIcon([int]$value) {
            $text = if ($value -gt 99) { '99+' } else { [string]$value }
            $size = 32
            # Windows scales the 32px overlay icon down to the taskbar badge slot, so the chip fills the canvas to
            # match the native badge size (about 18px on screen) instead of relying on canvas pixels.
            $height = 30
            $fontSize = switch ($text.Length) { 1 { 27 } 2 { 21 } default { 15 } }
            $bitmap = [System.Drawing.Bitmap]::new($size, $size)
            try {
                $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
                try {
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
                $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
                $graphics.Clear([System.Drawing.Color]::Transparent)
                $font = [System.Drawing.Font]::new('Segoe UI', [single]$fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
                try {
                    # Same shape as the ChatGPT taskbar badge: a dark chip with white digits, widened into a pill only
                    # as far as the number needs so two- and three-digit counts stay inside the canvas.
                    # MeasureString pads heavily at these sizes, so the pill width uses the tight typographic metrics.
                    $tight = [System.Drawing.StringFormat]::GenericTypographic
                    $textWidth = $graphics.MeasureString($text, $font, [System.Drawing.PointF]::new(0, 0), $tight).Width
                    $width = [single][Math]::Min($size, [Math]::Max($height, [Math]::Ceiling($textWidth) + 6))
                    $x = ($size - $width) / 2
                    $y = ($size - $height) / 2
                    $shape = [System.Drawing.Drawing2D.GraphicsPath]::new()
                    try {
                        $shape.AddArc($x, $y, $height, $height, 90, 180)
                        $shape.AddArc($x + $width - $height, $y, $height, $height, 270, 180)
                        $shape.CloseFigure()
                        $chip = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 38, 37, 45))
                        try { $graphics.FillPath($chip, $shape) } finally { $chip.Dispose() }
                    } finally { $shape.Dispose() }
                    $format = [System.Drawing.StringFormat]::new()
                    $format.Alignment = [System.Drawing.StringAlignment]::Center
                    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
                    # Without NoWrap a number wider than the layout rectangle would wrap onto a second line, and GDI+
                    # clips the last glyph at the rectangle edge, so the slack rectangle keeps the same centre.
                    $format.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
                    try { $graphics.DrawString($text, $font, [System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::new(-4, 0, $size + 8, $size), $format) } finally { $format.Dispose() }
                } finally { $font.Dispose() }
            } finally { $graphics.Dispose() }
                return $bitmap.GetHicon()
            } finally { $bitmap.Dispose() }
        }

        function Show-Badge([IntPtr[]]$windows, [int]$value) {
            $icon = New-BadgeIcon $value
            $text = if ($value -gt 99) { '99+' } else { [string]$value }
            try {
                foreach ($window in $windows) {
                    [DshTaskbarBadge]::SetOverlay($window, $icon, "$text 个会话已完成")
                }
            } catch {
                $null = [DshTaskbarBadge]::DestroyIcon($icon)
                throw
            }
            # Replace the previous handle only after every window points at the new icon.
            if ($script:badgeIcon -ne [IntPtr]::Zero) { $null = [DshTaskbarBadge]::DestroyIcon($script:badgeIcon) }
            $script:badgeIcon = $icon
        }

        $reader = [IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.UTF8Encoding]::new($false))
        $payload = $reader.ReadLine() | ConvertFrom-Json
        $count = [int]$payload.count
        if ($count -lt 1 -or $count -gt 999) { throw 'Invalid badge count' }
        $minutes = [double]$payload.maxMinutes
        if ($minutes -lt 1 -or $minutes -gt 1440) { throw 'Invalid badge lifetime' }
        $control = $reader.ReadLineAsync()
        $owners = [Collections.Generic.List[int]]::new()
        $processId = [int]$payload.hostPid
        for ($depth = 0; $depth -lt 12 -and $processId -gt 0; $depth++) {
            if ($owners.Contains($processId)) { break }
            $owners.Add($processId)
            $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
            if ($null -eq $processInfo) { break }
            $processId = [int]$processInfo.ParentProcessId
        }
        $shouldStop = Import-BadgeControl -Reader $reader -Control ([ref]$control) -Count ([ref]$count)
        if (-not $shouldStop) {
            $targets = @([DshTaskbarBadge]::Find([string]$payload.windowTitle, $owners.ToArray()))
            # A window the user is already looking at needs no unread badge.
            $targets = @($targets | Where-Object { $_ -ne [DshTaskbarBadge]::GetForegroundWindow() })
            if ($targets.Count -gt 0) {
                Show-Badge $targets $count
                $until = [DateTime]::UtcNow.AddMinutes($minutes)
                while ($targets.Count -gt 0 -and [DateTime]::UtcNow -lt $until) {
                    if ($targets -contains [DshTaskbarBadge]::GetForegroundWindow()) { break }
                    $targets = @($targets | Where-Object { [DshTaskbarBadge]::IsWindow($_) })
                    if ($targets.Count -eq 0) { break }
                    if ($control.IsCompleted) {
                        $line = $control.GetAwaiter().GetResult()
                        if ($null -eq $line) { break }
                        $command = $line | ConvertFrom-Json
                        if ($command.type -eq 'stop') { break }
                        if ($command.type -eq 'set') {
                            $count = [int]$command.count
                            if ($count -lt 1 -or $count -gt 999) { throw 'Invalid badge count' }
                            Show-Badge $targets $count
                        }
                        $control = $reader.ReadLineAsync()
                    }
                    Start-Sleep -Milliseconds 150
                }
            }
        }
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    $exitCode = 1
} finally {
    foreach ($target in $targets) {
        if ([DshTaskbarBadge]::IsWindow([IntPtr]$target)) {
            [DshTaskbarBadge]::SetOverlay([IntPtr]$target, [IntPtr]::Zero, '')
        }
    }
    if ($badgeIcon -ne [IntPtr]::Zero) { $null = [DshTaskbarBadge]::DestroyIcon($badgeIcon) }
}
exit $exitCode

