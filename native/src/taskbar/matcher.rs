fn is_dash(c: char) -> bool {
    matches!(c, '-' | '\u{2013}' | '\u{2014}')
}

fn has_prefix_boundary(prefix: &str) -> bool {
    if prefix.is_empty() {
        return true;
    }
    let mut chars = prefix.chars().rev();
    let Some(c3) = chars.next() else {
        return false;
    };
    let Some(c2) = chars.next() else {
        return false;
    };
    let Some(c1) = chars.next() else {
        return false;
    };
    c3.is_whitespace() && is_dash(c2) && c1.is_whitespace()
}

fn has_suffix_boundary(suffix: &str) -> bool {
    if suffix.is_empty() {
        return true;
    }
    let mut chars = suffix.chars();
    let Some(c1) = chars.next() else {
        return false;
    };
    let Some(c2) = chars.next() else {
        return false;
    };
    let Some(c3) = chars.next() else {
        return false;
    };
    c1.is_whitespace() && is_dash(c2) && c3.is_whitespace()
}

/// Matches `(?:^|\s[—–-]\s)(?:DeepSeek Harness|DSH(?: Local Build)?)(?:$|\s[-—–]\s)` case-insensitively.
pub fn matches_default_title(name: &str) -> bool {
    let targets = ["deepseek harness", "dsh local build", "dsh"];
    for (idx, _) in name.char_indices() {
        let prefix = &name[..idx];
        if !has_prefix_boundary(prefix) {
            continue;
        }
        let rest = &name[idx..];
        for target in targets {
            let Some(head) = rest.get(..target.len()) else {
                continue;
            };
            if head.eq_ignore_ascii_case(target) {
                let suffix = &rest[target.len()..];
                if has_suffix_boundary(suffix) {
                    return true;
                }
            }
        }
    }
    false
}

pub fn match_window_title(window_title: &str, filter: &str) -> bool {
    if !filter.is_empty() {
        return window_title
            .to_lowercase()
            .contains(&filter.to_lowercase());
    }
    matches_default_title(window_title)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DrainEvent {
    Set(i32),
    Stop,
    Eof,
}

/// Applies already-queued stdin control updates before the first paint or between ticks.
/// Returns `Ok(true)` if the badge should stop, `Ok(false)` otherwise.
pub fn drain_control_queue<I>(events: I, count: &mut i32) -> Result<bool, String>
where
    I: IntoIterator<Item = DrainEvent>,
{
    for ev in events {
        match ev {
            DrainEvent::Eof | DrainEvent::Stop => return Ok(true),
            DrainEvent::Set(next) => {
                if !(1..=999).contains(&next) {
                    return Err("Invalid badge count".to_string());
                }
                *count = next;
            }
        }
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_default_dsh_window_titles() {
        assert!(matches_default_title("DeepSeek Harness"));
        assert!(matches_default_title("deepseek harness"));
        assert!(matches_default_title("DSH"));
        assert!(matches_default_title("DSH Local Build"));
        assert!(matches_default_title("DSH - Google Chrome"));
        assert!(matches_default_title("My Session — DeepSeek Harness"));
        assert!(matches_default_title(
            "Work – DSH Local Build - Microsoft Edge"
        ));
        assert!(!matches_default_title("DSH2 - Notepad"));
        assert!(!matches_default_title("My DSH Window"));
        assert!(!matches_default_title("DSH Helper"));
        assert!(!matches_default_title(""));
    }

    #[test]
    fn custom_filter_matches_case_insensitive_substring() {
        assert!(match_window_title("My Custom 中文 Browser Tab", "中文"));
        assert!(match_window_title("My Custom Tab", "custom"));
        assert!(!match_window_title("Other Window", "custom"));
    }

    #[test]
    fn drain_control_queue_matches_self_tests() {
        let mut count = 1;
        let stop = drain_control_queue(
            [DrainEvent::Set(2), DrainEvent::Set(4), DrainEvent::Eof],
            &mut count,
        )
        .unwrap();
        assert!(stop);
        assert_eq!(count, 4);

        let mut count = 1;
        let stop = drain_control_queue(
            [DrainEvent::Set(3), DrainEvent::Stop, DrainEvent::Eof],
            &mut count,
        )
        .unwrap();
        assert!(stop);
        assert_eq!(count, 3);

        let mut count = 1;
        let stop = drain_control_queue(
            [DrainEvent::Stop, DrainEvent::Set(9), DrainEvent::Eof],
            &mut count,
        )
        .unwrap();
        assert!(stop);
        assert_eq!(count, 1);

        let mut count = 1;
        let stop = drain_control_queue([DrainEvent::Set(5)], &mut count).unwrap();
        assert!(!stop);
        assert_eq!(count, 5);
    }
}
