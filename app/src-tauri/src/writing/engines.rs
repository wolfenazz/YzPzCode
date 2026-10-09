//! The AI CLIs the Writing workspace can drive headlessly: how each one is
//! found, invoked, fed its prompt, and how its output stream is read back.
//!
//! This is deliberately separate from `agent_cli::AgentCliProvider`: that
//! trait describes interactive terminal launches for every CLI, while this
//! only covers the few whose print mode is known to work for long-form text.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::ffi::OsString;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WritingEngine {
    Claude,
    Codex,
    Grok,
    Antigravity,
    Opencode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineSupport {
    Supported,
    /// No engine is experimental today; the UI still understands the value.
    #[allow(dead_code)]
    Experimental,
}

/// How a run's text arrives: token by token, or as whole replacement snapshots.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineStreaming {
    Token,
    Message,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptDelivery {
    /// Written to stdin, then stdin is closed.
    Stdin,
    /// Written to `prompt.md` in the run folder; the args reference it.
    PromptFile,
    /// Passed as an argument (native binaries only, so the 32K CreateProcess limit applies).
    Argument,
}

pub const ALL_ENGINES: [WritingEngine; 5] = [
    WritingEngine::Claude,
    WritingEngine::Codex,
    WritingEngine::Grok,
    WritingEngine::Antigravity,
    WritingEngine::Opencode,
];

/// Prompts passed as an argument are rejected above this size.
pub const MAX_ARGUMENT_PROMPT_CHARS: usize = 30_000;

fn push(args: &mut Vec<OsString>, value: &str) {
    args.push(OsString::from(value));
}

pub struct RunContext<'a> {
    pub run_dir: &'a Path,
    pub model: Option<&'a str>,
    /// Written to `system.md` for engines that take a separate system prompt.
    pub has_system_file: bool,
    pub prompt: &'a str,
}

impl WritingEngine {
    pub fn display_name(self) -> &'static str {
        match self {
            Self::Claude => "Claude Code",
            Self::Codex => "Codex",
            Self::Grok => "Grok",
            Self::Antigravity => "Antigravity",
            Self::Opencode => "OpenCode",
        }
    }

    pub fn binary_candidates(self) -> &'static [&'static str] {
        match self {
            Self::Claude => &["claude"],
            Self::Codex => &["codex"],
            Self::Grok => &["grok"],
            Self::Antigravity => &["agy"],
            Self::Opencode => &["opencode"],
        }
    }

    pub fn support(self) -> EngineSupport {
        match self {
            Self::Claude | Self::Codex | Self::Grok | Self::Antigravity | Self::Opencode => {
                EngineSupport::Supported
            }
        }
    }

    pub fn streaming(self) -> EngineStreaming {
        match self {
            Self::Claude | Self::Grok | Self::Antigravity => EngineStreaming::Token,
            Self::Codex | Self::Opencode => EngineStreaming::Message,
        }
    }

    pub fn prompt_delivery(self) -> PromptDelivery {
        match self {
            Self::Claude | Self::Codex => PromptDelivery::Stdin,
            Self::Grok | Self::Opencode => PromptDelivery::PromptFile,
            Self::Antigravity => PromptDelivery::Argument,
        }
    }

    /// Whether the engine reads a separate system prompt file. The others get
    /// the system prompt prepended to the user prompt.
    pub fn takes_system_file(self) -> bool {
        matches!(self, Self::Claude)
    }

    pub fn build_args(self, ctx: &RunContext<'_>) -> Vec<OsString> {
        let mut args: Vec<OsString> = Vec::new();
        match self {
            Self::Claude => {
                for flag in [
                    "-p",
                    "--output-format",
                    "stream-json",
                    "--include-partial-messages",
                    "--verbose",
                    "--no-session-persistence",
                    "--permission-mode",
                    "default",
                    "--strict-mcp-config",
                    "--disable-slash-commands",
                ] {
                    push(&mut args, flag);
                }
                if let Some(model) = ctx.model {
                    push(&mut args, "--model");
                    push(&mut args, model);
                }
                if ctx.has_system_file {
                    args.push(OsString::from("--system-prompt-file"));
                    args.push(ctx.run_dir.join("system.md").into_os_string());
                }
                // Variadic, so it must come last.
                push(&mut args, "--tools");
                push(&mut args, "");
            }
            Self::Codex => {
                for flag in [
                    "--no-daemon",
                    "exec",
                    "--json",
                    "--skip-git-repo-check",
                    "--sandbox",
                    "read-only",
                    "--ephemeral",
                    "--color",
                    "never",
                    "-C",
                ] {
                    push(&mut args, flag);
                }
                args.push(ctx.run_dir.as_os_str().to_os_string());
                if let Some(model) = ctx.model {
                    args.push(OsString::from("-m"));
                    args.push(OsString::from(model));
                }
                args.push(OsString::from("-"));
            }
            Self::Grok => {
                args.push(OsString::from("--prompt-file"));
                args.push(ctx.run_dir.join("prompt.md").into_os_string());
                for flag in [
                    "--output-format",
                    "streaming-messages-json",
                    "--include-partial-messages",
                    "--no-subagents",
                    "--disable-web-search",
                    "--no-plan",
                    "--max-turns",
                    "1",
                ] {
                    args.push(OsString::from(flag));
                }
                if let Some(model) = ctx.model {
                    args.push(OsString::from("-m"));
                    args.push(OsString::from(model));
                }
            }
            Self::Antigravity => {
                // `--sandbox` keeps its shell tool restricted; it already auto-approves tool use in print mode.
                for flag in ["--output-format", "stream-json", "--disable-slash-commands", "--sandbox"] {
                    push(&mut args, flag);
                }
                if let Some(model) = ctx.model {
                    push(&mut args, "--model");
                    push(&mut args, model);
                }
                // `-p` takes the prompt as its value, so nothing may follow it.
                push(&mut args, "-p");
                push(&mut args, ctx.prompt);
            }
            Self::Opencode => {
                for flag in ["run", "--format", "json", "--file"] {
                    push(&mut args, flag);
                }
                args.push(ctx.run_dir.join("prompt.md").into_os_string());
                if let Some(model) = ctx.model {
                    args.push(OsString::from("-m"));
                    args.push(OsString::from(model));
                }
                args.push(OsString::from(
                    "Follow the attached instructions exactly. Output only the requested document text.",
                ));
            }
        }
        args
    }

    pub fn parser(self) -> Box<dyn OutputParser + Send> {
        match self {
            Self::Claude | Self::Grok => Box::<AnthropicStreamParser>::default(),
            Self::Codex => Box::<CodexJsonlParser>::default(),
            Self::Antigravity => Box::<AntigravityStreamParser>::default(),
            Self::Opencode => Box::<OpenCodeJsonParser>::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParsedEvent {
    /// Append to the text so far.
    Delta(String),
    /// Replace the text so far.
    Snapshot(String),
    Error(String),
}

pub trait OutputParser {
    fn feed(&mut self, line: &str) -> Vec<ParsedEvent>;
    /// The final text, once the stream has ended.
    fn finish(&mut self) -> String;
}

fn text_at<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    path.iter()
        .try_fold(value, |node, key| node.get(key))
        .and_then(Value::as_str)
}

/// Codex wraps API errors as a JSON string inside `message`. A model the
/// account can't use is almost always Codex's configured default, so say where to change it.
fn unwrap_error_message(raw: &str) -> String {
    let message = serde_json::from_str::<Value>(raw)
        .ok()
        .and_then(|inner| text_at(&inner, &["error", "message"]).map(str::to_string))
        .unwrap_or_else(|| raw.to_string());
    if message.contains("model is not supported") {
        format!("{message} Choose a model your plan includes in Settings → Writing → Engines.")
    } else {
        message
    }
}

/// Claude Code `stream-json` and Grok `streaming-messages-json`, which share
/// the Anthropic event shapes.
#[derive(Default)]
pub struct AnthropicStreamParser {
    streamed: String,
    assistant: String,
    result: Option<String>,
}

impl OutputParser for AnthropicStreamParser {
    fn feed(&mut self, line: &str) -> Vec<ParsedEvent> {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return Vec::new();
        };
        let event = if value.get("type").and_then(Value::as_str) == Some("stream_event") {
            value.get("event").unwrap_or(&Value::Null)
        } else {
            &value
        };
        match event.get("type").and_then(Value::as_str) {
            Some("content_block_delta") => {
                if text_at(event, &["delta", "type"]) == Some("text_delta") {
                    if let Some(text) = text_at(event, &["delta", "text"]) {
                        self.streamed.push_str(text);
                        return vec![ParsedEvent::Delta(text.to_string())];
                    }
                }
                Vec::new()
            }
            Some("assistant") => {
                let texts = value
                    .pointer("/message/content")
                    .and_then(Value::as_array)
                    .map(|blocks| {
                        blocks
                            .iter()
                            .filter(|block| block.get("type").and_then(Value::as_str) == Some("text"))
                            .filter_map(|block| block.get("text").and_then(Value::as_str))
                            .collect::<String>()
                    })
                    .unwrap_or_default();
                self.assistant.push_str(&texts);
                Vec::new()
            }
            Some("result") => {
                if value.get("is_error").and_then(Value::as_bool) == Some(true) {
                    let message = value
                        .get("errors")
                        .and_then(Value::as_array)
                        .and_then(|errors| errors.first())
                        .and_then(Value::as_str)
                        .or_else(|| value.get("result").and_then(Value::as_str))
                        .unwrap_or("The AI engine reported an error.");
                    return vec![ParsedEvent::Error(message.trim().to_string())];
                }
                self.result = value.get("result").and_then(Value::as_str).map(str::to_string);
                Vec::new()
            }
            _ => Vec::new(),
        }
    }

    fn finish(&mut self) -> String {
        self.result
            .clone()
            .filter(|text| !text.is_empty())
            .or_else(|| Some(self.streamed.clone()).filter(|text| !text.is_empty()))
            .unwrap_or_else(|| self.assistant.clone())
    }
}

/// `codex exec --json`: whole agent messages, no token deltas.
#[derive(Default)]
pub struct CodexJsonlParser {
    last_message: String,
}

impl OutputParser for CodexJsonlParser {
    fn feed(&mut self, line: &str) -> Vec<ParsedEvent> {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return Vec::new();
        };
        match value.get("type").and_then(Value::as_str) {
            Some("item.completed") => {
                let item = value.get("item").unwrap_or(&Value::Null);
                if item.get("type").and_then(Value::as_str) == Some("agent_message") {
                    if let Some(text) = item.get("text").and_then(Value::as_str) {
                        self.last_message = text.to_string();
                        return vec![ParsedEvent::Snapshot(text.to_string())];
                    }
                }
                Vec::new()
            }
            Some("turn.failed") => text_at(&value, &["error", "message"])
                .map(|message| vec![ParsedEvent::Error(unwrap_error_message(message))])
                .unwrap_or_default(),
            Some("error") => value
                .get("message")
                .and_then(Value::as_str)
                .map(|message| vec![ParsedEvent::Error(unwrap_error_message(message))])
                .unwrap_or_default(),
            _ => Vec::new(),
        }
    }

    fn finish(&mut self) -> String {
        self.last_message.clone()
    }
}

/// `agy --output-format stream-json`. Text arrives as `text_delta` on
/// `agent_response` steps; a later response step (after a tool call)
/// supersedes the earlier one, so each new step restarts the text.
#[derive(Default)]
pub struct AntigravityStreamParser {
    step: Option<u64>,
    text: String,
    response: Option<String>,
}

impl OutputParser for AntigravityStreamParser {
    fn feed(&mut self, line: &str) -> Vec<ParsedEvent> {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return Vec::new();
        };
        match value.get("event").and_then(Value::as_str) {
            Some("step_update") => {
                let update = value.get("step_update").unwrap_or(&Value::Null);
                if update.get("step_type").and_then(Value::as_str) != Some("agent_response") {
                    return Vec::new();
                }
                let Some(delta) = update.get("text_delta").and_then(Value::as_str) else {
                    return Vec::new();
                };
                let step = update.get("step_index").and_then(Value::as_u64);
                if step != self.step {
                    self.step = step;
                    self.text.clear();
                    self.text.push_str(delta);
                    return vec![ParsedEvent::Snapshot(self.text.clone())];
                }
                self.text.push_str(delta);
                vec![ParsedEvent::Delta(delta.to_string())]
            }
            Some("result") => {
                let result = value.get("result").unwrap_or(&Value::Null);
                let status = result.get("status").and_then(Value::as_str).unwrap_or("");
                if !status.eq_ignore_ascii_case("success") {
                    let message = result
                        .get("error")
                        .and_then(Value::as_str)
                        .unwrap_or("Antigravity did not finish the response.");
                    return vec![ParsedEvent::Error(message.to_string())];
                }
                self.response = result.get("response").and_then(Value::as_str).map(str::to_string);
                Vec::new()
            }
            _ => Vec::new(),
        }
    }

    fn finish(&mut self) -> String {
        self.response.clone().unwrap_or_else(|| self.text.clone())
    }
}

/// `opencode run --format json`: `text` parts carry whole text blocks.
#[derive(Default)]
pub struct OpenCodeJsonParser {
    text: String,
}

impl OutputParser for OpenCodeJsonParser {
    fn feed(&mut self, line: &str) -> Vec<ParsedEvent> {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return Vec::new();
        };
        match value.get("type").and_then(Value::as_str) {
            Some("text") => text_at(&value, &["part", "text"])
                .map(|text| {
                    self.text = text.to_string();
                    vec![ParsedEvent::Snapshot(text.to_string())]
                })
                .unwrap_or_default(),
            Some("error") => {
                let message = text_at(&value, &["error", "data", "message"])
                    .or_else(|| text_at(&value, &["error", "message"]))
                    .unwrap_or("OpenCode reported an error.");
                let rejected = text_at(&value, &["error", "type"]) == Some("provider.auth");
                vec![ParsedEvent::Error(if rejected {
                    format!("OpenCode's provider rejected the request ({message}). Pick a model from a provider you are signed in to, or run `opencode auth login`.")
                } else {
                    message.to_string()
                })]
            }
            _ => Vec::new(),
        }
    }

    fn finish(&mut self) -> String {
        self.text.clone()
    }
}

/// Removes the wrapping a model sometimes adds despite the output contract:
/// a lone code fence around the whole answer, or a "Here is…" lead-in line.
pub fn clean_model_text(text: &str) -> String {
    let mut body = text.trim();
    if let Some(rest) = body.strip_prefix("```") {
        if let Some(newline) = rest.find('\n') {
            let inner = &rest[newline + 1..];
            if let Some(stripped) = inner.trim_end().strip_suffix("```") {
                body = stripped.trim();
            }
        }
    }
    let first_line = body.lines().next().unwrap_or("");
    let lowered = first_line.to_ascii_lowercase();
    let is_preamble = first_line.len() < 160
        && first_line.trim_end().ends_with(':')
        && ["here is", "here's", "sure", "certainly", "below is"]
            .iter()
            .any(|lead| lowered.starts_with(lead));
    if is_preamble {
        body = body[first_line.len()..].trim_start();
    }
    body.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed_all(parser: &mut dyn OutputParser, lines: &[&str]) -> Vec<ParsedEvent> {
        lines.iter().flat_map(|line| parser.feed(line)).collect()
    }

    #[test]
    fn claude_stream_yields_deltas_and_result() {
        let mut parser = AnthropicStreamParser::default();
        let events = feed_all(
            &mut parser,
            &[
                r#"{"type":"system","subtype":"init","tools":[]}"#,
                r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}"#,
                r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello there"}}}"#,
                r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":", friend."}}}"#,
                r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Hello there, friend."}]}}"#,
                r#"{"type":"result","subtype":"success","is_error":false,"result":"Hello there, friend."}"#,
            ],
        );
        assert_eq!(
            events,
            vec![
                ParsedEvent::Delta("Hello there".into()),
                ParsedEvent::Delta(", friend.".into())
            ]
        );
        assert_eq!(parser.finish(), "Hello there, friend.");
    }

    #[test]
    fn grok_error_result_is_reported() {
        let mut parser = AnthropicStreamParser::default();
        let events = feed_all(
            &mut parser,
            &[r#"{"type":"result","subtype":"error_during_execution","is_error":true,"errors":["Not signed in. To authenticate without a browser, run:\n  grok login --device-code"]}"#],
        );
        assert!(matches!(&events[0], ParsedEvent::Error(message) if message.starts_with("Not signed in")));
    }

    #[test]
    fn bare_content_block_delta_is_accepted() {
        let mut parser = AnthropicStreamParser::default();
        let events = parser.feed(r#"{"type":"content_block_delta","delta":{"type":"text_delta","text":"x"}}"#);
        assert_eq!(events, vec![ParsedEvent::Delta("x".into())]);
        assert_eq!(parser.finish(), "x");
    }

    #[test]
    fn codex_messages_and_nested_errors() {
        let mut parser = CodexJsonlParser::default();
        let events = feed_all(
            &mut parser,
            &[
                r#"{"type":"thread.started","thread_id":"t"}"#,
                r#"{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Model metadata not found."}}"#,
                r#"{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Section text"}}"#,
                r#"{"type":"turn.failed","error":{"message":"{\"type\":\"error\",\"status\":400,\"error\":{\"type\":\"invalid_request_error\",\"message\":\"The 'gpt-x' model is not supported.\"}}"}}"#,
            ],
        );
        assert_eq!(
            events,
            vec![
                ParsedEvent::Snapshot("Section text".into()),
                ParsedEvent::Error("The 'gpt-x' model is not supported. Choose a model your plan includes in Settings → Writing → Engines.".into())
            ]
        );
        assert_eq!(parser.finish(), "Section text");
    }

    #[test]
    fn antigravity_restarts_text_on_a_new_response_step() {
        let mut parser = AntigravityStreamParser::default();
        let events = feed_all(
            &mut parser,
            &[
                r#"{"event":"step_update","step_update":{"step_index":2,"state":"ACTIVE","step_type":"agent_response","text_delta":"Let me look."}}"#,
                r#"{"event":"step_update","step_update":{"step_index":3,"state":"DONE","step_type":"tool","tool_name":"view_file"}}"#,
                r#"{"event":"step_update","step_update":{"step_index":4,"state":"ACTIVE","step_type":"agent_response","text_delta":"1\n2\n"}}"#,
                r#"{"event":"step_update","step_update":{"step_index":4,"state":"ACTIVE","step_type":"agent_response","text_delta":"3"}}"#,
                r#"{"event":"result","result":{"status":"SUCCESS","response":"1\n2\n3\n"}}"#,
            ],
        );
        assert_eq!(
            events,
            vec![
                ParsedEvent::Snapshot("Let me look.".into()),
                ParsedEvent::Snapshot("1\n2\n".into()),
                ParsedEvent::Delta("3".into())
            ]
        );
        assert_eq!(parser.finish(), "1\n2\n3\n");
    }

    #[test]
    fn claude_args_end_with_the_variadic_tools_flag() {
        let dir = std::env::temp_dir();
        let args = WritingEngine::Claude.build_args(&RunContext {
            run_dir: &dir,
            model: Some("sonnet"),
            has_system_file: true,
            prompt: "",
        });
        let args: Vec<String> = args.iter().map(|arg| arg.to_string_lossy().into_owned()).collect();
        assert_eq!(&args[args.len() - 2..], ["--tools", ""]);
        assert!(args.contains(&"--system-prompt-file".to_string()));
        assert!(args.windows(2).any(|pair| pair == ["--model", "sonnet"]));
        assert!(!args.contains(&"--bare".to_string()));
    }

    #[test]
    fn codex_reads_stdin_and_puts_no_daemon_before_exec() {
        let dir = std::env::temp_dir();
        let args = WritingEngine::Codex.build_args(&RunContext {
            run_dir: &dir,
            model: None,
            has_system_file: false,
            prompt: "",
        });
        assert_eq!(args[0], "--no-daemon");
        assert_eq!(args[1], "exec");
        assert_eq!(args.last().unwrap(), "-");
    }

    #[test]
    fn antigravity_prompt_is_the_value_of_p() {
        let dir = std::env::temp_dir();
        let args = WritingEngine::Antigravity.build_args(&RunContext {
            run_dir: &dir,
            model: None,
            has_system_file: false,
            prompt: "Write it",
        });
        assert_eq!(&args[args.len() - 2..], ["-p", "Write it"]);
    }

    #[test]
    fn model_wrapping_is_removed() {
        assert_eq!(clean_model_text("```markdown\n## A\n\nText\n```"), "## A\n\nText");
        assert_eq!(clean_model_text("Here is the section:\n\nBody text."), "Body text.");
        assert_eq!(clean_model_text("Body only."), "Body only.");
    }
}
