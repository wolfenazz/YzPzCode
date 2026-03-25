use super::get_ide_config;
use crate::types::IdeType;

pub fn launch_ide(ide: IdeType, directory: &str) -> Result<(), String> {
    let config = get_ide_config(ide);

    #[cfg(target_os = "windows")]
    {
        launch_windows(&config, directory)
    }

    #[cfg(target_os = "macos")]
    {
        launch_macos(&config, directory)
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        launch_linux(&config, directory)
    }
}

#[cfg(target_os = "windows")]
fn launch_windows(config: &super::IdeConfig, directory: &str) -> Result<(), String> {
    for binary in &config.binary_names {
        if which::which(binary).is_ok() {
            let result = std::process::Command::new(binary).arg(directory).spawn();
            if result.is_ok() {
                return Ok(());
            }
        }
    }

    for binary in &config.windows_binary_names {
        if which::which(binary).is_ok() {
            let result = std::process::Command::new(binary).arg(directory).spawn();
            if result.is_ok() {
                return Ok(());
            }
        }
    }

    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let program_files = std::env::var("ProgramFiles").unwrap_or_default();

    for search_subpath in &config.windows_search_paths {
        let paths_to_check = vec![
            format!("{}\\{}", local_app_data, search_subpath),
            format!("{}\\Programs\\{}", local_app_data, search_subpath),
            format!("{}\\{}", program_files, search_subpath),
        ];

        for base_path in paths_to_check {
            for binary in &config.windows_binary_names {
                let direct_path = std::path::Path::new(&base_path).join(binary);
                if direct_path.exists() {
                    let result = std::process::Command::new(&direct_path)
                        .arg(directory)
                        .spawn();
                    if result.is_ok() {
                        return Ok(());
                    }
                }

                if let Ok(entries) = std::fs::read_dir(&base_path) {
                    for entry in entries.flatten() {
                        let exe_path = entry.path().join(binary);
                        if exe_path.exists() {
                            let result =
                                std::process::Command::new(&exe_path).arg(directory).spawn();
                            if result.is_ok() {
                                return Ok(());
                            }
                        }
                    }
                }
            }
        }
    }

    Err(format!(
        "Failed to launch {}: executable not found",
        config.name
    ))
}

#[cfg(target_os = "macos")]
fn launch_macos(config: &super::IdeConfig, directory: &str) -> Result<(), String> {
    for binary in &config.binary_names {
        if which::which(binary).is_ok() {
            let result = std::process::Command::new(binary).arg(directory).spawn();
            if result.is_ok() {
                return Ok(());
            }
        }
    }

    for binary in &config.linux_binary_names {
        if which::which(binary).is_ok() {
            let result = std::process::Command::new(binary).arg(directory).spawn();
            if result.is_ok() {
                return Ok(());
            }
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        for app_name in &config.macos_app_names {
            let user_app_path = format!("{}/Applications/{}", home, app_name);
            let path = std::path::Path::new(&user_app_path);
            if path.exists() {
                let result = std::process::Command::new("open")
                    .arg("-a")
                    .arg(&user_app_path)
                    .arg(directory)
                    .spawn();
                if result.is_ok() {
                    return Ok(());
                }
            }
        }
    }

    for app_name in &config.macos_app_names {
        let app_path = format!("/Applications/{}", app_name);
        let path = std::path::Path::new(&app_path);
        if path.exists() {
            let result = std::process::Command::new("open")
                .arg("-a")
                .arg(&app_path)
                .arg(directory)
                .spawn();
            if result.is_ok() {
                return Ok(());
            }
        }
    }

    Err(format!("{} not found or failed to launch", config.name))
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn launch_linux(config: &super::IdeConfig, directory: &str) -> Result<(), String> {
    for binary in &config.binary_names {
        if which::which(binary).is_ok() {
            let result = std::process::Command::new(binary).arg(directory).spawn();
            if result.is_ok() {
                return Ok(());
            }
        }
    }

    for binary in &config.linux_binary_names {
        if which::which(binary).is_ok() {
            let result = std::process::Command::new(binary).arg(directory).spawn();
            if result.is_ok() {
                return Ok(());
            }
        }
    }

    let flatpak_id = get_flatpak_id(&config.name);
    if let Some(id) = flatpak_id {
        let result = std::process::Command::new("flatpak")
            .args(["run", &id, directory])
            .spawn();
        if result.is_ok() {
            return Ok(());
        }
    }

    let snap_name = get_snap_name(&config.name);
    if let Some(name) = snap_name {
        let result = std::process::Command::new("snap")
            .args(["run", &name])
            .spawn();
        if result.is_ok() {
            let _ = std::process::Command::new("snap")
                .args(["run", &name, "--", directory])
                .spawn();
            return Ok(());
        }
    }

    if let Some(desktop_file) = find_desktop_file(&config.name) {
        if let Ok(content) = std::fs::read_to_string(&desktop_file) {
            for line in content.lines() {
                if line.starts_with("Exec=") {
                    let exec_cmd = line.strip_prefix("Exec=").unwrap_or("");
                    let exec_cmd = exec_cmd.replace("%F", directory);
                    let exec_cmd = exec_cmd.replace("%f", directory);
                    let exec_cmd = exec_cmd.replace("%U", directory);
                    let exec_cmd = exec_cmd.replace("%u", directory);
                    let exec_cmd = exec_cmd.replace("%k", "");
                    let exec_cmd = exec_cmd.replace("%%", "%");

                    let parts: Vec<&str> = exec_cmd.split_whitespace().collect();
                    if !parts.is_empty() {
                        let program = parts[0];
                        let args: Vec<&str> = parts[1..]
                            .iter()
                            .filter(|s| !s.starts_with('%'))
                            .copied()
                            .collect();

                        let result = std::process::Command::new(program).args(&args).spawn();
                        if result.is_ok() {
                            return Ok(());
                        }
                    }
                }
            }
        }
    }

    Err(format!(
        "Failed to launch {}: executable not found",
        config.name
    ))
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn get_flatpak_id(name: &str) -> Option<String> {
    let flatpak_ids = [
        ("Visual Studio Code", "com.visualstudio.code"),
        ("Cursor", "com.cursor.Cursor"),
        ("Zed", "dev.zed.Zed"),
        ("WebStorm", "com.jetbrains.WebStorm"),
        ("IntelliJ IDEA", "com.jetbrains.IntelliJ-IDEA-Community"),
        ("Sublime Text", "com.sublimetext.three"),
    ];

    for (ide_name, flatpak_id) in flatpak_ids {
        if name.contains(ide_name) || ide_name.contains(name) {
            return Some(flatpak_id.to_string());
        }
    }
    None
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn get_snap_name(name: &str) -> Option<String> {
    let snap_names = [
        ("Visual Studio Code", "code"),
        ("Cursor", "cursor"),
        ("Zed", "zed"),
        ("WebStorm", "webstorm"),
        ("IntelliJ IDEA", "intellij-idea-community"),
        ("Sublime Text", "sublime-text"),
    ];

    for (ide_name, snap_name) in snap_names {
        if name.contains(ide_name) || ide_name.contains(name) {
            return Some(snap_name.to_string());
        }
    }
    None
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn find_desktop_file(name: &str) -> Option<String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let desktop_paths = [
        "/usr/share/applications",
        "/usr/local/share/applications",
        &format!("{}/.local/share/applications", home),
        "/var/lib/snapd/desktop/applications",
    ];

    let name_variations = get_desktop_file_variations(name);

    for apps_path in &desktop_paths {
        let path = std::path::Path::new(apps_path);
        if !path.exists() {
            continue;
        }

        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let file_name = entry.file_name().to_string_lossy().to_lowercase();
                for variation in &name_variations {
                    if file_name.contains(variation) {
                        return Some(entry.path().to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    None
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn get_desktop_file_variations(name: &str) -> Vec<String> {
    let mut variations = Vec::new();
    let lower = name.to_lowercase();
    variations.push(lower.replace(' ', "-"));
    variations.push(lower.replace(' ', "_"));
    variations.push(lower.replace(' ', ""));
    variations.push(lower.replace("visual studio code", "vscode"));
    variations.push(lower.replace("intellij idea", "idea"));
    variations.push(lower.replace("intellij", "idea"));
    variations.push(lower.replace("visual studio", "vscode"));
    variations
}
