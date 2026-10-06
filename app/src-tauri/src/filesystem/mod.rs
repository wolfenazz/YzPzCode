pub mod explorer;
pub mod git_diff_stats;
pub mod git_ops;
pub mod git_status;
pub mod history;
pub mod media_protocol;
pub mod operations;
pub mod reader;
pub mod search;
pub mod validation;
pub mod watcher;

use std::process::Command;

pub(crate) fn git_repository_root(cwd: &str) -> Result<String, String> {
    run_git_hidden(&["rev-parse", "--show-toplevel"], cwd).map(|root| {
        std::path::PathBuf::from(root.trim())
            .to_string_lossy()
            .to_string()
    })
}

pub fn run_git_hidden(args: &[&str], cwd: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new("git")
            .env("GIT_OPTIONAL_LOCKS", "0")
            .args(args)
            .current_dir(cwd)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
    };

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("git")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .args(args)
        .current_dir(cwd)
        .output();

    let output = output.map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
