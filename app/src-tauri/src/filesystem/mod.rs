pub mod explorer;
pub mod git_diff_stats;
pub mod git_status;
pub mod operations;
pub mod reader;
pub mod validation;
pub mod watcher;

use std::process::Command;

pub fn run_git_hidden(args: &[&str], cwd: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new("git")
            .args(args)
            .current_dir(cwd)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
    };

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("git").args(args).current_dir(cwd).output();

    let output = output.map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
