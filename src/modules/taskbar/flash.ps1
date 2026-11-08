#requires -Version 7.0
#requires -PSEdition Core
param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
$targets = @()
$exitCode = 0
try {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
public static class DshTaskbar {
    private delegate bool EnumProc(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [StructLayout(LayoutKind.Sequential)] private struct FlashInfo {
        public uint size; public IntPtr window; public uint flags; public uint count; public uint timeout;
    }
    [DllImport("user32.dll")] private static extern bool FlashWindowEx(ref FlashInfo info);
    public static void Flash(IntPtr window, bool enabled, uint count) {
        var info = new FlashInfo { size = (uint)Marshal.SizeOf<FlashInfo>(), window = window,
            flags = enabled ? 2u : 0u, count = count, timeout = 500 };
        FlashWindowEx(ref info);
    }
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
        $reader = [IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.UTF8Encoding]::new($false))
        $payload = $reader.ReadLine() | ConvertFrom-Json
        $seconds = [int]$payload.durationSeconds
        if ($seconds -lt 1 -or $seconds -gt 60) { throw 'Invalid flash duration' }
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
            $targets = @([DshTaskbar]::Find([string]$payload.windowTitle, $owners.ToArray()))
            $targets = @($targets | Where-Object { $_ -ne [DshTaskbar]::GetForegroundWindow() })
            foreach ($target in $targets) { [DshTaskbar]::Flash($target, $true, [uint32]($seconds * 2)) }
            $until = [DateTime]::UtcNow.AddSeconds($seconds)
            while ($targets.Count -gt 0 -and [DateTime]::UtcNow -lt $until) {
                if ($targets -contains [DshTaskbar]::GetForegroundWindow()) { break }
                if ($control.IsCompleted) {
                    $line = $control.GetAwaiter().GetResult()
                    if ($null -eq $line) { break }
                    $command = $line | ConvertFrom-Json
                    if ($command.type -eq 'stop') { break }
                    if ($command.type -eq 'refresh') {
                        $until = [DateTime]::UtcNow.AddSeconds($seconds)
                        foreach ($target in $targets) { [DshTaskbar]::Flash($target, $true, [uint32]($seconds * 2)) }
                    }
                    $control = $reader.ReadLineAsync()
                }
                Start-Sleep -Milliseconds 100
            }
        }
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    $exitCode = 1
} finally {
    foreach ($target in $targets) {
        if ([DshTaskbar]::IsWindow($target)) { [DshTaskbar]::Flash($target, $false, 0) }
    }
}
exit $exitCode
