#[tauri::command]
pub async fn send_feedback(
    message: String,
    name: Option<String>,
    contact: Option<String>,
) -> Result<(), String> {
    #[derive(serde::Serialize)]
    struct DiscordEmbed {
        title: String,
        description: String,
        fields: Vec<DiscordField>,
        color: u32,
        timestamp: String,
    }

    #[derive(serde::Serialize)]
    struct DiscordField {
        name: String,
        value: String,
        inline: bool,
    }

    #[derive(serde::Serialize)]
    struct DiscordWebhook {
        embeds: Vec<DiscordEmbed>,
    }

    let webhook_url = std::env::var("DISCORD_WEBHOOK_URL")
        .map_err(|_| "Feedback service is not configured. Please try again later.".to_string())?;
    let webhook_url = webhook_url.trim().to_string();
    if webhook_url.is_empty() {
        return Err("Feedback service is not configured. Please try again later.".to_string());
    }
    if !(webhook_url.starts_with("https://discord.com/api/webhooks/")
        || webhook_url.starts_with("https://canary.discord.com/api/webhooks/")
        || webhook_url.starts_with("https://ptb.discord.com/api/webhooks/"))
    {
        return Err("Feedback service is misconfigured. Please try again later.".to_string());
    }

    let message = message.trim().to_string();
    if message.is_empty() {
        return Err("Feedback message cannot be empty.".to_string());
    }
    if message.len() > 4000 {
        return Err("Feedback message is too long (maximum 4000 characters).".to_string());
    }

    let name = name
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();
    let name = if name.is_empty() {
        "Anonymous".to_string()
    } else {
        truncate_to_char_boundary(&name, 100)
    };

    let contact = contact
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();
    let contact = if contact.is_empty() {
        "Not provided".to_string()
    } else {
        truncate_to_char_boundary(&contact, 160)
    };

    let embed = DiscordEmbed {
        title: "📝 New Feedback".to_string(),
        description: message,
        fields: vec![
            DiscordField {
                name: "Name".to_string(),
                value: name,
                inline: true,
            },
            DiscordField {
                name: "Contact".to_string(),
                value: contact,
                inline: true,
            },
        ],
        color: 0x5865F2,
        timestamp: chrono_lite_timestamp(),
    };

    let webhook = DiscordWebhook {
        embeds: vec![embed],
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to send feedback: {}", e))?;
    let resp = client
        .post(webhook_url)
        .json(&webhook)
        .send()
        .await
        .map_err(|e| format!("Failed to send feedback: {}", e))?;
    resp.error_for_status()
        .map_err(|e| format!("Failed to send feedback: {}", e))?;

    Ok(())
}

fn truncate_to_char_boundary(value: &str, max_bytes: usize) -> String {
    if value.len() <= max_bytes {
        return value.to_string();
    }
    let mut end = max_bytes;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    value[..end].to_string()
}

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

fn chrono_lite_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let total_secs = duration.as_secs();

    let days_since_epoch = total_secs / 86400;
    let time_of_day_secs = total_secs % 86400;

    let mut year = 1970usize;
    let mut remaining_days = days_since_epoch as usize;

    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        year += 1;
    }

    let month_days: [usize; 12] = if is_leap_year(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };

    let mut month = 0usize;
    for (i, &days) in month_days.iter().enumerate() {
        if remaining_days < days {
            month = i;
            break;
        }
        remaining_days -= days;
    }

    let day = remaining_days + 1;
    let hour = (time_of_day_secs / 3600) as u8;
    let minute = ((time_of_day_secs % 3600) / 60) as u8;
    let second = (time_of_day_secs % 60) as u8;

    format!(
        "{}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year,
        month + 1,
        day,
        hour,
        minute,
        second
    )
}

fn is_leap_year(year: usize) -> bool {
    year.is_multiple_of(4) && !year.is_multiple_of(100) || year.is_multiple_of(400)
}
