//! Checks and installs everything Flutter Android development needs:
//! the Flutter SDK, a JDK, the Android command-line tools, SDK packages and
//! licenses, a virtual device, environment variables, and (on Windows) the
//! hypervisor the emulator runs on.
//!
//! Installs are user-level and need no administrator rights, except enabling
//! the Windows Hypervisor Platform, which asks for elevation explicitly.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};

use super::avd::{list_avds, parse_ini};
use super::sdk::{self, PATH_SEPARATOR};
use crate::ios::setup as ios_setup;

const FLUTTER_REPO: &str = "https://github.com/flutter/flutter.git";
const ANDROID_REPOSITORY: &str = "https://dl.google.com/android/repository/repository2-3.xml";
/// Used when the repository index cannot be read.
const CMDLINE_TOOLS_FALLBACK_REVISION: &str = "13114758";
const JDK_MAJOR: u32 = 17;
const PREFERRED_DEVICES: [&str; 6] = [
    "pixel_9", "pixel_8", "pixel_7", "pixel_6", "pixel_5", "pixel",
];

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ItemStatus {
    Ok,
    Missing,
    Warning,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupItem {
    pub id: &'static str,
    pub label: &'static str,
    pub status: ItemStatus,
    pub version: Option<String>,
    pub detail: Option<String>,
    pub path: Option<String>,
    /// The setup step that fixes this item, when the app can do it.
    pub fix_step: Option<&'static str>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupReport {
    pub items: Vec<SetupItem>,
    /// Flutter, the SDK pieces and a virtual device are all present.
    pub ready: bool,
    pub android_sdk: String,
    pub flutter_root: Option<String>,
    pub java_home: Option<String>,
    pub running_step: Option<String>,
    /// Xcode, a simulator runtime and device, and CocoaPods are present
    /// (macOS only; None elsewhere).
    pub ios_ready: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupLog<'a> {
    step: &'a str,
    text: String,
    level: &'a str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupProgress<'a> {
    step: &'a str,
    /// running | done | skipped | failed
    phase: &'a str,
    message: Option<String>,
    percent: Option<f32>,
}

/// The order "Set up everything" runs steps in.
pub const ALL_STEPS: [&str; 6] = [
    "flutter",
    "jdk",
    "cmdline-tools",
    "sdk-packages",
    "avd",
    "configure",
];

fn display(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn flutter_version(root: &Path) -> Option<String> {
    let json =
        std::fs::read_to_string(root.join("bin").join("cache").join("flutter.version.json")).ok();
    json.and_then(|text| {
        let value: serde_json::Value = serde_json::from_str(&text).ok()?;
        value.get("frameworkVersion")?.as_str().map(str::to_string)
    })
    .or_else(|| {
        std::fs::read_to_string(root.join("version"))
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
    })
}

/// JAVA_VERSION from the JDK's `release` file, e.g. "17.0.12".
fn java_version(home: &Path) -> Option<String> {
    let text = std::fs::read_to_string(home.join("release")).ok()?;
    parse_ini(&text)
        .get("JAVA_VERSION")
        .map(|v| v.trim_matches('"').to_string())
}

fn java_major(version: &str) -> Option<u32> {
    let mut parts = version.split(['.', '_', '+', '-']);
    let first: u32 = parts.next()?.parse().ok()?;
    if first == 1 {
        parts.next()?.parse().ok()
    } else {
        Some(first)
    }
}

fn subdirs(path: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(path)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| e.path().is_dir())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect()
        })
        .unwrap_or_default();
    names.sort_by_key(|name| version_key(name));
    names
}

/// Sort key for names like "android-36", "35.0.0", "android-36.1".
fn version_key(name: &str) -> Vec<u64> {
    name.split(|c: char| !c.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse().ok())
        .collect()
}

/// Installed system images as (package id, api).
fn system_images(sdk_dir: &Path) -> Vec<(String, Vec<u64>)> {
    let root = sdk_dir.join("system-images");
    let mut images = Vec::new();
    for api in subdirs(&root) {
        for tag in subdirs(&root.join(&api)) {
            for abi in subdirs(&root.join(&api).join(&tag)) {
                if root
                    .join(&api)
                    .join(&tag)
                    .join(&abi)
                    .join("system.img")
                    .is_file()
                {
                    images.push((
                        format!("system-images;{api};{tag};{abi}"),
                        version_key(&api),
                    ));
                }
            }
        }
    }
    images
}

/// The image a new AVD should use: host ABI, Play Store first, newest API.
fn best_system_image(sdk_dir: &Path) -> Option<String> {
    let abi = sdk::host_abi();
    let rank = |id: &str| {
        if id.contains(";google_apis_playstore;") {
            0
        } else if id.contains(";google_apis;") {
            1
        } else {
            2
        }
    };
    let mut images: Vec<(String, Vec<u64>)> = system_images(sdk_dir)
        .into_iter()
        .filter(|(id, _)| id.ends_with(&format!(";{abi}")))
        .collect();
    images.sort_by(|a, b| b.1.cmp(&a.1).then(rank(&a.0).cmp(&rank(&b.0))));
    images.into_iter().next().map(|(id, _)| id)
}

async fn acceleration_check(sdk_dir: &Path) -> Option<(bool, String)> {
    let emulator = sdk::emulator_path(sdk_dir);
    if !emulator.is_file() {
        return None;
    }
    let output = tokio::time::timeout(
        Duration::from_secs(20),
        sdk::tool_command(&emulator)
            .arg("-accel-check")
            .stdin(Stdio::null())
            .output(),
    )
    .await
    .ok()?
    .ok()?;
    let text = String::from_utf8_lossy(&output.stdout).to_string();
    let mut lines = text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && *l != "accel:" && *l != "accel");
    let code: i32 = lines.next()?.parse().ok()?;
    let message = lines.next().unwrap_or("").to_string();
    Some((code == 0, message))
}

pub async fn check(running_step: Option<String>) -> SetupReport {
    let sdk_dir = sdk::android_sdk_dir_or_default();
    let sdk_exists = sdk::android_sdk_dir().is_some();
    let mut items = Vec::new();
    let item = |id,
                label,
                status,
                version: Option<String>,
                detail: Option<String>,
                path: Option<String>,
                fix_step| SetupItem {
        id,
        label,
        status,
        version,
        detail,
        path,
        fix_step,
    };

    let flutter = sdk::flutter_root();
    items.push(match &flutter {
        Some(root) => item(
            "flutter",
            "Flutter SDK",
            ItemStatus::Ok,
            flutter_version(root),
            None,
            Some(display(root)),
            None,
        ),
        None => item(
            "flutter",
            "Flutter SDK",
            ItemStatus::Missing,
            None,
            Some(if which::which("git").is_ok() {
                format!(
                    "Installs the stable channel to {}",
                    display(&sdk::default_flutter_dir())
                )
            } else {
                "Needs Git to install. Install Git from Settings → Environment first.".into()
            }),
            None,
            Some("flutter"),
        ),
    });

    let java = sdk::java_home();
    let java_ver = java.as_deref().and_then(java_version);
    let java_ok = java_ver
        .as_deref()
        .and_then(java_major)
        .map(|m| m >= JDK_MAJOR)
        .unwrap_or(java.is_some());
    items.push(match &java {
        Some(home) if java_ok => item(
            "jdk",
            "Java JDK",
            ItemStatus::Ok,
            java_ver,
            None,
            Some(display(home)),
            None,
        ),
        Some(home) => item(
            "jdk",
            "Java JDK",
            ItemStatus::Warning,
            java_ver,
            Some(format!("Android builds need JDK {JDK_MAJOR} or newer.")),
            Some(display(home)),
            Some("jdk"),
        ),
        None => item(
            "jdk",
            "Java JDK",
            ItemStatus::Missing,
            None,
            Some(format!(
                "Installs Eclipse Temurin {JDK_MAJOR} for this user."
            )),
            None,
            Some("jdk"),
        ),
    });

    let sdkmanager = sdk::sdkmanager_path(&sdk_dir);
    items.push(item(
        "cmdline-tools",
        "Android command-line tools",
        if sdkmanager.is_some() {
            ItemStatus::Ok
        } else {
            ItemStatus::Missing
        },
        None,
        (!sdk_exists).then(|| format!("Creates the Android SDK at {}", display(&sdk_dir))),
        Some(display(&sdk_dir)),
        sdkmanager.is_none().then_some("cmdline-tools"),
    ));

    let platforms = subdirs(&sdk_dir.join("platforms"));
    let build_tools = subdirs(&sdk_dir.join("build-tools"));
    let images = system_images(&sdk_dir);
    let licensed = sdk_dir
        .join("licenses")
        .join("android-sdk-license")
        .is_file();
    let packages: [(&'static str, &'static str, bool, Option<String>); 6] = [
        (
            "platform-tools",
            "Platform tools (adb)",
            sdk::adb_path(&sdk_dir).is_file(),
            None,
        ),
        (
            "emulator",
            "Android Emulator",
            sdk::emulator_path(&sdk_dir).is_file(),
            None,
        ),
        (
            "platform",
            "Android platform",
            !platforms.is_empty(),
            platforms.last().cloned(),
        ),
        (
            "build-tools",
            "Build tools",
            !build_tools.is_empty(),
            build_tools.last().cloned(),
        ),
        (
            "system-image",
            "Emulator system image",
            !images.is_empty(),
            images.last().map(|(id, _)| id.clone()),
        ),
        ("licenses", "SDK licenses accepted", licensed, None),
    ];
    for (id, label, present, version) in packages {
        items.push(item(
            id,
            label,
            if present {
                ItemStatus::Ok
            } else {
                ItemStatus::Missing
            },
            version,
            None,
            None,
            (!present).then_some("sdk-packages"),
        ));
    }

    let avds = list_avds();
    items.push(item(
        "avd",
        "Virtual device",
        if avds.is_empty() {
            ItemStatus::Missing
        } else {
            ItemStatus::Ok
        },
        avds.first().map(|a| a.display_name.clone()),
        (avds.len() > 1).then(|| format!("{} devices", avds.len())),
        None,
        avds.is_empty().then_some("avd"),
    ));

    let flutter_on_path = which::which("flutter").is_ok();
    let android_home_set = std::env::var_os("ANDROID_HOME").is_some()
        || std::env::var_os("ANDROID_SDK_ROOT").is_some();
    let configured = flutter_on_path && android_home_set;
    items.push(item(
        "configure",
        "Environment variables",
        if configured {
            ItemStatus::Ok
        } else {
            ItemStatus::Warning
        },
        None,
        (!configured).then(|| {
            let mut missing = Vec::new();
            if !flutter_on_path {
                missing.push("flutter is not on PATH");
            }
            if !android_home_set {
                missing.push("ANDROID_HOME is not set");
            }
            format!(
                "{}; terminals outside YzPzCode won't find the tools.",
                missing.join(", ")
            )
        }),
        None,
        (!configured).then_some("configure"),
    ));

    if let Some((ok, message)) = acceleration_check(&sdk_dir).await {
        items.push(item(
            "acceleration",
            "Hardware acceleration",
            if ok {
                ItemStatus::Ok
            } else {
                ItemStatus::Warning
            },
            None,
            Some(message).filter(|m| !m.is_empty()),
            None,
            (!ok && cfg!(target_os = "windows")).then_some("acceleration"),
        ));
    }

    let ios_items = crate::ios::setup::check_items().await;
    let ios_ready = cfg!(target_os = "macos").then(|| {
        [
            "xcode",
            "xcode-license",
            "ios-runtime",
            "ios-simulator",
            "cocoapods",
        ]
        .iter()
        .all(|id| {
            ios_items
                .iter()
                .any(|i| i.id == *id && i.status == ItemStatus::Ok)
        })
    });
    items.extend(ios_items);

    let required = [
        "flutter",
        "jdk",
        "cmdline-tools",
        "platform-tools",
        "emulator",
        "platform",
        "build-tools",
        "system-image",
        "licenses",
        "avd",
    ];
    let ready = items
        .iter()
        .filter(|i| required.contains(&i.id))
        .all(|i| i.status == ItemStatus::Ok);
    SetupReport {
        items,
        ready,
        android_sdk: display(&sdk_dir),
        flutter_root: flutter.as_deref().map(display),
        java_home: java.as_deref().map(display),
        running_step,
        ios_ready,
    }
}

#[derive(Clone, Default)]
pub struct FlutterSetupManager {
    app: Arc<Mutex<Option<AppHandle>>>,
    running: Arc<Mutex<Option<String>>>,
    cancelled: Arc<AtomicBool>,
    child: Arc<Mutex<Option<u32>>>,
}

impl FlutterSetupManager {
    pub fn set_app_handle(&self, app: AppHandle) {
        *self.app.lock().unwrap() = Some(app);
    }

    pub fn running_step(&self) -> Option<String> {
        self.running.lock().unwrap().clone()
    }

    fn emit<T: Serialize + Clone>(&self, event: &str, payload: T) {
        if let Some(app) = self.app.lock().unwrap().clone() {
            let _ = app.emit(event, payload);
        }
    }

    fn log(&self, step: &str, text: impl Into<String>, level: &str) {
        self.emit(
            "flutter-setup-log",
            SetupLog {
                step,
                text: text.into(),
                level,
            },
        );
    }

    fn progress(&self, step: &str, phase: &str, message: Option<String>, percent: Option<f32>) {
        self.emit(
            "flutter-setup-progress",
            SetupProgress {
                step,
                phase,
                message,
                percent,
            },
        );
    }

    fn check_cancelled(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::SeqCst) {
            Err("Setup cancelled.".into())
        } else {
            Ok(())
        }
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        if let Some(pid) = *self.child.lock().unwrap() {
            kill_tree(pid);
        }
    }

    /// Runs the given steps in the background; `["all"]` runs every step that
    /// is still needed.
    pub fn start(&self, steps: Vec<String>) -> Result<(), String> {
        {
            let mut running = self.running.lock().unwrap();
            if running.is_some() {
                return Err("Setup is already running.".into());
            }
            *running = Some("starting".into());
        }
        self.cancelled.store(false, Ordering::SeqCst);
        let manager = self.clone();
        tauri::async_runtime::spawn(async move {
            let steps: Vec<String> = if steps.iter().any(|s| s == "all") {
                let ios: &[&str] = if cfg!(target_os = "macos") {
                    &ios_setup::IOS_STEPS
                } else {
                    &[]
                };
                ALL_STEPS.iter().chain(ios).map(|s| s.to_string()).collect()
            } else {
                steps
            };
            let mut result = Ok(());
            for step in &steps {
                *manager.running.lock().unwrap() = Some(step.clone());
                manager.progress(step, "running", None, None);
                let outcome = match manager.check_cancelled() {
                    Ok(()) => manager.run_step(step).await,
                    Err(error) => Err(error),
                };
                match outcome {
                    Ok(StepOutcome::Done(message)) => {
                        manager.progress(step, "done", message, Some(100.0))
                    }
                    Ok(StepOutcome::Skipped(message)) => {
                        manager.progress(step, "skipped", Some(message), None)
                    }
                    Err(error) => {
                        manager.log(step, error.clone(), "error");
                        manager.progress(step, "failed", Some(error.clone()), None);
                        result = Err(error);
                        break;
                    }
                }
            }
            *manager.running.lock().unwrap() = None;
            manager.emit(
                "flutter-setup-finished",
                serde_json::json!({ "ok": result.is_ok(), "error": result.err() }),
            );
        });
        Ok(())
    }

    async fn run_step(&self, step: &str) -> Result<StepOutcome, String> {
        match step {
            "flutter" => self.install_flutter().await,
            "jdk" => self.install_jdk().await,
            "cmdline-tools" => self.install_cmdline_tools().await,
            "sdk-packages" => self.install_sdk_packages().await,
            "avd" => self.create_avd().await,
            "configure" => self.configure_environment().await,
            "acceleration" => self.enable_acceleration().await,
            "doctor" => self.doctor().await,
            "xcode" => self.open_xcode_store().await,
            "xcode-setup" => self.setup_xcode().await,
            "ios-runtime" => self.install_ios_runtime().await,
            "ios-simulator" => self.create_ios_simulator().await,
            "homebrew" => self.install_homebrew().await,
            "cocoapods" => self.brew_install("cocoapods", None, "cocoapods").await,
            "idb" => {
                self.brew_install("idb", Some("facebook/fb"), "idb-companion")
                    .await
            }
            other => Err(format!("Unknown setup step {other}")),
        }
    }

    // ── Steps ────────────────────────────────────────────────────────────

    async fn install_flutter(&self) -> Result<StepOutcome, String> {
        if let Some(root) = sdk::flutter_root() {
            return Ok(StepOutcome::Skipped(format!(
                "Flutter is already installed at {}",
                display(&root)
            )));
        }
        let git = which::which("git").map_err(|_| "Git is required to install Flutter. Install Git (Settings → Environment) and try again.".to_string())?;
        let target = sdk::default_flutter_dir();
        if target.exists()
            && std::fs::read_dir(&target)
                .map(|mut d| d.next().is_some())
                .unwrap_or(false)
        {
            return Err(format!(
                "{} already exists but is not a Flutter SDK. Move it away and try again.",
                display(&target)
            ));
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        self.log(
            "flutter",
            format!("Cloning Flutter (stable) into {}", display(&target)),
            "info",
        );
        let mut clone = sdk::tool_command(git);
        clone
            .args([
                "clone",
                "--depth",
                "1",
                "--branch",
                "stable",
                "--progress",
                FLUTTER_REPO,
            ])
            .arg(&target);
        self.run_logged("flutter", clone, None, false).await?;
        prepend_process_path(&[target.join("bin")]);
        self.log(
            "flutter",
            "Downloading the Dart SDK and Flutter tool (first run)…",
            "info",
        );
        let mut version = sdk::tool_command(sdk::flutter_launcher(&target));
        version.arg("--version");
        self.run_logged("flutter", version, None, false).await?;
        Ok(StepOutcome::Done(flutter_version(&target)))
    }

    async fn install_jdk(&self) -> Result<StepOutcome, String> {
        if let Some(home) = sdk::java_home() {
            let ok = java_version(&home)
                .as_deref()
                .and_then(java_major)
                .map(|m| m >= JDK_MAJOR)
                .unwrap_or(true);
            if ok {
                return Ok(StepOutcome::Skipped(format!(
                    "Using the JDK at {}",
                    display(&home)
                )));
            }
        }
        let os = if cfg!(target_os = "windows") {
            "windows"
        } else if cfg!(target_os = "macos") {
            "mac"
        } else {
            "linux"
        };
        let arch = if cfg!(target_arch = "aarch64") {
            "aarch64"
        } else {
            "x64"
        };
        let url = format!("https://api.adoptium.net/v3/binary/latest/{JDK_MAJOR}/ga/{os}/{arch}/jdk/hotspot/normal/eclipse?project=jdk");
        let archive = self.download("jdk", &url, "Temurin JDK").await?;
        let target = sdk::toolchains_dir().join("jdk");
        if target.exists() {
            std::fs::remove_dir_all(&target)
                .map_err(|e| format!("Could not replace {}: {e}", display(&target)))?;
        }
        self.log("jdk", format!("Extracting to {}", display(&target)), "info");
        extract(&archive, &target).await?;
        let _ = std::fs::remove_file(&archive);
        let home =
            sdk::find_java_home_under(&target, 4).ok_or("The downloaded JDK has no bin/java.")?;
        Ok(StepOutcome::Done(java_version(&home)))
    }

    async fn install_cmdline_tools(&self) -> Result<StepOutcome, String> {
        let sdk_dir = sdk::android_sdk_dir_or_default();
        if sdk::sdkmanager_path(&sdk_dir).is_some() {
            return Ok(StepOutcome::Skipped(
                "Command-line tools are already installed.".into(),
            ));
        }
        std::fs::create_dir_all(&sdk_dir)
            .map_err(|e| format!("Could not create {}: {e}", display(&sdk_dir)))?;
        let os = if cfg!(target_os = "windows") {
            "win"
        } else if cfg!(target_os = "macos") {
            "mac"
        } else {
            "linux"
        };
        let revision = latest_cmdline_tools_revision(os)
            .await
            .unwrap_or_else(|| CMDLINE_TOOLS_FALLBACK_REVISION.to_string());
        let url = format!(
            "https://dl.google.com/android/repository/commandlinetools-{os}-{revision}_latest.zip"
        );
        let archive = self
            .download("cmdline-tools", &url, "Android command-line tools")
            .await?;
        let staging = sdk_dir
            .join("cmdline-tools")
            .join(format!(".staging-{}", uuid::Uuid::new_v4()));
        extract(&archive, &staging).await?;
        let _ = std::fs::remove_file(&archive);
        let latest = sdk_dir.join("cmdline-tools").join("latest");
        if latest.exists() {
            std::fs::remove_dir_all(&latest).map_err(|e| e.to_string())?;
        }
        // The archive holds a single `cmdline-tools/` folder; it must live at
        // `<sdk>/cmdline-tools/latest` for sdkmanager to find the SDK root.
        std::fs::rename(staging.join("cmdline-tools"), &latest)
            .map_err(|e| format!("Could not install the command-line tools: {e}"))?;
        let _ = std::fs::remove_dir_all(&staging);
        Ok(StepOutcome::Done(Some(format!("Revision {revision}"))))
    }

    async fn install_sdk_packages(&self) -> Result<StepOutcome, String> {
        let sdk_dir = sdk::android_sdk_dir_or_default();
        let sdkmanager = sdk::sdkmanager_path(&sdk_dir)
            .ok_or("Install the Android command-line tools first.")?;
        if sdk::java_home().is_none() {
            return Err("sdkmanager needs a JDK. Install the Java JDK step first.".into());
        }
        let sdk_root = format!("--sdk_root={}", display(&sdk_dir));
        let yes = "y\n".repeat(64);

        self.log("sdk-packages", "Accepting Android SDK licenses…", "info");
        let mut licenses = sdk::tool_command(&sdkmanager);
        licenses.args([sdk_root.as_str(), "--licenses"]);
        self.run_logged("sdk-packages", licenses, Some(yes.clone()), true)
            .await?;

        let mut wanted: Vec<String> = Vec::new();
        if !sdk::adb_path(&sdk_dir).is_file() {
            wanted.push("platform-tools".into());
        }
        if !sdk::emulator_path(&sdk_dir).is_file() {
            wanted.push("emulator".into());
        }
        let need_platform = subdirs(&sdk_dir.join("platforms")).is_empty();
        let need_build_tools = subdirs(&sdk_dir.join("build-tools")).is_empty();
        let need_image = best_system_image(&sdk_dir).is_none();
        if need_platform || need_build_tools || need_image {
            self.log(
                "sdk-packages",
                "Looking up the latest Android packages…",
                "info",
            );
            let mut list = sdk::tool_command(&sdkmanager);
            list.args([sdk_root.as_str(), "--list"]);
            let listing = self.run_logged("sdk-packages", list, None, true).await?;
            let latest = latest_packages(&listing, sdk::host_abi());
            if need_platform {
                wanted.push(
                    latest
                        .platform
                        .unwrap_or_else(|| "platforms;android-35".into()),
                );
            }
            if need_build_tools {
                wanted.push(
                    latest
                        .build_tools
                        .unwrap_or_else(|| "build-tools;35.0.0".into()),
                );
            }
            if need_image {
                wanted.push(latest.system_image.unwrap_or_else(|| {
                    format!("system-images;android-35;google_apis;{}", sdk::host_abi())
                }));
            }
        }
        if wanted.is_empty() {
            return Ok(StepOutcome::Done(Some(
                "Licenses accepted; packages already installed.".into(),
            )));
        }
        self.log(
            "sdk-packages",
            format!("Installing {}", wanted.join(", ")),
            "info",
        );
        let mut install = sdk::tool_command(&sdkmanager);
        install.arg(&sdk_root).arg("--install").args(&wanted);
        self.run_logged("sdk-packages", install, Some(yes), false)
            .await?;
        Ok(StepOutcome::Done(Some(format!(
            "Installed {}",
            wanted.len()
        ))))
    }

    async fn create_avd(&self) -> Result<StepOutcome, String> {
        if let Some(avd) = list_avds().first() {
            return Ok(StepOutcome::Skipped(format!(
                "{} is ready.",
                avd.display_name
            )));
        }
        let sdk_dir = sdk::android_sdk_dir_or_default();
        let avdmanager = sdk::avdmanager_path(&sdk_dir)
            .ok_or("Install the Android command-line tools first.")?;
        let image = best_system_image(&sdk_dir)
            .ok_or("Install an emulator system image first (Android SDK packages step).")?;

        let mut devices = sdk::tool_command(&avdmanager);
        devices.args(["list", "device", "-c"]);
        let listing = self
            .run_logged("avd", devices, None, true)
            .await
            .unwrap_or_default();
        let ids: Vec<&str> = listing
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .collect();
        let device = PREFERRED_DEVICES
            .iter()
            .find(|id| ids.contains(id))
            .map(|id| id.to_string());

        let existing: Vec<String> = list_avds().into_iter().map(|a| a.name).collect();
        let name = (1..)
            .map(|n| {
                if n == 1 {
                    "Flutter_Phone".to_string()
                } else {
                    format!("Flutter_Phone_{n}")
                }
            })
            .find(|name| !existing.contains(name))
            .unwrap();
        self.log("avd", format!("Creating {name} from {image}"), "info");
        let mut create = sdk::tool_command(&avdmanager);
        create.args(["create", "avd", "-n", &name, "-k", &image, "--force"]);
        if let Some(device) = &device {
            create.args(["-d", device]);
        }
        self.run_logged("avd", create, Some("no\n".into()), false)
            .await?;

        let config = super::avd::avd_home()
            .join(format!("{name}.avd"))
            .join("config.ini");
        if let Ok(text) = std::fs::read_to_string(&config) {
            let patched = set_ini_values(
                &text,
                &[
                    ("hw.keyboard", "yes"),
                    ("hw.gpu.enabled", "yes"),
                    ("hw.gpu.mode", "auto"),
                    ("avd.ini.displayname", "Flutter Phone"),
                ],
            );
            let _ = std::fs::write(&config, patched);
        }
        Ok(StepOutcome::Done(Some(name)))
    }

    async fn configure_environment(&self) -> Result<StepOutcome, String> {
        let sdk_dir = sdk::android_sdk_dir_or_default();
        let flutter = sdk::flutter_root();
        let java = sdk::java_home();
        if let Some(root) = &flutter {
            if sdk_dir.is_dir() {
                let mut config = sdk::tool_command(sdk::flutter_launcher(root));
                config.args(["config", "--android-sdk"]).arg(&sdk_dir);
                self.run_logged("configure", config, None, false).await?;
            }
        }
        let mut paths: Vec<PathBuf> = Vec::new();
        if let Some(root) = &flutter {
            paths.push(root.join("bin"));
        }
        paths.push(sdk_dir.join("platform-tools"));
        paths.push(sdk_dir.join("emulator"));
        if let Some(bin) = sdk::cmdline_tools_bin(&sdk_dir) {
            paths.push(bin);
        }
        let installed_jdk = sdk::installed_jdk_home();
        if let Some(home) = &installed_jdk {
            paths.push(home.join("bin"));
        }
        let mut vars: Vec<(&str, String)> = vec![("ANDROID_HOME", display(&sdk_dir))];
        // Point JAVA_HOME at our JDK only when nothing else claims it.
        if std::env::var_os("JAVA_HOME").is_none() {
            if let Some(home) = installed_jdk.as_ref().or(java.as_ref()) {
                vars.push(("JAVA_HOME", display(home)));
            }
        }
        persist_user_environment(&vars, &paths).await?;
        for (key, value) in &vars {
            std::env::set_var(key, value);
        }
        prepend_process_path(&paths);
        crate::utils::env::invalidate_env_cache();
        self.log(
            "configure",
            "Saved for new terminals and apps. Already-open terminals keep their old environment.",
            "info",
        );
        Ok(StepOutcome::Done(None))
    }

    async fn enable_acceleration(&self) -> Result<StepOutcome, String> {
        #[cfg(target_os = "windows")]
        {
            self.log("acceleration", "Windows will ask for administrator permission to enable the Windows Hypervisor Platform.", "info");
            let script = "Start-Process -FilePath powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-Command','Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All -NoRestart'";
            let mut command = sdk::tool_command("powershell");
            command.args(["-NoProfile", "-Command", script]);
            self.run_logged("acceleration", command, None, false)
                .await?;
            Ok(StepOutcome::Done(Some(
                "Restart Windows to finish enabling the hypervisor.".into(),
            )))
        }
        #[cfg(target_os = "linux")]
        {
            Err("Enable KVM: install qemu-kvm and add your user to the kvm group (sudo adduser $USER kvm), then log in again.".into())
        }
        #[cfg(target_os = "macos")]
        {
            Ok(StepOutcome::Skipped(
                "macOS includes the Hypervisor framework.".into(),
            ))
        }
    }

    async fn doctor(&self) -> Result<StepOutcome, String> {
        let root = sdk::flutter_root().ok_or("Install Flutter first.")?;
        let mut doctor = sdk::tool_command(sdk::flutter_launcher(&root));
        doctor.args(["doctor", "-v"]);
        // Doctor exits non-zero when anything is missing; its report is the point.
        let _ = self.run_logged("doctor", doctor, None, false).await;
        Ok(StepOutcome::Done(None))
    }

    // ── iOS (macOS) ──────────────────────────────────────────────────────

    fn require_macos() -> Result<(), String> {
        if cfg!(target_os = "macos") {
            Ok(())
        } else {
            Err("iOS development needs a Mac with Xcode.".into())
        }
    }

    async fn open_xcode_store(&self) -> Result<StepOutcome, String> {
        Self::require_macos()?;
        if ios_setup::xcode_installed() {
            return Ok(StepOutcome::Skipped("Xcode is already installed.".into()));
        }
        let mut open = tokio::process::Command::new("/usr/bin/open");
        open.arg(ios_setup::XCODE_STORE_URL);
        self.run_logged("xcode", open, None, false).await?;
        Ok(StepOutcome::Done(Some(
            "Install Xcode from the App Store, open it once, then press Check again.".into(),
        )))
    }

    async fn setup_xcode(&self) -> Result<StepOutcome, String> {
        Self::require_macos()?;
        if !ios_setup::xcode_installed() {
            return Ok(StepOutcome::Skipped(
                "Install Xcode from the App Store first.".into(),
            ));
        }
        let selected = ios_setup::xcode_selected().await;
        let quick = Duration::from_secs(20);
        let license = ios_setup::run("/usr/bin/xcodebuild", &["-license", "check"], quick)
            .await
            .is_some_and(|(ok, _, _)| ok);
        let first_launch =
            ios_setup::run("/usr/bin/xcodebuild", &["-checkFirstLaunchStatus"], quick)
                .await
                .is_some_and(|(ok, _, _)| ok);
        if selected && license && first_launch {
            return Ok(StepOutcome::Skipped("Xcode is ready.".into()));
        }
        self.log(
            "xcode-setup",
            "macOS will ask for an administrator password to select Xcode, accept its license and install its components.",
            "info",
        );
        let script = ios_setup::admin_applescript(&ios_setup::xcode_setup_script(!selected));
        let mut osascript = tokio::process::Command::new("/usr/bin/osascript");
        osascript.args(["-e", &script]);
        self.run_logged("xcode-setup", osascript, None, false)
            .await
            .map_err(|e| {
                if e.contains("-128") {
                    "Cancelled at the password prompt.".to_string()
                } else {
                    e
                }
            })?;
        Ok(StepOutcome::Done(None))
    }

    async fn install_ios_runtime(&self) -> Result<StepOutcome, String> {
        Self::require_macos()?;
        if !ios_setup::xcode_selected().await {
            return Ok(StepOutcome::Skipped("Set up Xcode first.".into()));
        }
        if let Some(runtime) = ios_setup::ios_runtimes().await.first() {
            return Ok(StepOutcome::Skipped(format!(
                "{} is installed.",
                runtime.name
            )));
        }
        self.log(
            "ios-runtime",
            "Downloading the iOS Simulator runtime. This is several gigabytes and can take a while.",
            "info",
        );
        let mut download = tokio::process::Command::new("/usr/bin/xcodebuild");
        download.args(["-downloadPlatform", "iOS"]);
        self.run_logged("ios-runtime", download, None, false)
            .await?;
        Ok(StepOutcome::Done(None))
    }

    async fn create_ios_simulator(&self) -> Result<StepOutcome, String> {
        Self::require_macos()?;
        if !ios_setup::xcode_selected().await {
            return Ok(StepOutcome::Skipped("Set up Xcode first.".into()));
        }
        if let Some(device) = crate::ios::simctl::list_devices()
            .await
            .unwrap_or_default()
            .first()
        {
            return Ok(StepOutcome::Skipped(format!(
                "{} already exists.",
                device.display_name
            )));
        }
        let runtime = ios_setup::ios_runtimes()
            .await
            .into_iter()
            .next()
            .ok_or("Install an iOS Simulator runtime first.")?;
        let types =
            crate::ios::simctl::simctl(&["list", "devicetypes", "-j"], Duration::from_secs(20))
                .await?;
        let (type_id, type_name) = ios_setup::preferred_device_type(&types)
            .ok_or("Xcode lists no iPhone device types.")?;
        let mut create = tokio::process::Command::new("/usr/bin/xcrun");
        create.args([
            "simctl",
            "create",
            &type_name,
            &type_id,
            &runtime.identifier,
        ]);
        self.run_logged("ios-simulator", create, None, false)
            .await?;
        Ok(StepOutcome::Done(Some(format!(
            "{type_name} ({})",
            runtime.name
        ))))
    }

    async fn install_homebrew(&self) -> Result<StepOutcome, String> {
        Self::require_macos()?;
        if ios_setup::brew_path().is_some() {
            return Ok(StepOutcome::Skipped(
                "Homebrew is already installed.".into(),
            ));
        }
        let mut osascript = tokio::process::Command::new("/usr/bin/osascript");
        osascript.args([
            "-e",
            &ios_setup::terminal_applescript(ios_setup::HOMEBREW_INSTALL),
        ]);
        self.run_logged("homebrew", osascript, None, false).await?;
        Ok(StepOutcome::Done(Some(
            "Finish the Homebrew install in Terminal (it asks for your password), then press Check again.".into(),
        )))
    }

    /// `brew install <formula>`, tapping `tap` first.
    async fn brew_install(
        &self,
        step: &str,
        tap: Option<&str>,
        formula: &str,
    ) -> Result<StepOutcome, String> {
        Self::require_macos()?;
        let installed = match step {
            "cocoapods" => ios_setup::pod_path().is_some(),
            "idb" => crate::ios::companion::companion_path().is_some(),
            _ => false,
        };
        if installed {
            return Ok(StepOutcome::Skipped(format!(
                "{formula} is already installed."
            )));
        }
        let Some(brew) = ios_setup::brew_path() else {
            return Ok(StepOutcome::Skipped(
                "Install Homebrew first (it is in the list below).".into(),
            ));
        };
        if let Some(tap) = tap {
            let mut command = tokio::process::Command::new(&brew);
            command
                .args(["tap", tap])
                .env("HOMEBREW_NO_AUTO_UPDATE", "1");
            self.run_logged(step, command, None, false).await?;
        }
        let mut command = tokio::process::Command::new(&brew);
        command
            .args(["install", formula])
            .env("HOMEBREW_NO_AUTO_UPDATE", "1")
            .env("HOMEBREW_NO_INSTALL_CLEANUP", "1");
        self.run_logged(step, command, None, false).await?;
        Ok(StepOutcome::Done(None))
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    async fn download(&self, step: &str, url: &str, label: &str) -> Result<PathBuf, String> {
        self.log(step, format!("Downloading {label}…"), "info");
        let client = reqwest::Client::builder()
            .user_agent("YzPzCode")
            .connect_timeout(Duration::from_secs(20))
            .build()
            .map_err(|e| e.to_string())?;
        let mut response = client
            .get(url)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| format!("Download failed: {e}"))?;
        let name = response
            .url()
            .path_segments()
            .and_then(|mut segments| segments.next_back().map(str::to_string))
            .filter(|name| name.contains('.'))
            .unwrap_or_else(|| format!("{step}.zip"));
        let dir = sdk::toolchains_dir().join("downloads");
        tokio::fs::create_dir_all(&dir)
            .await
            .map_err(|e| e.to_string())?;
        let path = dir.join(name);
        let mut file = tokio::fs::File::create(&path)
            .await
            .map_err(|e| e.to_string())?;
        let total = response.content_length();
        let mut received: u64 = 0;
        let mut last = Instant::now();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| format!("Download interrupted: {e}"))?
        {
            self.check_cancelled()?;
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;
            received += chunk.len() as u64;
            if last.elapsed() > Duration::from_millis(250) {
                last = Instant::now();
                let percent = total.map(|t| received as f32 / t as f32 * 100.0);
                self.progress(
                    step,
                    "running",
                    Some(format!("{label}: {}", progress_text(received, total))),
                    percent,
                );
            }
        }
        file.flush().await.map_err(|e| e.to_string())?;
        self.log(
            step,
            format!("Downloaded {}", progress_text(received, None)),
            "info",
        );
        Ok(path)
    }

    /// Runs a command, streaming its output to the setup log. Returns stdout.
    async fn run_logged(
        &self,
        step: &str,
        mut command: tokio::process::Command,
        input: Option<String>,
        quiet: bool,
    ) -> Result<String, String> {
        self.check_cancelled()?;
        command
            .stdin(if input.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let program = command.as_std().get_program().to_string_lossy().to_string();
        let mut child = command
            .spawn()
            .map_err(|e| format!("Could not run {program}: {e}"))?;
        *self.child.lock().unwrap() = child.id();
        if let (Some(input), Some(mut stdin)) = (input, child.stdin.take()) {
            tokio::spawn(async move {
                let _ = stdin.write_all(input.as_bytes()).await;
            });
        }
        let stdout = child.stdout.take().map(|s| self.pump(step, s, quiet, true));
        let stderr = child
            .stderr
            .take()
            .map(|s| self.pump(step, s, quiet, false));
        let status = child.wait().await.map_err(|e| e.to_string())?;
        *self.child.lock().unwrap() = None;
        let out = match stdout {
            Some(task) => task.await.unwrap_or_default(),
            None => String::new(),
        };
        let err = match stderr {
            Some(task) => task.await.unwrap_or_default(),
            None => String::new(),
        };
        self.check_cancelled()?;
        if status.success() {
            Ok(out)
        } else {
            let tail = err
                .lines()
                .chain(out.lines())
                .map(str::trim)
                .rfind(|l| !l.is_empty())
                .unwrap_or("")
                .to_string();
            let name = Path::new(&program)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or(program);
            Err(format!(
                "{name} failed{}{}",
                status
                    .code()
                    .map(|c| format!(" (exit {c})"))
                    .unwrap_or_default(),
                if tail.is_empty() {
                    String::new()
                } else {
                    format!(": {tail}")
                }
            ))
        }
    }

    /// Reads a stream, logging each line. Lines ended by `\r` are progress
    /// redraws and are throttled.
    fn pump<R: AsyncRead + Unpin + Send + 'static>(
        &self,
        step: &str,
        mut reader: R,
        quiet: bool,
        is_stdout: bool,
    ) -> tokio::task::JoinHandle<String> {
        let manager = self.clone();
        let step = step.to_string();
        tokio::spawn(async move {
            let mut collected = String::new();
            let mut pending: Vec<u8> = Vec::new();
            let mut buffer = [0u8; 8192];
            let mut last_progress = Instant::now() - Duration::from_secs(1);
            let level = if is_stdout { "stdout" } else { "stderr" };
            loop {
                let read = match reader.read(&mut buffer).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => n,
                };
                for &byte in &buffer[..read] {
                    if byte != b'\n' && byte != b'\r' {
                        pending.push(byte);
                        continue;
                    }
                    let line = String::from_utf8_lossy(&pending).trim_end().to_string();
                    pending.clear();
                    if line.trim().is_empty() {
                        continue;
                    }
                    collected.push_str(&line);
                    collected.push('\n');
                    if quiet {
                        continue;
                    }
                    if byte == b'\r' {
                        if last_progress.elapsed() < Duration::from_millis(400) {
                            continue;
                        }
                        last_progress = Instant::now();
                        manager.progress(&step, "running", Some(line), None);
                    } else {
                        manager.log(&step, line, level);
                    }
                }
            }
            if !pending.is_empty() {
                let line = String::from_utf8_lossy(&pending).trim_end().to_string();
                if !quiet && !line.trim().is_empty() {
                    manager.log(&step, line.clone(), level);
                }
                collected.push_str(&line);
            }
            collected
        })
    }
}

enum StepOutcome {
    Done(Option<String>),
    Skipped(String),
}

fn progress_text(received: u64, total: Option<u64>) -> String {
    let mb = |bytes: u64| bytes as f64 / 1_048_576.0;
    match total {
        Some(total) => format!("{:.0} of {:.0} MB", mb(received), mb(total)),
        None => format!("{:.0} MB", mb(received)),
    }
}

async fn latest_cmdline_tools_revision(os: &str) -> Option<String> {
    let text = reqwest::Client::new()
        .get(ANDROID_REPOSITORY)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .ok()?
        .text()
        .await
        .ok()?;
    let pattern = regex::Regex::new(&format!(r"commandlinetools-{os}-(\d+)_latest\.zip")).ok()?;
    pattern
        .captures_iter(&text)
        .filter_map(|c| c.get(1)?.as_str().parse::<u64>().ok())
        .max()
        .map(|rev| rev.to_string())
}

#[derive(Debug, Default, PartialEq)]
struct LatestPackages {
    platform: Option<String>,
    build_tools: Option<String>,
    system_image: Option<String>,
}

/// Picks the newest stable platform, build tools and a matching system image
/// from `sdkmanager --list` output.
fn latest_packages(listing: &str, abi: &str) -> LatestPackages {
    let ids: Vec<&str> = listing
        .lines()
        .filter_map(|line| line.split('|').next())
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .collect();
    let stable_api = |api: &str| {
        api.strip_prefix("android-")
            .map(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
            .unwrap_or(false)
    };
    let newest = |candidates: Vec<&str>| {
        let mut candidates = candidates;
        candidates.sort_by_key(|id| version_key(id));
        candidates.last().map(|id| id.to_string())
    };
    let platform = newest(
        ids.iter()
            .copied()
            .filter(|id| {
                id.strip_prefix("platforms;")
                    .map(stable_api)
                    .unwrap_or(false)
            })
            .collect(),
    );
    let build_tools = newest(
        ids.iter()
            .copied()
            .filter(|id| {
                id.strip_prefix("build-tools;")
                    .map(|v| v.chars().all(|c| c.is_ascii_digit() || c == '.'))
                    .unwrap_or(false)
            })
            .collect(),
    );
    let api_of = |id: &str| id.split(';').nth(1).map(str::to_string);
    let mut images: Vec<&str> = ids
        .iter()
        .copied()
        .filter(|id| {
            let parts: Vec<&str> = id.split(';').collect();
            parts.len() == 4
                && parts[0] == "system-images"
                && stable_api(parts[1])
                && matches!(parts[2], "google_apis" | "google_apis_playstore")
                && parts[3] == abi
        })
        .collect();
    // Prefer the platform's own API level, then Play Store images.
    let target_api = platform
        .as_deref()
        .and_then(|p| p.split(';').nth(1))
        .map(str::to_string);
    images.sort_by_key(|id| {
        (
            api_of(id) == target_api,
            version_key(id.split(';').nth(1).unwrap_or("")),
            id.contains("playstore"),
        )
    });
    LatestPackages {
        platform,
        build_tools,
        system_image: images.last().map(|id| id.to_string()),
    }
}

fn set_ini_values(text: &str, values: &[(&str, &str)]) -> String {
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    for (key, value) in values {
        let entry = format!("{key}={value}");
        match lines
            .iter_mut()
            .find(|line| line.split('=').next().map(str::trim) == Some(*key))
        {
            Some(line) => *line = entry,
            None => lines.push(entry),
        }
    }
    let mut out = lines.join("\n");
    out.push('\n');
    out
}

async fn extract(archive: &Path, target: &Path) -> Result<(), String> {
    let archive = archive.to_path_buf();
    let target = target.to_path_buf();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        let name = archive.to_string_lossy().to_lowercase();
        let file = std::fs::File::open(&archive).map_err(|e| e.to_string())?;
        if name.ends_with(".zip") {
            let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("Bad archive: {e}"))?;
            zip.extract(&target)
                .map_err(|e| format!("Could not extract: {e}"))
        } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
            tar::Archive::new(flate2::read::GzDecoder::new(file))
                .unpack(&target)
                .map_err(|e| format!("Could not extract: {e}"))
        } else {
            Err(format!("Unsupported archive {}", archive.display()))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn prepend_process_path(dirs: &[PathBuf]) {
    let current = std::env::var("PATH").unwrap_or_default();
    let existing: Vec<&str> = current.split(PATH_SEPARATOR).collect();
    let mut parts: Vec<String> = dirs
        .iter()
        .map(|d| display(d))
        .filter(|d| !existing.iter().any(|e| e.eq_ignore_ascii_case(d)))
        .collect();
    if parts.is_empty() {
        return;
    }
    parts.push(current);
    std::env::set_var("PATH", parts.join(PATH_SEPARATOR));
}

/// Saves variables and PATH entries for new terminals: the user environment
/// on Windows, a marked block in the shell profiles elsewhere.
async fn persist_user_environment(
    vars: &[(&str, String)],
    paths: &[PathBuf],
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let quote = |s: &str| format!("'{}'", s.replace('\'', "''"));
        let mut script = String::from("$ErrorActionPreference='Stop';");
        for (key, value) in vars {
            script.push_str(&format!(
                "if(-not [Environment]::GetEnvironmentVariable({k},'User')){{[Environment]::SetEnvironmentVariable({k},{v},'User')}};",
                k = quote(key),
                v = quote(value)
            ));
        }
        let list = paths
            .iter()
            .map(|p| quote(&display(p)))
            .collect::<Vec<_>>()
            .join(",");
        script.push_str(&format!(
            "$p=[Environment]::GetEnvironmentVariable('Path','User');$parts=@();if($p){{$parts=$p -split ';' | Where-Object {{$_}}}};\
             foreach($d in @({list})){{if(-not ($parts | Where-Object {{$_ -ieq $d}})){{$parts+=$d}}}};\
             [Environment]::SetEnvironmentVariable('Path',($parts -join ';'),'User')"
        ));
        let output = sdk::tool_command("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .stdin(Stdio::null())
            .output()
            .await
            .map_err(|e| format!("Could not update the user environment: {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "Could not update the user environment: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        const BEGIN: &str = "# >>> yzpzcode flutter >>>";
        const END: &str = "# <<< yzpzcode flutter <<<";
        let mut block = format!("{BEGIN}\n");
        for (key, value) in vars {
            block.push_str(&format!("export {key}=\"{value}\"\n"));
        }
        let joined = paths
            .iter()
            .map(|p| display(p))
            .collect::<Vec<_>>()
            .join(":");
        block.push_str(&format!("export PATH=\"{joined}:$PATH\"\n{END}\n"));
        let home = sdk::home_dir();
        let shell = std::env::var("SHELL").unwrap_or_default();
        let mut files = vec![home.join(".profile")];
        if shell.ends_with("zsh") || home.join(".zshrc").exists() || cfg!(target_os = "macos") {
            files.push(home.join(".zshrc"));
        }
        if shell.ends_with("bash") || home.join(".bashrc").exists() {
            files.push(home.join(".bashrc"));
        }
        for file in files {
            let text = std::fs::read_to_string(&file).unwrap_or_default();
            let cleaned = match (text.find(BEGIN), text.find(END)) {
                (Some(start), Some(end)) if end > start => format!(
                    "{}{}",
                    &text[..start],
                    text[end + END.len()..].trim_start_matches('\n')
                ),
                _ => text,
            };
            let separator = if cleaned.is_empty() || cleaned.ends_with('\n') {
                ""
            } else {
                "\n"
            };
            std::fs::write(&file, format!("{cleaned}{separator}{block}"))
                .map_err(|e| format!("Could not update {}: {e}", file.display()))?;
        }
        Ok(())
    }
}

fn kill_tree(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x0800_0000)
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_newest_stable_packages_for_the_host_abi() {
        let listing = "\
Available Packages:
  Path                                              | Version | Description
  -------                                           | ------- | -------
  build-tools;35.0.0                                | 35.0.0  | Android SDK Build-Tools 35
  build-tools;36.0.0                                | 36.0.0  | Android SDK Build-Tools 36
  build-tools;36.1.0-rc1                            | 36.1.0 rc1 | Android SDK Build-Tools 36.1-rc1
  platforms;android-35                              | 2       | Android SDK Platform 35
  platforms;android-36                              | 2       | Android SDK Platform 36
  platforms;android-Baklava                         | 1       | Android SDK Platform Baklava
  system-images;android-35;google_apis;x86_64       | 9       | Google APIs Intel x86_64 Atom System Image
  system-images;android-36;google_apis;x86_64       | 7       | Google APIs Intel x86_64 Atom System Image
  system-images;android-36;google_apis_playstore;x86_64 | 7   | Google Play Intel x86_64 Atom System Image
  system-images;android-36;google_apis;arm64-v8a    | 7       | Google APIs ARM 64 v8a System Image
";
        let latest = latest_packages(listing, "x86_64");
        assert_eq!(latest.platform.as_deref(), Some("platforms;android-36"));
        assert_eq!(latest.build_tools.as_deref(), Some("build-tools;36.0.0"));
        assert_eq!(
            latest.system_image.as_deref(),
            Some("system-images;android-36;google_apis_playstore;x86_64")
        );
        assert_eq!(
            latest_packages(listing, "arm64-v8a")
                .system_image
                .as_deref(),
            Some("system-images;android-36;google_apis;arm64-v8a")
        );
    }

    #[test]
    fn reads_java_major_versions() {
        assert_eq!(java_major("17.0.12"), Some(17));
        assert_eq!(java_major("1.8.0_402"), Some(8));
        assert_eq!(java_major("21"), Some(21));
    }

    #[test]
    fn sets_ini_values_in_place_and_appends_missing() {
        let out = set_ini_values(
            "a=1\nhw.keyboard = no\n",
            &[("hw.keyboard", "yes"), ("b", "2")],
        );
        assert_eq!(out, "a=1\nhw.keyboard=yes\nb=2\n");
    }

    #[test]
    fn sorts_versions_numerically() {
        let mut names = vec!["android-9", "android-36", "android-35"];
        names.sort_by_key(|n| version_key(n));
        assert_eq!(names, ["android-9", "android-35", "android-36"]);
    }
}

/// Prints this machine's report: `cargo test --lib setup_probe -- --ignored --nocapture`.
#[cfg(test)]
mod probe {
    #[tokio::test]
    #[ignore]
    async fn setup_probe() {
        let report = super::check(None).await;
        println!("{}", serde_json::to_string_pretty(&report).unwrap());
        let devices = crate::android::flutter::list_devices().await;
        println!("{devices:#?}");
    }
}
