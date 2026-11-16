pub mod reply_keys_logic;
pub mod xml;

#[cfg(windows)]
pub mod activator;
#[cfg(windows)]
pub mod identity;
#[cfg(windows)]
pub mod reply_keys;
#[cfg(windows)]
pub mod sound;
#[cfg(windows)]
pub mod toast;

#[cfg(windows)]
use std::io::{self, BufRead, BufWriter, Write};
#[cfg(windows)]
use std::sync::{mpsc, Arc, Mutex};

#[cfg(windows)]
use crate::protocol::{ShowToastPayload, ToastCommand, ToastEvent};
#[cfg(windows)]
use crate::win32::ComGuard;

#[cfg(windows)]
pub fn run_toast_host(assets_dir: Option<String>) -> Result<(), String> {
    let _com = ComGuard::new_mta()?;
    let stdout = Arc::new(Mutex::new(BufWriter::new(io::stdout())));
    let emit: activator::EventSender = {
        let stdout = Arc::clone(&stdout);
        Arc::new(move |event: &ToastEvent| {
            let Ok(line) = serde_json::to_string(event) else {
                return false;
            };
            let Ok(mut out) = stdout.lock() else {
                return false;
            };
            if writeln!(out, "{line}").is_err() {
                return false;
            }
            out.flush().is_ok()
        })
    };

    activator::serve(assets_dir.clone(), Arc::clone(&emit))?;
    let _ = emit(&ToastEvent::Ready);

    let (show_tx, show_rx) = mpsc::channel::<ShowToastPayload>();
    let show_emit = Arc::clone(&emit);
    let show_worker = std::thread::spawn(move || {
        while let Ok(payload) = show_rx.recv() {
            let id = payload.id;
            match toast::show_toast_payload(&payload, assets_dir.as_deref(), true) {
                Ok(()) => {
                    let _ = show_emit(&ToastEvent::ShowResult {
                        id,
                        ok: true,
                        error: None,
                    });
                }
                Err(err) => {
                    let _ = show_emit(&ToastEvent::ShowResult {
                        id,
                        ok: false,
                        error: Some(err),
                    });
                }
            }
        }
    });

    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let Ok(line) = line else {
            break;
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<ToastCommand>(trimmed) {
            Ok(ToastCommand::ReplyKeys { armed }) => {
                if armed {
                    reply_keys::arm();
                } else {
                    reply_keys::disarm();
                }
            }
            Ok(ToastCommand::Ack { id, ok }) => {
                activator::resolve_ack(id, ok);
            }
            Ok(ToastCommand::Show(payload)) => {
                let id = payload.id;
                if show_tx.send(payload).is_err() {
                    let _ = emit(&ToastEvent::ShowResult {
                        id,
                        ok: false,
                        error: Some("Toast worker unavailable".to_string()),
                    });
                }
            }
            Err(err) => {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    if let Some(id) = v.get("id").and_then(|x| x.as_u64()) {
                        let _ = emit(&ToastEvent::ShowResult {
                            id,
                            ok: false,
                            error: Some(format!("Invalid toast command: {err}")),
                        });
                        continue;
                    }
                }
                eprintln!("Invalid toast command: {err}");
            }
        }
    }

    drop(show_tx);
    let _ = show_worker.join();
    activator::shutdown();
    Ok(())
}

#[cfg(not(windows))]
pub fn run_toast_host(_assets_dir: Option<String>) -> Result<(), String> {
    Err("toast-host is only supported on Windows.".to_string())
}

#[cfg(windows)]
pub fn run_validate_toast(assets_dir: Option<String>) -> Result<(), String> {
    use std::io::Read;
    let _com = ComGuard::new_mta()?;
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|e| format!("Failed to read stdin: {e}"))?;
    let payload: ShowToastPayload =
        serde_json::from_str(input.trim()).map_err(|e| format!("Invalid JSON payload: {e}"))?;
    let (_app_id, _assets, doc) = toast::build_toast_document(&payload, assets_dir.as_deref())?;
    let xml = doc
        .GetXml()
        .map_err(|e| format!("XmlDocument::GetXml failed: {e}"))?
        .to_string();
    println!("{xml}");
    Ok(())
}

#[cfg(not(windows))]
pub fn run_validate_toast(assets_dir: Option<String>) -> Result<(), String> {
    use std::io::Read;
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|e| format!("Failed to read stdin: {e}"))?;
    let payload: ShowToastPayload =
        serde_json::from_str(input.trim()).map_err(|e| format!("Invalid JSON payload: {e}"))?;
    let _ = xml::validate_app_id(payload.app_id.as_deref()).map_err(str::to_string)?;
    let icon = assets_dir
        .or(payload.assets_dir)
        .map(|d| format!("{d}/deepseek-harness.png"))
        .unwrap_or_else(|| "assets/deepseek-harness.png".to_string());
    let approval_vec: Vec<xml::ToastButtonSpec<'_>> = payload
        .approval
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .map(|b| xml::ToastButtonSpec {
            label: b.label.as_str(),
            argument: b.argument.as_str(),
        })
        .collect();
    let out = xml::build_toast_xml(&xml::ToastXmlSpec {
        title: &payload.title,
        message: &payload.message,
        open: payload.open.as_deref(),
        desktop_present: false,
        icon_path: &icon,
        reply: payload.reply.as_deref(),
        reply_placeholder: payload.reply_placeholder.as_deref(),
        reply_label: payload.reply_label.as_deref(),
        approval: &approval_vec,
        has_sound: payload.sound.as_deref().is_some_and(|s| !s.is_empty()),
    });
    println!("{out}");
    Ok(())
}
