use serde_json::{json, Value};
use tauri::State;

use crate::agent_host::{AgentHostManager, CreateAgentSessionRequest};

#[tauri::command]
pub async fn ensure_agent_host(manager: State<'_, AgentHostManager>) -> Result<Value, String> {
    let status = manager.ensure_running().await.map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(status).unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn get_agent_host_status(manager: State<'_, AgentHostManager>) -> Result<Value, String> {
    let status = manager.status();
    Ok(serde_json::to_value(status).unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn create_agent_session(
    manager: State<'_, AgentHostManager>,
    request: CreateAgentSessionRequest,
) -> Result<Value, String> {
    let result = manager
        .quick_command(
            "create-session",
            Some(json!({
                "workspaceId": request.workspace_id,
                "cwd": request.cwd,
                "providerId": request.provider_id,
                "modelId": request.model_id,
                "apiKey": request.api_key,
                "baseUrl": request.base_url,
                "systemPrompt": request.system_prompt,
                "title": request.title,
                "enableAgentTeams": request.enable_agent_teams,
                "teamName": request.team_name,
                "compactionStrategy": request.compaction_strategy,
                "maxTotalTokens": request.max_total_tokens,
            })),
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(result)
}

#[tauri::command]
pub async fn send_agent_message(
    manager: State<'_, AgentHostManager>,
    session_id: String,
    prompt: String,
    mode: Option<String>,
    user_images: Option<Vec<String>>,
    user_files: Option<Vec<String>>,
) -> Result<Value, String> {
    manager
        .quick_command(
            "send-message",
            Some(json!({
                "sessionId": session_id,
                "prompt": prompt,
                "mode": mode,
                "userImages": user_images.unwrap_or_default(),
                "userFiles": user_files.unwrap_or_default(),
            })),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resume_agent_session(
    manager: State<'_, AgentHostManager>,
    session_id: String,
) -> Result<Value, String> {
    manager
        .quick_command("resume-session", Some(json!({ "sessionId": session_id })))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn abort_agent_session(
    manager: State<'_, AgentHostManager>,
    session_id: String,
) -> Result<Value, String> {
    manager
        .quick_command("abort", Some(json!({ "sessionId": session_id })))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_agent_session(
    manager: State<'_, AgentHostManager>,
    session_id: String,
) -> Result<Value, String> {
    manager
        .quick_command("stop", Some(json!({ "sessionId": session_id })))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_agent_session(
    manager: State<'_, AgentHostManager>,
    session_id: String,
) -> Result<(), String> {
    manager
        .close_session(&session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_agent_session(
    manager: State<'_, AgentHostManager>,
    session_id: String,
) -> Result<Value, String> {
    let result = manager
        .quick_command("delete-session", Some(json!({ "sessionId": session_id })))
        .await
        .map_err(|e| e.to_string())?;
    manager.remove_session_from_workspace(&session_id);
    Ok(result)
}

#[tauri::command]
pub async fn list_agent_sessions(
    manager: State<'_, AgentHostManager>,
    workspace_id: Option<String>,
) -> Result<Value, String> {
    let result = manager
        .quick_command("list-sessions", None)
        .await
        .map_err(|e| e.to_string())?;

    let sessions = result
        .get("sessions")
        .cloned()
        .unwrap_or(Value::Array(vec![]));
    let filtered: Vec<Value> = if let Some(ws_id) = workspace_id {
        sessions
            .as_array()
            .map(|list| {
                list.iter()
                    .filter(|s| {
                        s.get("metadata")
                            .and_then(|m| m.get("workspaceId"))
                            .and_then(|v| v.as_str())
                            .map(|id| id == ws_id)
                            .unwrap_or(false)
                    })
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    } else {
        sessions.as_array().cloned().unwrap_or_default()
    };

    Ok(json!({ "sessions": filtered }))
}

#[tauri::command]
pub async fn get_agent_session(
    manager: State<'_, AgentHostManager>,
    session_id: String,
) -> Result<Value, String> {
    manager
        .quick_command("get-session", Some(json!({ "sessionId": session_id })))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_agent_messages(
    manager: State<'_, AgentHostManager>,
    session_id: String,
) -> Result<Value, String> {
    manager
        .quick_command("read-messages", Some(json!({ "sessionId": session_id })))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_agent_session_preview(
    manager: State<'_, AgentHostManager>,
    session_id: String,
) -> Result<Value, String> {
    manager
        .quick_command(
            "get-session-preview",
            Some(json!({ "sessionId": session_id })),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_agent_session_title(
    manager: State<'_, AgentHostManager>,
    session_id: String,
    title: String,
) -> Result<Value, String> {
    manager
        .quick_command(
            "update-title",
            Some(json!({ "sessionId": session_id, "title": title })),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_agent_session_model(
    manager: State<'_, AgentHostManager>,
    session_id: String,
    model_id: String,
) -> Result<Value, String> {
    manager
        .quick_command(
            "update-model",
            Some(json!({ "sessionId": session_id, "modelId": model_id })),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_agent_fast_mode(
    manager: State<'_, AgentHostManager>,
    session_id: String,
    enabled: bool,
) -> Result<Value, String> {
    manager
        .quick_command(
            "set-fast-mode",
            Some(json!({ "sessionId": session_id, "enabled": enabled })),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn approve_agent_tool(
    manager: State<'_, AgentHostManager>,
    request_id: String,
    approved: bool,
    reason: Option<String>,
) -> Result<Value, String> {
    manager
        .quick_command(
            "approve-tool",
            Some(json!({ "requestId": request_id, "approved": approved, "reason": reason })),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_agent_providers(manager: State<'_, AgentHostManager>) -> Result<Value, String> {
    manager
        .quick_command("get-providers", None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_agent_models(
    manager: State<'_, AgentHostManager>,
    provider_id: String,
) -> Result<Value, String> {
    manager
        .quick_command("get-models", Some(json!({ "providerId": provider_id })))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_agent_provider_config(
    manager: State<'_, AgentHostManager>,
    provider_id: String,
    api_key: Option<String>,
    base_url: Option<String>,
    model_id: Option<String>,
) -> Result<Value, String> {
    manager
        .quick_command(
            "set-provider-config",
            Some(json!({
                "providerId": provider_id,
                "apiKey": api_key,
                "baseUrl": base_url,
                "modelId": model_id,
            })),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_agent_provider_configs(
    manager: State<'_, AgentHostManager>,
) -> Result<Value, String> {
    manager
        .quick_command("list-provider-configs", None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_agent_provider_config(
    manager: State<'_, AgentHostManager>,
    provider_id: String,
) -> Result<Value, String> {
    manager
        .quick_command(
            "remove-provider-config",
            Some(json!({ "providerId": provider_id })),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_agent_session_usage(
    manager: State<'_, AgentHostManager>,
    session_id: String,
) -> Result<Value, String> {
    manager
        .quick_command("get-usage", Some(json!({ "sessionId": session_id })))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_agent_session_connection(
    manager: State<'_, AgentHostManager>,
    session_id: String,
    provider_id: Option<String>,
    model_id: Option<String>,
    api_key: Option<String>,
    base_url: Option<String>,
    thinking: Option<bool>,
    reasoning_effort: Option<String>,
) -> Result<Value, String> {
    let mut payload = serde_json::Map::new();
    payload.insert("sessionId".to_string(), json!(session_id));
    payload.insert("providerId".to_string(), json!(provider_id));
    payload.insert("modelId".to_string(), json!(model_id));
    payload.insert("apiKey".to_string(), json!(api_key));
    payload.insert("baseUrl".to_string(), json!(base_url));
    if let Some(t) = thinking {
        payload.insert("thinking".to_string(), json!(t));
    }
    if let Some(e) = reasoning_effort {
        payload.insert("reasoningEffort".to_string(), json!(e));
    }
    manager
        .quick_command("update-connection", Some(Value::Object(payload)))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_agent_settings(manager: State<'_, AgentHostManager>) -> Result<Value, String> {
    manager
        .quick_command("get-settings", None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_agent_settings(
    manager: State<'_, AgentHostManager>,
    update: Value,
) -> Result<Value, String> {
    manager
        .quick_command("update-settings", Some(json!({ "update": update })))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_agent_tool_policy(
    manager: State<'_, AgentHostManager>,
    tool_name: String,
    enabled: Option<bool>,
    auto_approve: Option<bool>,
) -> Result<Value, String> {
    manager
        .quick_command(
            "set-tool-policy",
            Some(json!({
                "name": tool_name,
                "enabled": enabled,
                "autoApprove": auto_approve,
            })),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_agent_tool_policy(
    manager: State<'_, AgentHostManager>,
    tool_name: String,
) -> Result<Value, String> {
    manager
        .quick_command("clear-tool-policy", Some(json!({ "name": tool_name })))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_agent_user_instructions(
    manager: State<'_, AgentHostManager>,
    kind: String,
) -> Result<Value, String> {
    manager
        .quick_command("list-user-instructions", Some(json!({ "type": kind })))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_agent_user_instruction(
    manager: State<'_, AgentHostManager>,
    kind: String,
    name: String,
    description: Option<String>,
    instructions: Option<String>,
) -> Result<Value, String> {
    manager
        .quick_command(
            "add-user-instruction",
            Some(json!({
                "type": kind,
                "name": name,
                "description": description,
                "instructions": instructions,
            })),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_agent_user_instruction(
    manager: State<'_, AgentHostManager>,
    kind: String,
    id: String,
    enabled: bool,
) -> Result<Value, String> {
    manager
        .quick_command(
            "toggle-user-instruction",
            Some(json!({
                "type": kind,
                "id": id,
                "enabled": enabled,
            })),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_agent_runtime_commands(
    manager: State<'_, AgentHostManager>,
) -> Result<Value, String> {
    manager
        .quick_command("list-runtime-commands", None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn answer_agent_question(
    manager: State<'_, AgentHostManager>,
    request_id: String,
    answer: String,
) -> Result<Value, String> {
    manager
        .quick_command(
            "answer-question",
            Some(json!({ "requestId": request_id, "answer": answer })),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_agent_mcp_servers(manager: State<'_, AgentHostManager>) -> Result<Value, String> {
    manager
        .quick_command("list-mcp-servers", None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_agent_mcp_server(
    manager: State<'_, AgentHostManager>,
    name: String,
    transport: Value,
) -> Result<Value, String> {
    manager
        .quick_command(
            "add-mcp-server",
            Some(json!({ "name": name, "transport": transport })),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_agent_mcp_server(
    manager: State<'_, AgentHostManager>,
    name: String,
) -> Result<Value, String> {
    manager
        .quick_command("remove-mcp-server", Some(json!({ "name": name })))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_agent_mcp_server_disabled(
    manager: State<'_, AgentHostManager>,
    name: String,
    disabled: bool,
) -> Result<Value, String> {
    manager
        .quick_command(
            "set-mcp-server-disabled",
            Some(json!({ "name": name, "disabled": disabled })),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn shutdown_agent_host(manager: State<'_, AgentHostManager>) -> Result<(), String> {
    manager.shutdown();
    Ok(())
}
