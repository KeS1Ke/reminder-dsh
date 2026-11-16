pub fn should_send(shift: bool, ctrl: bool, alt: bool, has_text: bool) -> bool {
    has_text && !shift && !ctrl && !alt
}

pub fn is_text_key(vk: u32, ctrl: bool) -> bool {
    if ctrl {
        return vk == 0x56;
    }
    if (0x30..=0x39).contains(&vk) {
        return true;
    }
    if (0x41..=0x5A).contains(&vk) {
        return true;
    }
    if (0x60..=0x6F).contains(&vk) {
        return true;
    }
    if vk == 0x20 {
        return true;
    }
    if (0xBA..=0xC0).contains(&vk) {
        return true;
    }
    if (0xDB..=0xDE).contains(&vk) {
        return true;
    }
    vk == 0xE7
}

/// Backspace/Delete undoes one typed unit and never invents text.
/// Paste and committed Unicode count as one unit.
pub fn note_input(units: i32, vk: u32, ctrl: bool) -> i32 {
    if ctrl && vk == 0x56 {
        return units + 1;
    }
    if ctrl {
        return units;
    }
    if vk == 0x08 || vk == 0x2E {
        return if units > 0 { units - 1 } else { 0 };
    }
    if is_text_key(vk, false) {
        return units + 1;
    }
    units
}

/// Letters arm a possible IME commit. Space or committed Unicode clears it so the following Enter can send.
pub fn note_commit(armed_commit: bool, vk: u32, ctrl: bool) -> bool {
    if ctrl {
        return armed_commit;
    }
    if vk == 0x20 || vk == 0xE7 {
        return false;
    }
    if vk == 0x08 || vk == 0x2E {
        return armed_commit;
    }
    if (0x30..=0x39).contains(&vk)
        || (0x41..=0x5A).contains(&vk)
        || (0x60..=0x69).contains(&vk)
        || vk == 0xE5
    {
        return true;
    }
    armed_commit
}

/// The first Enter while an IME is composing or in native mode belongs to the IME, not to Send.
pub fn pass_enter_to_ime(armed_commit: bool, native_ime: bool, composing: bool) -> bool {
    composing || (armed_commit && native_ime)
}

pub fn is_shell_experience_host_exe(image_path: &str) -> bool {
    let trimmed = image_path.trim_end_matches('\0');
    let file_name = trimmed.rsplit(['\\', '/']).next().unwrap_or(trimmed);
    file_name.eq_ignore_ascii_case("ShellExperienceHost.exe")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enter_sends_reply_and_shift_enter_keeps_newline() {
        assert!(should_send(false, false, false, true));
        assert!(!should_send(true, false, false, true));
        assert!(!should_send(false, true, false, true));
        assert!(!should_send(false, false, true, true));
        assert!(!should_send(false, false, false, false));
    }

    #[test]
    fn reply_text_tracking_and_ime_commit() {
        let u = note_input(0, 0x41, false);
        let u = note_input(u, 0x08, false);
        assert_eq!(u, 0);
        assert_eq!(note_input(0, 0x08, false), 0);
        assert_eq!(note_input(0, 0x56, true), 1);
        assert!(pass_enter_to_ime(true, true, false));
        assert!(!pass_enter_to_ime(true, false, false));
        assert!(pass_enter_to_ime(false, false, true));
        assert!(!note_commit(true, 0x20, false));
        assert!(!note_commit(true, 0xE7, false));
        assert!(note_commit(false, 0x41, false));
    }

    #[test]
    fn matches_shell_experience_host_path() {
        assert!(is_shell_experience_host_exe(
            r"C:\Windows\SystemApps\ShellExperienceHost_cw5n1h2txyewy\ShellExperienceHost.exe"
        ));
        assert!(is_shell_experience_host_exe("shellexperiencehost.exe"));
        assert!(!is_shell_experience_host_exe(r"C:\Windows\explorer.exe"));
    }
}
