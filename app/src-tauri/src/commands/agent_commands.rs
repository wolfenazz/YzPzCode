use tauri::State;

use crate::agent::{AgentExecutor, AgentTask, ExecuteAgentTaskRequest};
use crate::terminal::TerminalManager;

#[tauri::command]
pub async fn execute_agent_task(
    agent_executor: State<'_, AgentExecutor>,
    terminal_manager: State<'_, TerminalManager>,
    request: ExecuteAgentTaskRequest,
) -> Result<AgentTask, String> {
    use crate::agent_cli::get_provider;

    let agent = request.agent;
    let provider = get_provider(agent);
    agent_executor.set_provider(provider);

    let task = agent_executor.create_task(request);
    let task_id = task.id.clone();
    let task_clone = task.clone();
    let task_id_for_log = task_id.clone();

    let executor = agent_executor.inner().clone();
    let terminal_mgr = terminal_manager.inner().clone();

    tokio::spawn(async move {
        if let Err(e) = executor.execute_with_retry(task_id, &terminal_mgr).await {
            eprintln!("Agent task {} failed: {}", task_id_for_log, e);
        }
    });

    Ok(task_clone)
}

#[tauri::command]
pub async fn get_agent_task_status(
    agent_executor: State<'_, AgentExecutor>,
    task_id: String,
) -> Result<AgentTask, String> {
    agent_executor
        .get_task(&task_id)
        .ok_or_else(|| "Task not found".to_string())
}

#[tauri::command]
pub async fn cancel_agent_task(
    agent_executor: State<'_, AgentExecutor>,
    task_id: String,
) -> Result<bool, String> {
    Ok(agent_executor.cancel_task(&task_id))
}
