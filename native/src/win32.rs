use std::ffi::c_void;
use std::ptr;

use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

pub fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

pub unsafe fn from_wide_ptr(ptr: *const u16) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let mut len = 0usize;
    while *ptr.add(len) != 0 {
        len += 1;
    }
    String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len))
}

pub fn from_wide_buf(buf: &[u16]) -> String {
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len])
}

pub struct ComGuard {
    should_uninit: bool,
}

impl ComGuard {
    pub fn new_mta() -> Result<Self, String> {
        unsafe {
            let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
            // S_OK (0) or S_FALSE (1) means we initialized COM on this thread.
            // RPC_E_CHANGED_MODE (0x80010106) means this thread already has COM initialized.
            let code = hr.0 as u32;
            if code == 0 || code == 1 {
                Ok(Self {
                    should_uninit: true,
                })
            } else if code == 0x8001_0106 {
                Ok(Self {
                    should_uninit: false,
                })
            } else {
                Err(format!("CoInitializeEx failed: 0x{code:08X}"))
            }
        }
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.should_uninit {
            unsafe {
                CoUninitialize();
            }
        }
    }
}

pub type HKey = *mut c_void;
pub const HKEY_CLASSES_ROOT: HKey = 0x8000_0000usize as HKey;
pub const HKEY_CURRENT_USER: HKey = 0x8000_0001usize as HKey;
pub const KEY_READ: u32 = 0x20019;
pub const KEY_WRITE: u32 = 0x20006;
pub const REG_SZ: u32 = 1;
pub const MOVEFILE_REPLACE_EXISTING: u32 = 1;
pub const SW_SHOWNORMAL: i32 = 1;
pub const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
pub const TH32CS_SNAPPROCESS: u32 = 0x0000_0002;
pub const INVALID_HANDLE_VALUE: *mut c_void = (-1isize) as *mut c_void;

#[repr(C)]
pub struct RawGuid {
    pub data1: u32,
    pub data2: u16,
    pub data3: u16,
    pub data4: [u8; 8],
}

#[repr(C)]
pub struct ProcessEntry32W {
    pub dw_size: u32,
    pub cnt_usage: u32,
    pub th32_process_id: u32,
    pub th32_default_heap_id: usize,
    pub th32_module_id: u32,
    pub cnt_threads: u32,
    pub th32_parent_process_id: u32,
    pub pc_pri_class_base: i32,
    pub dw_flags: u32,
    pub sz_exe_file: [u16; 260],
}

#[link(name = "advapi32")]
extern "system" {
    pub fn RegOpenKeyExW(
        h_key: HKey,
        lp_sub_key: *const u16,
        ul_options: u32,
        sam_desired: u32,
        phk_result: *mut HKey,
    ) -> i32;
    pub fn RegCreateKeyExW(
        h_key: HKey,
        lp_sub_key: *const u16,
        reserved: u32,
        lp_class: *const u16,
        dw_options: u32,
        sam_desired: u32,
        lp_security_attributes: *const c_void,
        phk_result: *mut HKey,
        lpdw_disposition: *mut u32,
    ) -> i32;
    pub fn RegQueryValueExW(
        h_key: HKey,
        lp_value_name: *const u16,
        lp_reserved: *mut u32,
        lp_type: *mut u32,
        lp_data: *mut u8,
        lpcb_data: *mut u32,
    ) -> i32;
    pub fn RegSetValueExW(
        h_key: HKey,
        lp_value_name: *const u16,
        reserved: u32,
        dw_type: u32,
        lp_data: *const u8,
        cb_data: u32,
    ) -> i32;
    pub fn RegCloseKey(h_key: HKey) -> i32;
}

#[link(name = "kernel32")]
extern "system" {
    pub fn GetLastError() -> u32;
    pub fn MoveFileExW(
        lp_existing_file_name: *const u16,
        lp_new_file_name: *const u16,
        dw_flags: u32,
    ) -> i32;
    pub fn GetCurrentThreadId() -> u32;
    pub fn OpenProcess(
        dw_desired_access: u32,
        b_inherit_handle: i32,
        dw_process_id: u32,
    ) -> *mut c_void;
    pub fn CloseHandle(h_object: *mut c_void) -> i32;
    pub fn QueryFullProcessImageNameW(
        h_process: *mut c_void,
        dw_flags: u32,
        lp_exe_name: *mut u16,
        lpdw_size: *mut u32,
    ) -> i32;
    pub fn CreateToolhelp32Snapshot(dw_flags: u32, th32_process_id: u32) -> *mut c_void;
    pub fn Process32FirstW(h_snapshot: *mut c_void, lppe: *mut ProcessEntry32W) -> i32;
    pub fn Process32NextW(h_snapshot: *mut c_void, lppe: *mut ProcessEntry32W) -> i32;
}

#[link(name = "shell32")]
extern "system" {
    pub fn SHChangeNotify(
        w_event_id: i32,
        u_flags: u32,
        dw_item1: *const c_void,
        dw_item2: *const c_void,
    );
    pub fn ShellExecuteW(
        hwnd: *mut c_void,
        lp_operation: *const u16,
        lp_file: *const u16,
        lp_parameters: *const u16,
        lp_directory: *const u16,
        n_show_cmd: i32,
    ) -> *mut c_void;
    pub fn SHGetKnownFolderPath(
        rfid: *const RawGuid,
        dw_flags: u32,
        h_token: *mut c_void,
        ppsz_path: *mut *mut u16,
    ) -> i32;
}

#[link(name = "ole32")]
extern "system" {
    pub fn CoTaskMemFree(pv: *mut c_void);
    pub fn CoRegisterClassObject(
        rclsid: *const RawGuid,
        p_unk: *const c_void,
        dw_cls_context: u32,
        flags: u32,
        lpdw_register: *mut u32,
    ) -> i32;
    pub fn CoRevokeClassObject(dw_register: u32) -> i32;
}

pub struct RegKeyGuard(pub HKey);

impl Drop for RegKeyGuard {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                RegCloseKey(self.0);
            }
        }
    }
}

pub fn reg_read_sz(root: HKey, subkey: &str, value_name: Option<&str>) -> Option<String> {
    let subkey_w = to_wide(subkey);
    let mut hkey: HKey = ptr::null_mut();
    let status = unsafe { RegOpenKeyExW(root, subkey_w.as_ptr(), 0, KEY_READ, &mut hkey) };
    if status != 0 || hkey.is_null() {
        return None;
    }
    let _guard = RegKeyGuard(hkey);
    reg_query_sz(hkey, value_name)
}

pub fn reg_query_sz(hkey: HKey, value_name: Option<&str>) -> Option<String> {
    let name_w = value_name.map(to_wide);
    let name_ptr = name_w.as_ref().map_or(ptr::null(), |v| v.as_ptr());
    let mut reg_type: u32 = 0;
    let mut bytes: u32 = 0;
    let status = unsafe {
        RegQueryValueExW(
            hkey,
            name_ptr,
            ptr::null_mut(),
            &mut reg_type,
            ptr::null_mut(),
            &mut bytes,
        )
    };
    if status != 0 || reg_type != REG_SZ || bytes < 2 {
        return None;
    }
    let mut buf = vec![0u16; (bytes as usize + 1) / 2];
    let status = unsafe {
        RegQueryValueExW(
            hkey,
            name_ptr,
            ptr::null_mut(),
            &mut reg_type,
            buf.as_mut_ptr() as *mut u8,
            &mut bytes,
        )
    };
    if status != 0 {
        return None;
    }
    let u16_len = (bytes as usize) / 2;
    let slice = &buf[..u16_len.min(buf.len())];
    Some(from_wide_buf(slice))
}

pub fn reg_create_hkcu(subkey: &str) -> Result<RegKeyGuard, String> {
    let subkey_w = to_wide(subkey);
    let mut hkey: HKey = ptr::null_mut();
    let status = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            subkey_w.as_ptr(),
            0,
            ptr::null(),
            0,
            KEY_READ | KEY_WRITE,
            ptr::null(),
            &mut hkey,
            ptr::null_mut(),
        )
    };
    if status != 0 || hkey.is_null() {
        return Err(format!("RegCreateKeyExW failed for {subkey}: {status}"));
    }
    Ok(RegKeyGuard(hkey))
}

pub fn reg_set_sz(hkey: HKey, name: &str, value: &str) -> Result<(), String> {
    let name_w = to_wide(name);
    let value_w = to_wide(value);
    let byte_len = (value_w.len() * 2) as u32;
    let status = unsafe {
        RegSetValueExW(
            hkey,
            name_w.as_ptr(),
            0,
            REG_SZ,
            value_w.as_ptr() as *const u8,
            byte_len,
        )
    };
    if status != 0 {
        return Err(format!("RegSetValueExW failed for {name}: {status}"));
    }
    Ok(())
}

pub fn open_protocol_url(url: &str) {
    let op_w = to_wide("open");
    let url_w = to_wide(url);
    unsafe {
        ShellExecuteW(
            ptr::null_mut(),
            op_w.as_ptr(),
            url_w.as_ptr(),
            ptr::null(),
            ptr::null(),
            SW_SHOWNORMAL,
        );
    }
}

pub fn get_programs_folder() -> Option<String> {
    const FOLDERID_PROGRAMS: RawGuid = RawGuid {
        data1: 0xA77F_5D77,
        data2: 0x2E2B,
        data3: 0x44C3,
        data4: [0xA6, 0xA2, 0xAB, 0xA6, 0x01, 0x05, 0x4A, 0x51],
    };
    unsafe {
        let mut raw: *mut u16 = ptr::null_mut();
        let hr = SHGetKnownFolderPath(&FOLDERID_PROGRAMS, 0, ptr::null_mut(), &mut raw);
        if hr == 0 && !raw.is_null() {
            let s = from_wide_ptr(raw);
            CoTaskMemFree(raw as *mut c_void);
            if !s.is_empty() {
                return Some(s);
            }
        }
    }
    std::env::var_os("APPDATA").map(|appdata| {
        std::path::PathBuf::from(appdata)
            .join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs")
            .to_string_lossy()
            .into_owned()
    })
}
