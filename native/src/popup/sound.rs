use std::ffi::c_void;
use std::path::Path;
use std::ptr;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::win32::to_wide;

static SOUND_SEQ: AtomicU64 = AtomicU64::new(1);

#[link(name = "winmm")]
extern "system" {
    fn mciSendStringW(
        lpsz_command: *const u16,
        lpsz_return_string: *mut u16,
        cch_return: u32,
        hwnd_callback: *mut c_void,
    ) -> u32;
}

fn send_mci(cmd: &str) -> u32 {
    let w = to_wide(cmd);
    unsafe { mciSendStringW(w.as_ptr(), ptr::null_mut(), 0, ptr::null_mut()) }
}

fn play_blocking(open_cmd: &str, alias: &str) {
    if send_mci(open_cmd) != 0 {
        return;
    }
    let _ = send_mci(&format!("play {alias} wait"));
    let _ = send_mci(&format!("close {alias}"));
}

pub fn play_sound(path: &str, async_play: bool) {
    if path.contains(['\r', '\n', '"']) || !Path::new(path).is_file() {
        return;
    }
    let seq = SOUND_SEQ.fetch_add(1, Ordering::Relaxed);
    let alias = format!("dsh{}_{seq}", std::process::id());
    let kind = if path.to_ascii_lowercase().ends_with(".mp3") {
        "mpegvideo"
    } else {
        "waveaudio"
    };
    let open_cmd = format!(r#"open "{path}" type {kind} alias {alias}"#);
    if async_play {
        std::thread::spawn(move || {
            play_blocking(&open_cmd, &alias);
        });
    } else {
        play_blocking(&open_cmd, &alias);
    }
}
