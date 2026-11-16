use std::collections::HashSet;
use std::ffi::c_void;
use std::fs;
use std::path::{Path, PathBuf};
use std::ptr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use windows::core::{Interface, GUID, PCWSTR};
use windows::Win32::Foundation::PROPERTYKEY;
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::System::Com::{CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

use crate::win32::{
    from_wide_buf, get_programs_folder, reg_create_hkcu, reg_query_sz, reg_set_sz, to_wide,
    GetLastError, MoveFileExW, SHChangeNotify, MOVEFILE_REPLACE_EXISTING,
};

pub const ACTIVATOR_CLSID_STR: &str = "{BD86FD58-A2BF-430E-A8D9-8D20238ED61A}";
const ACTIVATOR_GUID: GUID = GUID::from_u128(0xBD86FD58_A2BF_430E_A8D9_8D20238ED61A);
const PKEY_AUMID_FMTID: GUID = GUID::from_u128(0x9F4C2855_9F79_4B39_A8D0_E1D42DE1D5F3);

const VT_LPWSTR: u16 = 31;
const VT_CLSID: u16 = 72;
const SHCNE_CREATE: i32 = 0x0000_0002;
const SHCNE_UPDATEITEM: i32 = 0x0000_2000;
const SHCNF_PATHW: u32 = 0x0005;
const SHCNF_FLUSH: u32 = 0x1000;

#[repr(C)]
struct RawPropVariant {
    vt: u16,
    reserved1: u16,
    reserved2: u16,
    reserved3: u16,
    data: *mut c_void,
    padding: usize,
}

static REGISTERED: OnceLock<Mutex<HashSet<(String, Option<String>)>>> = OnceLock::new();
static STAGED_SEQ: AtomicU64 = AtomicU64::new(1);

fn read_shortcut_icon_location(link_path: &Path) -> Option<String> {
    let path_w = to_wide(&link_path.to_string_lossy());
    unsafe {
        let shell_link: IShellLinkW =
            CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let file: IPersistFile = shell_link.cast().ok()?;
        file.Load(PCWSTR::from_raw(path_w.as_ptr()), STGM(0)).ok()?;
        let mut buf = vec![0u16; 1024];
        let mut icon_index: i32 = 0;
        shell_link
            .GetIconLocation(&mut buf, &mut icon_index)
            .ok()?;
        let icon_path = from_wide_buf(&buf);
        if icon_path.is_empty() {
            None
        } else {
            Some(format!("{icon_path},{icon_index}"))
        }
    }
}

fn write_and_swap_shortcut(
    staged: &Path,
    destination: &Path,
    target_exe: &str,
    icon_source: &str,
    app_id: &str,
) -> Result<(), String> {
    let staged_w = to_wide(&staged.to_string_lossy());
    let dest_w = to_wide(&destination.to_string_lossy());
    let target_w = to_wide(target_exe);
    let icon_w = to_wide(icon_source);
    let app_id_w = to_wide(app_id);

    unsafe {
        let shell_link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
            .map_err(|e| format!("CoCreateInstance(ShellLink) failed: {e}"))?;
        shell_link
            .SetPath(PCWSTR::from_raw(target_w.as_ptr()))
            .map_err(|e| format!("IShellLinkW::SetPath failed: {e}"))?;
        shell_link
            .SetIconLocation(PCWSTR::from_raw(icon_w.as_ptr()), 0)
            .map_err(|e| format!("IShellLinkW::SetIconLocation failed: {e}"))?;

        let store: IPropertyStore = shell_link
            .cast()
            .map_err(|e| format!("QueryInterface(IPropertyStore) failed: {e}"))?;

        let key_id = PROPERTYKEY {
            fmtid: PKEY_AUMID_FMTID,
            pid: 5,
        };
        let pv_id = RawPropVariant {
            vt: VT_LPWSTR,
            reserved1: 0,
            reserved2: 0,
            reserved3: 0,
            data: app_id_w.as_ptr() as *mut c_void,
            padding: 0,
        };
        store
            .SetValue(
                &key_id,
                &pv_id as *const RawPropVariant as *const PROPVARIANT,
            )
            .map_err(|e| format!("IPropertyStore::SetValue(AUMID) failed: {e}"))?;

        let mut activator_guid = ACTIVATOR_GUID;
        let key_clsid = PROPERTYKEY {
            fmtid: PKEY_AUMID_FMTID,
            pid: 26,
        };
        let pv_clsid = RawPropVariant {
            vt: VT_CLSID,
            reserved1: 0,
            reserved2: 0,
            reserved3: 0,
            data: (&mut activator_guid as *mut GUID) as *mut c_void,
            padding: 0,
        };
        store
            .SetValue(
                &key_clsid,
                &pv_clsid as *const RawPropVariant as *const PROPVARIANT,
            )
            .map_err(|e| format!("IPropertyStore::SetValue(ToastActivatorCLSID) failed: {e}"))?;

        store
            .Commit()
            .map_err(|e| format!("IPropertyStore::Commit failed: {e}"))?;

        let file: IPersistFile = shell_link
            .cast()
            .map_err(|e| format!("QueryInterface(IPersistFile) failed: {e}"))?;
        file.Save(PCWSTR::from_raw(staged_w.as_ptr()), true)
            .map_err(|e| format!("IPersistFile::Save failed: {e}"))?;
    }

    let replaced = destination.exists();
    let moved = unsafe {
        MoveFileExW(
            staged_w.as_ptr(),
            dest_w.as_ptr(),
            MOVEFILE_REPLACE_EXISTING,
        )
    };
    if moved == 0 {
        let err = unsafe { GetLastError() };
        return Err(format!("MoveFileExW failed with Win32 error {err}"));
    }
    unsafe {
        SHChangeNotify(
            if replaced {
                SHCNE_UPDATEITEM
            } else {
                SHCNE_CREATE
            },
            SHCNF_PATHW | SHCNF_FLUSH,
            dest_w.as_ptr() as *const c_void,
            ptr::null(),
        );
    }
    Ok(())
}

pub fn register_toast_identity(
    app_id: &str,
    assets_dir: &Path,
    desktop: Option<&str>,
) -> Result<(), String> {
    let cache = REGISTERED.get_or_init(|| Mutex::new(HashSet::new()));
    let marker = (app_id.to_string(), desktop.map(ToString::to_string));
    if let Ok(guard) = cache.lock() {
        if guard.contains(&marker) {
            return Ok(());
        }
    }

    let icon_png = assets_dir.join("deepseek-harness.png");
    let icon_png_str = icon_png.to_string_lossy().into_owned();
    let icon_ico = assets_dir.join("deepseek-harness.ico");
    let icon_ico_str = if icon_ico.is_file() {
        Some(icon_ico.to_string_lossy().into_owned())
    } else {
        None
    };

    let reg_path = format!("Software\\Classes\\AppUserModelId\\{app_id}");
    let key = reg_create_hkcu(&reg_path)?;
    reg_set_sz(key.0, "DisplayName", "DeepSeek Harness")?;
    reg_set_sz(key.0, "IconUri", &icon_png_str)?;
    reg_set_sz(key.0, "CustomActivator", ACTIVATOR_CLSID_STR)?;

    if let Some(desktop_exe) = desktop {
        if let Some(programs) = get_programs_folder() {
            let directory = PathBuf::from(programs).join("DeepSeek Harness Notifications");
            let suffix = if app_id == "KeS1Ke.DSH" {
                String::new()
            } else if let Some(rest) = app_id.strip_prefix("KeS1Ke.DSH.") {
                format!(" {rest}")
            } else {
                String::new()
            };
            let link = directory.join(format!("DeepSeek Harness{suffix}.lnk"));
            let icon_source = icon_ico_str.as_deref().unwrap_or(desktop_exe);
            let expected_icon = format!("{icon_source},0");
            let current_icon = if link.is_file() {
                read_shortcut_icon_location(&link)
            } else {
                None
            };
            let same_icon = current_icon
                .as_deref()
                .is_some_and(|c| c.to_lowercase() == expected_icon.to_lowercase());
            let same_target = reg_query_sz(key.0, Some("DesktopShortcutTarget"))
                .as_deref()
                == Some(desktop_exe);

            if !link.is_file() || !same_target || !same_icon {
                fs::create_dir_all(&directory)
                    .map_err(|e| format!("Failed to create Start Menu folder: {e}"))?;
                let seq = STAGED_SEQ.fetch_add(1, Ordering::Relaxed);
                let staged =
                    directory.join(format!(".register-{}-{seq}.lnk", std::process::id()));
                let res = write_and_swap_shortcut(&staged, &link, desktop_exe, icon_source, app_id);
                let _ = fs::remove_file(&staged);
                res?;
                reg_set_sz(key.0, "DesktopShortcutTarget", desktop_exe)?;
            }
        }
    }

    if let Ok(mut guard) = cache.lock() {
        guard.insert(marker);
    }
    Ok(())
}
