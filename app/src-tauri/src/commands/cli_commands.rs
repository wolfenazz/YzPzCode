use std::collections::HashMap;
use tauri::State;

use crate::agent_cli::{
    AgentCliDetector, AgentCliInfo, AgentCliInstaller, AuthDetector, AuthInfo, CliLaunchState,
    CliLauncher, PrerequisiteStatus, PrerequisitesChecker,
};
use crate::types::AgentType;

#[tauri::command]
pub async fn check_prerequisites() -> Result<Vec<PrerequisiteStatus>, String> {
    Ok(PrerequisitesChecker::check_all())
}

#[tauri::command]
pub async fn check_nodejs() -> Result<PrerequisiteStatus, String> {
    Ok(PrerequisitesChecker::check_nodejs())
}

#[tauri::command]
pub async fn detect_agent_cli(
    detector: State<'_, AgentCliDetector>,
    agent: AgentType,
) -> Result<AgentCliInfo, String> {
    Ok(detector.detect(agent))
}

#[tauri::command]
pub async fn detect_all_agent_clis(
    detector: State<'_, AgentCliDetector>,
) -> Result<HashMap<AgentType, AgentCliInfo>, String> {
    Ok(detector.detect_all())
}

#[tauri::command]
pub async fn clear_cli_cache(detector: State<'_, AgentCliDetector>) -> Result<(), String> {
    detector.clear_cache();
    Ok(())
}

#[tauri::command]
pub async fn install_agent_cli(
    installer: State<'_, AgentCliInstaller>,
    agent: AgentType,
) -> Result<(), String> {
    installer.install(agent)
}

#[tauri::command]
pub async fn get_install_command(agent: AgentType) -> Result<String, String> {
    Ok(AgentCliInstaller::get_install_command(agent))
}

#[tauri::command]
pub async fn open_install_terminal(agent: AgentType) -> Result<(), String> {
    use crate::agent_cli::{get_provider, Platform};
    let provider = get_provider(agent);
    let platform = Platform::current();
    let install_cmd = provider.get_install_command(platform);

    if install_cmd.is_empty() {
        return Err("No installation command available".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x00000010;

        let binary = install_cmd[0].to_lowercase();
        let mut command = if binary == "powershell" || binary == "pwsh" {
            let mut c = std::process::Command::new(&install_cmd[0]);
            c.arg("-NoExit");
            if install_cmd.len() > 1 {
                c.args(&install_cmd[1..]);
            }
            c
        } else {
            let mut c = std::process::Command::new("cmd");
            c.arg("/k").args(&install_cmd);
            c
        };

        // This flag ensures exactly one new console window is created for the command
        command.creation_flags(CREATE_NEW_CONSOLE);
        command.spawn().map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        let full_cmd =
            if install_cmd.len() >= 3 && install_cmd[0] == "bash" && install_cmd[1] == "-c" {
                install_cmd[2..].join(" ")
            } else {
                install_cmd.join(" ")
            };
        std::process::Command::new("osascript")
            .arg("-e")
            .arg(format!(
                "tell application \"Terminal\" to do script \"{}\"",
                full_cmd
            ))
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let full_cmd =
            if install_cmd.len() >= 3 && install_cmd[0] == "bash" && install_cmd[1] == "-c" {
                install_cmd[2..].join(" ")
            } else {
                install_cmd.join(" ")
            };
        let _ = std::process::Command::new("x-terminal-emulator")
            .arg("-e")
            .arg(&full_cmd)
            .spawn()
            .or_else(|_| {
                std::process::Command::new("gnome-terminal")
                    .arg("--")
                    .arg("bash")
                    .arg("-c")
                    .arg(format!("{}; exec bash", full_cmd))
                    .spawn()
            });
    }

    Ok(())
}

#[tauri::command]
pub async fn launch_cli_in_terminal(
    launcher: State<'_, CliLauncher>,
    session_id: String,
    agent: AgentType,
) -> Result<(), String> {
    launcher
        .launch_cli(&session_id, agent)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_cli_in_terminal(
    launcher: State<'_, CliLauncher>,
    session_id: String,
) -> Result<(), String> {
    launcher.stop_cli(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restart_cli_in_terminal(
    launcher: State<'_, CliLauncher>,
    session_id: String,
) -> Result<(), String> {
    launcher.restart_cli(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_cli_launch_state(
    launcher: State<'_, CliLauncher>,
    session_id: String,
) -> Result<Option<CliLaunchState>, String> {
    Ok(launcher.get_launch_state(&session_id))
}

#[tauri::command]
pub async fn get_all_cli_launch_states(
    launcher: State<'_, CliLauncher>,
) -> Result<Vec<CliLaunchState>, String> {
    Ok(launcher.get_all_launch_states())
}

#[tauri::command]
pub async fn check_cli_auth(agent: AgentType) -> Result<AuthInfo, String> {
    Ok(AuthDetector::check_auth(agent))
}

#[tauri::command]
pub async fn check_all_cli_auth() -> Result<Vec<AuthInfo>, String> {
    Ok(AuthDetector::check_all())
}

#[tauri::command]
pub async fn get_auth_instructions(agent: AgentType) -> Result<Vec<String>, String> {
    Ok(AuthDetector::get_auth_instructions(agent))
}

#[tauri::command]
pub async fn get_cli_binary_name(agent: AgentType) -> Result<String, String> {
    Ok(CliLauncher::get_binary_name(agent).to_string())
}

#[tauri::command]
pub async fn detect_all_tool_clis(
    detector: State<'_, AgentCliDetector>,
) -> Result<HashMap<AgentType, AgentCliInfo>, String> {
    Ok(detector.detect_all_tool_clis())
}

#[tauri::command]
pub async fn check_all_tool_auths() -> Result<Vec<AuthInfo>, String> {
    Ok(AuthDetector::check_all_tool_auths())
}

#[tauri::command]
pub async fn get_tool_install_command(agent: AgentType) -> Result<String, String> {
    Ok(AgentCliInstaller::get_install_command(agent))
}

#[tauri::command]
pub async fn open_tool_install_terminal(agent: AgentType) -> Result<(), String> {
    open_install_terminal(agent).await
}

pub fn build_agent_queue(
    allocation: &HashMap<AgentType, usize>,
    count: usize,
) -> Vec<Option<AgentType>> {
    let mut queue: Vec<Option<AgentType>> = Vec::new();
    for (agent_type, agent_count) in allocation.iter() {
        for _ in 0..*agent_count {
            queue.push(Some(*agent_type));
        }
    }
    while queue.len() < count {
        queue.push(None);
    }
    queue
}
