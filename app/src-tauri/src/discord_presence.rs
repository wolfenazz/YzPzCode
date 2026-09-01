use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use discord_rich_presence::{
    activity::{Activity, Assets, Button, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use serde::{Deserialize, Serialize};

const DISCORD_APP_ID: &str = "1371569865835315280";
const DISCORD_LOGO_URL: &str =
    "https://cdn.jsdelivr.net/gh/wolfenazz/YzPzCode@main/app/src-tauri/icons/icon.png";
const PROJECT_URL: &str = "https://github.com/wolfenazz/YzPzCode";
const RELEASES_URL: &str = "https://github.com/wolfenazz/YzPzCode/releases/latest";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordPresenceState {
    pub enabled: bool,
    pub workspace_name: Option<String>,
    pub details: Option<String>,
    pub state_text: Option<String>,
}

#[derive(Debug)]
pub struct DiscordPresenceManager {
    client: Arc<Mutex<Option<DiscordIpcClient>>>,
    enabled: Arc<Mutex<bool>>,
    started_at: Arc<Mutex<i64>>,
    current_state: Arc<Mutex<DiscordPresenceState>>,
}

impl Clone for DiscordPresenceManager {
    fn clone(&self) -> Self {
        Self {
            client: self.client.clone(),
            enabled: self.enabled.clone(),
            started_at: self.started_at.clone(),
            current_state: self.current_state.clone(),
        }
    }
}

impl DiscordPresenceManager {
    pub fn new() -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
            enabled: Arc::new(Mutex::new(false)),
            started_at: Arc::new(Mutex::new(Self::unix_timestamp())),
            current_state: Arc::new(Mutex::new(DiscordPresenceState {
                enabled: false,
                workspace_name: None,
                details: None,
                state_text: None,
            })),
        }
    }

    pub fn enable(&self) -> Result<(), String> {
        let mut enabled = self.enabled.lock().unwrap();
        if *enabled {
            return Ok(());
        }
        *enabled = true;
        drop(enabled);

        *self.started_at.lock().unwrap() = Self::unix_timestamp();
        self.current_state.lock().unwrap().enabled = true;
        self.connect_and_update()
    }

    pub fn disable(&self) -> Result<(), String> {
        let mut enabled = self.enabled.lock().unwrap();
        if !*enabled {
            return Ok(());
        }
        *enabled = false;
        drop(enabled);

        self.current_state.lock().unwrap().enabled = false;
        self.disconnect()
    }

    pub fn is_enabled(&self) -> bool {
        *self.enabled.lock().unwrap()
    }

    #[allow(dead_code)]
    pub fn get_state(&self) -> DiscordPresenceState {
        self.current_state.lock().unwrap().clone()
    }

    pub fn update_activity(
        &self,
        workspace_name: Option<String>,
        details: Option<String>,
        state_text: Option<String>,
    ) -> Result<(), String> {
        {
            let mut current = self.current_state.lock().unwrap();
            current.workspace_name = workspace_name.clone();
            current.details = details.clone();
            current.state_text = state_text.clone();
        }

        if !self.is_enabled() {
            return Ok(());
        }

        self.connect_and_update()
    }

    pub fn clear_activity(&self) -> Result<(), String> {
        {
            let mut current = self.current_state.lock().unwrap();
            current.workspace_name = None;
            current.details = None;
            current.state_text = None;
        }

        if !self.is_enabled() {
            return Ok(());
        }

        self.send_idle_presence()
    }

    fn connect_and_update(&self) -> Result<(), String> {
        let (details_text, state_text, workspace_name) = {
            let state = self.current_state.lock().unwrap();
            let d = state
                .details
                .clone()
                .unwrap_or_else(|| "No workspace open".to_string());
            let s = state
                .state_text
                .clone()
                .unwrap_or_else(|| "Idle".to_string());
            let w = state.workspace_name.clone();
            (d, s, w)
        };
        let details_text = Self::truncate_for_discord(&details_text);
        let state_text = Self::truncate_for_discord(&state_text);
        let started_at = *self.started_at.lock().unwrap();
        let large_text = workspace_name
            .as_deref()
            .map(|name| format!("YzPzCode - {}", name))
            .unwrap_or_else(|| "YzPzCode - AI coding workspace".to_string());
        let large_text = Self::truncate_for_discord(&large_text);

        let activity = Activity::new()
            .details(&details_text)
            .state(&state_text)
            .assets(
                Assets::new()
                    .large_image(DISCORD_LOGO_URL)
                    .large_text(&large_text),
            )
            .timestamps(Timestamps::new().start(started_at))
            .buttons(Self::activity_buttons());

        self.send_activity(activity)
    }

    fn send_idle_presence(&self) -> Result<(), String> {
        let started_at = *self.started_at.lock().unwrap();
        let activity = Activity::new()
            .details("Idle")
            .state("No workspace open")
            .assets(
                Assets::new()
                    .large_image(DISCORD_LOGO_URL)
                    .large_text("YzPzCode - AI coding workspace"),
            )
            .timestamps(Timestamps::new().start(started_at))
            .buttons(Self::activity_buttons());

        self.send_activity(activity)
    }

    fn activity_buttons() -> Vec<Button<'static>> {
        vec![
            Button::new("View on GitHub", PROJECT_URL),
            Button::new("Download YzPzCode", RELEASES_URL),
        ]
    }

    fn truncate_for_discord(value: &str) -> String {
        value.chars().take(128).collect()
    }

    fn unix_timestamp() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64
    }

    fn send_activity(&self, activity: Activity) -> Result<(), String> {
        let mut client_guard = self.client.lock().unwrap();

        if client_guard.is_none() {
            *client_guard = Some(Self::connect_client()?);
        }

        if let Some(ref mut client) = *client_guard {
            if let Err(first_error) = client.set_activity(activity.clone()) {
                eprintln!(
                    "Discord Rich Presence: reconnecting after update failed: {}",
                    first_error
                );

                if let Some(mut stale_client) = client_guard.take() {
                    let _ = stale_client.close();
                }

                let mut client = Self::connect_client()?;
                client.set_activity(activity).map_err(|e| {
                    format!("Failed to set Discord activity after reconnect: {}", e)
                })?;
                *client_guard = Some(client);
            }
        }

        Ok(())
    }

    fn connect_client() -> Result<DiscordIpcClient, String> {
        let mut client = DiscordIpcClient::new(DISCORD_APP_ID)
            .map_err(|e| format!("Failed to create Discord IPC client: {}", e))?;

        if let Err(e) = client.connect() {
            eprintln!(
                "Discord Rich Presence: could not connect to Discord client: {}",
                e
            );
            return Err(format!("Discord client not running: {}", e));
        }

        Ok(client)
    }

    fn disconnect(&self) -> Result<(), String> {
        let mut client_guard = self.client.lock().unwrap();
        if let Some(mut client) = client_guard.take() {
            client
                .close()
                .map_err(|e| format!("Failed to disconnect Discord IPC: {}", e))?;
        }
        Ok(())
    }
}
