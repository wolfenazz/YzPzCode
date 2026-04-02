use crate::types::{AgentType, LaunchExternalRequest};

use super::cli_commands::build_agent_queue;
use super::terminal_commands::get_grid_dimensions;

#[tauri::command]
pub async fn launch_external_terminals(request: LaunchExternalRequest) -> Result<(), String> {
    if request.count == 0 {
        return Err("Terminal count must be at least 1".to_string());
    }

    let path = std::path::Path::new(&request.workspace_path);
    if !path.exists() {
        return Err(format!(
            "Workspace path does not exist: {}",
            request.workspace_path
        ));
    }
    if !path.is_dir() {
        return Err(format!(
            "Workspace path is not a directory: {}",
            request.workspace_path
        ));
    }

    let agent_queue = build_agent_queue(&request.agent_allocation, request.count);
    let (cols, rows) = get_grid_dimensions(request.count);

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
            format!(
                "/k \"cd /d {} && timeout /t 2 /nobreak >nul && {}\"",
                workspace_path, binary
            )
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
        unsafe {
            GetWindowThreadProcessId(our_console_hwnd, &mut our_pid);
        }
    }

    let mut found_hwnds: Vec<HWND> = Vec::with_capacity(count);

    for _ in 0..count {
        let hwnd = unsafe { FindWindowW(console_class_ptr, ptr::null()) };
        if hwnd == 0 {
            break;
        }

        let mut pid: DWORD = 0;
        unsafe {
            GetWindowThreadProcessId(hwnd, &mut pid);
        }

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
            .arg(format!(
                "tell application \"Terminal\" to do script \"{}\"",
                escaped_script
            ))
            .spawn()
            .map_err(|e| format!("Failed to spawn terminal {}: {}", index, e));

        match result {
            Ok(mut child) => {
                pids.push(child.id());
                std::thread::spawn(move || {
                    let _ = child.wait();
                });
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
            window_index,
            x,
            y,
            x + tile_w,
            y + tile_h
        );

        let _ = Command::new("osascript").arg("-e").arg(&script).spawn();
    }
}

#[cfg(target_os = "macos")]
fn parse_macos_screen_size(json: &str) -> (i32, i32) {
    let default = (1920, 1080);
    let width_key = "\"_spdisplays_resolution\"";

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
            Ok(mut child) => {
                std::thread::spawn(move || {
                    let _ = child.wait();
                });
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

    let candidates = [
        "gnome-terminal",
        "konsole",
        "xfce4-terminal",
        "x-terminal-emulator",
    ];
    for term in &candidates {
        if Command::new("which")
            .arg(term)
            .output()
            .map_or(false, |o| o.status.success())
        {
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

    if Command::new("which")
        .arg("wmctrl")
        .output()
        .map_or(false, |o| o.status.success())
    {
        let wmctrl_list = Command::new("wmctrl").arg("-l").output();

        if let Ok(output) = wmctrl_list {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
                let lines: Vec<&str> = stdout.lines().collect();

                let active_windows: Vec<&&str> = lines.iter().rev().take(count).collect();

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
                        .args([
                            "-i",
                            "-e",
                            &format!("0,{},{},{},{}", x, y, tile_w, tile_h),
                            window_id,
                        ])
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
                                if let (Ok(w), Ok(h)) =
                                    (size_parts[0].parse::<i32>(), size_parts[1].parse::<i32>())
                                {
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
                        let nums: Vec<i32> = star_part
                            .split_whitespace()
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
