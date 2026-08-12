mod managed;
mod session;

pub use managed::{ManagedCommandManager, ManagedCommandState};
pub use session::PtySession;

use anyhow::Result;
use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use crate::types::{AgentType, TerminalSession};

const EMIT_BATCH_INTERVAL_MS: u64 = 8;
const MAX_BATCH_SIZE: usize = 512 * 1024;

pub(crate) fn spawn_output_reader(
    app_clone: AppHandle,
    sid: String,
    output_rx: mpsc::Receiver<Vec<u8>>,
) {
    thread::spawn(move || {
        let mut buffer = Vec::with_capacity(MAX_BATCH_SIZE);
        // Carries the trailing bytes of a multi-byte UTF-8 sequence that were
        // cut off at a batch boundary so the next batch can reassemble them.
        // Native terminals reassemble UTF-8 across reads; without this a split
        // sequence (e.g. box-drawing glyphs rendered heavily by TUI agents)
        // gets decoded as U+FFFD replacement characters -> "glitching text".
        let mut utf8_carry: Vec<u8> = Vec::with_capacity(4);
        let mut last_emit = Instant::now();

        // Emits `buffer` to the frontend, first carrying any incomplete
        // trailing UTF-8 sequence into `utf8_carry` so the next batch can
        // complete it instead of mangling it into replacement glyphs.
        let flush = |buffer: &mut Vec<u8>, utf8_carry: &mut Vec<u8>, sid: &str| {
            if buffer.is_empty() && utf8_carry.is_empty() {
                return;
            }
            // Prepend any incomplete sequence carried from the previous batch.
            let mut combined = Vec::with_capacity(buffer.len() + utf8_carry.len());
            combined.append(utf8_carry);
            combined.extend_from_slice(buffer);

            let valid_len = match std::str::from_utf8(&combined) {
                Ok(_) => combined.len(),
                Err(err) => {
                    let valid = err.valid_up_to();
                    match err.error_len() {
                        // Truncated/incomplete sequence at the end of the
                        // batch: carry the tail (at most 3 bytes) forward so
                        // the next batch can complete it.
                        None => {
                            *utf8_carry = combined[valid..].to_vec();
                            valid
                        }
                        // Genuinely invalid byte(s). If they sit at the very
                        // end (<= 3 bytes) treat them as a possible incomplete
                        // tail; otherwise decode the whole batch lossily.
                        Some(_) => {
                            let trailing = combined.len() - valid;
                            if valid > 0 && trailing <= 3 {
                                *utf8_carry = combined[valid..].to_vec();
                                valid
                            } else {
                                utf8_carry.clear();
                                combined.len()
                            }
                        }
                    }
                }
            };

            let output = String::from_utf8_lossy(&combined[..valid_len]).into_owned();
            let _ = app_clone.emit(&format!("terminal-output:{}", sid), &output);
            buffer.clear();
        };

        loop {
            match output_rx.recv_timeout(Duration::from_millis(EMIT_BATCH_INTERVAL_MS)) {
                Ok(data) => {
                    buffer.extend_from_slice(&data);

                    if (buffer.len() >= MAX_BATCH_SIZE
                        || last_emit.elapsed().as_millis() >= EMIT_BATCH_INTERVAL_MS as u128)
                        && !buffer.is_empty()
                    {
                        flush(&mut buffer, &mut utf8_carry, &sid);
                        last_emit = Instant::now();
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if !buffer.is_empty() {
                        flush(&mut buffer, &mut utf8_carry, &sid);
                        last_emit = Instant::now();
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    if !buffer.is_empty() {
                        flush(&mut buffer, &mut utf8_carry, &sid);
                    }
                    // Flush any final incomplete sequence lossily.
                    if !utf8_carry.is_empty() {
                        let output = String::from_utf8_lossy(&utf8_carry).into_owned();
                        let _ = app_clone.emit(&format!("terminal-output:{}", sid), &output);
                    }
                    break;
                }
            }
        }
    });
}

#[derive(Clone)]
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        TerminalManager {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            app_handle: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        let mut app = self.app_handle.lock().unwrap();
        *app = Some(handle);
    }

    pub fn create_sessions(
        &self,
        workspace_id: String,
        workspace_path: String,
        count: usize,
        agent_allocation: HashMap<AgentType, usize>,
        shell: Option<String>,
    ) -> Result<Vec<TerminalSession>> {
        let mut result_sessions = Vec::new();
        let mut agent_queue: Vec<Option<AgentType>> = Vec::new();

        for (agent_type, agent_count) in agent_allocation.iter() {
            for _ in 0..*agent_count {
                agent_queue.push(Some(*agent_type));
            }
        }

        while agent_queue.len() < count {
            agent_queue.push(None);
        }

        let app = self.app_handle.lock().unwrap();

        for index in 0..count {
            let agent = agent_queue.get(index).cloned().flatten();

            let (pty_session, output_rx) = match PtySession::create(
                workspace_id.clone(),
                index,
                workspace_path.clone(),
                agent,
                shell.clone(),
            ) {
                Ok(res) => res,
                Err(e) => {
                    eprintln!(
                        "[ERR] Failed to create PtySession at index {}: {}",
                        index, e
                    );
                    return Err(e);
                }
            };

            let session_id = pty_session.get_session().id.clone();
            let sid = session_id.clone();

            if let Some(app_handle) = app.as_ref() {
                spawn_output_reader(app_handle.clone(), sid.clone(), output_rx);
            }

            let terminal_session = pty_session.get_session().clone();
            result_sessions.push(terminal_session);

            let mut sessions = self.sessions.lock().unwrap();
            sessions.insert(session_id, pty_session);
        }

        Ok(result_sessions)
    }

    pub fn write_to_session(&self, session_id: &str, input: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(session_id) {
            session.write(input.as_bytes())?;
        } else {
            return Err(anyhow::anyhow!("Session not found: {}", session_id));
        }
        Ok(())
    }

    pub fn resize_session(
        &self,
        session_id: &str,
        cols: u16,
        rows: u16,
        pixel_width: u16,
        pixel_height: u16,
    ) -> Result<()> {
        let sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get(session_id) {
            session.resize(cols, rows, pixel_width, pixel_height)?;
        } else {
            return Err(anyhow::anyhow!("Session not found: {}", session_id));
        }
        Ok(())
    }

    pub fn kill_session(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(session_id) {
            session.kill();
        }
        sessions.remove(session_id);
        Ok(())
    }

    pub fn kill_sessions_by_workspace(&self, workspace_id: &str) -> Result<()> {
        let session_ids: Vec<String> = {
            let sessions = self.sessions.lock().unwrap();
            sessions
                .iter()
                .filter(|(_, pty_session)| pty_session.get_session().workspace_id == workspace_id)
                .map(|(id, _)| id.clone())
                .collect()
        };

        for session_id in &session_ids {
            self.kill_session(session_id)?;
        }

        Ok(())
    }

    #[allow(dead_code)]
    pub fn kill_all_sessions(&self) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        for (id, session) in sessions.iter_mut() {
            match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                session.kill();
            })) {
                Ok(_) => {}
                Err(e) => eprintln!("Panic while killing session {}: {:?}", id, e),
            }
        }
        sessions.clear();
        Ok(())
    }

    pub fn create_single_session(
        &self,
        workspace_id: String,
        workspace_path: String,
        index: usize,
        agent: Option<AgentType>,
        shell: Option<String>,
    ) -> Result<TerminalSession> {
        let app = self.app_handle.lock().unwrap();

        let (pty_session, output_rx) = PtySession::create(
            workspace_id.clone(),
            index,
            workspace_path.clone(),
            agent,
            shell,
        )?;

        let session_id = pty_session.get_session().id.clone();
        let sid = session_id.clone();

        if let Some(app_handle) = app.as_ref() {
            spawn_output_reader(app_handle.clone(), sid.clone(), output_rx);
        }

        let terminal_session = pty_session.get_session().clone();

        let mut sessions = self.sessions.lock().unwrap();
        sessions.insert(session_id, pty_session);

        Ok(terminal_session)
    }

    pub fn get_all_sessions(&self) -> Vec<TerminalSession> {
        let sessions = self.sessions.lock().unwrap();
        sessions.values().map(|s| s.get_session().clone()).collect()
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}
