using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;

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
            if (appId != "KeS1Ke.DSH" || String.IsNullOrEmpty(arguments)) return 0;
            var route = Regex.Match(arguments, @"\A([a-f0-9]{32}):([a-f0-9]{32})\z");
            if (!route.Success) return 0;
            bool delivered;
            try
            {
                var entry = Array.Find(input ?? new NotificationInput[0], item => item.Key == "reply");
                delivered = Deliver(route.Groups[1].Value, route.Groups[2].Value, entry.Value);
            }
            catch (IOException) { delivered = false; }
            catch (UnauthorizedAccessException) { delivered = false; }
            catch (TimeoutException) { delivered = false; }
            catch (AggregateException) { delivered = false; }
            if (!delivered)
            {
                using (Process.Start(new ProcessStartInfo(launcher,
                    "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + toastScript + "\" -ReplyFailed")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true
                })) { }
            }
            return 0;
        }

        private static bool Deliver(string pipeId, string token, string text)
        {
            if (String.IsNullOrWhiteSpace(text) || text.Length > 8000) return false;
            using (var pipe = new NamedPipeClientStream(".", "kesike-dsh-reply-" + pipeId,
                PipeDirection.InOut, PipeOptions.Asynchronous, TokenImpersonationLevel.Identification))
            {
                pipe.Connect(2000);
                var message = Encoding.ASCII.GetBytes(token + " " + Convert.ToBase64String(Encoding.UTF8.GetBytes(text)) + "\n");
                if (!pipe.WriteAsync(message, 0, message.Length).Wait(2000)) return false;
                using (var reader = new StreamReader(pipe, Encoding.ASCII))
                {
                    var acknowledgment = reader.ReadLineAsync();
                    return acknowledgment.Wait(3000) && acknowledgment.Result == "ok";
                }
            }
        }

        public static void Run(Guid clsid, string powershell, string script)
        {
            const uint localServer = 4, multipleUse = 1;
            launcher = powershell;
            toastScript = script;
            Marshal.ThrowExceptionForHR(CoInitializeEx(IntPtr.Zero, 0)); // MTA
            try
            {
                uint registration;
                Marshal.ThrowExceptionForHR(CoRegisterClassObject(ref clsid, new Factory(), localServer, multipleUse, out registration));
                try { Console.WriteLine("ready"); Console.ReadLine(); }
                finally { CoRevokeClassObject(registration); }
            }
            finally { CoUninitialize(); }
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
}
