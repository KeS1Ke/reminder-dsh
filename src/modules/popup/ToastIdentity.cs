using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public static class DshToastIdentity
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool MoveFileEx(string source, string destination, uint flags);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern void SHChangeNotify(int eventId, uint flags, string path, IntPtr unused);

    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    private class ShellLink { }

    [StructLayout(LayoutKind.Sequential)]
    private struct PropertyKey { public Guid Format; public uint Id; }

    [StructLayout(LayoutKind.Sequential)]
    private struct PropertyValue
    {
        public ushort Type, Reserved1, Reserved2, Reserved3;
        public IntPtr Data;
        public int Padding;
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        void GetCount(out uint count);
        void GetAt(uint index, out PropertyKey key);
        void GetValue(ref PropertyKey key, out PropertyValue value);
        void SetValue(ref PropertyKey key, ref PropertyValue value);
        void Commit();
    }

    public static void RegisterShortcut(string staged, string destination, string appId, Guid activator)
    {
        var link = new ShellLink();
        try
        {
            var file = (IPersistFile)link;
            file.Load(staged, 2); // STGM_READWRITE
            var store = (IPropertyStore)link;
            var key = new PropertyKey { Format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), Id = 5 };
            var value = new PropertyValue { Type = 31, Data = Marshal.StringToCoTaskMemUni(appId) }; // VT_LPWSTR
            try { store.SetValue(ref key, ref value); }
            finally { Marshal.FreeCoTaskMem(value.Data); }

            key.Id = 26; // AppUserModel.ToastActivatorCLSID
            value = new PropertyValue { Type = 72, Data = Marshal.AllocCoTaskMem(16) }; // VT_CLSID
            try
            {
                Marshal.StructureToPtr(activator, value.Data, false);
                store.SetValue(ref key, ref value);
            }
            finally { Marshal.FreeCoTaskMem(value.Data); }
            store.Commit();
            file.Save(staged, true);
        }
        finally { Marshal.FinalReleaseComObject(link); }

        bool replaced = File.Exists(destination);
        if (!MoveFileEx(staged, destination, 1)) // MOVEFILE_REPLACE_EXISTING
            throw new Win32Exception(Marshal.GetLastWin32Error());
        SHChangeNotify(replaced ? 0x2000 : 2, 0x1005, destination, IntPtr.Zero); // UPDATEITEM/CREATE, PATHW | FLUSH
    }
}
