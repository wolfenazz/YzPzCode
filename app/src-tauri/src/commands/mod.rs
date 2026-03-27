use std::collections::HashMap;
use tauri::State;

use crate::agent::{AgentExecutor, AgentTask, ExecuteAgentTaskRequest};
use crate::agent_cli::{
    AgentCliDetector, AgentCliInfo, AgentCliInstaller, AuthDetector, AuthInfo, CliLaunchState,
    CliLauncher, PrerequisiteStatus, PrerequisitesChecker,
};
use crate::ide::{launch_ide, IdeDetector};
use crate::terminal::TerminalManager;
use crate::types::{AgentType, CreateSessionsRequest, IdeInfo, IdeType, LaunchExternalRequest, TerminalSession};

#[tauri::command]
pub async fn create_terminal_sessions(
    manager: State<'_, TerminalManager>,
    launcher: State<'_, CliLauncher>,
    request: CreateSessionsRequest,
) -> Result<Vec<TerminalSession>, String> {
    // Kill only existing sessions for this workspace to ensure a clean state
    let _ = manager.kill_sessions_by_workspace(&request.workspace_id);

    let sessions = manager
        .create_sessions(
            request.workspace_id,
            request.workspace_path,
            request.count,
            request.agent_fleet.allocation,
        )
        .map_err(|e| e.to_string())?;

    // Automatically launch CLI for sessions that have an agent assigned
    // We do this after creating all sessions
    for session in &sessions {
        if let Some(agent) = session.agent {
            let _ = launcher.launch_cli(&session.id, agent);
        }
    }

    Ok(sessions)
}

#[tauri::command]
pub async fn write_to_terminal(
    manager: State<'_, TerminalManager>,
    session_id: String,
    input: String,
) -> Result<(), String> {
    manager
        .write_to_session(&session_id, &input)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resize_terminal(
    manager: State<'_, TerminalManager>,
    session_id: String,
    cols: u16,
    rows: u16,
    pixel_width: Option<u16>,
    pixel_height: Option<u16>,
) -> Result<(), String> {
    let pw = pixel_width.unwrap_or(0);
    let ph = pixel_height.unwrap_or(0);
    manager
        .resize_session(&session_id, cols, rows, pw, ph)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kill_session(
    manager: State<'_, TerminalManager>,
    session_id: String,
) -> Result<(), String> {
    manager.kill_session(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kill_workspace_sessions(
    manager: State<'_, TerminalManager>,
    workspace_id: String,
) -> Result<(), String> {
    manager
        .kill_sessions_by_workspace(&workspace_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_sessions(
    manager: State<'_, TerminalManager>,
) -> Result<Vec<TerminalSession>, String> {
    Ok(manager.get_all_sessions())
}

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

    let executor = agent_executor.inner().clone();
    let terminal_mgr = terminal_manager.inner().clone();

    tokio::spawn(async move {
        let _ = executor.execute_with_retry(task_id, &terminal_mgr).await;
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

#[tauri::command]
pub async fn check_prerequisites() -> Result<Vec<PrerequisiteStatus>, String> {
    Ok(PrerequisitesChecker::check_all())
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
        let full_cmd = install_cmd.join(" ");
        std::process::Command::new("osascript")
            .arg("-e")
            .arg(format!("tell application \"Terminal\" to do script \"{}\"", full_cmd))
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let full_cmd = install_cmd.join(" ");
        // Try common terminal emulators
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
pub async fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn minimize_window(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn maximize_window(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn close_window(
    window: tauri::Window,
    terminal_manager: State<'_, TerminalManager>,
) -> Result<(), String> {
    println!("close_window called, cleaning up sessions...");
    let _ = terminal_manager.kill_all_sessions();
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn detect_ide(detector: State<'_, IdeDetector>, ide: IdeType) -> Result<IdeInfo, String> {
    let mut det = detector.inner().clone();
    Ok(det.detect(ide))
}

#[tauri::command]
pub async fn detect_all_ides_cmd(detector: State<'_, IdeDetector>) -> Result<std::collections::HashMap<IdeType, IdeInfo>, String> {
    let mut det = detector.inner().clone();
    Ok(det.detect_all())
}

#[tauri::command]
pub async fn launch_ide_cmd(ide: IdeType, directory: String) -> Result<(), String> {
    launch_ide(ide, &directory)
}

#[tauri::command]
pub async fn send_feedback(
    message: String,
    name: Option<String>,
    contact: Option<String>,
) -> Result<(), String> {
    #[derive(serde::Serialize)]
    struct DiscordEmbed {
        title: String,
        description: String,
        fields: Vec<DiscordField>,
        color: u32,
        timestamp: String,
    }

    #[derive(serde::Serialize)]
    struct DiscordField {
        name: String,
        value: String,
        inline: bool,
    }

    #[derive(serde::Serialize)]
    struct DiscordWebhook {
        embeds: Vec<DiscordEmbed>,
    }

    let webhook_url = "https://canary.discord.com/api/webhooks/1486331999936581664/5NhDM8ejMhP_nWwvGwhxbTewEiYr8xsNtrvYB2v3QHZxUUEiOcFwm3mQvlkXUv13yYwI";

    let embed = DiscordEmbed {
        title: "📝 New Feedback".to_string(),
        description: message,
        fields: vec![
            DiscordField {
                name: "Name".to_string(),
                value: name.unwrap_or_else(|| "Anonymous".to_string()),
                inline: true,
            },
            DiscordField {
                name: "Contact".to_string(),
                value: contact.unwrap_or_else(|| "Not provided".to_string()),
                inline: true,
            },
        ],
        color: 0x5865F2,
        timestamp: chrono_lite_timestamp(),
    };

    let webhook = DiscordWebhook {
        embeds: vec![embed],
    };

    let client = reqwest::Client::new();
    client
        .post(webhook_url)
        .json(&webhook)
        .send()
        .await
        .map_err(|e| format!("Failed to send feedback: {}", e))?;

    Ok(())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsVersionInfo {
    pub os_type: String,
    pub version: String,
    pub is_windows_10: bool,
    pub display_warning: bool,
}

#[tauri::command]
pub async fn get_os_version() -> Result<OsVersionInfo, String> {
    #[cfg(target_os = "windows")]
    {
        let version = get_windows_version();
        let is_windows_10 = version.starts_with("10.") && !version.contains("10.0.22");
        
        Ok(OsVersionInfo {
            os_type: "windows".to_string(),
            version: version.clone(),
            is_windows_10,
            display_warning: is_windows_10,
        })
    }

    #[cfg(target_os = "macos")]
    {
        let version = get_macos_version();
        Ok(OsVersionInfo {
            os_type: "macos".to_string(),
            version,
            is_windows_10: false,
            display_warning: false,
        })
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let version = get_linux_version();
        Ok(OsVersionInfo {
            os_type: "linux".to_string(),
            version,
            is_windows_10: false,
            display_warning: false,
        })
    }
}

#[cfg(target_os = "windows")]
fn get_windows_version() -> String {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let output = Command::new("cmd")
        .args(["/c", "ver"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let ver_output = String::from_utf8_lossy(&o.stdout);
            if let Some(version_part) = ver_output.split("Version ").nth(1) {
                if let Some(_version_num) = version_part.split('.').next() {
                    let build = version_part.split('.').nth(2).unwrap_or("0");
                    let build_num: u32 = build.chars().filter(|c| c.is_digit(10)).collect::<String>().parse().unwrap_or(0);
                    let minor = version_part.split('.').nth(1).unwrap_or("0");
                    return format!("10.{}.{}", minor, build_num);
                }
            }
            "unknown".to_string()
        }
        _ => "unknown".to_string()
    }
}

#[cfg(target_os = "macos")]
fn get_macos_version() -> String {
    use std::process::Command;
    
    let output = Command::new("sw_vers")
        .arg("-productVersion")
        .output();
    
    match output {
        Ok(o) if o.status.success() => {
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        }
        _ => "unknown".to_string()
    }
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn get_linux_version() -> String {
    use std::process::Command;
    
    let output = Command::new("uname")
        .arg("-r")
        .output();
    
    match output {
        Ok(o) if o.status.success() => {
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        }
        _ => "unknown".to_string()
    }
}

fn chrono_lite_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    let datetime = secs as i64;
    format!("{}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        1970 + datetime / 31536000,
        (datetime % 31536000) / 2592000 + 1,
        (datetime % 2592000) / 86400 + 1,
        (datetime % 86400) / 3600,
        (datetime % 3600) / 60,
        datetime % 60
    )
}

fn get_grid_dimensions(count: usize) -> (usize, usize) {
    match count {
        1 => (1, 1),
        2 => (2, 1),
        4 => (2, 2),
        6 => (3, 2),
        8 => (4, 2),
        _ => (1, 1),
    }
}

fn build_agent_queue(allocation: &std::collections::HashMap<AgentType, usize>, count: usize) -> Vec<Option<AgentType>> {
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

#[tauri::command]
pub async fn launch_external_terminals(
    request: LaunchExternalRequest,
) -> Result<(), String> {
    if request.count == 0 {
        return Err("Terminal count must be at least 1".to_string());
    }

    let path = std::path::Path::new(&request.workspace_path);
    if !path.exists() {
        return Err(format!("Workspace path does not exist: {}", request.workspace_path));
    }
    if !path.is_dir() {
        return Err(format!("Workspace path is not a directory: {}", request.workspace_path));
    }

    let agent_queue = build_agent_queue(&request.agent_allocation, request.count);
    let (cols, rows) = get_grid_dimensions(request.count);

    println!("DEBUG: agent_queue = {:?}", agent_queue);
    println!("DEBUG: count = {}, cols = {}, rows = {}", request.count, cols, rows);

    #[cfg(target_os = "windows")]
    {
        launch_external_windows_separate(&request.workspace_path, &agent_queue, cols, rows)
    }

    #[cfg(target_os = "macos")]
    {
        launch_external_macos(&request.workspace_path, &agent_queue, cols, rows)
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        launch_external_linux(&request.workspace_path, &agent_queue, cols, rows)
    }
}

#[cfg(target_os = "windows")]
fn launch_external_windows_separate(
    workspace_path: &str,
    agent_queue: &[Option<AgentType>],
    cols: usize,
    rows: usize,
) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    const CREATE_NEW_CONSOLE: u32 = 0x00000010;

    let spawned_count = AtomicUsize::new(0);

    for (index, agent) in agent_queue.iter().enumerate() {
        let command_str = if let Some(a) = agent {
            let binary = crate::agent_cli::CliLauncher::get_binary_name(*a);
            format!("/k \"cd /d {} && timeout /t 2 /nobreak >nul && {}\"", workspace_path, binary)
        } else {
            format!("/k \"cd /d {}\"", workspace_path)
        };

        let mut cmd = Command::new("cmd");
        cmd.raw_arg(&command_str);
        cmd.creation_flags(CREATE_NEW_CONSOLE);
        cmd.current_dir(workspace_path);

        match cmd.spawn() {
            Ok(mut child) => {
                spawned_count.fetch_add(1, Ordering::SeqCst);

                std::thread::spawn(move || {
                    let _ = child.wait();
                });

                if index < agent_queue.len() - 1 {
                    std::thread::sleep(Duration::from_millis(200));
                }
            }
            Err(e) => return Err(format!("Failed to spawn terminal {}: {}", index, e)),
        }
    }

    if spawned_count.load(Ordering::SeqCst) == 0 {
        return Ok(());
    }

    std::thread::sleep(Duration::from_millis(500));

    tile_console_windows(spawned_count.load(Ordering::SeqCst), cols, rows);

    Ok(())
}

#[cfg(target_os = "windows")]
fn tile_console_windows(count: usize, cols: usize, rows: usize) {
    use std::ptr;

    type HWND = isize;
    type DWORD = u32;
    type BOOL = i32;
    type UINT = u32;

    const SM_CXSCREEN: i32 = 0;
    const SM_CYSCREEN: i32 = 1;
    const SWP_NOZORDER: UINT = 0x0004;

    #[link(name = "user32")]
    extern "system" {
        fn GetSystemMetrics(n_index: i32) -> i32;
        fn GetConsoleWindow() -> HWND;
        fn FindWindowW(lp_class_name: *const u16, lp_window_name: *const u16) -> HWND;
        fn GetWindowThreadProcessId(hwnd: HWND, lpdw_process_id: *mut DWORD) -> DWORD;
        fn IsWindowVisible(hwnd: HWND) -> BOOL;
        fn SetWindowPos(
            hwnd: HWND,
            hwnd_insert_after: HWND,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            u_flags: UINT,
        ) -> BOOL;
    }

    let screen_w = unsafe { GetSystemMetrics(SM_CXSCREEN) };
    let screen_h = unsafe { GetSystemMetrics(SM_CYSCREEN) };

    let gap: i32 = 8;
    let total_gap_x = gap * (cols as i32 + 1);
    let total_gap_y = gap * (rows as i32 + 1);
    let tile_w = (screen_w - total_gap_x) / cols as i32;
    let tile_h = (screen_h - total_gap_y) / rows as i32;

    let console_class: Vec<u16> = "ConsoleWindowClass\0".encode_utf16().collect();
    let console_class_ptr = console_class.as_ptr();

    let our_console_hwnd = unsafe { GetConsoleWindow() };
    let mut our_pid: DWORD = 0;
    if our_console_hwnd != 0 {
        unsafe { GetWindowThreadProcessId(our_console_hwnd, &mut our_pid); }
    }

    let mut found_hwnds: Vec<HWND> = Vec::with_capacity(count);

    for _ in 0..count {
        let hwnd = unsafe { FindWindowW(console_class_ptr, ptr::null()) };
        if hwnd == 0 {
            break;
        }

        let mut pid: DWORD = 0;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid); }

        let is_visible = unsafe { IsWindowVisible(hwnd) } != 0;
        let is_not_ours = pid != 0 && pid != our_pid;
        let already_found = found_hwnds.contains(&hwnd);

        if is_visible && is_not_ours && !already_found {
            found_hwnds.push(hwnd);
        }
    }

    for (i, &hwnd) in found_hwnds.iter().take(count).enumerate() {
        let col = i % cols;
        let row = i / cols;
        let x = gap + (col as i32 * (tile_w + gap));
        let y = gap + (row as i32 * (tile_h + gap));

        unsafe {
            SetWindowPos(hwnd, 0, x, y, tile_w, tile_h, SWP_NOZORDER);
        }
    }
}

#[cfg(target_os = "macos")]
fn launch_external_macos(
    workspace_path: &str,
    agent_queue: &[Option<AgentType>],
    cols: usize,
    rows: usize,
) -> Result<(), String> {
    use std::process::Command;

    let mut pids: Vec<u32> = Vec::new();

    for (index, agent) in agent_queue.iter().enumerate() {
        let script = if let Some(a) = agent {
            let binary = crate::agent_cli::CliLauncher::get_binary_name(*a);
            format!("cd \"{}\" && {}", workspace_path, binary)
        } else {
            format!("cd \"{}\"", workspace_path)
        };

        let escaped_script = script.replace('"', "\\'");

        let result = Command::new("osascript")
            .arg("-e")
            .arg(format!("tell application \"Terminal\" to do script \"{}\"", escaped_script))
            .spawn()
            .map_err(|e| format!("Failed to spawn terminal {}: {}", index, e));

        match result {
            Ok(child) => {
                pids.push(child.id());
                std::thread::spawn(move || { let _ = child.wait(); });
            }
            Err(e) => return Err(e),
        }

        if index < agent_queue.len() - 1 {
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
    }

    std::thread::sleep(std::time::Duration::from_millis(800));

    tile_terminal_macos(pids.len().min(agent_queue.len()), cols, rows);

    Ok(())
}

#[cfg(target_os = "macos")]
fn tile_terminal_macos(count: usize, cols: usize, rows: usize) {
    use std::process::Command;

    let screen_size = Command::new("system_profiler")
        .args(["SPDisplaysDataType", "-json"])
        .output();

    let (screen_w, screen_h) = if let Ok(output) = screen_size {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            parse_macos_screen_size(&stdout)
        } else {
            (1920, 1080)
        }
    } else {
        (1920, 1080)
    };

    let menu_bar_height: i32 = 25;
    let dock_height: i32 = 70;
    let gap: i32 = 4;
    let usable_h = screen_h - menu_bar_height - dock_height;
    let total_gap_x = gap * (cols as i32 + 1);
    let total_gap_y = gap * (rows as i32 + 1);
    let tile_w = (screen_w - total_gap_x) / cols as i32;
    let tile_h = (usable_h - total_gap_y) / rows as i32;

    for i in 0..count {
        let col = i % cols;
        let row = i / cols;
        let x = gap + (col as i32 * (tile_w + gap));
        let y = menu_bar_height + gap + (row as i32 * (tile_h + gap));
        let window_index = i + 1;

        let script = format!(
            "tell application \"Terminal\" to set bounds of window {} to {{{}, {}, {}, {}}}",
            window_index, x, y, x + tile_w, y + tile_h
        );

        let _ = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .spawn();
    }
}

#[cfg(target_os = "macos")]
fn parse_macos_screen_size(json: &str) -> (i32, i32) {
    let default = (1920, 1080);
    let width_key = "\"_spdisplays_resolution\"";
    let height_key = "\"_spdisplays_main\"";

    for line in json.lines() {
        if line.contains("\"spdisplays_ndrvs\"") {
            continue;
        }
        if line.contains(width_key) || line.contains("\"Width\"") {
            if let Some(pos) = line.find(':') {
                let num_str = line[pos + 1..].trim().trim_matches(',').trim();
                if let Ok(w) = num_str.parse::<i32>() {
                    if w > 100 {
                        if let Ok(h) = find_macos_height(json) {
                            return (w, h);
                        }
                    }
                }
            }
        }
    }
    default
}

#[cfg(target_os = "macos")]
fn find_macos_height(json: &str) -> Result<i32, ()> {
    let default = 1080;
    for line in json.lines() {
        if line.contains("\"Height\"") || line.contains("\"spdisplays_resolution\"") {
            if let Some(pos) = line.find(':') {
                let num_str = line[pos + 1..].trim().trim_matches(',').trim();
                if let Ok(h) = num_str.parse::<i32>() {
                    if h > 100 {
                        return Ok(h);
                    }
                }
            }
        }
    }
    Ok(default)
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn launch_external_linux(
    workspace_path: &str,
    agent_queue: &[Option<AgentType>],
    cols: usize,
    rows: usize,
) -> Result<(), String> {
    use std::process::Command;

    let terminal = detect_linux_terminal();

    for (index, agent) in agent_queue.iter().enumerate() {
        let cmd = if let Some(a) = agent {
            let binary = crate::agent_cli::CliLauncher::get_binary_name(*a);
            format!("cd '{}' && {}; exec bash", workspace_path, binary)
        } else {
            format!("cd '{}'; exec bash", workspace_path)
        };

        let result = match terminal.as_str() {
            "gnome-terminal" => Command::new("gnome-terminal")
                .args(["--", "bash", "-c", &cmd])
                .spawn(),
            "konsole" => Command::new("konsole")
                .args(["-e", "bash", "-c", &cmd])
                .spawn(),
            "xfce4-terminal" => Command::new("xfce4-terminal")
                .args(["-e", &format!("bash -c '{}'", cmd)])
                .spawn(),
            _ => Command::new("x-terminal-emulator")
                .args(["-e", &format!("bash -c '{}'", cmd)])
                .spawn(),
        };

        match result {
            Ok(child) => {
                std::thread::spawn(move || { let _ = child.wait(); });
            }
            Err(e) => return Err(format!("Failed to spawn terminal {}: {}", index, e)),
        }

        if index < agent_queue.len() - 1 {
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
    }

    std::thread::sleep(std::time::Duration::from_millis(800));

    tile_terminal_linux(agent_queue.len(), cols, rows);

    Ok(())
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn detect_linux_terminal() -> String {
    use std::process::Command;

    let candidates = ["gnome-terminal", "konsole", "xfce4-terminal", "x-terminal-emulator"];
    for term in &candidates {
        if Command::new("which").arg(term).output().map_or(false, |o| o.status.success()) {
            return term.to_string();
        }
    }
    "gnome-terminal".to_string()
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn tile_terminal_linux(count: usize, cols: usize, rows: usize) {
    use std::process::Command;

    let (screen_w, screen_h) = get_linux_screen_size();

    let panel_height: i32 = 30;
    let gap: i32 = 4;
    let usable_h = screen_h - panel_height;
    let total_gap_x = gap * (cols as i32 + 1);
    let total_gap_y = gap * (rows as i32 + 1);
    let tile_w = (screen_w - total_gap_x) / cols as i32;
    let tile_h = (usable_h - total_gap_y) / rows as i32;

    if Command::new("which").arg("wmctrl").output().map_or(false, |o| o.status.success()) {
        let wmctrl_list = Command::new("wmctrl").arg("-l").output();

        if let Ok(output) = wmctrl_list {
            if output.status.success() {
                let lines: Vec<&str> = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .collect();

                let active_windows: Vec<&str> = lines.iter().rev().take(count).collect();

                for (i, line) in active_windows.iter().enumerate() {
                    let window_id = line.split_whitespace().next().unwrap_or("");
                    if window_id.is_empty() {
                        continue;
                    }

                    let col = i % cols;
                    let row = i / cols;
                    let x = gap + (col as i32 * (tile_w + gap));
                    let y = panel_height + gap + (row as i32 * (tile_h + gap));

                    let _ = Command::new("wmctrl")
                        .args(["-i", "-e", &format!("0,{},{},{},{}", x, y, tile_w, tile_h), window_id])
                        .spawn();
                }
            }
        }
    }
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn get_linux_screen_size() -> (i32, i32) {
    use std::process::Command;

    if let Ok(output) = Command::new("xdpyinfo").output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("dimensions:") {
                    if let Some(dim_part) = line.split("dimensions:").nth(1) {
                        let parts: Vec<&str> = dim_part.split_whitespace().collect();
                        if parts.len() >= 1 {
                            let size_parts: Vec<&str> = parts[0].split('x').collect();
                            if size_parts.len() == 2 {
                                if let (Ok(w), Ok(h)) = (size_parts[0].parse::<i32>(), size_parts[1].parse::<i32>()) {
                                    return (w, h);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if let Ok(output) = Command::new("xrandr").output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = stdout.lines().next() {
                if first_line.contains(" connected") {
                    if let Some(star_part) = first_line.split('*').next() {
                        let nums: Vec<&str> = star_part.split_whitespace()
                            .filter_map(|s| s.parse::<i32>().ok())
                            .collect();
                        if nums.len() >= 2 {
                            return (nums[0], nums[1]);
                        }
                    }
                }
            }
        }
    }

    (1920, 1080)
}
