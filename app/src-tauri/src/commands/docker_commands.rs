//! Docker panel backend (lightweight stub): list running containers and
//! start/stop them. Logs/Compose are run through the app's terminal sessions.

use std::process::Command;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainer {
    pub id: String,
    pub image: String,
    pub status: String,
    pub names: String,
}

fn run_docker(args: &[&str]) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new("docker")
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
    };
    #[cfg(not(target_os = "windows"))]
    let output = Command::new("docker").args(args).output();

    let output = output.map_err(|e| format!("Docker not available: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub fn list_docker_containers() -> Result<Vec<DockerContainer>, String> {
    let stdout = run_docker(&[
        "ps",
        "--format",
        "{{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}",
    ])?;

    let containers = stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(4, '\t');
            let (Some(id), Some(image), Some(status), Some(names)) =
                (parts.next(), parts.next(), parts.next(), parts.next())
            else {
                return None;
            };
            Some(DockerContainer {
                id: id.to_string(),
                image: image.to_string(),
                status: status.to_string(),
                names: names.to_string(),
            })
        })
        .collect();

    Ok(containers)
}

#[tauri::command]
pub fn docker_start(name: String) -> Result<(), String> {
    run_docker(&["start", &name])?;
    Ok(())
}

#[tauri::command]
pub fn docker_stop(name: String) -> Result<(), String> {
    run_docker(&["stop", &name])?;
    Ok(())
}
