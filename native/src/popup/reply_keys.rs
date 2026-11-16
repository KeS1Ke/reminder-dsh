use std::cell::RefCell;
use std::ffi::c_void;
use std::ptr;
use std::sync::atomic::{AtomicI32, AtomicU32, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use crate::popup::reply_keys_logic::{
    is_shell_experience_host_exe, note_commit, note_input, pass_enter_to_ime, should_send,
};
use crate::win32::{
    from_wide_buf, CloseHandle, GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW,
    PROCESS_QUERY_LIMITED_INFORMATION,
};

const VK_RETURN: u32 = 0x0D;
const VK_SHIFT: i32 = 0x10;
const VK_CONTROL: i32 = 0x11;
const VK_MENU: i32 = 0x12;

const WH_KEYBOARD_LL: i32 = 13;
const EVENT_SYSTEM_FOREGROUND: u32 = 0x0003;
const WM_KEYDOWN: usize = 0x0100;
const WM_QUIT: u32 = 0x0012;
const SEND_MESSAGE_ID: u32 = 0x8001;
const REEVALUATE_ID: u32 = 0x8002;
const LLKHF_INJECTED: u32 = 0x10;
const KEYEVENTF_KEYUP: u32 = 2;
const GCS_COMPSTR: u32 = 8;
const WM_IME_CONTROL: u32 = 0x0283;
const SMTO_ABORTIFHUNG: u32 = 0x0002;

#[repr(C)]
struct KbdLlHookStruct {
    vk_code: u32,
    scan_code: u32,
    flags: u32,
    time: u32,
    dw_extra_info: usize,
}

#[repr(C)]
struct Point {
    x: i32,
    y: i32,
}

#[repr(C)]
struct Msg {
    hwnd: *mut c_void,
    message: u32,
    w_param: usize,
    l_param: isize,
    time: u32,
    pt: Point,
}

type HookProc = unsafe extern "system" fn(i32, usize, isize) -> isize;
type WinEventProc =
    unsafe extern "system" fn(*mut c_void, u32, *mut c_void, i32, i32, u32, u32);

#[link(name = "user32")]
extern "system" {
    fn SetWindowsHookExW(
        id_hook: i32,
        lpfn: HookProc,
        hmod: *mut c_void,
        dw_thread_id: u32,
    ) -> *mut c_void;
    fn UnhookWindowsHookEx(hhk: *mut c_void) -> i32;
    fn SetWinEventHook(
        event_min: u32,
        event_max: u32,
        hmod_win_event_proc: *mut c_void,
        pfn_win_event_proc: WinEventProc,
        id_process: u32,
        id_thread: u32,
        dw_flags: u32,
    ) -> *mut c_void;
    fn UnhookWinEvent(h_win_event_hook: *mut c_void) -> i32;
    fn CallNextHookEx(hhk: *mut c_void, n_code: i32, w_param: usize, l_param: isize) -> isize;
    fn GetForegroundWindow() -> *mut c_void;
    fn GetAsyncKeyState(v_key: i32) -> i16;
    fn GetWindowThreadProcessId(hwnd: *mut c_void, lpdw_process_id: *mut u32) -> u32;
    fn GetClassNameW(hwnd: *mut c_void, lp_class_name: *mut u16, n_max_count: i32) -> i32;
    fn PeekMessageW(
        lp_msg: *mut Msg,
        hwnd: *mut c_void,
        w_msg_filter_min: u32,
        w_msg_filter_max: u32,
        w_remove_msg: u32,
    ) -> i32;
    fn GetMessageW(
        lp_msg: *mut Msg,
        hwnd: *mut c_void,
        w_msg_filter_min: u32,
        w_msg_filter_max: u32,
    ) -> i32;
    fn TranslateMessage(lp_msg: *const Msg) -> i32;
    fn DispatchMessageW(lp_msg: *const Msg) -> isize;
    fn PostThreadMessageW(id_thread: u32, msg: u32, w_param: usize, l_param: isize) -> i32;
    fn keybd_event(b_vk: u8, b_scan: u8, dw_flags: u32, dw_extra_info: usize);
    fn SendMessageTimeoutW(
        hwnd: *mut c_void,
        msg: u32,
        w_param: usize,
        l_param: isize,
        fu_flags: u32,
        u_timeout: u32,
        lpdw_result: *mut usize,
    ) -> isize;
}

#[link(name = "imm32")]
extern "system" {
    fn ImmGetContext(hwnd: *mut c_void) -> *mut c_void;
    fn ImmReleaseContext(hwnd: *mut c_void, h_imc: *mut c_void) -> i32;
    fn ImmGetCompositionStringW(
        h_imc: *mut c_void,
        dw_index: u32,
        lp_buf: *mut c_void,
        dw_buf_len: u32,
    ) -> i32;
    fn ImmGetDefaultIMEWnd(hwnd: *mut c_void) -> *mut c_void;
}

static ARMED: AtomicI32 = AtomicI32::new(0);
static THREAD_ID: AtomicU32 = AtomicU32::new(0);
static WORKER: Mutex<Option<JoinHandle<()>>> = Mutex::new(None);

struct HookState {
    pending_units: i32,
    commit_pending: bool,
    hook: *mut c_void,
    foreground_hook: *mut c_void,
    seen_hwnd: *mut c_void,
    seen_notification: bool,
}

impl Default for HookState {
    fn default() -> Self {
        Self {
            pending_units: 0,
            commit_pending: false,
            hook: ptr::null_mut(),
            foreground_hook: ptr::null_mut(),
            seen_hwnd: ptr::null_mut(),
            seen_notification: false,
        }
    }
}

thread_local! {
    static HOOK_STATE: RefCell<HookState> = RefCell::new(HookState::default());
}

pub fn arm() {
    ARMED.fetch_add(1, Ordering::AcqRel);
    nudge();
}

pub fn disarm() {
    let mut prev = ARMED.load(Ordering::Acquire);
    while prev > 0 {
        match ARMED.compare_exchange_weak(prev, prev - 1, Ordering::AcqRel, Ordering::Acquire) {
            Ok(_) => break,
            Err(actual) => prev = actual,
        }
    }
    nudge();
}

fn nudge() {
    let tid = THREAD_ID.load(Ordering::Acquire);
    if tid != 0 {
        unsafe {
            PostThreadMessageW(tid, REEVALUATE_ID, 0, 0);
        }
    }
}

pub fn start() {
    let Ok(mut slot) = WORKER.lock() else {
        return;
    };
    if slot.is_some() {
        return;
    }
    let ready = Arc::new((Mutex::new(false), Condvar::new()));
    let ready_tx = Arc::clone(&ready);
    let handle = std::thread::spawn(move || {
        hook_loop(ready_tx);
    });
    *slot = Some(handle);
    let deadline = Instant::now() + Duration::from_secs(5);
    if let Ok(mut guard) = ready.0.lock() {
        while !*guard {
            let now = Instant::now();
            if now >= deadline {
                break;
            }
            let (next_g, timeout_res) = ready
                .1
                .wait_timeout(guard, deadline - now)
                .unwrap_or_else(|e| e.into_inner());
            guard = next_g;
            if timeout_res.timed_out() {
                break;
            }
        }
    };
}

pub fn stop() {
    let tid = THREAD_ID.load(Ordering::Acquire);
    if tid != 0 {
        unsafe {
            PostThreadMessageW(tid, WM_QUIT, 0, 0);
        }
    }
    if let Ok(mut slot) = WORKER.lock() {
        if let Some(handle) = slot.take() {
            let _ = handle.join();
        }
    }
}

fn signal_ready(ready: &Arc<(Mutex<bool>, Condvar)>) {
    if let Ok(mut guard) = ready.0.lock() {
        *guard = true;
        ready.1.notify_all();
    }
}

fn down(vk: i32) -> bool {
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}

fn is_notification_window(st: &mut HookState, hwnd: *mut c_void) -> bool {
    if hwnd.is_null() {
        return false;
    }
    if hwnd == st.seen_hwnd {
        return st.seen_notification;
    }
    st.seen_hwnd = hwnd;
    st.seen_notification = false;

    let mut cls_buf = [0u16; 64];
    let len = unsafe { GetClassNameW(hwnd, cls_buf.as_mut_ptr(), cls_buf.len() as i32) };
    if len <= 0 || from_wide_buf(&cls_buf[..len as usize]) != "Windows.UI.Core.CoreWindow" {
        return false;
    }

    let mut pid: u32 = 0;
    unsafe {
        GetWindowThreadProcessId(hwnd, &mut pid);
    }
    if pid == 0 {
        return false;
    }

    let proc_handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if proc_handle.is_null() {
        return false;
    }
    let mut name_buf = [0u16; 512];
    let mut size = name_buf.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(proc_handle, 0, name_buf.as_mut_ptr(), &mut size) };
    unsafe {
        CloseHandle(proc_handle);
    }
    if ok != 0 && size > 0 {
        let exe_path = from_wide_buf(&name_buf[..size as usize]);
        st.seen_notification = is_shell_experience_host_exe(&exe_path);
    }
    st.seen_notification
}

fn context_composing(hwnd: *mut c_void) -> bool {
    let ctx = unsafe { ImmGetContext(hwnd) };
    if ctx.is_null() {
        return false;
    }
    let len = unsafe { ImmGetCompositionStringW(ctx, GCS_COMPSTR, ptr::null_mut(), 0) };
    unsafe {
        ImmReleaseContext(hwnd, ctx);
    }
    len > 0
}

fn composing(hwnd: *mut c_void) -> bool {
    if context_composing(hwnd) {
        return true;
    }
    let ime = unsafe { ImmGetDefaultIMEWnd(hwnd) };
    !ime.is_null() && ime != hwnd && context_composing(ime)
}

fn native_ime(hwnd: *mut c_void) -> bool {
    let ime = unsafe { ImmGetDefaultIMEWnd(hwnd) };
    if ime.is_null() {
        return false;
    }
    let mut mode: usize = 0;
    let ok = unsafe {
        SendMessageTimeoutW(
            ime,
            WM_IME_CONTROL,
            0x0001,
            0,
            SMTO_ABORTIFHUNG,
            15,
            &mut mode,
        )
    };
    ok != 0 && (mode & 1) != 0
}

fn tap_ctrl_enter() {
    unsafe {
        keybd_event(VK_CONTROL as u8, 0, 0, 0);
        keybd_event(VK_RETURN as u8, 0, 0, 0);
        keybd_event(VK_RETURN as u8, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL as u8, 0, KEYEVENTF_KEYUP, 0);
    }
}

fn install_if_needed() {
    HOOK_STATE.with(|cell| {
        let mut st = cell.borrow_mut();
        let fg = unsafe { GetForegroundWindow() };
        let want = ARMED.load(Ordering::Acquire) > 0 && is_notification_window(&mut st, fg);
        if !want {
            st.pending_units = 0;
            st.commit_pending = false;
        }
        if want {
            if st.hook.is_null() {
                st.hook = unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, on_key, ptr::null_mut(), 0) };
            }
        } else if !st.hook.is_null() {
            unsafe {
                UnhookWindowsHookEx(st.hook);
            }
            st.hook = ptr::null_mut();
        }
    });
}

fn swallow_enter(w_param: usize, l_param: isize) -> bool {
    if w_param != WM_KEYDOWN || l_param == 0 {
        return false;
    }
    let key = unsafe { &*(l_param as *const KbdLlHookStruct) };
    let injected = (key.flags & LLKHF_INJECTED) != 0;

    HOOK_STATE.with(|cell| {
        let mut st = cell.borrow_mut();
        if ARMED.load(Ordering::Acquire) <= 0 {
            st.pending_units = 0;
            st.commit_pending = false;
            return false;
        }
        let fg = unsafe { GetForegroundWindow() };
        let notification = is_notification_window(&mut st, fg);
        let ctrl = down(VK_CONTROL);
        let alt = down(VK_MENU);
        let shift = down(VK_SHIFT);
        if !notification {
            st.pending_units = 0;
            st.commit_pending = false;
            return false;
        }
        if injected {
            if key.vk_code != VK_RETURN {
                st.pending_units = note_input(st.pending_units, key.vk_code, ctrl);
                st.commit_pending = note_commit(st.commit_pending, key.vk_code, ctrl);
            }
            return false;
        }
        if key.vk_code != VK_RETURN {
            st.pending_units = note_input(st.pending_units, key.vk_code, ctrl);
            st.commit_pending = note_commit(st.commit_pending, key.vk_code, ctrl);
            return false;
        }
        if !should_send(shift, ctrl, alt, st.pending_units > 0) {
            return false;
        }
        let is_composing = composing(fg);
        let is_native = !is_composing && st.commit_pending && native_ime(fg);
        if pass_enter_to_ime(st.commit_pending, is_native, is_composing) {
            st.commit_pending = false;
            return false;
        }
        st.pending_units = 0;
        st.commit_pending = false;
        true
    })
}

unsafe extern "system" fn on_foreground(
    _event_hook: *mut c_void,
    _event_type: u32,
    _hwnd: *mut c_void,
    id_object: i32,
    _id_child: i32,
    _event_thread: u32,
    _time: u32,
) {
    if id_object == 0 {
        install_if_needed();
    }
}

unsafe extern "system" fn on_key(code: i32, w_param: usize, l_param: isize) -> isize {
    if code >= 0 && swallow_enter(w_param, l_param) {
        let tid = THREAD_ID.load(Ordering::Acquire);
        if tid != 0 {
            PostThreadMessageW(tid, SEND_MESSAGE_ID, 0, 0);
        }
        return 1;
    }
    let hook = HOOK_STATE.with(|cell| cell.borrow().hook);
    CallNextHookEx(hook, code, w_param, l_param)
}

fn hook_loop(ready: Arc<(Mutex<bool>, Condvar)>) {
    unsafe {
        let mut msg = Msg {
            hwnd: ptr::null_mut(),
            message: 0,
            w_param: 0,
            l_param: 0,
            time: 0,
            pt: Point { x: 0, y: 0 },
        };
        PeekMessageW(&mut msg, ptr::null_mut(), 0, 0, 0);
        let tid = GetCurrentThreadId();
        THREAD_ID.store(tid, Ordering::Release);

        let fg_hook = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            ptr::null_mut(),
            on_foreground,
            0,
            0,
            0,
        );
        HOOK_STATE.with(|cell| {
            cell.borrow_mut().foreground_hook = fg_hook;
        });
        install_if_needed();
        signal_ready(&ready);

        while GetMessageW(&mut msg, ptr::null_mut(), 0, 0) > 0 {
            if msg.message == REEVALUATE_ID {
                install_if_needed();
            } else if msg.message == SEND_MESSAGE_ID {
                tap_ctrl_enter();
            } else {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }

        HOOK_STATE.with(|cell| {
            let mut st = cell.borrow_mut();
            if !st.hook.is_null() {
                UnhookWindowsHookEx(st.hook);
                st.hook = ptr::null_mut();
            }
            if !st.foreground_hook.is_null() {
                UnhookWinEvent(st.foreground_hook);
                st.foreground_hook = ptr::null_mut();
            }
        });
        THREAD_ID.store(0, Ordering::Release);
    }
}
