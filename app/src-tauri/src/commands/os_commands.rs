#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsVersionInfo {
    pub os_type: String,
    pub version: String,
    pub is_windows_10: bool,
    pub display_warning: bool,
}

#[tauri::command]
pub async fn get_os_version() -> Result<OsVersionInfo, String> {
    #[cfg(target_os = "windows")]
    {
        let version = get_windows_version();
        let is_windows_10 = version.starts_with("10.") && !version.contains("10.0.22");

        Ok(OsVersionInfo {
            os_type: "windows".to_string(),
            version: version.clone(),
            is_windows_10,
            display_warning: is_windows_10,
        })
    }

    #[cfg(target_os = "macos")]
    {
        let version = get_macos_version();
        Ok(OsVersionInfo {
            os_type: "macos".to_string(),
            version,
            is_windows_10: false,
            display_warning: false,
        })
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let version = get_linux_version();
        Ok(OsVersionInfo {
            os_type: "linux".to_string(),
            version,
            is_windows_10: false,
            display_warning: false,
        })
    }
}

#[cfg(target_os = "windows")]
fn get_windows_version() -> String {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let output = Command::new("cmd")
        .args(["/c", "ver"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let ver_output = String::from_utf8_lossy(&o.stdout);
            if let Some(version_part) = ver_output.split("Version ").nth(1) {
                if let Some(_version_num) = version_part.split('.').next() {
                    let build = version_part.split('.').nth(2).unwrap_or("0");
                    let build_num: u32 = build
                        .chars()
                        .filter(|c| c.is_ascii_digit())
                        .collect::<String>()
                        .parse()
                        .unwrap_or(0);
                    let minor = version_part.split('.').nth(1).unwrap_or("0");
                    return format!("10.{}.{}", minor, build_num);
                }
            }
            "unknown".to_string()
        }
        _ => "unknown".to_string(),
    }
}

#[cfg(target_os = "macos")]
fn get_macos_version() -> String {
    use std::process::Command;

    let output = Command::new("sw_vers").arg("-productVersion").output();

    match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        _ => "unknown".to_string(),
    }
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn get_linux_version() -> String {
    use std::process::Command;

    let output = Command::new("uname").arg("-r").output();

    match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        _ => "unknown".to_string(),
    }
}
