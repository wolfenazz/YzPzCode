use std::process::Command;

pub fn init_user_environment() {
    #[cfg(target_os = "windows")]
    {
        if let Err(e) = load_windows_user_env() {
            eprintln!("Failed to load user environment: {}", e);
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Err(e) = load_macos_user_env() {
            eprintln!("Failed to load macOS user environment: {}", e);
        }
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        if let Err(e) = load_linux_user_env() {
            eprintln!("Failed to load Linux user environment: {}", e);
        }
    }
}

#[cfg(target_os = "macos")]
fn load_macos_user_env() -> anyhow::Result<()> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    let output = Command::new(&shell).args(&["-l", "-c", "env"]).output()?;

    if output.status.success() {
        let env_output = String::from_utf8_lossy(&output.stdout);
        for line in env_output.lines() {
            if let Some((key, value)) = line.split_once('=') {
                let important_vars = [
                    "PATH",
                    "HOME",
                    "USER",
                    "LOGNAME",
                    "SHELL",
                    "TMPDIR",
                    "LANG",
                    "LC_ALL",
                    "TERM",
                    "EDITOR",
                    "VISUAL",
                    "NODE_PATH",
                    "NVM_DIR",
                    "NVM_INC",
                    "NVM_CD_FLAGS",
                    "NVM_BIN",
                    "FNM_DIR",
                    "FNM_MULTISHELL_PATH",
                    "FNM_CORE_DIR",
                    "RBENV_SHELL",
                    "PYENV_SHELL",
                    "GOPATH",
                    "GOBIN",
                    "CARGO_HOME",
                    "RUSTUP_HOME",
                    "BUN_INSTALL",
                    "JAVA_HOME",
                    "ANDROID_HOME",
                    "FLUTTER_ROOT",
                ];

                if important_vars.contains(&key) {
                    if std::env::var(key).is_err() || key == "PATH" {
                        let _ = std::env::set_var(key, value);
                    }
                }
            }
        }
    }

    if std::env::var("PATH").is_err() {
        let default_paths = [
            "/usr/local/bin",
            "/usr/local/sbin",
            "/opt/homebrew/bin",
            "/opt/homebrew/sbin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
        ];

        if let Ok(home) = std::env::var("HOME") {
            let home_paths = [
                format!("{}/.local/bin", home),
                format!("{}/bin", home),
                format!("{}/.npm-global/bin", home),
                format!("{}/.cargo/bin", home),
                format!("{}/.bun/bin", home),
                format!("{}/go/bin", home),
            ];

            let mut all_paths: Vec<String> = home_paths;
            all_paths.extend(default_paths.iter().map(|s| s.to_string()));

            let path_value = all_paths.join(":");
            let _ = std::env::set_var("PATH", &path_value);
        } else {
            let path_value = default_paths.join(":");
            let _ = std::env::set_var("PATH", &path_value);
        }
    }

    if std::env::var("LANG").is_err() {
        let _ = std::env::set_var("LANG", "en_US.UTF-8");
    }

    Ok(())
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn load_linux_user_env() -> anyhow::Result<()> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

    let output = Command::new(&shell).args(&["-l", "-c", "env"]).output()?;

    if output.status.success() {
        let env_output = String::from_utf8_lossy(&output.stdout);
        for line in env_output.lines() {
            if let Some((key, value)) = line.split_once('=') {
                let important_vars = [
                    "PATH",
                    "HOME",
                    "USER",
                    "LOGNAME",
                    "SHELL",
                    "LANG",
                    "LC_ALL",
                    "TERM",
                    "EDITOR",
                    "VISUAL",
                    "DISPLAY",
                    "WAYLAND_DISPLAY",
                    "XDG_SESSION_TYPE",
                    "XDG_CURRENT_DESKTOP",
                    "XDG_DATA_HOME",
                    "XDG_CONFIG_HOME",
                    "XDG_CACHE_HOME",
                    "XDG_RUNTIME_DIR",
                    "NODE_PATH",
                    "NVM_DIR",
                    "NVM_INC",
                    "NVM_CD_FLAGS",
                    "NVM_BIN",
                    "FNM_DIR",
                    "FNM_MULTISHELL_PATH",
                    "RBENV_SHELL",
                    "PYENV_SHELL",
                    "GOPATH",
                    "GOBIN",
                    "CARGO_HOME",
                    "RUSTUP_HOME",
                    "BUN_INSTALL",
                    "JAVA_HOME",
                    "ANDROID_HOME",
                    "FLUTTER_ROOT",
                ];

                if important_vars.contains(&key) {
                    if std::env::var(key).is_err() || key == "PATH" {
                        let _ = std::env::set_var(key, value);
                    }
                }
            }
        }
    }

    if std::env::var("PATH").is_err() {
        let default_paths = [
            "/usr/local/bin",
            "/usr/local/sbin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
            "/snap/bin",
            "/opt/local/bin",
        ];

        if let Ok(home) = std::env::var("HOME") {
            let home_paths = [
                format!("{}/.local/bin", home),
                format!("{}/bin", home),
                format!("{}/.npm-global/bin", home),
                format!("{}/.cargo/bin", home),
                format!("{}/.bun/bin", home),
                format!("{}/go/bin", home),
            ];

            let mut all_paths: Vec<String> = home_paths;
            all_paths.extend(default_paths.iter().map(|s| s.to_string()));

            let path_value = all_paths.join(":");
            let _ = std::env::set_var("PATH", &path_value);
        } else {
            let path_value = default_paths.join(":");
            let _ = std::env::set_var("PATH", &path_value);
        }
    }

    if std::env::var("LANG").is_err() {
        let _ = std::env::set_var("LANG", "en_US.UTF-8");
    }

    if std::env::var("XDG_DATA_HOME").is_err() {
        if let Ok(home) = std::env::var("HOME") {
            let _ = std::env::set_var("XDG_DATA_HOME", &format!("{}/.local/share", home));
        }
    }

    if std::env::var("XDG_CONFIG_HOME").is_err() {
        if let Ok(home) = std::env::var("HOME") {
            let _ = std::env::set_var("XDG_CONFIG_HOME", &format!("{}/.config", home));
        }
    }

    if std::env::var("XDG_CACHE_HOME").is_err() {
        if let Ok(home) = std::env::var("HOME") {
            let _ = std::env::set_var("XDG_CACHE_HOME", &format!("{}/.cache", home));
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn load_windows_user_env() -> anyhow::Result<()> {
    let output = Command::new("cmd").args(["/c", "echo %PATH%"]).output()?;

    if output.status.success() {
        let path_var = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path_var.is_empty() && path_var != "%PATH%" {
            if let Ok(current_path) = std::env::var("PATH") {
                if current_path.is_empty() || current_path.len() < path_var.len() / 2 {
                    std::env::set_var("PATH", &path_var);
                }
            }
        }
    }

    let env_vars = [
        "APPDATA",
        "LOCALAPPDATA",
        "USERPROFILE",
        "HOME",
        "COMSPEC",
        "TEMP",
        "TMP",
    ];

    for var in env_vars {
        if std::env::var(var).is_err() {
            let output = Command::new("cmd")
                .args(["/c", &format!("echo %{}%", var)])
                .output()?;

            if output.status.success() {
                let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !value.is_empty() && value != format!("%{}%", var) {
                    std::env::set_var(var, &value);
                }
            }
        }
    }

    if std::env::var("PATH").is_err() || std::env::var("PATH").map(|p| p.is_empty()).unwrap_or(true)
    {
        let common_paths = [
            r"C:\Windows\System32",
            r"C:\Windows",
            r"C:\Program Files\nodejs",
            r"C:\Program Files\Git\bin",
            r"C:\Program Files\Git\cmd",
        ];

        let mut combined_paths: Vec<String> = Vec::new();

        if let Ok(appdata) = std::env::var("APPDATA") {
            combined_paths.push(format!(r"{}\npm", appdata));
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            combined_paths.push(format!(r"{}\bin", local));
            combined_paths.push(format!(r"{}\pnpm", local));
            combined_paths.push(format!(r"{}\Microsoft\WindowsApps", local));
        }
        if let Ok(home) = std::env::var("USERPROFILE") {
            combined_paths.push(format!(r"{}\.claude\bin", home));
            combined_paths.push(format!(r"{}\.local\bin", home));
            combined_paths.push(format!(r"{}\bin", home));
            combined_paths.push(format!(r"{}\AppData\Local\Microsoft\WindowsApps", home));
        }

        combined_paths.extend(common_paths.iter().map(|s| s.to_string()));

        let path_value = combined_paths.join(";");
        std::env::set_var("PATH", &path_value);
    }

    Ok(())
}
