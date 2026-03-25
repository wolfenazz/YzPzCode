mod session;

pub use session::PtySession;

use anyhow::Result;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use crate::types::{AgentType, TerminalSession};

const EMIT_BATCH_INTERVAL_MS: u64 = 16;
const MAX_BATCH_SIZE: usize = 32 * 1024;

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
    ) -> Result<Vec<TerminalSession>> {
        println!(
            "Creating {} terminal sessions for workspace: {} at {}",
            count, workspace_id, workspace_path
        );
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

        println!("Final agent queue size: {}", agent_queue.len());

        let app = self.app_handle.lock().unwrap();

        for index in 0..count {
            let agent = agent_queue.get(index).cloned().flatten();

            println!("Spawning PTY session {} for agent {:?}", index, agent);

            let (pty_session, output_rx) = match PtySession::create(
                workspace_id.clone(),
                index,
                workspace_path.clone(),
                agent,
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
                let app_clone = app_handle.clone();
                thread::spawn(move || {
                    let mut buffer = Vec::with_capacity(MAX_BATCH_SIZE);
                    let mut last_emit = Instant::now();

                    loop {
                        match output_rx.recv_timeout(Duration::from_millis(EMIT_BATCH_INTERVAL_MS))
                        {
                            Ok(data) => {
                                buffer.extend_from_slice(&data);

                                if (buffer.len() >= MAX_BATCH_SIZE
                                    || last_emit.elapsed().as_millis()
                                        >= EMIT_BATCH_INTERVAL_MS as u128)
                                    && !buffer.is_empty()
                                {
                                    if let Ok(output) = String::from_utf8(buffer.clone()) {
                                        let _ = app_clone
                                            .emit(&format!("terminal-output:{}", sid), &output);
                                    }
                                    buffer.clear();
                                    last_emit = Instant::now();
                                }
                            }
                            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                                if !buffer.is_empty() {
                                    if let Ok(output) = String::from_utf8(buffer.clone()) {
                                        let _ = app_clone
                                            .emit(&format!("terminal-output:{}", sid), &output);
                                    }
                                    buffer.clear();
                                    last_emit = Instant::now();
                                }
                            }
                            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                                if !buffer.is_empty() {
                                    if let Ok(output) = String::from_utf8(buffer.clone()) {
                                        let _ = app_clone
                                            .emit(&format!("terminal-output:{}", sid), &output);
                                    }
                                }
                                break;
                            }
                        }
                    }
                });
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
        }
        Ok(())
    }

    pub fn resize_session(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get(session_id) {
            session.resize(cols, rows)?;
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
        let mut sessions = self.sessions.lock().unwrap();
        let sessions_to_remove: Vec<String> = sessions
            .iter()
            .filter(|(_, pty_session)| pty_session.get_session().workspace_id == workspace_id)
            .map(|(id, _)| id.clone())
            .collect();

        for session_id in &sessions_to_remove {
            if let Some(session) = sessions.get_mut(session_id) {
                session.kill();
            }
            sessions.remove(session_id);
        }

        Ok(())
    }

    #[allow(dead_code)]
    pub fn kill_all_sessions(&self) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        for session in sessions.values_mut() {
            session.kill();
        }
        sessions.clear();
        Ok(())
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
