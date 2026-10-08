//! What Flutter iOS development needs on a Mac, for the setup checklist:
//! Xcode (selected, license accepted, first launch done), an iOS Simulator
//! runtime and device, CocoaPods, and idb_companion for the embedded screen.
//! The install steps themselves run in `android::setup` with the others.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use crate::android::setup::{ItemStatus, SetupItem};

use super::companion::companion_path;
use super::simctl;

pub const XCODE_APP: &str = "/Applications/Xcode.app";
pub const XCODE_STORE_URL: &str = "macappstore://apps.apple.com/app/id497799835";
pub const HOMEBREW_INSTALL: &str = r#"/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)""#;

/// The steps "Set up everything" adds on macOS, in order.
pub const IOS_STEPS: [&str; 5] = [
    "xcode-setup",
    "ios-runtime",
    "ios-simulator",
    "cocoapods",
    "idb",
];

/// Runs a tool and returns (success, stdout, stderr); None when it can't start.
pub async fn run(
    program: &str,
    args: &[&str],
    timeout: Duration,
) -> Option<(bool, String, String)> {
    let output = tokio::time::timeout(
        timeout,
        tokio::process::Command::new(program)
            .args(args)
            .stdin(Stdio::null())
            .kill_on_drop(true)
            .output(),
    )
    .await
    .ok()?
    .ok()?;
    Some((
        output.status.success(),
        String::from_utf8_lossy(&output.stdout).trim().to_string(),
        String::from_utf8_lossy(&output.stderr).trim().to_string(),
    ))
}

fn find_tool(name: &str) -> Option<PathBuf> {
    which::which(name).ok().or_else(|| {
        ["/opt/homebrew/bin", "/usr/local/bin"]
            .iter()
            .map(|dir| Path::new(dir).join(name))
            .find(|p| p.is_file())
    })
}

pub fn brew_path() -> Option<PathBuf> {
    find_tool("brew")
}

pub fn pod_path() -> Option<PathBuf> {
    find_tool("pod")
}

/// The developer directory `xcode-select` points at.
pub async fn developer_dir() -> Option<String> {
    run("/usr/bin/xcode-select", &["-p"], Duration::from_secs(10))
        .await
        .filter(|(ok, _, _)| *ok)
        .map(|(_, out, _)| out)
}

pub fn xcode_installed() -> bool {
    Path::new(XCODE_APP).is_dir()
}

/// Xcode is installed and selected (not just the Command Line Tools).
pub async fn xcode_selected() -> bool {
    developer_dir()
        .await
        .is_some_and(|dir| dir.contains(".app/Contents/Developer"))
}

#[derive(Debug, Clone, PartialEq)]
pub struct IosRuntime {
    pub identifier: String,
    pub name: String,
    pub version: Vec<u64>,
}

/// Installed, available iOS runtimes, newest first.
pub fn parse_runtimes(json: &str) -> Vec<IosRuntime> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return Vec::new();
    };
    let mut runtimes: Vec<IosRuntime> = value
        .get("runtimes")
        .and_then(|r| r.as_array())
        .map(|list| {
            list.iter()
                .filter(|r| {
                    r.get("isAvailable")
                        .and_then(|a| a.as_bool())
                        .unwrap_or(true)
                })
                .filter_map(|r| {
                    let identifier = r.get("identifier")?.as_str()?.to_string();
                    let (os, version) = simctl::runtime_name(&identifier)?;
                    (os == "iOS").then(|| IosRuntime {
                        name: r
                            .get("name")
                            .and_then(|n| n.as_str())
                            .map(str::to_string)
                            .unwrap_or_else(|| format!("iOS {version}")),
                        version: version.split('.').filter_map(|p| p.parse().ok()).collect(),
                        identifier,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    runtimes.sort_by(|a, b| b.version.cmp(&a.version));
    runtimes
}

pub async fn ios_runtimes() -> Vec<IosRuntime> {
    match simctl::simctl(&["list", "runtimes", "-j"], Duration::from_secs(20)).await {
        Ok(json) => parse_runtimes(&json),
        Err(_) => Vec::new(),
    }
}

/// The iPhone device type a new simulator should use: the newest Pro model.
pub fn preferred_device_type(json: &str) -> Option<(String, String)> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    let types: Vec<(String, String)> = value
        .get("devicetypes")?
        .as_array()?
        .iter()
        .filter_map(|t| {
            Some((
                t.get("identifier")?.as_str()?.to_string(),
                t.get("name")?.as_str()?.to_string(),
            ))
        })
        .filter(|(_, name)| name.starts_with("iPhone") && !name.contains("SE"))
        .collect();
    let number = |name: &str| -> u32 {
        name.trim_start_matches("iPhone")
            .trim()
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect::<String>()
            .parse()
            .unwrap_or(0)
    };
    let rank = |name: &str| (number(name), name.ends_with(" Pro"), !name.contains("Max"));
    types.into_iter().max_by_key(|(_, name)| rank(name))
}

fn item(
    id: &'static str,
    label: &'static str,
    status: ItemStatus,
    version: Option<String>,
    detail: Option<String>,
    fix_step: Option<&'static str>,
) -> SetupItem {
    SetupItem {
        id,
        label,
        status,
        version,
        detail,
        path: None,
        fix_step,
    }
}

/// The iOS part of the setup report. Empty off macOS.
pub async fn check_items() -> Vec<SetupItem> {
    if !cfg!(target_os = "macos") {
        return Vec::new();
    }
    let mut items = Vec::new();
    let installed = xcode_installed();
    let selected = xcode_selected().await;
    let version = if selected {
        run(
            "/usr/bin/xcodebuild",
            &["-version"],
            Duration::from_secs(20),
        )
        .await
        .filter(|(ok, _, _)| *ok)
        .and_then(|(_, out, _)| out.lines().next().map(str::to_string))
    } else {
        None
    };
    items.push(match (installed || selected, selected) {
        (true, true) => item("xcode", "Xcode", ItemStatus::Ok, version, None, None),
        (true, false) => item(
            "xcode",
            "Xcode",
            ItemStatus::Warning,
            None,
            Some("Installed, but the command-line tools point elsewhere.".into()),
            Some("xcode-setup"),
        ),
        _ => item(
            "xcode",
            "Xcode",
            ItemStatus::Missing,
            None,
            Some("Install Xcode from the App Store; it includes the iOS Simulator.".into()),
            Some("xcode"),
        ),
    });
    if !selected {
        return items;
    }

    let license = run(
        "/usr/bin/xcodebuild",
        &["-license", "check"],
        Duration::from_secs(20),
    )
    .await
    .is_some_and(|(ok, _, _)| ok);
    let first_launch = run(
        "/usr/bin/xcodebuild",
        &["-checkFirstLaunchStatus"],
        Duration::from_secs(20),
    )
    .await
    .is_some_and(|(ok, _, _)| ok);
    items.push(if license && first_launch {
        item(
            "xcode-license",
            "Xcode license & components",
            ItemStatus::Ok,
            None,
            None,
            None,
        )
    } else {
        item(
            "xcode-license",
            "Xcode license & components",
            ItemStatus::Missing,
            None,
            Some(
                if license {
                    "Xcode's first-launch components are not installed."
                } else {
                    "The Xcode license has not been accepted."
                }
                .into(),
            ),
            Some("xcode-setup"),
        )
    });

    let runtimes = ios_runtimes().await;
    items.push(match runtimes.first() {
        Some(runtime) => item(
            "ios-runtime",
            "iOS Simulator runtime",
            ItemStatus::Ok,
            Some(runtime.name.clone()),
            (runtimes.len() > 1).then(|| format!("{} runtimes", runtimes.len())),
            None,
        ),
        None => item(
            "ios-runtime",
            "iOS Simulator runtime",
            ItemStatus::Missing,
            None,
            Some("Downloads the iOS platform for Xcode (several GB).".into()),
            Some("ios-runtime"),
        ),
    });

    let devices = simctl::list_devices().await.unwrap_or_default();
    items.push(match devices.first() {
        Some(device) => item(
            "ios-simulator",
            "iOS simulator",
            ItemStatus::Ok,
            Some(device.display_name.clone()),
            (devices.len() > 1).then(|| format!("{} simulators", devices.len())),
            None,
        ),
        None => item(
            "ios-simulator",
            "iOS simulator",
            ItemStatus::Missing,
            None,
            Some("Creates an iPhone simulator.".into()),
            (!runtimes.is_empty()).then_some("ios-simulator"),
        ),
    });

    let brew = brew_path();
    let pod = pod_path();
    let pod_version = match &pod {
        Some(pod) => run(
            &pod.to_string_lossy(),
            &["--version"],
            Duration::from_secs(30),
        )
        .await
        .filter(|(ok, _, _)| *ok)
        .map(|(_, out, _)| out),
        None => None,
    };
    items.push(match (&pod, brew.is_some()) {
        (Some(_), _) => item(
            "cocoapods",
            "CocoaPods",
            ItemStatus::Ok,
            pod_version,
            None,
            None,
        ),
        (None, true) => item(
            "cocoapods",
            "CocoaPods",
            ItemStatus::Missing,
            None,
            Some("Flutter iOS plugins need it. Installs with Homebrew.".into()),
            Some("cocoapods"),
        ),
        (None, false) => item(
            "cocoapods",
            "CocoaPods",
            ItemStatus::Missing,
            None,
            Some("Install Homebrew first.".into()),
            None,
        ),
    });
    items.push(match (companion_path(), brew.is_some()) {
        (Some(_), _) => item(
            "idb",
            "Simulator screen bridge (idb)",
            ItemStatus::Ok,
            None,
            None,
            None,
        ),
        (None, true) => item(
            "idb",
            "Simulator screen bridge (idb)",
            ItemStatus::Missing,
            None,
            Some(
                "Shows the simulator inside YzPzCode. Installs idb-companion with Homebrew.".into(),
            ),
            Some("idb"),
        ),
        (None, false) => item(
            "idb",
            "Simulator screen bridge (idb)",
            ItemStatus::Missing,
            None,
            Some("Install Homebrew first.".into()),
            None,
        ),
    });
    items.push(match &brew {
        Some(path) => item(
            "homebrew",
            "Homebrew",
            ItemStatus::Ok,
            None,
            Some(path.to_string_lossy().to_string()),
            None,
        ),
        None => item(
            "homebrew",
            "Homebrew",
            ItemStatus::Missing,
            None,
            Some("Installs CocoaPods and idb. Opens Terminal; it asks for your password.".into()),
            Some("homebrew"),
        ),
    });
    items
}

/// The admin shell command that selects Xcode, accepts its license and
/// installs its first-launch components.
pub fn xcode_setup_script(select_xcode: bool) -> String {
    let mut parts = Vec::new();
    if select_xcode {
        parts.push(format!(
            "/usr/bin/xcode-select -s {XCODE_APP}/Contents/Developer"
        ));
    }
    parts.push("/usr/bin/xcodebuild -license accept".to_string());
    parts.push("/usr/bin/xcodebuild -runFirstLaunch".to_string());
    parts.join(" && ")
}

/// AppleScript for `osascript -e`, quoting `command` for `do shell script`.
pub fn admin_applescript(command: &str) -> String {
    let quoted = command.replace('\\', "\\\\").replace('"', "\\\"");
    format!("do shell script \"{quoted}\" with administrator privileges")
}

/// AppleScript that opens Terminal running `command`.
pub fn terminal_applescript(command: &str) -> String {
    let quoted = command.replace('\\', "\\\\").replace('"', "\\\"");
    format!("tell application \"Terminal\"\nactivate\ndo script \"{quoted}\"\nend tell")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_ios_runtimes_newest_first() {
        let json = r#"{"runtimes":[
          {"identifier":"com.apple.CoreSimulator.SimRuntime.iOS-17-5","name":"iOS 17.5","isAvailable":true},
          {"identifier":"com.apple.CoreSimulator.SimRuntime.iOS-18-2","name":"iOS 18.2","isAvailable":true},
          {"identifier":"com.apple.CoreSimulator.SimRuntime.iOS-16-0","name":"iOS 16.0","isAvailable":false},
          {"identifier":"com.apple.CoreSimulator.SimRuntime.watchOS-11-2","name":"watchOS 11.2","isAvailable":true}
        ]}"#;
        let names: Vec<String> = parse_runtimes(json).into_iter().map(|r| r.name).collect();
        assert_eq!(names, ["iOS 18.2", "iOS 17.5"]);
    }

    #[test]
    fn prefers_the_newest_pro_iphone() {
        let json = r#"{"devicetypes":[
          {"identifier":"t.15","name":"iPhone 15"},
          {"identifier":"t.16pm","name":"iPhone 16 Pro Max"},
          {"identifier":"t.16p","name":"iPhone 16 Pro"},
          {"identifier":"t.16","name":"iPhone 16"},
          {"identifier":"t.se","name":"iPhone SE (3rd generation)"},
          {"identifier":"t.ipad","name":"iPad Air 11-inch (M2)"}
        ]}"#;
        assert_eq!(
            preferred_device_type(json),
            Some(("t.16p".into(), "iPhone 16 Pro".into()))
        );
    }

    #[test]
    fn quotes_shell_commands_for_applescript() {
        let script = admin_applescript(&xcode_setup_script(true));
        assert!(script.starts_with("do shell script \"/usr/bin/xcode-select -s /Applications/Xcode.app/Contents/Developer && "));
        assert!(script.ends_with("\" with administrator privileges"));
        let terminal = terminal_applescript(HOMEBREW_INSTALL);
        assert!(terminal.contains(r#"do script "/bin/bash -c \"$(curl"#));
    }
}
