use tauri::State;

use crate::discord_presence::DiscordPresenceManager;

#[tauri::command]
pub async fn enable_discord_presence(
    manager: State<'_, DiscordPresenceManager>,
) -> Result<bool, String> {
    manager.enable()?;
    Ok(true)
}

#[tauri::command]
pub async fn disable_discord_presence(
    manager: State<'_, DiscordPresenceManager>,
) -> Result<bool, String> {
    manager.disable()?;
    Ok(false)
}

#[tauri::command]
pub async fn is_discord_presence_enabled(
    manager: State<'_, DiscordPresenceManager>,
) -> Result<bool, String> {
    Ok(manager.is_enabled())
}

#[tauri::command]
pub async fn update_discord_activity(
    manager: State<'_, DiscordPresenceManager>,
    workspace_name: Option<String>,
    details: Option<String>,
    state_text: Option<String>,
    file_icon: Option<String>,
    file_icon_text: Option<String>,
) -> Result<(), String> {
    manager.update_activity(
        workspace_name,
        details,
        state_text,
        file_icon,
        file_icon_text,
    )
}

#[tauri::command]
pub async fn clear_discord_activity(
    manager: State<'_, DiscordPresenceManager>,
) -> Result<(), String> {
    manager.clear_activity()
}
