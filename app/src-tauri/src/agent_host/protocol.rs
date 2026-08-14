//! Wire protocol shared with the YZPZ Agent sidecar (Node).

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A command we send to the sidecar.
#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub struct CommandMessage {
    #[serde(rename = "type")]
    pub message_type: &'static str,
    pub id: String,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Value>,
}

impl CommandMessage {
    pub fn new(id: String, command: &str, args: Option<Value>) -> Self {
        CommandMessage {
            message_type: "command",
            id,
            command: command.to_string(),
            args,
        }
    }
}

/// An event envelope pushed by the sidecar.
#[derive(Debug, Clone, Deserialize)]
pub struct SidecarEventEnvelope {
    pub name: String,
    pub payload: Value,
}

/// A message received from the sidecar (tagged union on `type`).
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum SidecarMessage {
    Response {
        id: String,
        ok: bool,
        #[serde(default)]
        result: Option<Value>,
        #[serde(default)]
        error: Option<String>,
    },
    Event {
        event: SidecarEventEnvelope,
    },
}

/// Create-session request from the frontend.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentSessionRequest {
    pub workspace_id: String,
    pub cwd: String,
    pub provider_id: String,
    pub model_id: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub enable_agent_teams: Option<bool>,
    #[serde(default)]
    pub team_name: Option<String>,
    #[serde(default)]
    pub compaction_strategy: Option<String>,
    #[serde(default)]
    pub max_total_tokens: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sidecar_response() {
        let raw = r#"{"type":"response","id":"1","ok":true,"result":{"pong":true}}"#;
        let msg: SidecarMessage = serde_json::from_str(raw).unwrap();
        match msg {
            SidecarMessage::Response {
                id,
                ok,
                result,
                error,
            } => {
                assert_eq!(id, "1");
                assert!(ok);
                assert_eq!(result.unwrap()["pong"], true);
                assert!(error.is_none());
            }
            _ => panic!("expected response"),
        }
    }

    #[test]
    fn parses_sidecar_error_response() {
        let raw = r#"{"type":"response","id":"2","ok":false,"error":"boom"}"#;
        let msg: SidecarMessage = serde_json::from_str(raw).unwrap();
        match msg {
            SidecarMessage::Response { ok, error, .. } => {
                assert!(!ok);
                assert_eq!(error.unwrap(), "boom");
            }
            _ => panic!("expected response"),
        }
    }

    #[test]
    fn parses_sidecar_event() {
        let raw = r#"{"type":"event","event":{"name":"approval-request","payload":{"requestId":"r1","sessionId":"s1"}}}"#;
        let msg: SidecarMessage = serde_json::from_str(raw).unwrap();
        match msg {
            SidecarMessage::Event { event } => {
                assert_eq!(event.name, "approval-request");
                assert_eq!(event.payload["sessionId"], "s1");
            }
            _ => panic!("expected event"),
        }
    }

    #[test]
    fn serializes_command_message() {
        let msg = CommandMessage::new("9".to_string(), "ping", None);
        let raw = serde_json::to_string(&msg).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed["type"], "command");
        assert_eq!(parsed["command"], "ping");
        assert_eq!(parsed["id"], "9");
        assert!(parsed.get("args").is_none());
    }

    #[test]
    fn parses_create_session_request_camel_case() {
        let raw = r#"{"workspaceId":"w1","cwd":"C:\\dev","providerId":"anthropic","modelId":"claude-sonnet-4-6"}"#;
        let req: CreateAgentSessionRequest = serde_json::from_str(raw).unwrap();
        assert_eq!(req.workspace_id, "w1");
        assert_eq!(req.provider_id, "anthropic");
        assert_eq!(req.model_id, "claude-sonnet-4-6");
        assert!(req.api_key.is_none());
    }

    #[test]
    fn parses_create_session_request_with_max_total_tokens() {
        let raw = r#"{"workspaceId":"w1","cwd":"C:\\dev","providerId":"anthropic","modelId":"claude-sonnet-4-6","maxTotalTokens":1000000}"#;
        let req: CreateAgentSessionRequest = serde_json::from_str(raw).unwrap();
        assert_eq!(req.max_total_tokens, Some(1_000_000));
        assert!(req.compaction_strategy.is_none());

        // Absent field defaults to None (backwards compatible).
        let raw2 =
            r#"{"workspaceId":"w2","cwd":"C:\\dev","providerId":"openai","modelId":"gpt-5"}"#;
        let req2: CreateAgentSessionRequest = serde_json::from_str(raw2).unwrap();
        assert!(req2.max_total_tokens.is_none());

        // Serializes back out as camelCase `maxTotalTokens`.
        let out: serde_json::Value = serde_json::to_value(&req).unwrap();
        assert_eq!(out["maxTotalTokens"], 1_000_000);
    }
}
