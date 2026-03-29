use std::process::{Command, Output, Stdio};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
            Self::find_in_windows_paths(binary)
        }
        #[cfg(target_os = "macos")]
        {
            if let Ok(o) = Self::run_hidden("which", &[binary]) {
                if o.status.success() {
                    let path = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    if !path.is_empty() {
                        return Some(path);
                    }
                }
            }
            Self::find_in_macos_paths(binary)
        }
        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        {
            if let Ok(o) = Self::run_hidden("which", &[binary]) {
                if o.status.success() {
                    let path = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    if !path.is_empty() {
                        return Some(path);
                    }
                }
            }
            Self::find_in_linux_paths(binary)
        }
    }

    #[cfg(target_os = "windows")]
    fn find_in_windows_paths(binary: &str) -> Option<String> {
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

            if let Ok(nvm_dir) = std::fs::read_dir(format!(r"{}\.nvm\versions\node", home)) {
                for entry in nvm_dir.flatten() {
                    if entry.path().is_dir() {
                        paths.push(format!(r"{}\bin", entry.path().display()));
                    }
                }
            }

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

        let exts = ["", ".cmd", ".exe", ".bat"];
        for dir in paths {
            for ext in exts {
                let full = format!(r"{}\{}{}", dir, binary, ext);
                if std::path::Path::new(&full).exists() {
                    return Some(full);
                }
            }
        }
        None
    }

    #[cfg(target_os = "windows")]
    fn get_npm_global_prefix() -> Option<String> {
        Self::run_hidden("npm", &["config", "get", "--global", "prefix"])
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    }

    #[cfg(target_os = "macos")]
    fn find_in_macos_paths(binary: &str) -> Option<String> {
        let mut paths = Vec::new();

        paths.push("/usr/local/bin".to_string());
        paths.push("/opt/homebrew/bin".to_string());
        paths.push("/opt/homebrew/sbin".to_string());
        paths.push("/usr/local/sbin".to_string());

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

            if let Ok(nvm_dir) = std::fs::read_dir(format!("{}/.nvm/versions/node", home)) {
                for entry in nvm_dir.flatten() {
                    if entry.path().is_dir() {
                        paths.push(format!("{}/bin", entry.path().display().to_string()));
                    }
                }
            }
        }

        for dir in paths {
            let full = format!("{}/{}", dir, binary);
            if std::path::Path::new(&full).exists() {
                return Some(full);
            }
        }
        None
    }

    #[cfg(target_os = "macos")]
    fn get_npm_global_prefix() -> Option<String> {
        Self::run_hidden("npm", &["config", "get", "--global", "prefix"])
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    fn find_in_linux_paths(binary: &str) -> Option<String> {
        let mut paths = Vec::new();

        paths.push("/usr/local/bin".to_string());
        paths.push("/usr/bin".to_string());
        paths.push("/bin".to_string());
        paths.push("/usr/sbin".to_string());
        paths.push("/sbin".to_string());
        paths.push("/snap/bin".to_string());
        paths.push("/usr/local/sbin".to_string());
        paths.push("/opt/local/bin".to_string());

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

            if let Ok(nvm_dir) = std::fs::read_dir(format!("{}/.nvm/versions/node", home)) {
                for entry in nvm_dir.flatten() {
                    if entry.path().is_dir() {
                        paths.push(format!("{}/bin", entry.path().display().to_string()));
                    }
                }
            }
        }

        if let Ok(data_home) = std::env::var("XDG_DATA_HOME") {
            paths.push(format!("{}/flatpak/exports/bin", data_home));
        } else if let Ok(home) = std::env::var("HOME") {
            paths.push(format!("{}/.local/share/flatpak/exports/bin", home));
        }

        paths.push("/var/lib/flatpak/exports/bin".to_string());

        for dir in paths {
            let full = format!("{}/{}", dir, binary);
            if std::path::Path::new(&full).exists() {
                return Some(full);
            }
        }
        None
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    fn get_npm_global_prefix() -> Option<String> {
        Self::run_hidden("npm", &["config", "get", "--global", "prefix"])
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    }

    pub async fn find_binary_async(binary: &str) -> Option<String> {
        let binary = binary.to_string();
        tokio::task::spawn_blocking(move || Self::find_binary(&binary))
            .await
            .ok()?
    }
}
