use anyhow::{Context, Result};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
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
            .creation_flags(CREATE_NO_WINDOW)
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

/// The script path an npm cmd-shim runs, relative to the shim's folder:
/// `"%_prog%"  "%dp0%\node_modules\pkg\bin\cli.js" %*` → `node_modules\pkg\bin\cli.js`.
fn parse_npm_cmd_shim_script(content: &str) -> Option<String> {
    let marker = "\"%dp0%\\";
    let mut rest = content;
    while let Some(index) = rest.find(marker) {
        let after = &rest[index + marker.len()..];
        let end = after.find('"')?;
        let candidate = &after[..end];
        let lower = candidate.to_ascii_lowercase();
        if lower.ends_with(".js") || lower.ends_with(".mjs") || lower.ends_with(".cjs") {
            return Some(candidate.to_string());
        }
        rest = &after[end..];
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
        Self::hidden_command(binary_path, args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
    }

    /// The command `run_cmd_hidden` would run, without stdio configured, so
    /// callers can pipe or stream it themselves. Resolves npm `.cmd`/`.ps1`
    /// and shell-script shims on Windows and never opens a console window.
    pub fn hidden_command<S: AsRef<OsStr>>(binary_path: &str, args: &[S]) -> Command {
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
                                .args(args);
                            Self::add_no_window(&mut cmd);
                            return cmd;
                        }
                    }
                }
                let mut cmd = Command::new("cmd");
                cmd.arg("/c").arg(binary_path).args(args);
                Self::add_no_window(&mut cmd);
                return cmd;
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
                        cmd.arg("/c").arg(&cmd_path).args(args);
                        Self::add_no_window(&mut cmd);
                        return cmd;
                    }

                    if let Some(ps_script) = find_ps_script(dir) {
                        let mut cmd = Command::new("powershell.exe");
                        cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
                            .arg(&ps_script)
                            .args(args);
                        Self::add_no_window(&mut cmd);
                        return cmd;
                    }
                }
            }
        }
        let mut cmd = Command::new(binary_path);
        cmd.args(args);
        Self::add_no_window(&mut cmd);
        cmd
    }

    /// For an npm `.cmd` shim (or its extensionless sibling), the node binary
    /// and the JavaScript entry point it launches. Running `node script.js`
    /// directly avoids cmd.exe's 8191-character limit, its `%`/`^` mangling and
    /// PowerShell re-encoding piped stdin.
    pub fn resolve_npm_cmd_shim(binary_path: &str) -> Option<(PathBuf, PathBuf)> {
        let path = Path::new(binary_path);
        let shim = if path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("cmd"))
        {
            path.to_path_buf()
        } else {
            let candidate =
                path.with_file_name(format!("{}.cmd", path.file_name()?.to_string_lossy()));
            if !candidate.exists() {
                return None;
            }
            candidate
        };
        let dir = shim.parent()?;
        let content = std::fs::read_to_string(&shim).ok()?;
        let script = parse_npm_cmd_shim_script(&content)?;
        let script = dir.join(script);
        if !script.exists() {
            return None;
        }
        let local_node = dir.join("node.exe");
        let node = if local_node.exists() {
            local_node
        } else {
            PathBuf::from(Self::find_binary("node")?)
        };
        Some((node, script))
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

    fn search_dirs_for_binary(
        binary: &str,
        dirs: &[String],
        extensions: &[&str],
    ) -> Option<String> {
        for dir in dirs {
            for ext in extensions {
                let full = if ext.is_empty() {
                    format!("{}/{}", dir, binary)
                } else {
                    #[cfg(target_os = "windows")]
                    {
                        format!(r"{}\{}{}", dir, binary, ext)
                    }
                    #[cfg(not(target_os = "windows"))]
                    {
                        format!("{}/{}{}", dir, binary, ext)
                    }
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
            paths.push(format!(r"{}\hermes\bin", local));
            paths.push(format!(r"{}\hermes\hermes-agent\venv\Scripts", local));
        }
        paths.push(r"C:\Program Files\nodejs".to_string());
        paths.push(r"C:\Program Files\Git\bin".to_string());

        if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
            paths.push(format!(r"{}\.claude\bin", home));
            paths.push(format!(r"{}\.grok\bin", home));
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
            paths.push(format!("{}/.grok/bin", home));
            paths.push(format!("{}/.hermes/bin", home));
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
            paths.push(format!("{}/.local/share/hermes/bin", home));
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
            paths.push(format!("{}/.grok/bin", home));
            paths.push(format!("{}/.hermes/bin", home));
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
            paths.push(format!("{}/.local/share/hermes/bin", home));
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
        Self::search_dirs_for_binary(
            binary,
            &Self::platform_search_dirs(),
            &["", ".cmd", ".exe", ".bat"],
        )
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

/// Whether the current process runs with an elevated (High integrity) token.
///
/// Codex 0.157+ auto-starts a shared Windows app-server daemon unless told
/// otherwise, and that daemon refuses to start from an elevated process so
/// that shared clients cannot inherit administrator privileges. Launch paths
/// use this to opt out of the daemon when the host process is elevated.
#[allow(dead_code)]
pub fn is_process_elevated() -> bool {
    #[cfg(target_os = "windows")]
    {
        static ELEVATED: LazyLock<bool> = LazyLock::new(|| {
            ProcessRunner::run_hidden("whoami", &["/groups"])
                .ok()
                .filter(|output| output.status.success())
                .map(|output| {
                    let groups = String::from_utf8_lossy(&output.stdout);
                    // High integrity (S-1-16-12288) or System (S-1-16-16384).
                    groups.contains("S-1-16-12288") || groups.contains("S-1-16-16384")
                })
                .unwrap_or(false)
        });

        *ELEVATED
    }

    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// Kill a process and everything it spawned (cmd → node → CLI on Windows).
pub fn terminate_process_tree(pid: u32) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let output = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .output()
            .with_context(|| format!("Failed to stop process pid {}", pid))?;

        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(anyhow::anyhow!(
                "Failed to stop process pid {} (taskkill exit {:?}){}",
                pid,
                output.status.code(),
                if detail.is_empty() {
                    String::new()
                } else {
                    format!(": {}", detail)
                }
            ));
        }
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = Command::new("kill")
            .args(["-TERM", &format!("-{}", pid)])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .with_context(|| format!("Failed to signal process group {}", pid))?;
        if !status.success() {
            return Err(anyhow::anyhow!(
                "Failed to signal process group {} (kill exit {:?})",
                pid,
                status.code()
            ));
        }
        return Ok(());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn npm_cmd_shim_script_is_found() {
        let shim = concat!(
            "@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\n",
            r#"IF EXIST "%dp0%\node.exe" ( SET "_prog=%dp0%\node.exe" ) ELSE ( SET "_prog=node" )"#,
            "\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & ",
            r#""%_prog%"  "%dp0%\node_modules\@openai\codex\bin\codex.js" %*"#,
        );
        assert_eq!(
            parse_npm_cmd_shim_script(shim).as_deref(),
            Some(r"node_modules\@openai\codex\bin\codex.js")
        );
    }

    #[test]
    fn non_node_shim_is_ignored() {
        assert_eq!(
            parse_npm_cmd_shim_script(r#"@echo off "%dp0%\tool.exe" %*"#),
            None
        );
    }
}
