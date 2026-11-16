use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalButton {
    pub label: String,
    pub argument: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct ShowToastPayload {
    pub id: u64,
    pub title: String,
    pub message: String,
    pub app_id: Option<String>,
    pub open: Option<String>,
    pub reply: Option<String>,
    pub reply_placeholder: Option<String>,
    pub reply_label: Option<String>,
    pub approval: Option<Vec<ApprovalButton>>,
    pub sound: Option<String>,
    pub assets_dir: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ToastCommand {
    Show(ShowToastPayload),
    ReplyKeys { armed: bool },
    Ack { id: u64, ok: bool },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActivateInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ToastEvent {
    Ready,
    ShowResult {
        id: u64,
        ok: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    Activate {
        id: u64,
        argument: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        input: Option<ActivateInput>,
    },
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BadgeStart {
    pub host_pid: u32,
    #[serde(default)]
    pub window_title: String,
    pub count: i32,
    pub max_minutes: f64,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum BadgeControl {
    Set { count: i32 },
    Stop,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RouteKind {
    Reply,
    Decision,
    Open,
}

pub fn is_known_app_id(app_id: &str) -> bool {
    matches!(
        app_id,
        "KeS1Ke.DSH"
            | "KeS1Ke.DSH.2"
            | "KeS1Ke.DSH.3"
            | "KeS1Ke.DSH.4"
            | "KeS1Ke.DSH.5"
    )
}

fn is_hex32(s: &str) -> bool {
    s.len() == 32 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// Validates activation argument format: `<32-hex>(:<32-hex>)?(:decision|:open)?`.
pub fn parse_activation_route(arguments: &str) -> Option<RouteKind> {
    if arguments.is_empty() {
        return None;
    }
    let (core, kind) = if let Some(rest) = arguments.strip_suffix(":decision") {
        (rest, RouteKind::Decision)
    } else if let Some(rest) = arguments.strip_suffix(":open") {
        (rest, RouteKind::Open)
    } else {
        (arguments, RouteKind::Reply)
    };
    if is_hex32(core) {
        return Some(kind);
    }
    if let Some((first, second)) = core.split_once(':') {
        if is_hex32(first) && is_hex32(second) {
            return Some(kind);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_known_app_ids() {
        assert!(is_known_app_id("KeS1Ke.DSH"));
        for n in 2..=5 {
            assert!(is_known_app_id(&format!("KeS1Ke.DSH.{n}")));
        }
        assert!(!is_known_app_id("KeS1Ke.DSH.1"));
        assert!(!is_known_app_id("KeS1Ke.DSH.6"));
        assert!(!is_known_app_id("Other.App"));
    }

    #[test]
    fn parses_activation_routes() {
        let tok = "0123456789abcdef0123456789abcdef";
        let pipe = "fedcba9876543210fedcba9876543210";
        assert_eq!(parse_activation_route(tok), Some(RouteKind::Reply));
        assert_eq!(
            parse_activation_route(&format!("{tok}:decision")),
            Some(RouteKind::Decision)
        );
        assert_eq!(
            parse_activation_route(&format!("{tok}:open")),
            Some(RouteKind::Open)
        );
        assert_eq!(
            parse_activation_route(&format!("{pipe}:{tok}:open")),
            Some(RouteKind::Open)
        );
        assert_eq!(parse_activation_route(""), None);
        assert_eq!(parse_activation_route("bad"), None);
        assert_eq!(parse_activation_route(&format!("{tok}:other")), None);
        assert_eq!(
            parse_activation_route(&format!("{}:open", "A".repeat(32))),
            None
        );
    }

    #[test]
    fn deserializes_toast_commands_and_serializes_events() {
        let cmd: ToastCommand = serde_json::from_str(
            r#"{"type":"show","id":7,"title":"Hi","message":"Done","appId":"KeS1Ke.DSH.2"}"#,
        )
        .unwrap();
        match cmd {
            ToastCommand::Show(p) => {
                assert_eq!(p.id, 7);
                assert_eq!(p.title, "Hi");
                assert_eq!(p.app_id.as_deref(), Some("KeS1Ke.DSH.2"));
            }
            _ => panic!("expected Show"),
        }

        let keys: ToastCommand =
            serde_json::from_str(r#"{"type":"reply-keys","armed":true}"#).unwrap();
        assert_eq!(keys, ToastCommand::ReplyKeys { armed: true });

        let ack: ToastCommand = serde_json::from_str(r#"{"type":"ack","id":4,"ok":false}"#).unwrap();
        assert_eq!(ack, ToastCommand::Ack { id: 4, ok: false });

        let ready = serde_json::to_string(&ToastEvent::Ready).unwrap();
        assert_eq!(ready, r#"{"type":"ready"}"#);

        let res = serde_json::to_string(&ToastEvent::ShowResult {
            id: 7,
            ok: true,
            error: None,
        })
        .unwrap();
        assert_eq!(res, r#"{"type":"show-result","id":7,"ok":true}"#);
    }
}
