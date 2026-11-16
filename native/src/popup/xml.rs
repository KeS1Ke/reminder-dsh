use std::fmt::Write;

pub fn validate_app_id(app_id: Option<&str>) -> Result<&str, &'static str> {
    let id = match app_id {
        Some(s) if !s.is_empty() => s,
        _ => "KeS1Ke.DSH",
    };
    if matches!(
        id,
        "KeS1Ke.DSH"
            | "KeS1Ke.DSH.2"
            | "KeS1Ke.DSH.3"
            | "KeS1Ke.DSH.4"
            | "KeS1Ke.DSH.5"
    ) {
        Ok(id)
    } else {
        Err("Unexpected notification identity.")
    }
}

pub fn strip_invalid_xml_chars(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        let code = c as u32;
        let invalid = matches!(code, 0x00..=0x08 | 0x0B | 0x0C | 0x0E..=0x1F | 0xFFFE | 0xFFFF);
        if !invalid {
            out.push(c);
        }
    }
    out
}

pub fn escape_xml_text(input: &str) -> String {
    let cleaned = strip_invalid_xml_chars(input);
    let mut out = String::with_capacity(cleaned.len());
    for ch in cleaned.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(ch),
        }
    }
    out
}

pub fn escape_xml_attr(input: &str) -> String {
    let cleaned = strip_invalid_xml_chars(input);
    let mut out = String::with_capacity(cleaned.len());
    for ch in cleaned.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

fn push_uri_segment_escaped(out: &mut String, s: &str) {
    for b in s.as_bytes() {
        let unreserved = matches!(
            *b,
            b'A'..=b'Z'
                | b'a'..=b'z'
                | b'0'..=b'9'
                | b'-'
                | b'.'
                | b'_'
                | b'~'
                | b'/'
                | b':'
        );
        if unreserved {
            out.push(*b as char);
        } else {
            let _ = write!(out, "%{:02X}", b);
        }
    }
}

pub fn path_to_file_uri(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    let mut out = String::from("file://");
    if let Some(unc_rest) = normalized.strip_prefix("//") {
        push_uri_segment_escaped(&mut out, unc_rest);
    } else if normalized.starts_with('/') {
        push_uri_segment_escaped(&mut out, &normalized);
    } else {
        out.push('/');
        push_uri_segment_escaped(&mut out, &normalized);
    }
    out
}

/// Parses `"C:\...\DeepSeek Harness.exe"` from `HKCR\dsh\shell\open\command` value.
pub fn parse_desktop_exe_from_command(command: &str) -> Option<String> {
    let trimmed = command.trim_start();
    let rest = trimmed.strip_prefix('"')?;
    let end = rest.find('"')?;
    let candidate = &rest[..end];
    if candidate.ends_with("\\DeepSeek Harness.exe") && candidate.len() > "\\DeepSeek Harness.exe".len() {
        Some(candidate.to_string())
    } else {
        None
    }
}

pub struct ToastButtonSpec<'a> {
    pub label: &'a str,
    pub argument: &'a str,
}

pub struct ToastXmlSpec<'a> {
    pub title: &'a str,
    pub message: &'a str,
    pub open: Option<&'a str>,
    pub desktop_present: bool,
    pub icon_path: &'a str,
    pub reply: Option<&'a str>,
    pub reply_placeholder: Option<&'a str>,
    pub reply_label: Option<&'a str>,
    pub approval: &'a [ToastButtonSpec<'a>],
    pub has_sound: bool,
}

pub fn build_toast_xml(spec: &ToastXmlSpec<'_>) -> String {
    let mut xml = String::with_capacity(512);
    xml.push_str("<toast");
    if let Some(open) = spec.open.filter(|s| !s.is_empty()) {
        let _ = write!(
            xml,
            r#" activationType="background" launch="{}""#,
            escape_xml_attr(open)
        );
    } else if spec.desktop_present {
        xml.push_str(r#" activationType="protocol" launch="dsh://open""#);
    }
    xml.push_str(r#"><visual><binding template="ToastGeneric">"#);
    let _ = write!(
        xml,
        r#"<text hint-maxLines="1">{}</text>"#,
        escape_xml_text(spec.title)
    );
    if !spec.message.is_empty() {
        let _ = write!(
            xml,
            r#"<text hint-maxLines="3">{}</text>"#,
            escape_xml_text(spec.message)
        );
    }
    if !spec.desktop_present {
        let icon_uri = path_to_file_uri(spec.icon_path);
        let _ = write!(
            xml,
            r#"<image placement="appLogoOverride" src="{}"/>"#,
            escape_xml_attr(&icon_uri)
        );
    }
    xml.push_str("</binding></visual>");

    let has_reply = spec.reply.is_some_and(|s| !s.is_empty());
    let has_approval = !spec.approval.is_empty();
    if has_reply || has_approval {
        xml.push_str("<actions>");
        if let Some(reply_arg) = spec.reply.filter(|s| !s.is_empty()) {
            let placeholder = spec.reply_placeholder.unwrap_or("");
            let label = spec.reply_label.unwrap_or("");
            let _ = write!(
                xml,
                r#"<input id="reply" type="text" placeHolderContent="{}"/><action content="{}" arguments="{}" activationType="background" hint-inputId="reply"/>"#,
                escape_xml_attr(placeholder),
                escape_xml_attr(label),
                escape_xml_attr(reply_arg),
            );
        } else {
            for btn in spec.approval {
                let _ = write!(
                    xml,
                    r#"<action content="{}" arguments="{}" activationType="background"/>"#,
                    escape_xml_attr(btn.label),
                    escape_xml_attr(btn.argument),
                );
            }
        }
        xml.push_str("</actions>");
    }

    if spec.has_sound {
        xml.push_str(r#"<audio silent="true"/>"#);
    }
    xml.push_str("</toast>");
    xml
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_app_ids() {
        assert_eq!(validate_app_id(None), Ok("KeS1Ke.DSH"));
        assert_eq!(validate_app_id(Some("")), Ok("KeS1Ke.DSH"));
        assert_eq!(validate_app_id(Some("KeS1Ke.DSH.2")), Ok("KeS1Ke.DSH.2"));
        assert_eq!(
            validate_app_id(Some("Other.App")),
            Err("Unexpected notification identity.")
        );
    }

    #[test]
    fn strips_invalid_xml_chars_and_escapes() {
        let dirty = "A\x00B\x08C\x0BD\tE\nF\u{FFFE}G & <ok> \"q\"";
        assert_eq!(
            escape_xml_text(dirty),
            "ABCD\tE\nFG &amp; &lt;ok&gt; \"q\""
        );
        assert_eq!(
            escape_xml_attr(dirty),
            "ABCD\tE\nFG &amp; &lt;ok&gt; &quot;q&quot;"
        );
    }

    #[test]
    fn builds_full_reply_toast_xml() {
        let xml = build_toast_xml(&ToastXmlSpec {
            title: "中文 \" $() ` 标题",
            message: "任务完成 & <已就绪> 🐋\n'hello'",
            open: None,
            desktop_present: false,
            icon_path: r"C:\repo\assets\deepseek-harness.png",
            reply: Some("test-route"),
            reply_placeholder: Some("回复 DSH"),
            reply_label: Some("发送"),
            approval: &[],
            has_sound: false,
        });
        assert!(xml.contains(r#"<binding template="ToastGeneric">"#));
        assert!(xml.contains(r#"<text hint-maxLines="1">中文 " $() ` 标题</text>"#));
        assert!(xml.contains("<text hint-maxLines=\"3\">任务完成 &amp; &lt;已就绪&gt; 🐋\n'hello'</text>"));
        assert!(xml.contains(
            r#"<image placement="appLogoOverride" src="file:///C:/repo/assets/deepseek-harness.png"/>"#
        ));
        assert!(xml.contains(r#"<input id="reply" type="text" placeHolderContent="回复 DSH"/>"#));
        assert!(xml.contains(
            r#"<action content="发送" arguments="test-route" activationType="background" hint-inputId="reply"/>"#
        ));
        assert!(!xml.contains("<audio"));
    }

    #[test]
    fn omits_second_text_when_message_empty_and_silences_sound() {
        let xml = build_toast_xml(&ToastXmlSpec {
            title: "会话标题 & <测试>",
            message: "",
            open: None,
            desktop_present: true,
            icon_path: r"C:\Program Files\reminder-dsh\assets\deepseek-harness.png",
            reply: None,
            reply_placeholder: None,
            reply_label: None,
            approval: &[],
            has_sound: true,
        });
        assert!(xml.contains(r#"<toast activationType="protocol" launch="dsh://open">"#));
        assert!(xml.contains(r#"<text hint-maxLines="1">会话标题 &amp; &lt;测试&gt;</text>"#));
        assert_eq!(xml.matches("<text ").count(), 1);
        assert!(!xml.contains("<image "));
        assert!(xml.contains(r#"<audio silent="true"/>"#));
    }

    #[test]
    fn separates_open_and_approval_actions() {
        let route = format!("{}:{}:open", "a".repeat(32), "b".repeat(32));
        let buttons = [
            ToastButtonSpec {
                label: "允许",
                argument: "allow-route",
            },
            ToastButtonSpec {
                label: "拒绝",
                argument: "reject-route",
            },
        ];
        let xml = build_toast_xml(&ToastXmlSpec {
            title: "会话标题",
            message: "",
            open: Some(&route),
            desktop_present: true,
            icon_path: r"C:\repo\assets\deepseek-harness.png",
            reply: None,
            reply_placeholder: None,
            reply_label: None,
            approval: &buttons,
            has_sound: false,
        });
        assert!(xml.contains(&format!(
            r#"<toast activationType="background" launch="{route}">"#
        )));
        assert!(!xml.contains("dsh://open"));
        assert!(xml.contains(
            r#"<action content="允许" arguments="allow-route" activationType="background"/>"#
        ));
        assert!(xml.contains(
            r#"<action content="拒绝" arguments="reject-route" activationType="background"/>"#
        ));
        assert!(!xml.contains("<input "));
    }

    #[test]
    fn parses_desktop_protocol_command() {
        assert_eq!(
            parse_desktop_exe_from_command(
                r#"  "C:\Users\me\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe" "%1""#
            ),
            Some(r"C:\Users\me\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe".to_string())
        );
        assert_eq!(parse_desktop_exe_from_command(r#""C:\Other\app.exe" "%1""#), None);
        assert_eq!(parse_desktop_exe_from_command(r#""\DeepSeek Harness.exe""#), None);
    }

    #[test]
    fn formats_file_uris_with_percent_encoding() {
        assert_eq!(
            path_to_file_uri(r"C:\My Plugins\DSH\deepseek-harness.png"),
            "file:///C:/My%20Plugins/DSH/deepseek-harness.png"
        );
    }
}
