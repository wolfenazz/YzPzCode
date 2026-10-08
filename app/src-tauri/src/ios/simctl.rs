//! `xcrun simctl`: simulator discovery, boot, shutdown, screenshots and the
//! pasteboard, plus the device-frame data the panel draws around a screen.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;

/// A camera cutout drawn over the top of the screen, sized as fractions of
/// the screen's (portrait) width.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Cutout {
    /// "island" (Dynamic Island) or "notch".
    pub kind: &'static str,
    pub width: f64,
    pub height: f64,
    /// Gap above an island; a notch hangs from the edge.
    pub top: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IosFrame {
    /// Display corner radius in screen pixels (0 for square displays).
    pub corner_radius: f64,
    pub cutout: Option<Cutout>,
    /// A Touch ID home button below the screen.
    pub home_button: bool,
    pub tablet: bool,
}

/// One simulator, shaped like an Android AVD entry (`AvdInfo`) so the device
/// picker lists both; `name` is the simulator's UDID.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulatorDevice {
    pub name: String,
    pub display_name: String,
    pub api_level: Option<u32>,
    pub abi: Option<String>,
    /// "iOS 18.2"
    pub variant: Option<String>,
    /// Device type, e.g. "iPhone 16 Pro".
    pub device: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// Pixels per point.
    pub density: Option<f64>,
    pub path: String,
    pub platform: &'static str,
    /// simctl state: Booted, Shutdown, Booting, Shutting Down.
    pub state: String,
    pub frame: Option<IosFrame>,
}

#[derive(Deserialize)]
struct DeviceList {
    devices: HashMap<String, Vec<RawDevice>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawDevice {
    udid: String,
    name: String,
    state: String,
    #[serde(default = "available")]
    is_available: bool,
    #[serde(default)]
    device_type_identifier: Option<String>,
    #[serde(default)]
    data_path: Option<String>,
}

fn available() -> bool {
    true
}

#[derive(Deserialize)]
struct DeviceTypeList {
    devicetypes: Vec<RawDeviceType>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawDeviceType {
    identifier: String,
    name: String,
    #[serde(default)]
    bundle_path: Option<String>,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct ScreenProfile {
    pub width: u32,
    pub height: u32,
    pub scale: f64,
}

pub fn xcrun() -> tokio::process::Command {
    let mut command = tokio::process::Command::new("/usr/bin/xcrun");
    command.stdin(Stdio::null()).kill_on_drop(true);
    command
}

/// Runs `xcrun simctl <args>` and returns stdout, or the last stderr line.
pub async fn simctl(args: &[&str], timeout: Duration) -> Result<String, String> {
    let output = tokio::time::timeout(timeout, xcrun().arg("simctl").args(args).output())
        .await
        .map_err(|_| format!("simctl {} timed out", args.first().unwrap_or(&"")))?
        .map_err(|e| format!("Could not run xcrun: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        Err(err
            .lines()
            .map(str::trim)
            .rfind(|l| !l.is_empty())
            .unwrap_or("simctl failed")
            .to_string())
    }
}

/// "com.apple.CoreSimulator.SimRuntime.iOS-18-2" → ("iOS", "18.2").
pub fn runtime_name(identifier: &str) -> Option<(String, String)> {
    let tail = identifier.rsplit('.').next()?;
    let (os, version) = tail.split_once('-')?;
    Some((os.to_string(), version.replace('-', ".")))
}

/// Simulators of iOS runtimes (iPhone and iPad), newest runtime first.
pub fn parse_devices(json: &str) -> Result<Vec<(String, String, RawDeviceInfo)>, String> {
    let list: DeviceList = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let mut runtimes: Vec<(String, Vec<RawDevice>)> = list
        .devices
        .into_iter()
        .filter(|(runtime, _)| runtime_name(runtime).is_some_and(|(os, _)| os == "iOS"))
        .collect();
    let version_key = |runtime: &str| -> Vec<u64> {
        runtime_name(runtime)
            .map(|(_, v)| v.split('.').filter_map(|p| p.parse().ok()).collect())
            .unwrap_or_default()
    };
    runtimes.sort_by_key(|(runtime, _)| std::cmp::Reverse(version_key(runtime)));
    let mut out = Vec::new();
    for (runtime, devices) in runtimes {
        let version = runtime_name(&runtime).map(|(_, v)| v).unwrap_or_default();
        for device in devices.into_iter().filter(|d| d.is_available) {
            out.push((
                runtime.clone(),
                version.clone(),
                RawDeviceInfo {
                    udid: device.udid,
                    name: device.name,
                    state: device.state,
                    device_type: device.device_type_identifier,
                    data_path: device.data_path,
                },
            ));
        }
    }
    Ok(out)
}

#[derive(Debug, Clone)]
pub struct RawDeviceInfo {
    pub udid: String,
    pub name: String,
    pub state: String,
    pub device_type: Option<String>,
    pub data_path: Option<String>,
}

fn profiles() -> &'static Mutex<HashMap<String, (String, ScreenProfile)>> {
    static CACHE: OnceLock<Mutex<HashMap<String, (String, ScreenProfile)>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// Screen size and scale of a device type, from its `profile.plist`.
async fn load_profiles() -> HashMap<String, (String, ScreenProfile)> {
    {
        let cache = profiles().lock().unwrap();
        if !cache.is_empty() {
            return cache.clone();
        }
    }
    let Ok(json) = simctl(&["list", "devicetypes", "-j"], Duration::from_secs(20)).await else {
        return HashMap::new();
    };
    let Ok(list) = serde_json::from_str::<DeviceTypeList>(&json) else {
        return HashMap::new();
    };
    let mut found = HashMap::new();
    for kind in list.devicetypes {
        if !(kind.name.starts_with("iPhone") || kind.name.starts_with("iPad")) {
            continue;
        }
        let Some(bundle) = kind.bundle_path else {
            continue;
        };
        let plist = PathBuf::from(bundle)
            .join("Contents")
            .join("Resources")
            .join("profile.plist");
        let profile = read_profile(&plist).await.unwrap_or_default();
        found.insert(kind.identifier, (kind.name, profile));
    }
    *profiles().lock().unwrap() = found.clone();
    found
}

async fn read_profile(plist: &std::path::Path) -> Option<ScreenProfile> {
    let output = tokio::process::Command::new("/usr/bin/plutil")
        .args(["-convert", "json", "-o", "-"])
        .arg(plist)
        .stdin(Stdio::null())
        .output()
        .await
        .ok()?;
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
    let number = |key: &str| value.get(key).and_then(|v| v.as_f64());
    Some(ScreenProfile {
        width: number("mainScreenWidth")? as u32,
        height: number("mainScreenHeight")? as u32,
        scale: number("mainScreenScale").unwrap_or(1.0),
    })
}

/// The model number and suffix of "iPhone 15 Pro Max", "iPhone XS", "iPhone 16e".
fn iphone_model(name: &str) -> Option<(u32, String)> {
    let rest = name.strip_prefix("iPhone")?.trim();
    if let Some(x) = rest.strip_prefix('X') {
        return Some((10, x.trim().to_string()));
    }
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    let number = digits.parse().ok()?;
    Some((number, rest[digits.len()..].trim().to_string()))
}

/// The frame of an iPhone or iPad model. Corner radii are Apple's display
/// radii in points; unknown future models get the newest shape.
pub fn frame_for(model: &str, width_px: u32, scale: f64) -> IosFrame {
    let points = |pt: f64| pt * scale.max(1.0);
    let width_pt = f64::from(width_px) / scale.max(1.0);
    let frame = |radius_pt: f64, cutout: Option<Cutout>| IosFrame {
        corner_radius: points(radius_pt),
        cutout,
        home_button: false,
        tablet: false,
    };
    let island = || {
        Some(Cutout {
            kind: "island",
            width: 125.0 / width_pt,
            height: 37.0 / width_pt,
            top: 11.0 / width_pt,
        })
    };
    let notch = |width_pt_notch: f64| {
        Some(Cutout {
            kind: "notch",
            width: width_pt_notch / width_pt,
            height: 32.0 / width_pt,
            top: 0.0,
        })
    };
    let home = IosFrame {
        corner_radius: 0.0,
        cutout: None,
        home_button: true,
        tablet: false,
    };

    if model.starts_with("iPad") {
        let legacy = [
            "(5th generation)",
            "(6th generation)",
            "(7th generation)",
            "(8th generation)",
            "(9th generation)",
        ]
        .iter()
        .any(|g| model.starts_with("iPad ") && model.contains(g))
            || model.starts_with("iPad Air (3rd")
            || model.starts_with("iPad mini (5th")
            || model.contains("9.7-inch")
            || model.contains("10.5-inch")
            || (model.contains("12.9-inch") && (model.contains("1st") || model.contains("2nd")));
        return IosFrame {
            corner_radius: if legacy { 0.0 } else { points(18.0) },
            cutout: None,
            home_button: legacy,
            tablet: true,
        };
    }
    if model.starts_with("iPhone SE")
        || model.starts_with("iPhone 8")
        || model.starts_with("iPhone 7")
        || model.starts_with("iPhone 6")
    {
        return home;
    }
    let Some((number, suffix)) = iphone_model(model) else {
        return frame(55.0, island());
    };
    let pro = suffix.contains("Pro");
    let max = suffix.contains("Max") || suffix.contains("Plus");
    let mini = suffix.contains("mini");
    match number {
        10 if suffix.contains('R') => frame(41.5, notch(230.0)),
        10 => frame(39.0, notch(209.0)),
        11 if pro => frame(39.0, notch(209.0)),
        11 => frame(41.5, notch(230.0)),
        12 | 13 if mini => frame(44.0, notch(if number == 12 { 226.0 } else { 175.0 })),
        12 if max => frame(53.33, notch(210.0)),
        12 => frame(47.33, notch(210.0)),
        13 if max => frame(53.33, notch(162.0)),
        13 => frame(47.33, notch(162.0)),
        14 if pro => frame(55.0, island()),
        14 if max => frame(53.33, notch(162.0)),
        14 => frame(47.33, notch(162.0)),
        16 if suffix == "e" => frame(47.33, notch(162.0)),
        15 => frame(55.0, island()),
        16 if pro => frame(62.0, island()),
        16 => frame(55.0, island()),
        _ => frame(62.0, island()),
    }
}

/// Every iOS simulator with its screen and frame. Empty when Xcode is absent.
pub async fn list_devices() -> Result<Vec<SimulatorDevice>, String> {
    let json = simctl(
        &["list", "devices", "available", "-j"],
        Duration::from_secs(20),
    )
    .await?;
    let devices = parse_devices(&json)?;
    let profiles = load_profiles().await;
    Ok(devices
        .into_iter()
        .map(|(_, version, device)| {
            let (type_name, profile) = device
                .device_type
                .as_ref()
                .and_then(|id| profiles.get(id).cloned())
                .unwrap_or_else(|| (device.name.clone(), ScreenProfile::default()));
            let known = profile.width > 0 && profile.height > 0;
            SimulatorDevice {
                display_name: device.name.clone(),
                name: device.udid,
                api_level: None,
                abi: None,
                variant: Some(format!("iOS {version}")),
                frame: known.then(|| frame_for(&type_name, profile.width, profile.scale)),
                device: Some(type_name),
                width: known.then_some(profile.width),
                height: known.then_some(profile.height),
                density: known.then_some(profile.scale),
                path: device.data_path.unwrap_or_default(),
                platform: "ios",
                state: device.state,
            }
        })
        .collect())
}

pub async fn boot(udid: &str) -> Result<(), String> {
    match simctl(&["boot", udid], Duration::from_secs(120)).await {
        Ok(_) => Ok(()),
        // Already booted (by Simulator.app or an earlier run) is fine.
        Err(error) if error.contains("current state: Booted") => Ok(()),
        Err(error) => Err(error),
    }
}

/// Waits until SpringBoard is up.
pub async fn wait_booted(udid: &str, timeout: Duration) -> Result<(), String> {
    simctl(&["bootstatus", udid], timeout).await.map(|_| ())
}

pub async fn shutdown(udid: &str) -> Result<(), String> {
    match simctl(&["shutdown", udid], Duration::from_secs(60)).await {
        Ok(_) => Ok(()),
        Err(error) if error.contains("current state: Shutdown") => Ok(()),
        Err(error) => Err(error),
    }
}

/// Erases a shut-down simulator's content and settings.
pub async fn erase(udid: &str) -> Result<(), String> {
    simctl(&["erase", udid], Duration::from_secs(120))
        .await
        .map(|_| ())
}

pub async fn screenshot_png(udid: &str, path: &std::path::Path) -> Result<(), String> {
    let path = path.to_string_lossy().to_string();
    simctl(
        &["io", udid, "screenshot", "--type=png", &path],
        Duration::from_secs(30),
    )
    .await
    .map(|_| ())
}

/// Puts text on the simulator's pasteboard.
pub async fn pbcopy(udid: &str, text: &str) -> Result<(), String> {
    let mut child = xcrun()
        .args(["simctl", "pbcopy", udid])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Could not run xcrun: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(text.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
    }
    let status = tokio::time::timeout(Duration::from_secs(10), child.wait())
        .await
        .map_err(|_| "simctl pbcopy timed out".to_string())?
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Could not set the simulator pasteboard.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_runtimes() {
        assert_eq!(
            runtime_name("com.apple.CoreSimulator.SimRuntime.iOS-18-2"),
            Some(("iOS".into(), "18.2".into()))
        );
        assert_eq!(
            runtime_name("com.apple.CoreSimulator.SimRuntime.watchOS-11-0"),
            Some(("watchOS".into(), "11.0".into()))
        );
    }

    #[test]
    fn lists_ios_simulators_newest_runtime_first() {
        let json = r#"{"devices":{
          "com.apple.CoreSimulator.SimRuntime.iOS-17-5":[{"udid":"A","name":"iPhone 15","state":"Shutdown","isAvailable":true,"deviceTypeIdentifier":"com.apple.CoreSimulator.SimDeviceType.iPhone-15"}],
          "com.apple.CoreSimulator.SimRuntime.iOS-18-2":[{"udid":"B","name":"iPhone 16 Pro","state":"Booted","isAvailable":true},{"udid":"C","name":"Old","state":"Shutdown","isAvailable":false}],
          "com.apple.CoreSimulator.SimRuntime.watchOS-11-0":[{"udid":"W","name":"Apple Watch","state":"Shutdown","isAvailable":true}]
        }}"#;
        let devices = parse_devices(json).unwrap();
        let udids: Vec<&str> = devices.iter().map(|(_, _, d)| d.udid.as_str()).collect();
        assert_eq!(udids, ["B", "A"]);
        assert_eq!(devices[0].1, "18.2");
        assert_eq!(
            devices[1].2.device_type.as_deref(),
            Some("com.apple.CoreSimulator.SimDeviceType.iPhone-15")
        );
    }

    #[test]
    fn frames_match_the_model() {
        let pro = frame_for("iPhone 16 Pro", 1206, 3.0);
        assert_eq!(pro.corner_radius, 186.0);
        assert_eq!(pro.cutout.as_ref().unwrap().kind, "island");
        assert!((pro.cutout.as_ref().unwrap().width - 125.0 / 402.0).abs() < 1e-9);
        assert_eq!(frame_for("iPhone 15", 1179, 3.0).corner_radius, 165.0);
        assert_eq!(
            frame_for("iPhone 14", 1170, 3.0).cutout.unwrap().kind,
            "notch"
        );
        assert_eq!(
            frame_for("iPhone 14 Pro", 1179, 3.0).cutout.unwrap().kind,
            "island"
        );
        assert_eq!(
            frame_for("iPhone 16e", 1170, 3.0).cutout.unwrap().kind,
            "notch"
        );
        assert_eq!(frame_for("iPhone XR", 828, 2.0).corner_radius, 83.0);
        assert!(frame_for("iPhone SE (3rd generation)", 750, 2.0).home_button);
        assert!(frame_for("iPad (9th generation)", 1620, 2.0).home_button);
        let ipad = frame_for("iPad Pro 13-inch (M4)", 2064, 2.0);
        assert!(ipad.tablet && !ipad.home_button && ipad.corner_radius == 36.0);
        assert_eq!(frame_for("iPhone 17 Pro", 1206, 3.0).corner_radius, 186.0);
    }
}
