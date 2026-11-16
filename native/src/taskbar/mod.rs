pub mod matcher;

#[cfg(windows)]
pub mod icon;
#[cfg(windows)]
pub mod overlay;
#[cfg(windows)]
pub mod window;

use crate::taskbar::matcher::{drain_control_queue, DrainEvent};

pub fn run_drain_self_test() -> Result<(), String> {
    let cases = [
        (
            "queued sets",
            vec![DrainEvent::Set(2), DrainEvent::Set(4), DrainEvent::Eof],
            4,
            true,
        ),
        (
            "set then stop",
            vec![DrainEvent::Set(3), DrainEvent::Stop, DrainEvent::Eof],
            3,
            true,
        ),
        (
            "stop first",
            vec![DrainEvent::Stop, DrainEvent::Set(9), DrainEvent::Eof],
            1,
            true,
        ),
    ];

    for (label, events, expected_count, expected_stop) in cases {
        let mut count = 1;
        let stop = drain_control_queue(events, &mut count)?;
        if stop != expected_stop || count != expected_count {
            return Err(format!("{label} stop={stop} count={count}"));
        }
    }
    Ok(())
}

#[cfg(windows)]
pub fn run_validate_taskbar() -> Result<(), String> {
    use crate::taskbar::icon::GdiplusGuard;
    use crate::taskbar::overlay::{destroy_hicon, TaskbarListHandle};
    use crate::win32::ComGuard;

    let _com = ComGuard::new_mta()?;
    let _gdip = GdiplusGuard::start()?;
    let _list = TaskbarListHandle::create_and_init()?;
    let icon = icon::render_badge_icon(1)?;
    destroy_hicon(icon);
    Ok(())
}

#[cfg(not(windows))]
pub fn run_validate_taskbar() -> Result<(), String> {
    Err("validate-taskbar is only supported on Windows.".to_string())
}

#[cfg(windows)]
pub fn run_taskbar_badge() -> Result<(), String> {
    use std::io::{self, BufRead};
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    use crate::protocol::{BadgeControl, BadgeStart};
    use crate::taskbar::icon::GdiplusGuard;
    use crate::taskbar::overlay::{BadgeOverlayState, TaskbarListHandle};
    use crate::taskbar::window::{
        collect_owner_pids, find_target_windows, get_foreground_window, is_window,
    };
    use crate::win32::ComGuard;

    let _com = ComGuard::new_mta()?;
    let _gdip = GdiplusGuard::start()?;
    let list = TaskbarListHandle::create_and_init()?;

    let (line_tx, line_rx) = mpsc::channel::<DrainEvent>();
    let mut stdin_lines = io::stdin().lock().lines();
    let Some(first_res) = stdin_lines.next() else {
        return Err("Missing initial badge payload".to_string());
    };
    let first_line = first_res.map_err(|e| format!("Failed to read initial payload: {e}"))?;
    let payload: BadgeStart =
        serde_json::from_str(first_line.trim()).map_err(|e| format!("Invalid badge payload: {e}"))?;

    let mut count = payload.count;
    if !(1..=999).contains(&count) {
        return Err("Invalid badge count".to_string());
    }
    if !(1.0..=1440.0).contains(&payload.max_minutes) {
        return Err("Invalid badge lifetime".to_string());
    }

    // Spawn the non-blocking control reader before collecting owner PIDs so updates arriving during
    // startup are queued and drained before the first paint.
    drop(stdin_lines);
    let _reader_thread = std::thread::spawn(move || {
        let stdin = io::stdin();
        for line in stdin.lock().lines() {
            match line {
                Ok(text) => {
                    let trimmed = text.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<BadgeControl>(trimmed) {
                        Ok(BadgeControl::Stop) => {
                            let _ = line_tx.send(DrainEvent::Stop);
                            return;
                        }
                        Ok(BadgeControl::Set { count }) => {
                            if line_tx.send(DrainEvent::Set(count)).is_err() {
                                return;
                            }
                        }
                        Err(_) => {}
                    }
                }
                Err(_) => break,
            }
        }
        let _ = line_tx.send(DrainEvent::Eof);
    });

    let owners = collect_owner_pids(payload.host_pid);
    let mut queued = Vec::new();
    while let Ok(ev) = line_rx.try_recv() {
        queued.push(ev);
    }
    if drain_control_queue(queued, &mut count)? {
        return Ok(());
    }

    let mut targets = find_target_windows(&payload.window_title, &owners)?;
    // A window the user is already looking at needs no unread badge.
    let fg = get_foreground_window();
    if targets.contains(&fg) {
        targets.clear();
    }
    if targets.is_empty() {
        return Ok(());
    }

    let mut overlay = BadgeOverlayState::new(list);
    overlay.targets = targets;
    overlay.show_badge(count)?;

    let until = Instant::now() + Duration::from_secs_f64(payload.max_minutes * 60.0);
    while !overlay.targets.is_empty() && Instant::now() < until {
        let fg = get_foreground_window();
        if overlay.targets.contains(&fg) {
            break;
        }
        overlay.targets.retain(|&hwnd| is_window(hwnd));
        if overlay.targets.is_empty() {
            break;
        }

        let prev_count = count;
        let mut batch = Vec::new();
        while let Ok(ev) = line_rx.try_recv() {
            batch.push(ev);
        }
        if drain_control_queue(batch, &mut count)? {
            break;
        }
        if count != prev_count {
            overlay.show_badge(count)?;
        }

        // Wait up to 150ms for the next control message so `stop` reacts immediately instead of
        // polling strictly every 150ms.
        match line_rx.recv_timeout(Duration::from_millis(150)) {
            Ok(ev) => {
                let prev = count;
                if drain_control_queue(std::iter::once(ev), &mut count)? {
                    break;
                }
                if count != prev {
                    overlay.show_badge(count)?;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    Ok(())
}

#[cfg(not(windows))]
pub fn run_taskbar_badge() -> Result<(), String> {
    Err("taskbar-badge is only supported on Windows.".to_string())
}
