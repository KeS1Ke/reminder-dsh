using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace DshReminder
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct NotificationInput
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string Key;
        [MarshalAs(UnmanagedType.LPWStr)] public string Value;
    }

    [ComImport, Guid("53E31837-6600-4A81-9395-75CFFE746F94")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface INotificationActivationCallback
    {
        [PreserveSig]
        int Activate([MarshalAs(UnmanagedType.LPWStr)] string appId,
            [MarshalAs(UnmanagedType.LPWStr)] string arguments,
            [MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 3)] NotificationInput[] input,
            uint count);
    }

    [ComImport, Guid("00000001-0000-0000-C000-000000000046")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IClassFactory
    {
        [PreserveSig] int CreateInstance(IntPtr outer, ref Guid iid, out IntPtr instance);
        [PreserveSig] int LockServer([MarshalAs(UnmanagedType.Bool)] bool locked);
    }

    // Run while the DSH backend holds the helper's stdin open.
    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    public sealed class ToastActivator : INotificationActivationCallback
    {
        private static string launcher, toastScript;

        public int Activate(string appId, string arguments, NotificationInput[] input, uint count)
        {
            if (!KnownApp(appId) || String.IsNullOrEmpty(arguments)) return 0;
            var route = Regex.Match(arguments, @"\A([a-f0-9]{32}):([a-f0-9]{32})(:decision|:open)?\z");
            if (!route.Success) return 0;
            var kind = route.Groups[3].Value;
            if (kind == ":open")
            {
                // Navigate the backend first (it answers the GUI long poll), then open the app either way.
                try { Deliver(route.Groups[1].Value, route.Groups[2].Value, null); }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
                catch (TimeoutException) { }
                catch (AggregateException) { }
                OpenApp();
                return 0;
            }
            bool approval = kind == ":decision";
            bool delivered;
            try
            {
                var entry = Array.Find(input ?? new NotificationInput[0], item => item.Key == "reply");
                delivered = Deliver(route.Groups[1].Value, route.Groups[2].Value, approval ? "decision" : entry.Value);
            }
            catch (IOException) { delivered = false; }
            catch (UnauthorizedAccessException) { delivered = false; }
            catch (TimeoutException) { delivered = false; }
            catch (AggregateException) { delivered = false; }
            if (!delivered)
            {
                using (Process.Start(new ProcessStartInfo(launcher,
                    "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + toastScript + "\" "
                        + (approval ? "-ApprovalFailed" : "-ReplyFailed"))
                {
                    UseShellExecute = false,
                    CreateNoWindow = true
                })) { }
            }
            return 0;
        }

        // Stacked banners use KeS1Ke.DSH.2 through .5. They share this activator.
        private static bool KnownApp(string appId)
        {
            return appId == "KeS1Ke.DSH" || appId != null && Regex.IsMatch(appId, @"\AKeS1Ke\.DSH\.[2-5]\z");
        }

        private static void OpenApp()
        {
            try
            {
                using (Process.Start(new ProcessStartInfo("dsh://open") { UseShellExecute = true })) { }
            }
            catch
            {
                // The protocol may be unregistered (web-only profile); the GUI long poll already ran.
            }
        }

        private static bool Deliver(string pipeId, string token, string text)
        {
            // A null text marks a body click: it carries the route token only.
            if (text != null && (String.IsNullOrWhiteSpace(text) || text.Length > 8000)) return false;
            using (var pipe = new NamedPipeClientStream(".", "kesike-dsh-reply-" + pipeId,
                PipeDirection.InOut, PipeOptions.Asynchronous, TokenImpersonationLevel.Identification))
            {
                pipe.Connect(2000);
                var body = text == null ? token + "\n" : token + " " + Convert.ToBase64String(Encoding.UTF8.GetBytes(text)) + "\n";
                var message = Encoding.ASCII.GetBytes(body);
                if (!pipe.WriteAsync(message, 0, message.Length).Wait(2000)) return false;
                using (var reader = new StreamReader(pipe, Encoding.ASCII))
                {
                    var acknowledgment = reader.ReadLineAsync();
                    return acknowledgment.Wait(3000) && acknowledgment.Result == "ok";
                }
            }
        }

        private static uint classRegistration;
        private static bool comReady;

        // The toast host process calls Serve once. It keeps this COM server for every later banner.
        public static void Serve(Guid clsid, string powershell, string script)
        {
            const uint localServer = 4, multipleUse = 1;
            launcher = powershell;
            toastScript = script;
            Marshal.ThrowExceptionForHR(CoInitializeEx(IntPtr.Zero, 0)); // MTA
            try
            {
                uint registration;
                Marshal.ThrowExceptionForHR(CoRegisterClassObject(ref clsid, new Factory(), localServer, multipleUse, out registration));
                classRegistration = registration;
                comReady = true;
                ReplyKeys.Start();
            }
            catch
            {
                CoUninitialize();
                throw;
            }
        }

        public static void Shutdown()
        {
            ReplyKeys.Stop();
            if (!comReady) return;
            CoRevokeClassObject(classRegistration);
            CoUninitialize();
            comReady = false;
        }

        [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
        public sealed class Factory : IClassFactory
        {
            public int CreateInstance(IntPtr outer, ref Guid iid, out IntPtr instance)
            {
                instance = IntPtr.Zero;
                if (outer != IntPtr.Zero) return unchecked((int)0x80040110); // CLASS_E_NOAGGREGATION
                var unknown = Marshal.GetIUnknownForObject(new ToastActivator());
                try { return Marshal.QueryInterface(unknown, ref iid, out instance); }
                finally { Marshal.Release(unknown); }
            }

            public int LockServer(bool locked) { return 0; }
        }

        [DllImport("ole32.dll")] private static extern int CoInitializeEx(IntPtr reserved, uint model);
        [DllImport("ole32.dll")] private static extern void CoUninitialize();
        [DllImport("ole32.dll")] private static extern int CoRegisterClassObject(ref Guid clsid,
            [MarshalAs(UnmanagedType.Interface)] IClassFactory factory, uint context, uint flags, out uint registration);
        [DllImport("ole32.dll")] private static extern int CoRevokeClassObject(uint registration);
    }

    // Windows draws the toast text box and only sends on Ctrl+Enter. This hook remaps a plain Enter
    // in that box to the shell shortcut. Shift+Enter is left alone so the box can insert a newline.
    public static class ReplyKeys
    {
        const int Enter = 0x0D, Shift = 0x10, Ctrl = 0x11, Alt = 0x12;
        const int KeyDown = 0x0100, KeyUpFlag = 2, Injected = 0x10;
        const uint SendMessageId = 0x8001;

        const uint Reevaluate = 0x8002;

        static int armed;
        static int pendingUnits;
        static bool commitPending;
        static uint threadId;
        static IntPtr hook;
        static IntPtr foregroundHook;
        static IntPtr seenHwnd;
        static bool seenNotification;
        static Thread thread;
        static WinEventDelegate foregroundDelegate;
        static readonly ManualResetEvent ready = new ManualResetEvent(false);
        static readonly HookProc proc = OnKey;

        public static bool ShouldSend(bool shift, bool ctrl, bool alt, bool hasText)
        {
            return hasText && !shift && !ctrl && !alt;
        }

        // Backspace undoes one typed unit and never invents text. Paste and injected characters count as one unit.
        public static int NoteInput(int units, uint vk, bool ctrl)
        {
            if (ctrl && vk == 0x56) return units + 1;
            if (ctrl) return units;
            if (vk == 0x08 || vk == 0x2E) return units > 0 ? units - 1 : 0;
            if (IsTextKey(vk, false)) return units + 1;
            return units;
        }

        // Letters arm a possible IME commit. Space or committed Unicode clears it so the following Enter can send.
        public static bool NoteCommit(bool armedCommit, uint vk, bool ctrl)
        {
            if (ctrl) return armedCommit;
            if (vk == 0x20 || vk == 0xE7) return false;
            if (vk == 0x08 || vk == 0x2E) return armedCommit;
            if ((vk >= 0x30 && vk <= 0x39) || (vk >= 0x41 && vk <= 0x5A) || (vk >= 0x60 && vk <= 0x69) || vk == 0xE5)
                return true;
            return armedCommit;
        }

        // The first Enter while an IME is composing or in native mode belongs to the IME, not to Send.
        public static bool PassEnterToIme(bool armedCommit, bool nativeIme, bool composing)
        {
            return composing || (armedCommit && nativeIme);
        }

        public static void Arm() { Interlocked.Increment(ref armed); Nudge(); }
        public static void Disarm()
        {
            if (Interlocked.Decrement(ref armed) < 0) Interlocked.Exchange(ref armed, 0);
            Nudge();
        }

        public static void Start()
        {
            thread = new Thread(Loop);
            thread.IsBackground = true;
            thread.Start();
            ready.WaitOne(5000);
        }

        public static void Stop()
        {
            if (threadId != 0) PostThreadMessage(threadId, 0x0012, IntPtr.Zero, IntPtr.Zero);
            if (thread != null) thread.Join(1000);
            thread = null;
        }

        // The keyboard hook exists only while a reply is armed and the notification UI is in front.
        static void InstallIfNeeded()
        {
            bool want = Volatile.Read(ref armed) > 0 && IsNotificationWindow(GetForegroundWindow());
            if (!want) { pendingUnits = 0; commitPending = false; }
            if (want)
            {
                if (hook == IntPtr.Zero) hook = SetWindowsHookEx(13, proc, IntPtr.Zero, 0);
            }
            else if (hook != IntPtr.Zero)
            {
                UnhookWindowsHookEx(hook);
                hook = IntPtr.Zero;
            }
        }

        static void Nudge()
        {
            if (threadId != 0) PostThreadMessage(threadId, Reevaluate, IntPtr.Zero, IntPtr.Zero);
        }

        static void OnForeground(IntPtr eventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint eventThread, uint time)
        {
            if (idObject == 0) InstallIfNeeded();
        }

        static void Loop()
        {
            try
            {
                MSG discard;
                PeekMessage(out discard, IntPtr.Zero, 0, 0, 0);
                threadId = GetCurrentThreadId();
                foregroundDelegate = OnForeground;
                foregroundHook = SetWinEventHook(0x0003, 0x0003, IntPtr.Zero, foregroundDelegate, 0, 0, 0);
                InstallIfNeeded();
                ready.Set();
                MSG msg;
                while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0)
                {
                    if (msg.message == Reevaluate) InstallIfNeeded();
                    else if (msg.message == SendMessageId) TapCtrlEnter();
                    else { TranslateMessage(ref msg); DispatchMessage(ref msg); }
                }
            }
            catch { ready.Set(); }
            finally
            {
                if (hook != IntPtr.Zero) { UnhookWindowsHookEx(hook); hook = IntPtr.Zero; }
                if (foregroundHook != IntPtr.Zero) { UnhookWinEvent(foregroundHook); foregroundHook = IntPtr.Zero; }
                threadId = 0;
            }
        }

        static IntPtr OnKey(int code, IntPtr wParam, IntPtr lParam)
        {
            try
            {
                if (code >= 0 && SwallowEnter(wParam, lParam))
                {
                    PostThreadMessage(threadId, SendMessageId, IntPtr.Zero, IntPtr.Zero);
                    return (IntPtr)1;
                }
            }
            catch { }
            return CallNextHookEx(hook, code, wParam, lParam);
        }

        static bool SwallowEnter(IntPtr wParam, IntPtr lParam)
        {
            int message = wParam.ToInt32();
            if (message != KeyDown) return false;
            Kbd key = (Kbd)Marshal.PtrToStructure(lParam, typeof(Kbd));
            bool injected = (key.flags & Injected) != 0;
            if (Volatile.Read(ref armed) <= 0) { pendingUnits = 0; commitPending = false; return false; }
            IntPtr foreground = GetForegroundWindow();
            bool notification = IsNotificationWindow(foreground);
            bool ctrl = Down(Ctrl), alt = Down(Alt), shift = Down(Shift);
            if (!notification) { pendingUnits = 0; commitPending = false; return false; }
            if (injected)
            {
                // Our own Ctrl+Enter is injected. Other injected text, such as a paste or IME packet, still fills the box.
                if (key.vkCode != Enter)
                {
                    pendingUnits = NoteInput(pendingUnits, key.vkCode, ctrl);
                    commitPending = NoteCommit(commitPending, key.vkCode, ctrl);
                }
                return false;
            }
            if (key.vkCode != Enter)
            {
                pendingUnits = NoteInput(pendingUnits, key.vkCode, ctrl);
                commitPending = NoteCommit(commitPending, key.vkCode, ctrl);
                return false;
            }
            if (!ShouldSend(shift, ctrl, alt, pendingUnits > 0)) return false;
            bool composing = Composing(foreground);
            if (PassEnterToIme(commitPending, !composing && commitPending && NativeIme(foreground), composing))
            {
                commitPending = false;
                return false;
            }
            pendingUnits = 0;
            commitPending = false;
            return true;
        }

        static bool IsTextKey(uint vk, bool ctrl)
        {
            if (ctrl) return vk == 0x56;
            if (vk >= 0x30 && vk <= 0x39) return true;
            if (vk >= 0x41 && vk <= 0x5A) return true;
            if (vk >= 0x60 && vk <= 0x6F) return true;
            if (vk == 0x20) return true;
            if (vk >= 0xBA && vk <= 0xC0) return true;
            if (vk >= 0xDB && vk <= 0xDE) return true;
            return vk == 0xE7;
        }

        static bool IsNotificationWindow(IntPtr hwnd)
        {
            if (hwnd == IntPtr.Zero) return false;
            if (hwnd == seenHwnd) return seenNotification;
            seenHwnd = hwnd;
            seenNotification = false;
            var cls = new StringBuilder(64);
            GetClassName(hwnd, cls, cls.Capacity);
            if (cls.ToString() != "Windows.UI.Core.CoreWindow") return false;
            uint pid;
            GetWindowThreadProcessId(hwnd, out pid);
            try
            {
                using (var process = Process.GetProcessById((int)pid))
                    seenNotification = process.ProcessName == "ShellExperienceHost";
            }
            catch { seenNotification = false; }
            return seenNotification;
        }

        static bool Composing(IntPtr hwnd)
        {
            if (ContextComposing(hwnd)) return true;
            // ImmGetContext on another process's CoreWindow is usually empty. The IME window is the fallback.
            IntPtr ime = ImmGetDefaultIMEWnd(hwnd);
            return ime != IntPtr.Zero && ime != hwnd && ContextComposing(ime);
        }

        static bool ContextComposing(IntPtr hwnd)
        {
            IntPtr context = ImmGetContext(hwnd);
            if (context == IntPtr.Zero) return false;
            try { return ImmGetCompositionString(context, 0x0008, IntPtr.Zero, 0) > 0; }
            finally { ImmReleaseContext(hwnd, context); }
        }

        static bool NativeIme(IntPtr hwnd)
        {
            IntPtr ime = ImmGetDefaultIMEWnd(hwnd);
            if (ime == IntPtr.Zero) return false;
            IntPtr mode;
            // A short timeout: the keyboard hook must not wait on a busy IME window.
            IntPtr ok = SendMessageTimeout(ime, 0x0283, (IntPtr)0x0001, IntPtr.Zero, 0x0002, 15, out mode);
            return ok != IntPtr.Zero && (mode.ToInt64() & 1) != 0;
        }

        static bool Down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

        static void TapCtrlEnter()
        {
            keybd_event(Ctrl, 0, 0, UIntPtr.Zero);
            keybd_event(Enter, 0, 0, UIntPtr.Zero);
            keybd_event(Enter, 0, KeyUpFlag, UIntPtr.Zero);
            keybd_event(Ctrl, 0, KeyUpFlag, UIntPtr.Zero);
        }

        delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
        delegate void WinEventDelegate(IntPtr eventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint eventThread, uint time);
        [StructLayout(LayoutKind.Sequential)]
        struct Kbd { public uint vkCode, scanCode, flags, time; public UIntPtr extra; }
        [StructLayout(LayoutKind.Sequential)]
        struct POINT { public int x, y; }
        [StructLayout(LayoutKind.Sequential)]
        struct MSG
        {
            public IntPtr hwnd;
            public uint message;
            public IntPtr wParam;
            public IntPtr lParam;
            public uint time;
            public POINT pt;
        }

        [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr module, uint thread);
        [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, WinEventDelegate callback, uint pid, uint tid, uint flags);
        [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
        [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder cls, int count);
        [DllImport("user32.dll")] static extern bool PeekMessage(out MSG msg, IntPtr hwnd, uint min, uint max, uint remove);
        [DllImport("user32.dll")] static extern int GetMessage(out MSG msg, IntPtr hwnd, uint min, uint max);
        [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG msg);
        [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG msg);
        [DllImport("user32.dll")] static extern bool PostThreadMessage(uint thread, uint msg, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
        [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
        [DllImport("imm32.dll")] static extern IntPtr ImmGetContext(IntPtr hwnd);
        [DllImport("imm32.dll")] static extern bool ImmReleaseContext(IntPtr hwnd, IntPtr context);
        [DllImport("imm32.dll")] static extern int ImmGetCompositionString(IntPtr context, uint index, IntPtr buffer, uint length);
        [DllImport("imm32.dll")] static extern IntPtr ImmGetDefaultIMEWnd(IntPtr hwnd);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
    }
}
