use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use super::{
    AgentTask, AgentTaskStatus, ExecuteAgentTaskRequest, COMMAND_GENERATION_PROMPT,
    MAX_RETRIES,
};
use crate::agent_cli::AgentCliProvider;
use crate::terminal::TerminalManager;
use crate::utils::process::ProcessRunner;

#[derive(Clone)]
pub struct AgentExecutor {
    tasks: Arc<Mutex<HashMap<String, AgentTask>>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    provider: Arc<Mutex<Option<Box<dyn AgentCliProvider>>>>,
}

impl AgentExecutor {
    pub fn new(provider: Box<dyn AgentCliProvider>) -> Self {
        AgentExecutor {
            tasks: Arc::new(Mutex::new(HashMap::new())),
            app_handle: Arc::new(Mutex::new(None)),
            provider: Arc::new(Mutex::new(Some(provider))),
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        let mut app = self.app_handle.lock().unwrap();
        *app = Some(handle);
    }

    pub fn set_provider(&self, provider: Box<dyn AgentCliProvider>) {
        let mut prov = self.provider.lock().unwrap();
        *prov = Some(provider);
    }

    pub fn create_task(&self, request: ExecuteAgentTaskRequest) -> AgentTask {
        let task = AgentTask {
            id: Uuid::new_v4().to_string(),
            session_id: request.session_id,
            agent: request.agent,
            prompt: request.prompt,
            cwd: request.cwd,
            status: AgentTaskStatus::Pending,
            generated_command: None,
            output: String::new(),
            error: None,
            retry_count: 0,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            completed_at: None,
        };

        let mut tasks = self.tasks.lock().unwrap();
        tasks.insert(task.id.clone(), task.clone());
        task
    }

    pub fn get_task(&self, task_id: &str) -> Option<AgentTask> {
        self.tasks.lock().unwrap().get(task_id).cloned()
    }

    pub fn update_task_status(&self, task_id: &str, status: AgentTaskStatus) {
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(task) = tasks.get_mut(task_id) {
            let is_terminal = matches!(
                status,
                AgentTaskStatus::Completed | AgentTaskStatus::Failed | AgentTaskStatus::Cancelled
            );
            task.status = status;
            if is_terminal {
                task.completed_at = Some(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64,
                );
            }
        }
    }

    pub fn set_generated_command(&self, task_id: &str, command: String) {
        if let Some(task) = self.tasks.lock().unwrap().get_mut(task_id) {
            task.generated_command = Some(command);
        }
    }

    pub fn set_error(&self, task_id: &str, error: String) {
        if let Some(task) = self.tasks.lock().unwrap().get_mut(task_id) {
            task.error = Some(error);
        }
    }

    pub fn increment_retry(&self, task_id: &str) -> u32 {
        if let Some(task) = self.tasks.lock().unwrap().get_mut(task_id) {
            task.retry_count += 1;
            return task.retry_count;
        }
        0
    }

    pub fn cancel_task(&self, task_id: &str) -> bool {
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(task) = tasks.get_mut(task_id) {
            if matches!(task.status, AgentTaskStatus::Pending | AgentTaskStatus::Running) {
                task.status = AgentTaskStatus::Cancelled;
                task.completed_at = Some(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64,
                );
                return true;
            }
        }
        false
    }

    pub fn generate_command_prompt(&self, cwd: &str, user_prompt: &str) -> String {
        COMMAND_GENERATION_PROMPT
            .replace("{cwd}", cwd)
            .replace("{prompt}", user_prompt)
    }

    pub async fn execute_with_retry(
        &self,
        task_id: String,
        terminal_manager: &TerminalManager,
    ) -> Result<(), String> {
        let task = self.get_task(&task_id).ok_or("Task not found")?;
        let prompt = self.generate_command_prompt(&task.cwd, &task.prompt);

        self.update_task_status(&task_id, AgentTaskStatus::Running);
        self.emit_task_update(&task_id);

        let mut retry_count = 0;
        loop {
            match self.generate_command(&prompt).await {
                Ok(command) => {
                    if command == "UNKNOWN" {
                        self.set_error(&task_id, "Could not generate a command for this task".to_string());
                        self.update_task_status(&task_id, AgentTaskStatus::Failed);
                        self.emit_task_update(&task_id);
                        return Err("Could not generate command".to_string());
                    }

                    self.set_generated_command(&task_id, command.clone());
                    self.emit_task_update(&task_id);

                    let command_with_newline = format!("{}\n", command);
                    terminal_manager
                        .write_to_session(&task.session_id, &command_with_newline)
                        .map_err(|e| e.to_string())?;

                    self.update_task_status(&task_id, AgentTaskStatus::Completed);
                    self.emit_task_update(&task_id);
                    return Ok(());
                }
                Err(e) => {
                    retry_count += 1;
                    if retry_count >= MAX_RETRIES {
                        self.set_error(&task_id, format!("Failed after {} retries: {}", MAX_RETRIES, e));
                        self.update_task_status(&task_id, AgentTaskStatus::Failed);
                        self.emit_task_update(&task_id);
                        return Err(e);
                    }
                    self.increment_retry(&task_id);
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        }
    }

    async fn generate_command(&self, prompt: &str) -> Result<String, String> {
        let binary_name = {
            let provider = self.provider.lock().unwrap();
            provider.as_ref().ok_or("Provider not set")?.binary_name()
        };

        let binary_path = ProcessRunner::find_binary_async(binary_name).await
            .ok_or(format!("CLI '{}' not found", binary_name))?;

        let prompt = prompt.to_string();
        tokio::task::spawn_blocking(move || Self::run_cli(&binary_path, &prompt))
            .await
            .map_err(|e| e.to_string())?
    }

    fn run_cli(binary_path: &str, prompt: &str) -> Result<String, String> {
        let output = ProcessRunner::run_cmd_hidden(binary_path, &[prompt])
            .map_err(|e| format!("Failed to execute CLI: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("CLI execution failed: {}", stderr));
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    fn emit_task_update(&self, task_id: &str) {
        if let Some(app) = self.app_handle.lock().unwrap().as_ref() {
            if let Some(task) = self.get_task(task_id) {
                let _ = app.emit(&format!("agent-task-update:{}", task_id), &task);
            }
        }
    }
}
