use std::collections::{HashMap, HashSet};
use std::ffi::c_void;
use std::mem::size_of;

use crate::taskbar::matcher::match_window_title;
use crate::win32::{
    CloseHandle, CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, ProcessEntry32W,
    INVALID_HANDLE_VALUE, TH32CS_SNAPPROCESS,
};

#[link(name = "user32")]
extern "system" {
    fn EnumWindows(
        lp_enum_func: unsafe extern "system" fn(*mut c_void, isize) -> i32,
        l_param: isize,
    ) -> i32;
    fn IsWindowVisible(h_wnd: *mut c_void) -> i32;
    fn GetWindowTextW(h_wnd: *mut c_void, lp_string: *mut u16, n_max_count: i32) -> i32;
    fn GetWindowThreadProcessId(h_wnd: *mut c_void, lpdw_process_id: *mut u32) -> u32;
    fn GetForegroundWindow() -> *mut c_void;
    fn IsWindow(h_wnd: *mut c_void) -> i32;
}

pub fn get_foreground_window() -> isize {
    unsafe { GetForegroundWindow() as isize }
}

pub fn is_window(hwnd: isize) -> bool {
    if hwnd == 0 {
        return false;
    }
    unsafe { IsWindow(hwnd as *mut c_void) != 0 }
}

pub fn collect_owner_pids(host_pid: u32) -> HashSet<u32> {
    let mut owners = HashSet::new();
    if host_pid == 0 {
        return owners;
    }

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE || snapshot.is_null() {
        owners.insert(host_pid);
        return owners;
    }

    let mut parents = HashMap::<u32, u32>::new();
    let mut entry: ProcessEntry32W = unsafe { std::mem::zeroed() };
    entry.dw_size = size_of::<ProcessEntry32W>() as u32;
    let mut ok = unsafe { Process32FirstW(snapshot, &mut entry) };
    while ok != 0 {
        parents.insert(entry.th32_process_id, entry.th32_parent_process_id);
        entry.dw_size = size_of::<ProcessEntry32W>() as u32;
        ok = unsafe { Process32NextW(snapshot, &mut entry) };
    }
    unsafe {
        CloseHandle(snapshot);
    }

    let mut pid = host_pid;
    for _ in 0..12 {
        if pid == 0 || !owners.insert(pid) {
            break;
        }
        match parents.get(&pid) {
            Some(&ppid) => pid = ppid,
            None => break,
        }
    }
    owners
}

struct EnumContext<'a> {
    filter: &'a str,
    owners: &'a HashSet<u32>,
    matches: Vec<isize>,
    owned: Vec<isize>,
}

unsafe extern "system" fn enum_window_proc(hwnd: *mut c_void, lparam: isize) -> i32 {
    if IsWindowVisible(hwnd) == 0 {
        return 1;
    }
    let ctx = &mut *(lparam as *mut EnumContext<'_>);
    let mut buf = [0u16; 2048];
    let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
    let title = if len > 0 {
        String::from_utf16_lossy(&buf[..(len as usize).min(buf.len())])
    } else {
        String::new()
    };
    if !match_window_title(&title, ctx.filter) {
        return 1;
    }
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, &mut pid);
    let handle = hwnd as isize;
    ctx.matches.push(handle);
    if ctx.owners.contains(&pid) {
        ctx.owned.push(handle);
    }
    1
}

pub fn find_target_windows(filter: &str, owners: &HashSet<u32>) -> Result<Vec<isize>, String> {
    let mut ctx = EnumContext {
        filter,
        owners,
        matches: Vec::new(),
        owned: Vec::new(),
    };
    unsafe {
        EnumWindows(enum_window_proc, (&mut ctx as *mut EnumContext<'_>) as isize);
    }
    if !ctx.owned.is_empty() {
        return Ok(ctx.owned);
    }
    if ctx.matches.len() > 1 {
        return Err(
            "匹配到多个 DSH 窗口，请在提醒设置中填写更具体的目标窗口标题。".to_string(),
        );
    }
    if ctx.matches.is_empty() {
        return Err(
            "未找到 DSH 窗口。请让浏览器显示 DSH 标签页，或在提醒设置中填写目标窗口标题。"
                .to_string(),
        );
    }
    Ok(ctx.matches)
}
