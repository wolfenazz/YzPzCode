//! Runs a writing engine headlessly and streams its text back over a Tauri
//! channel. Each run gets an empty scratch folder as its working directory so
//! the engine has nothing on disk to read or change.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::sync::oneshot;

use super::engines::{
    clean_model_text, ParsedEvent, PromptDelivery, RunContext, WritingEngine,
    MAX_ARGUMENT_PROMPT_CHARS,
};
use crate::utils::process::{terminate_process_tree, ProcessRunner};

const DEFAULT_TIMEOUT_SECS: u64 = 600;
const FLUSH_INTERVAL: Duration = Duration::from_millis(40);
const STDERR_TAIL_BYTES: usize = 32 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WritingAiRunRequest {
    pub run_id: String,
    pub engine: WritingEngine,
    pub model: Option<String>,
    pub system_prompt: Option<String>,
    pub prompt: String,
    pub timeout_secs: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum WritingAiEvent {
    Started {
        pid: Option<u32>,
    },
    /// Append to the text so far.
    Delta {
        text: String,
    },
    /// Replace the text so far.
    Snapshot {
        text: String,
    },
    #[serde(rename_all = "camelCase")]
    Done {
        ok: bool,
        cancelled: bool,
        exit_code: Option<i32>,
        error: Option<String>,
        full_text: String,
        stderr_tail: String,
    },
}

struct RunHandle {
    pid: Option<u32>,
    cancel: Option<oneshot::Sender<()>>,
}

#[derive(Default, Clone)]
pub struct WritingAiRunner {
    runs: Arc<Mutex<HashMap<String, RunHandle>>>,
}

fn valid_run_id(run_id: &str) -> bool {
    !run_id.is_empty()
        && run_id.len() <= 80
        && run_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// The command for a resolved binary. npm shims are run as `node script.js`
/// so long prompts and non-ASCII stdin survive.
fn build_command(binary_path: &str, args: &[std::ffi::OsString]) -> std::process::Command {
    #[cfg(target_os = "windows")]
    {
        if let Some((node, script)) = ProcessRunner::resolve_npm_cmd_shim(binary_path) {
            use std::os::windows::process::CommandExt;
            let mut cmd = std::process::Command::new(node);
            cmd.arg(script).args(args).creation_flags(0x0800_0000);
            return cmd;
        }
    }
    ProcessRunner::hidden_command(binary_path, args)
}

async fn resolve_engine_binary(engine: WritingEngine) -> Option<String> {
    for candidate in engine.binary_candidates() {
        if let Some(path) = ProcessRunner::find_binary_async(candidate).await {
            return Some(path);
        }
    }
    None
}

impl WritingAiRunner {
    pub async fn start(
        &self,
        cache_dir: PathBuf,
        request: WritingAiRunRequest,
        events: Channel<WritingAiEvent>,
    ) -> Result<(), String> {
        if !valid_run_id(&request.run_id) {
            return Err("Invalid run id.".into());
        }
        if self.runs.lock().map_err(|e| e.to_string())?.contains_key(&request.run_id) {
            return Err("A run with this id is already active.".into());
        }
        let engine = request.engine;
        let binary = resolve_engine_binary(engine)
            .await
            .ok_or_else(|| format!("{} is not installed or not on PATH.", engine.display_name()))?;

        let takes_system_file = engine.takes_system_file() && request.system_prompt.is_some();
        let prompt = match (&request.system_prompt, takes_system_file) {
            (Some(system), false) => format!("{system}\n\n---\n\n{}", request.prompt),
            _ => request.prompt.clone(),
        };
        if engine.prompt_delivery() == PromptDelivery::Argument
            && prompt.chars().count() > MAX_ARGUMENT_PROMPT_CHARS
        {
            return Err(format!(
                "{} takes its prompt as an argument and this prompt is too long. Use Claude Code or Codex for long reports.",
                engine.display_name()
            ));
        }

        let run_dir = cache_dir.join("writing-runs").join(&request.run_id);
        tokio::fs::create_dir_all(&run_dir)
            .await
            .map_err(|e| format!("Could not create the run folder: {e}"))?;
        if takes_system_file {
            if let Some(system) = &request.system_prompt {
                tokio::fs::write(run_dir.join("system.md"), system)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
        if engine.prompt_delivery() == PromptDelivery::PromptFile {
            tokio::fs::write(run_dir.join("prompt.md"), &prompt)
                .await
                .map_err(|e| e.to_string())?;
        }

        let mut model = request.model.clone().filter(|m| !m.trim().is_empty());
        if model.is_none() && engine == WritingEngine::Opencode {
            if let Ok(models) = super::models::list_models(engine).await {
                model = super::models::pick_default(&models);
            }
        }
        let args = engine.build_args(&RunContext {
            run_dir: &run_dir,
            model: model.as_deref(),
            has_system_file: takes_system_file,
            prompt: &prompt,
        });
        let mut std_cmd = build_command(&binary, &args);
        std_cmd.current_dir(&run_dir);
        // A nested Claude Code refuses to start when it thinks it is inside another session.
        std_cmd.env_remove("CLAUDECODE");
        std_cmd.env("NO_COLOR", "1");
        #[cfg(target_os = "windows")]
        std_cmd.env("PATH", crate::terminal::managed::build_windows_path());

        let mut cmd = tokio::process::Command::from(std_cmd);
        cmd.stdin(if engine.prompt_delivery() == PromptDelivery::Stdin {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

        let mut child = cmd.spawn().map_err(|e| {
            let _ = std::fs::remove_dir_all(&run_dir);
            format!("Could not start {}: {e}", engine.display_name())
        })?;
        let pid = child.id();

        if let Some(mut stdin) = child.stdin.take() {
            let input = prompt.clone().into_bytes();
            tokio::spawn(async move {
                let _ = stdin.write_all(&input).await;
                let _ = stdin.shutdown().await;
            });
        }

        let (cancel_tx, cancel_rx) = oneshot::channel();
        self.runs.lock().map_err(|e| e.to_string())?.insert(
            request.run_id.clone(),
            RunHandle {
                pid,
                cancel: Some(cancel_tx),
            },
        );
        let _ = events.send(WritingAiEvent::Started { pid });

        let runs = self.runs.clone();
        let timeout = Duration::from_secs(request.timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS).max(10));
        tokio::spawn(async move {
            let done = drive_run(engine, child, pid, cancel_rx, timeout, &events).await;
            let _ = events.send(done);
            if let Ok(mut runs) = runs.lock() {
                runs.remove(&request.run_id);
            }
            remove_run_dir(&run_dir).await;
        });
        Ok(())
    }

    pub fn cancel(&self, run_id: &str) -> Result<(), String> {
        let mut runs = self.runs.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = runs.get_mut(run_id) {
            if let Some(cancel) = handle.cancel.take() {
                let _ = cancel.send(());
            }
        }
        Ok(())
    }

    /// Kills every running engine; called when the app closes.
    pub fn stop_all(&self) {
        let pids: Vec<u32> = match self.runs.lock() {
            Ok(mut runs) => runs.drain().filter_map(|(_, handle)| handle.pid).collect(),
            Err(_) => return,
        };
        for pid in pids {
            let _ = terminate_process_tree(pid);
        }
    }
}

async fn remove_run_dir(run_dir: &Path) {
    // Give a killed process tree a moment to release its handles.
    for _ in 0..5 {
        if tokio::fs::remove_dir_all(run_dir).await.is_ok() || !run_dir.exists() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

async fn drive_run(
    engine: WritingEngine,
    mut child: tokio::process::Child,
    pid: Option<u32>,
    mut cancel_rx: oneshot::Receiver<()>,
    timeout: Duration,
    events: &Channel<WritingAiEvent>,
) -> WritingAiEvent {
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stderr_task = tokio::spawn(async move {
        let mut tail: Vec<u8> = Vec::new();
        if let Some(mut stderr) = stderr {
            let mut buf = [0u8; 4096];
            while let Ok(read) = stderr.read(&mut buf).await {
                if read == 0 {
                    break;
                }
                tail.extend_from_slice(&buf[..read]);
                if tail.len() > STDERR_TAIL_BYTES {
                    let excess = tail.len() - STDERR_TAIL_BYTES;
                    tail.drain(..excess);
                }
            }
        }
        String::from_utf8_lossy(&tail).into_owned()
    });

    let mut parser = engine.parser();
    let mut error: Option<String> = None;
    let mut cancelled = false;
    let mut timed_out = false;
    // Pending output since the last flush: either appended text, or a
    // replacement snapshot followed by appended text.
    let mut pending_snapshot: Option<String> = None;
    let mut pending_delta = String::new();

    let flush = |snapshot: &mut Option<String>, delta: &mut String| {
        if let Some(mut text) = snapshot.take() {
            text.push_str(delta);
            delta.clear();
            let _ = events.send(WritingAiEvent::Snapshot { text });
        } else if !delta.is_empty() {
            let _ = events.send(WritingAiEvent::Delta {
                text: std::mem::take(delta),
            });
        }
    };

    if let Some(stdout) = stdout {
        let mut reader = BufReader::new(stdout);
        let mut line = Vec::new();
        let mut ticker = tokio::time::interval(FLUSH_INTERVAL);
        let deadline = tokio::time::sleep(timeout);
        tokio::pin!(deadline);
        loop {
            tokio::select! {
                read = reader.read_until(b'\n', &mut line) => {
                    match read {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {
                            let text = String::from_utf8_lossy(&line);
                            for event in parser.feed(text.trim_end_matches(['\r', '\n'])) {
                                match event {
                                    ParsedEvent::Delta(delta) => pending_delta.push_str(&delta),
                                    ParsedEvent::Snapshot(snapshot) => {
                                        pending_delta.clear();
                                        pending_snapshot = Some(snapshot);
                                    }
                                    ParsedEvent::Error(message) => error = Some(message),
                                }
                            }
                            line.clear();
                        }
                    }
                }
                _ = ticker.tick() => flush(&mut pending_snapshot, &mut pending_delta),
                _ = &mut cancel_rx, if !cancelled => {
                    cancelled = true;
                    if let Some(pid) = pid {
                        let _ = tokio::task::spawn_blocking(move || terminate_process_tree(pid)).await;
                    }
                    let _ = child.start_kill();
                }
                _ = &mut deadline, if !timed_out => {
                    timed_out = true;
                    if let Some(pid) = pid {
                        let _ = tokio::task::spawn_blocking(move || terminate_process_tree(pid)).await;
                    }
                    let _ = child.start_kill();
                }
            }
        }
    }
    flush(&mut pending_snapshot, &mut pending_delta);

    let status = child.wait().await.ok();
    let exit_code = status.and_then(|status| status.code());
    let stderr_tail = stderr_task.await.unwrap_or_default();
    let full_text = clean_model_text(&parser.finish());

    let error = if cancelled {
        Some("Cancelled.".to_string())
    } else if timed_out {
        Some(format!("Timed out after {} seconds.", timeout.as_secs()))
    } else if error.is_some() {
        error
    } else if !status.is_some_and(|status| status.success()) {
        let detail = stderr_tail
            .lines()
            .map(str::trim)
            .rfind(|line| !line.is_empty())
            .unwrap_or("")
            .to_string();
        Some(if detail.is_empty() {
            format!("{} exited with code {:?}.", engine.display_name(), exit_code)
        } else {
            detail
        })
    } else if full_text.trim().is_empty() {
        Some(format!("{} returned no text.", engine.display_name()))
    } else {
        None
    };

    WritingAiEvent::Done {
        ok: error.is_none(),
        cancelled,
        exit_code,
        error,
        full_text,
        stderr_tail,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Streams a short section from the installed Claude Code CLI. Opt-in, as it
    /// needs the CLI signed in: `cargo test writing_runner_streams -- --ignored`.
    /// `WRITING_TEST_ENGINE` / `WRITING_TEST_MODEL` pick another engine.
    #[tokio::test]
    #[ignore]
    async fn writing_runner_streams_from_claude() {
        use tauri::ipc::InvokeResponseBody;

        let events: Arc<Mutex<Vec<serde_json::Value>>> = Arc::default();
        let sink = events.clone();
        let channel: Channel<WritingAiEvent> = Channel::new(move |body| {
            if let InvokeResponseBody::Json(json) = body {
                sink.lock().unwrap().push(serde_json::from_str(&json).unwrap());
            }
            Ok(())
        });
        let runner = WritingAiRunner::default();
        runner
            .start(
                std::env::temp_dir().join("yzpz-writing-test"),
                WritingAiRunRequest {
                    run_id: format!("test-{}", std::process::id()),
                    engine: std::env::var("WRITING_TEST_ENGINE")
                        .ok()
                        .and_then(|name| serde_json::from_value(serde_json::Value::String(name)).ok())
                        .unwrap_or(WritingEngine::Claude),
                    model: std::env::var("WRITING_TEST_MODEL").ok(),
                    system_prompt: Some("You are a professional writer. Output only Markdown.".into()),
                    prompt: "Write two short paragraphs (about 80 words in total) on why irrigation scheduling matters in arid farms. Then a two-row Markdown table with a caption line 'Table: Water use'.".into(),
                    timeout_secs: Some(180),
                },
                channel,
            )
            .await
            .expect("start run");

        let done = tokio::time::timeout(Duration::from_secs(200), async {
            loop {
                if let Some(done) = events.lock().unwrap().iter().find(|event| event["type"] == "done").cloned() {
                    return done;
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        })
        .await
        .expect("run finished");

        let all = events.lock().unwrap().clone();
        let deltas = all
            .iter()
            .filter(|event| event["type"] == "delta" || event["type"] == "snapshot")
            .count();
        println!("events: {}, deltas: {deltas}", all.len());
        println!("done: {}", serde_json::to_string_pretty(&done).unwrap());
        assert_eq!(all.first().unwrap()["type"], "started");
        assert_eq!(done["ok"], true, "{done}");
        assert!(deltas >= 1, "expected streamed deltas");
        let text = done["fullText"].as_str().unwrap();
        assert!(text.contains("Table: Water use"), "{text}");
        assert!(!text.starts_with("```"));
    }

    #[test]
    fn run_ids_are_restricted_to_safe_folder_names() {
        assert!(valid_run_id("run-1a2b_C"));
        assert!(!valid_run_id(""));
        assert!(!valid_run_id("../escape"));
        assert!(!valid_run_id("a/b"));
        assert!(!valid_run_id(&"x".repeat(81)));
    }
}
