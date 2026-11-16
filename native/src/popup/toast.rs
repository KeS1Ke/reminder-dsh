use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use windows::core::HSTRING;
use windows::Data::Xml::Dom::XmlDocument;
use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};

use crate::popup::identity::register_toast_identity;
use crate::popup::sound::play_sound;
use crate::popup::xml::{
    build_toast_xml, parse_desktop_exe_from_command, validate_app_id, ToastButtonSpec,
    ToastXmlSpec,
};
use crate::protocol::ShowToastPayload;
use crate::win32::{reg_read_sz, HKEY_CLASSES_ROOT};

static DESKTOP_PATH: OnceLock<Option<String>> = OnceLock::new();

pub fn get_desktop_path() -> Option<&'static str> {
    DESKTOP_PATH
        .get_or_init(|| {
            let cmd = reg_read_sz(HKEY_CLASSES_ROOT, r"dsh\shell\open\command", None)?;
            let exe = parse_desktop_exe_from_command(&cmd)?;
            if Path::new(&exe).is_file() {
                Some(exe)
            } else {
                None
            }
        })
        .as_deref()
}

pub fn resolve_assets_dir(explicit: Option<&str>) -> Result<PathBuf, String> {
    if let Some(dir) = explicit.filter(|s| !s.is_empty()) {
        let candidate = PathBuf::from(dir);
        if candidate.join("deepseek-harness.png").is_file() {
            return Ok(candidate);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        let mut cur = exe.parent().map(Path::to_path_buf);
        for _ in 0..4 {
            if let Some(dir) = &cur {
                let candidate = dir.join("assets");
                if candidate.join("deepseek-harness.png").is_file() {
                    return Ok(candidate);
                }
                cur = dir.parent().map(Path::to_path_buf);
            } else {
                break;
            }
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        let candidate = cwd.join("assets");
        if candidate.join("deepseek-harness.png").is_file() {
            return Ok(candidate);
        }
    }
    Err("The DSH notification icon is missing.".to_string())
}

pub fn build_toast_document(
    payload: &ShowToastPayload,
    default_assets_dir: Option<&str>,
) -> Result<(String, PathBuf, XmlDocument), String> {
    let app_id = validate_app_id(payload.app_id.as_deref()).map_err(str::to_string)?;
    let assets_dir =
        resolve_assets_dir(payload.assets_dir.as_deref().or(default_assets_dir))?;
    let icon_path = assets_dir
        .join("deepseek-harness.png")
        .canonicalize()
        .unwrap_or_else(|_| assets_dir.join("deepseek-harness.png"));
    if !icon_path.is_file() {
        return Err("The DSH notification icon is missing.".to_string());
    }
    let icon_str = icon_path.to_string_lossy();
    // Strip Windows extended-length UNC prefix `\\?\` from canonicalize() before building file:// URI.
    let clean_icon = icon_str.strip_prefix(r"\\?\").unwrap_or(&icon_str);
    let desktop = get_desktop_path();

    let approval_vec: Vec<ToastButtonSpec<'_>> = payload
        .approval
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .map(|b| ToastButtonSpec {
            label: b.label.as_str(),
            argument: b.argument.as_str(),
        })
        .collect();

    let xml_str = build_toast_xml(&ToastXmlSpec {
        title: &payload.title,
        message: &payload.message,
        open: payload.open.as_deref(),
        desktop_present: desktop.is_some(),
        icon_path: clean_icon,
        reply: payload.reply.as_deref(),
        reply_placeholder: payload.reply_placeholder.as_deref(),
        reply_label: payload.reply_label.as_deref(),
        approval: &approval_vec,
        has_sound: payload.sound.as_deref().is_some_and(|s| !s.is_empty()),
    });

    let doc = XmlDocument::new().map_err(|e| format!("XmlDocument::new failed: {e}"))?;
    doc.LoadXml(&HSTRING::from(xml_str))
        .map_err(|e| format!("XmlDocument::LoadXml failed: {e}"))?;
    Ok((app_id.to_string(), assets_dir, doc))
}

pub fn show_toast_payload(
    payload: &ShowToastPayload,
    default_assets_dir: Option<&str>,
    async_sound: bool,
) -> Result<(), String> {
    let (app_id, assets_dir, doc) = build_toast_document(payload, default_assets_dir)?;
    let toast = ToastNotification::CreateToastNotification(&doc)
        .map_err(|e| format!("CreateToastNotification failed: {e}"))?;
    let desktop = get_desktop_path();
    register_toast_identity(&app_id, &assets_dir, desktop)?;
    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(&app_id))
        .map_err(|e| format!("CreateToastNotifierWithId failed: {e}"))?;
    notifier
        .Show(&toast)
        .map_err(|e| format!("ToastNotifier::Show failed: {e}"))?;
    if let Some(sound_path) = payload.sound.as_deref().filter(|s| !s.is_empty()) {
        play_sound(sound_path, async_sound);
    }
    Ok(())
}

pub fn show_failure_toast(approval: bool, default_assets_dir: Option<&str>) {
    let payload = if approval {
        ShowToastPayload {
            title: "DeepSeek Harness 审批未提交".to_string(),
            message: "请回到 DeepSeek Harness 查看待处理请求。".to_string(),
            ..Default::default()
        }
    } else {
        ShowToastPayload {
            title: "DSH 回复未确认".to_string(),
            message: "请回到原 DSH 会话检查消息，或在那里发送。".to_string(),
            ..Default::default()
        }
    };
    let _ = show_toast_payload(&payload, default_assets_dir, false);
}
