use std::process::{Command, Output, Stdio};
use std::sync::LazyLock;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub static NPM_GLOBAL_PREFIX: LazyLock<Option<String>> = LazyLock::new(|| {
    #[cfg(target_os = "windows")]
    {
        Command::new("npm")
            .args(["config", "get", "--global", "prefix"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new("npm")
            .args(["config", "get", "--global", "prefix"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    }
});

pub fn get_npm_global_prefix() -> Option<String> {
    NPM_GLOBAL_PREFIX.clone()
}

#[cfg(target_os = "windows")]
fn is_shell_script(path: &str) -> bool {
    if let Ok(mut file) = std::fs::File::open(path) {
        let mut buf = [0u8; 2];
        if std::io::Read::read_exact(&mut file, &mut buf).is_ok() {
            return buf == [b'#', b'!'];
        }
    }
    false
}

#[cfg(target_os = "windows")]
fn find_ps_script(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                if ext == "ps1" {
                    return Some(path);
                }
            }
        }
    }
    None
}

pub struct ProcessRunner;

impl ProcessRunner {
    #[cfg(target_os = "windows")]
    fn add_no_window(cmd: &mut Command) -> &mut Command {
        cmd.creation_flags(CREATE_NO_WINDOW)
    }

    #[cfg(not(target_os = "windows"))]
    fn add_no_window(cmd: &mut Command) -> &mut Command {
        cmd
    }

    pub fn run_hidden(program: &str, args: &[&str]) -> std::io::Result<Output> {
        let mut cmd = Command::new(program);
        cmd.args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        Self::add_no_window(&mut cmd).output()
    }

    pub fn run_cmd_hidden(binary_path: &str, args: &[&str]) -> std::io::Result<Output> {
        #[cfg(target_os = "windows")]
        {
            let lower = binary_path.to_lowercase();
            if lower.ends_with(".cmd") || lower.ends_with(".bat") {
                if let Ok(content) = std::fs::read_to_string(binary_path) {
                    if content.contains("powershell.exe") || content.contains("PowerShell") {
                        let dir = std::path::Path::new(binary_path)
                            .parent()
                            .unwrap_or(std::path::Path::new("."));
                        if let Some(ps_script) = find_ps_script(dir) {
                            let mut cmd = Command::new("powershell.exe");
                            cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
                                .arg(&ps_script)
                                .args(args)
                                .stdin(Stdio::null())
                                .stdout(Stdio::piped())
                                .stderr(Stdio::piped());
                            return Self::add_no_window(&mut cmd).output();
                        }
                    }
                }
                let mut cmd = Command::new("cmd");
                cmd.arg("/c")
                    .arg(binary_path)
                    .args(args)
                    .stdin(Stdio::null())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped());
                return Self::add_no_window(&mut cmd).output();
            }

            // Handle shell script shims (#!/bin/sh) left by npm on Windows.
            // npm creates three files: name, name.cmd, name.ps1 — the extensionless
            // one is a Unix shell script that cannot run natively on Windows.
            // Try the .cmd variant first, then fall back to the .ps1 script.
            if is_shell_script(binary_path) {
                let path = std::path::Path::new(binary_path);
                if let Some(stem) = path.file_name() {
                    let stem = stem.to_string_lossy();
                    let dir = path.parent().unwrap_or(std::path::Path::new("."));

                    let cmd_path = dir.join(format!("{}.cmd", stem));
                    if cmd_path.exists() {
                        let mut cmd = Command::new("cmd");
                        cmd.arg("/c")
                            .arg(&cmd_path)
                            .args(args)
                            .stdin(Stdio::null())
                            .stdout(Stdio::piped())
                            .stderr(Stdio::piped());
                        return Self::add_no_window(&mut cmd).output();
                    }

                    if let Some(ps_script) = find_ps_script(dir) {
                        let mut cmd = Command::new("powershell.exe");
                        cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
                            .arg(&ps_script)
                            .args(args)
                            .stdin(Stdio::null())
                            .stdout(Stdio::piped())
                            .stderr(Stdio::piped());
                        return Self::add_no_window(&mut cmd).output();
                    }
                }
            }
        }
        Self::run_hidden(binary_path, args)
    }

    pub fn find_binary(binary: &str) -> Option<String> {
        #[cfg(target_os = "windows")]
        {
            let exts = ["", ".cmd", ".exe", ".bat"];
            for ext in exts {
                let full_name = format!("{}{}", binary, ext);
                if let Ok(o) = Self::run_hidden("where", &[&full_name]) {
                    if o.status.success() {
                        if let Some(path) = String::from_utf8_lossy(&o.stdout).lines().next() {
                            let trimmed = path.trim().to_string();
                            if !trimmed.is_empty() {
                                return Some(trimmed);
                            }
                        }
                    }
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            if let Ok(o) = Self::run_hidden("which", &[binary]) {
                if o.status.success() {
                    let path = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    if !path.is_empty() {
                        return Some(path);
                    }
                }
            }
        }
        Self::find_in_platform_paths(binary)
    }

    fn get_npm_global_prefix() -> Option<String> {
        get_npm_global_prefix()
    }

    fn search_dirs_for_binary(binary: &str, dirs: &[String], extensions: &[&str]) -> Option<String> {
        for dir in dirs {
            for ext in extensions {
                let full = if ext.is_empty() {
                    format!("{}/{}", dir, binary)
                } else {
                    #[cfg(target_os = "windows")]
                    { format!(r"{}\{}{}", dir, binary, ext) }
                    #[cfg(not(target_os = "windows"))]
                    { format!("{}/{}{}", dir, binary, ext) }
                };
                if std::path::Path::new(&full).exists() {
                    return Some(full);
                }
            }
        }
        None
    }

    fn nvm_version_dirs(base: &str) -> Vec<String> {
        let nvm_path = format!("{}/.nvm/versions/node", base);
        std::fs::read_dir(&nvm_path)
            .map(|dir| {
                dir.flatten()
                    .filter(|e| e.path().is_dir())
                    .map(|e| format!("{}/bin", e.path().display()))
                    .collect()
            })
            .unwrap_or_default()
    }

    #[cfg(target_os = "windows")]
    fn platform_search_dirs() -> Vec<String> {
        let mut paths = Vec::new();

        if let Ok(appdata) = std::env::var("APPDATA") {
            paths.push(format!(r"{}\npm", appdata));
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            paths.push(format!(r"{}\bin", local));
            paths.push(format!(r"{}\pnpm", local));
            paths.push(format!(r"{}\Programs\nodejs", local));
        }
        paths.push(r"C:\Program Files\nodejs".to_string());
        paths.push(r"C:\Program Files\Git\bin".to_string());

        if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
            paths.push(format!(r"{}\.claude\bin", home));
            paths.push(format!(r"{}\.local\bin", home));
            paths.push(format!(r"{}\bin", home));
            paths.push(format!(r"{}\.npm-global\bin", home));
            paths.extend(Self::nvm_version_dirs(&home));

            if let Ok(nvm_home) = std::env::var("NVM_HOME") {
                if !nvm_home.is_empty() {
                    paths.push(nvm_home);
                }
            }

            let nvm_current = format!(r"{}\.nvm\current", home);
            if std::path::Path::new(&nvm_current).exists() {
                paths.push(nvm_current);
            }
        }

        if let Some(prefix) = Self::get_npm_global_prefix() {
            paths.push(format!(r"{}\bin", prefix));
            paths.push(format!(r"{}\node_modules\.bin", prefix));
        }

        if let Ok(npm_config_prefix) = std::env::var("NPM_CONFIG_PREFIX") {
            if !npm_config_prefix.is_empty() {
                paths.push(format!(r"{}\bin", npm_config_prefix));
            }
        }

        paths
    }

    #[cfg(target_os = "macos")]
    fn platform_search_dirs() -> Vec<String> {
        let mut paths = vec![
            "/usr/local/bin".to_string(),
            "/opt/homebrew/bin".to_string(),
            "/opt/homebrew/sbin".to_string(),
            "/usr/local/sbin".to_string(),
        ];

        if let Some(prefix) = Self::get_npm_global_prefix() {
            paths.push(format!("{}/bin", prefix));
        }

        if let Ok(home) = std::env::var("HOME") {
            paths.push(format!("{}/.claude/bin", home));
            paths.push(format!("{}/.local/bin", home));
            paths.push(format!("{}/bin", home));
            paths.push(format!("{}/.npm-global/bin", home));
            paths.push(format!("{}/.npm/bin", home));
            paths.push(format!("{}/.cargo/bin", home));
            paths.push(format!("{}/.bun/bin", home));
            paths.push(format!("{}/.deno/bin", home));
            paths.push(format!("{}/.volta/bin", home));
            paths.push(format!("{}/.fnm/bin", home));
            paths.push(format!("{}/go/bin", home));
            paths.extend(Self::nvm_version_dirs(&home));
        }

        paths
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    fn platform_search_dirs() -> Vec<String> {
        let mut paths = vec![
            "/usr/local/bin".to_string(),
            "/usr/bin".to_string(),
            "/bin".to_string(),
            "/usr/sbin".to_string(),
            "/sbin".to_string(),
            "/snap/bin".to_string(),
            "/usr/local/sbin".to_string(),
            "/opt/local/bin".to_string(),
        ];

        if let Some(prefix) = Self::get_npm_global_prefix() {
            paths.push(format!("{}/bin", prefix));
        }

        if let Ok(home) = std::env::var("HOME") {
            paths.push(format!("{}/.claude/bin", home));
            paths.push(format!("{}/.local/bin", home));
            paths.push(format!("{}/bin", home));
            paths.push(format!("{}/.npm-global/bin", home));
            paths.push(format!("{}/.npm/bin", home));
            paths.push(format!("{}/.cargo/bin", home));
            paths.push(format!(
                "{}/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin",
                home
            ));
            paths.push(format!("{}/.bun/bin", home));
            paths.push(format!("{}/.deno/bin", home));
            paths.push(format!("{}/.volta/bin", home));
            paths.push(format!("{}/.fnm/bin", home));
            paths.push(format!("{}/go/bin", home));
            paths.push(format!("{}/.local/share/fnm/bin", home));
            paths.push(format!("{}/.sdkman/candidates/java/current/bin", home));
            paths.extend(Self::nvm_version_dirs(&home));
        }

        if let Ok(data_home) = std::env::var("XDG_DATA_HOME") {
            paths.push(format!("{}/flatpak/exports/bin", data_home));
        } else if let Ok(home) = std::env::var("HOME") {
            paths.push(format!("{}/.local/share/flatpak/exports/bin", home));
        }

        paths.push("/var/lib/flatpak/exports/bin".to_string());

        paths
    }

    #[cfg(target_os = "windows")]
    fn find_in_platform_paths(binary: &str) -> Option<String> {
        Self::search_dirs_for_binary(binary, &Self::platform_search_dirs(), &["", ".cmd", ".exe", ".bat"])
    }

    #[cfg(not(target_os = "windows"))]
    fn find_in_platform_paths(binary: &str) -> Option<String> {
        Self::search_dirs_for_binary(binary, &Self::platform_search_dirs(), &[""])
    }

    pub async fn find_binary_async(binary: &str) -> Option<String> {
        let binary = binary.to_string();
        tokio::task::spawn_blocking(move || Self::find_binary(&binary))
            .await
            .ok()?
    }
}
