use std::ffi::c_void;

use windows::core::PCWSTR;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::UI::Shell::{ITaskbarList3, ITaskbarList4, TaskbarList};
use windows::Win32::UI::WindowsAndMessaging::HICON;

use crate::taskbar::icon::{format_badge_text, render_badge_icon};
use crate::taskbar::window::is_window;
use crate::win32::to_wide;

#[link(name = "user32")]
extern "system" {
    fn DestroyIcon(h_icon: *mut c_void) -> i32;
}

pub enum TaskbarListHandle {
    V4(ITaskbarList4),
    V3(ITaskbarList3),
}

impl TaskbarListHandle {
    pub fn create_and_init() -> Result<Self, String> {
        unsafe {
            if let Ok(list4) = CoCreateInstance::<_, ITaskbarList4>(&TaskbarList, None, CLSCTX_INPROC_SERVER) {
                list4
                    .HrInit()
                    .map_err(|e| format!("ITaskbarList4::HrInit failed: {e}"))?;
                return Ok(Self::V4(list4));
            }
            let list3 = CoCreateInstance::<_, ITaskbarList3>(&TaskbarList, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| format!("CoCreateInstance(ITaskbarList3) failed: {e}"))?;
            list3
                .HrInit()
                .map_err(|e| format!("ITaskbarList3::HrInit failed: {e}"))?;
            Ok(Self::V3(list3))
        }
    }

    pub fn set_overlay(&self, hwnd: isize, icon: isize, description: &str) -> Result<(), String> {
        let desc_w = to_wide(description);
        let hwnd_arg = HWND(hwnd as *mut c_void);
        let icon_arg = HICON(icon as *mut c_void);
        let desc_arg = PCWSTR::from_raw(desc_w.as_ptr());
        unsafe {
            match self {
                Self::V4(list4) => list4
                    .SetOverlayIcon(hwnd_arg, icon_arg, desc_arg)
                    .map_err(|e| format!("ITaskbarList4::SetOverlayIcon failed: {e}")),
                Self::V3(list3) => list3
                    .SetOverlayIcon(hwnd_arg, icon_arg, desc_arg)
                    .map_err(|e| format!("ITaskbarList3::SetOverlayIcon failed: {e}")),
            }
        }
    }
}

pub fn destroy_hicon(icon: isize) {
    if icon != 0 {
        unsafe {
            let _ = DestroyIcon(icon as *mut c_void);
        }
    }
}

pub struct BadgeOverlayState {
    list: TaskbarListHandle,
    pub targets: Vec<isize>,
    badge_icon: isize,
}

impl BadgeOverlayState {
    pub fn new(list: TaskbarListHandle) -> Self {
        Self {
            list,
            targets: Vec::new(),
            badge_icon: 0,
        }
    }

    pub fn show_badge(&mut self, value: i32) -> Result<(), String> {
        let icon = render_badge_icon(value)?;
        let desc = format!("{} 个会话已完成", format_badge_text(value));
        for &hwnd in &self.targets {
            if let Err(err) = self.list.set_overlay(hwnd, icon, &desc) {
                destroy_hicon(icon);
                return Err(err);
            }
        }
        // Replace the previous handle only after every window points at the new icon.
        if self.badge_icon != 0 {
            destroy_hicon(self.badge_icon);
        }
        self.badge_icon = icon;
        Ok(())
    }
}

impl Drop for BadgeOverlayState {
    fn drop(&mut self) {
        for &hwnd in &self.targets {
            if is_window(hwnd) {
                let _ = self.list.set_overlay(hwnd, 0, "");
            }
        }
        if self.badge_icon != 0 {
            destroy_hicon(self.badge_icon);
            self.badge_icon = 0;
        }
    }
}
