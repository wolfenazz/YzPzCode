//! Reads the Android Virtual Devices defined on this machine.

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::sdk::home_dir;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvdInfo {
    /// The id passed to `emulator -avd`.
    pub name: String,
    pub display_name: String,
    pub api_level: Option<u32>,
    pub abi: Option<String>,
    /// e.g. "Google Play", "Google APIs".
    pub variant: Option<String>,
    pub device: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub density: Option<u32>,
    pub path: String,
}

pub fn avd_home() -> PathBuf {
    if let Some(dir) = std::env::var_os("ANDROID_AVD_HOME") {
        return PathBuf::from(dir);
    }
    if let Some(dir) = std::env::var_os("ANDROID_USER_HOME") {
        return PathBuf::from(dir).join("avd");
    }
    if let Some(dir) = std::env::var_os("ANDROID_SDK_HOME") {
        return PathBuf::from(dir).join(".android").join("avd");
    }
    home_dir().join(".android").join("avd")
}

pub fn parse_ini(text: &str) -> HashMap<String, String> {
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.starts_with('#') {
                return None;
            }
            let (key, value) = line.split_once('=')?;
            Some((key.trim().to_string(), value.trim().to_string()))
        })
        .collect()
}

fn read_ini(path: &Path) -> HashMap<String, String> {
    std::fs::read_to_string(path)
        .map(|text| parse_ini(&text))
        .unwrap_or_default()
}

fn api_level(value: Option<&String>) -> Option<u32> {
    value?
        .trim_start_matches("android-")
        .split(|c: char| !c.is_ascii_digit())
        .next()?
        .parse()
        .ok()
}

pub fn list_avds() -> Vec<AvdInfo> {
    let home = avd_home();
    let Ok(entries) = std::fs::read_dir(&home) else {
        return Vec::new();
    };
    let mut avds: Vec<AvdInfo> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension()?.to_str()? != "ini" {
                return None;
            }
            let name = path.file_stem()?.to_string_lossy().to_string();
            let pointer = read_ini(&path);
            let dir = pointer
                .get("path")
                .map(PathBuf::from)
                .filter(|dir| dir.is_dir())
                .or_else(|| {
                    pointer
                        .get("path.rel")
                        .map(|rel| home.parent().unwrap_or(&home).join(rel))
                })
                .unwrap_or_else(|| home.join(format!("{name}.avd")));
            let config = read_ini(&dir.join("config.ini"));
            if config.is_empty() && !dir.is_dir() {
                return None;
            }
            let number = |key: &str| config.get(key).and_then(|value| value.parse().ok());
            Some(AvdInfo {
                display_name: config
                    .get("avd.ini.displayname")
                    .cloned()
                    .unwrap_or_else(|| name.replace('_', " ")),
                api_level: api_level(config.get("target").or(pointer.get("target"))).or_else(
                    || {
                        let sysdir = config.get("image.sysdir.1")?;
                        let part = sysdir
                            .split(['/', '\\'])
                            .find(|part| part.starts_with("android-"))?;
                        api_level(Some(&part.to_string()))
                    },
                ),
                abi: config.get("abi.type").cloned(),
                variant: config.get("tag.display").cloned(),
                device: config.get("hw.device.name").cloned(),
                width: number("hw.lcd.width"),
                height: number("hw.lcd.height"),
                density: number("hw.lcd.density"),
                path: dir.to_string_lossy().to_string(),
                name,
            })
        })
        .collect();
    avds.sort_by(|a, b| {
        a.display_name
            .to_lowercase()
            .cmp(&b.display_name.to_lowercase())
    });
    avds
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_api_level_from_target_and_sysdir() {
        assert_eq!(api_level(Some(&"android-36".to_string())), Some(36));
        assert_eq!(api_level(Some(&"android-34-ext10".to_string())), Some(34));
        assert_eq!(
            api_level(Some(&"Google Inc.:Google APIs:33".to_string())),
            None
        );
    }

    #[test]
    fn ini_parser_skips_comments_and_trims() {
        let ini = parse_ini("# c\nhw.lcd.width = 1080\nempty=\n");
        assert_eq!(ini.get("hw.lcd.width").map(String::as_str), Some("1080"));
        assert_eq!(ini.get("empty").map(String::as_str), Some(""));
        assert!(!ini.contains_key("# c"));
    }
}
