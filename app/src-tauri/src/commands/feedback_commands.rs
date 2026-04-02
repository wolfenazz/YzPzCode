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
        .unwrap_or_else(|_| "https://canary.discord.com/api/webhooks/1486331999936581664/5NhDM8ejMhP_nWwvGwhxbTewEiYr8xsNtrvYB2v3QHZxUUEiOcFwm3mQvlkXUv13yYwI".to_string());

    let embed = DiscordEmbed {
        title: "📝 New Feedback".to_string(),
        description: message,
        fields: vec![
            DiscordField {
                name: "Name".to_string(),
                value: name.unwrap_or_else(|| "Anonymous".to_string()),
                inline: true,
            },
            DiscordField {
                name: "Contact".to_string(),
                value: contact.unwrap_or_else(|| "Not provided".to_string()),
                inline: true,
            },
        ],
        color: 0x5865F2,
        timestamp: chrono_lite_timestamp(),
    };

    let webhook = DiscordWebhook {
        embeds: vec![embed],
    };

    let client = reqwest::Client::new();
    client
        .post(webhook_url)
        .json(&webhook)
        .send()
        .await
        .map_err(|e| format!("Failed to send feedback: {}", e))?;

    Ok(())
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
                        .filter(|c| c.is_digit(10))
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
