use tauri::State;

use crate::terminal::TerminalManager;

#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    let scheme = url.split(':').next().unwrap_or("").to_lowercase();
    if scheme != "http" && scheme != "https" {
        return Err(format!(
            "Only http/https URLs are allowed, got '{}' scheme",
            scheme
        ));
    }
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
    if let Err(e) = terminal_manager.kill_all_sessions() {
        eprintln!("Warning: failed to kill all sessions on close: {}", e);
    }
    window.close().map_err(|e| e.to_string())
}
