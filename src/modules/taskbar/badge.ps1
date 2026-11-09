#requires -Version 7.0
#requires -PSEdition Core
param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
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
            $bitmap = [System.Drawing.Bitmap]::new($size, $size)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
                $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
                $graphics.Clear([System.Drawing.Color]::Transparent)
                $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 224, 49, 49))
                try { $graphics.FillEllipse($brush, 0.5, 0.5, $size - 1, $size - 1) } finally { $brush.Dispose() }
                $fontSize = switch ($text.Length) { 1 { 22 } 2 { 18 } default { 13 } }
                $font = [System.Drawing.Font]::new('Segoe UI', [single]$fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
                try {
                    $format = [System.Drawing.StringFormat]::new()
                    $format.Alignment = [System.Drawing.StringAlignment]::Center
                    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
                    $graphics.DrawString($text, $font, [System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::new(0, 0, $size, $size), $format)
                } finally { $font.Dispose() }
            } finally { $graphics.Dispose() }
            return $bitmap.GetHicon()
        }

        function Show-Badge([IntPtr[]]$windows, [int]$value) {
            $icon = New-BadgeIcon $value
            $text = if ($value -gt 99) { '99+' } else { [string]$value }
            foreach ($window in $windows) {
                [DshTaskbarBadge]::SetOverlay($window, $icon, "$text 个会话已完成")
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
        $shouldStop = $false
        if ($control.IsCompleted) {
            $line = $control.GetAwaiter().GetResult()
            if ($null -eq $line -or ($line | ConvertFrom-Json).type -eq 'stop') { $shouldStop = $true }
            else { $control = $reader.ReadLineAsync() }
        }
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
