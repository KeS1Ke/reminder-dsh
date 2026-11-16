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

/// Only an active IME composition string should consume Enter instead of sending.
pub fn pass_enter_to_ime(composing: bool) -> bool {
    composing
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
    fn reply_text_tracking_sends_on_first_enter_unless_composing() {
        let u = note_input(0, 0x41, false);
        let u = note_input(u, 0x31, false); // e.g. IME candidate selection via digit 1
        assert!(should_send(false, false, false, u > 0));
        assert!(!pass_enter_to_ime(false));
        assert!(pass_enter_to_ime(true));

        let u = note_input(0, 0x41, false);
        let u = note_input(u, 0x08, false);
        assert_eq!(u, 0);
        assert_eq!(note_input(0, 0x08, false), 0);
        assert_eq!(note_input(0, 0x56, true), 1);
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
