//! Locates the Flutter SDK, the Android SDK and its tools, and a JDK.
//!
//! Nothing here requires the tools to be on PATH: the app is often launched
//! from the desktop with a PATH that predates the install, so every command it
//! runs gets an explicit environment from [`tool_env`].

use std::path::{Path, PathBuf};

#[cfg(target_os = "windows")]
pub const EXE: &str = ".exe";
#[cfg(not(target_os = "windows"))]
pub const EXE: &str = "";

#[cfg(target_os = "windows")]
pub const SCRIPT: &str = ".bat";
#[cfg(not(target_os = "windows"))]
pub const SCRIPT: &str = "";

#[cfg(target_os = "windows")]
pub const PATH_SEPARATOR: &str = ";";
#[cfg(not(target_os = "windows"))]
pub const PATH_SEPARATOR: &str = ":";

pub fn home_dir() -> PathBuf {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Where the setup flow installs toolchains the user had no copy of (the JDK).
pub fn toolchains_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join("AppData").join("Local"))
            .join("yzpzcode")
            .join("toolchains")
    }
    #[cfg(not(target_os = "windows"))]
    {
        home_dir()
            .join(".local")
            .join("share")
            .join("yzpzcode")
            .join("toolchains")
    }
}

/// The SDK location Android Studio uses on each platform.
pub fn default_android_sdk_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join("AppData").join("Local"))
            .join("Android")
            .join("Sdk")
    }
    #[cfg(target_os = "macos")]
    {
        home_dir().join("Library").join("Android").join("sdk")
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        home_dir().join("Android").join("Sdk")
    }
}

/// Flutter's recommended install location (`~/development/flutter`).
pub fn default_flutter_dir() -> PathBuf {
    home_dir().join("development").join("flutter")
}

/// Follows symlinks (Homebrew, snap and asdf shims) without the `\\?\`
/// prefix `canonicalize` adds on Windows, which `.bat` launchers reject.
fn resolve_link(path: PathBuf) -> PathBuf {
    match std::fs::canonicalize(&path) {
        Ok(resolved) => {
            let text = resolved.to_string_lossy();
            PathBuf::from(text.strip_prefix(r"\\?\").unwrap_or(&text))
        }
        Err(_) => path,
    }
}

fn looks_like_sdk(path: &Path) -> bool {
    [
        "platform-tools",
        "emulator",
        "cmdline-tools",
        "tools",
        "platforms",
    ]
    .iter()
    .any(|dir| path.join(dir).is_dir())
}

/// Reads `android-sdk` from Flutter's settings file, if `flutter config` set it.
fn flutter_configured_sdk() -> Option<PathBuf> {
    let mut candidates = vec![home_dir().join(".flutter_settings")];
    #[cfg(target_os = "windows")]
    if let Some(appdata) = std::env::var_os("APPDATA") {
        candidates.push(PathBuf::from(appdata).join("flutter").join("settings"));
    }
    #[cfg(not(target_os = "windows"))]
    {
        let config = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join(".config"));
        candidates.push(config.join("flutter").join("settings"));
    }
    candidates.into_iter().find_map(|file| {
        let text = std::fs::read_to_string(file).ok()?;
        let json: serde_json::Value = serde_json::from_str(&text).ok()?;
        json.get("android-sdk")?.as_str().map(PathBuf::from)
    })
}

pub fn android_sdk_dir() -> Option<PathBuf> {
    let from_env = ["ANDROID_HOME", "ANDROID_SDK_ROOT"]
        .iter()
        .filter_map(std::env::var_os)
        .map(PathBuf::from);
    from_env
        .chain(flutter_configured_sdk())
        .chain(std::iter::once(default_android_sdk_dir()))
        .find(|path| looks_like_sdk(path))
}

/// The SDK to use, or the location a fresh install should go to.
pub fn android_sdk_dir_or_default() -> PathBuf {
    android_sdk_dir().unwrap_or_else(default_android_sdk_dir)
}

pub fn adb_path(sdk: &Path) -> PathBuf {
    sdk.join("platform-tools").join(format!("adb{EXE}"))
}

pub fn emulator_path(sdk: &Path) -> PathBuf {
    sdk.join("emulator").join(format!("emulator{EXE}"))
}

/// The `bin` folder of the newest command-line tools in the SDK.
pub fn cmdline_tools_bin(sdk: &Path) -> Option<PathBuf> {
    let root = sdk.join("cmdline-tools");
    let latest = root.join("latest").join("bin");
    if latest.join(format!("sdkmanager{SCRIPT}")).is_file() {
        return Some(latest);
    }
    let mut versioned: Vec<PathBuf> = std::fs::read_dir(&root)
        .ok()?
        .flatten()
        .map(|entry| entry.path().join("bin"))
        .filter(|bin| bin.join(format!("sdkmanager{SCRIPT}")).is_file())
        .collect();
    versioned.sort();
    versioned.pop().or_else(|| {
        let legacy = sdk.join("tools").join("bin");
        legacy
            .join(format!("sdkmanager{SCRIPT}"))
            .is_file()
            .then_some(legacy)
    })
}

pub fn sdkmanager_path(sdk: &Path) -> Option<PathBuf> {
    cmdline_tools_bin(sdk).map(|bin| bin.join(format!("sdkmanager{SCRIPT}")))
}

pub fn avdmanager_path(sdk: &Path) -> Option<PathBuf> {
    cmdline_tools_bin(sdk)
        .map(|bin| bin.join(format!("avdmanager{SCRIPT}")))
        .filter(|path| path.is_file())
}

/// The Flutter SDK root (the folder that contains `bin/flutter`).
pub fn flutter_root() -> Option<PathBuf> {
    let launcher = format!("flutter{SCRIPT}");
    let from_path = which::which("flutter").ok().and_then(|path| {
        let resolved = resolve_link(path);
        resolved.parent()?.parent().map(Path::to_path_buf)
    });
    let mut candidates: Vec<PathBuf> = Vec::new();
    candidates.extend(from_path);
    candidates.extend(std::env::var_os("FLUTTER_ROOT").map(PathBuf::from));
    candidates.push(default_flutter_dir());
    candidates.push(home_dir().join("flutter"));
    candidates.push(home_dir().join("dev").join("flutter"));
    candidates.push(home_dir().join("develop").join("flutter"));
    #[cfg(target_os = "windows")]
    {
        candidates.push(PathBuf::from(r"C:\flutter"));
        candidates.push(PathBuf::from(r"C:\src\flutter"));
        candidates.push(PathBuf::from(r"C:\tools\flutter"));
    }
    #[cfg(not(target_os = "windows"))]
    {
        candidates.push(PathBuf::from("/opt/flutter"));
        candidates.push(PathBuf::from("/usr/local/flutter"));
        candidates.push(
            home_dir()
                .join("snap")
                .join("flutter")
                .join("common")
                .join("flutter"),
        );
    }
    candidates
        .into_iter()
        .find(|root| root.join("bin").join(&launcher).is_file())
}

pub fn flutter_launcher(root: &Path) -> PathBuf {
    root.join("bin").join(format!("flutter{SCRIPT}"))
}

fn java_in(home: &Path) -> bool {
    home.join("bin").join(format!("java{EXE}")).is_file()
}

/// A JDK home directory, preferring JAVA_HOME, then Android Studio's bundled
/// runtime, then the JDK the setup flow installs, then `java` on PATH.
pub fn java_home() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    candidates.extend(std::env::var_os("JAVA_HOME").map(PathBuf::from));
    #[cfg(target_os = "windows")]
    {
        for base in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
            if let Some(dir) = std::env::var_os(base) {
                let dir = PathBuf::from(dir);
                candidates.push(dir.join("Android").join("Android Studio").join("jbr"));
                candidates.push(dir.join("Programs").join("Android Studio").join("jbr"));
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from(
            "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
        ));
        candidates
            .push(home_dir().join("Applications/Android Studio.app/Contents/jbr/Contents/Home"));
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        candidates.push(PathBuf::from("/opt/android-studio/jbr"));
        candidates.push(home_dir().join("android-studio").join("jbr"));
        candidates.push(PathBuf::from("/snap/android-studio/current/jbr"));
    }
    candidates.extend(installed_jdk_home());
    if let Some(home) = candidates.into_iter().find(|home| java_in(home)) {
        return Some(home);
    }
    let java = which::which("java").ok()?;
    let resolved = resolve_link(java);
    let home = resolved.parent()?.parent()?.to_path_buf();
    java_in(&home).then_some(home)
}

/// The JDK the setup flow downloaded, if any.
pub fn installed_jdk_home() -> Option<PathBuf> {
    find_java_home_under(&toolchains_dir().join("jdk"), 4)
}

/// Finds the folder holding `bin/java` inside an extracted JDK archive.
pub fn find_java_home_under(root: &Path, depth: usize) -> Option<PathBuf> {
    if java_in(root) {
        return Some(root.to_path_buf());
    }
    if depth == 0 {
        return None;
    }
    let mut children: Vec<PathBuf> = std::fs::read_dir(root)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    children.sort();
    children
        .into_iter()
        .find_map(|child| find_java_home_under(&child, depth - 1))
}

/// Environment for every Flutter / Android command the app runs.
pub fn tool_env() -> Vec<(String, String)> {
    let sdk = android_sdk_dir_or_default();
    let mut prefix: Vec<PathBuf> = Vec::new();
    let mut env = vec![
        (
            "ANDROID_HOME".to_string(),
            sdk.to_string_lossy().to_string(),
        ),
        (
            "ANDROID_SDK_ROOT".to_string(),
            sdk.to_string_lossy().to_string(),
        ),
        // Keeps `flutter` from prompting or printing analytics banners in
        // machine-readable output.
        ("FLUTTER_SUPPRESS_ANALYTICS".to_string(), "true".to_string()),
    ];
    if let Some(java) = java_home() {
        prefix.push(java.join("bin"));
        env.push(("JAVA_HOME".to_string(), java.to_string_lossy().to_string()));
    }
    if let Some(flutter) = flutter_root() {
        prefix.push(flutter.join("bin"));
    }
    prefix.push(sdk.join("platform-tools"));
    prefix.push(sdk.join("emulator"));
    if let Some(bin) = cmdline_tools_bin(&sdk) {
        prefix.push(bin);
    }
    let current = std::env::var("PATH").unwrap_or_default();
    let mut parts: Vec<String> = prefix
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect();
    parts.push(current);
    env.push(("PATH".to_string(), parts.join(PATH_SEPARATOR)));
    env
}

/// A command for a Flutter / Android tool with [`tool_env`] applied and, on
/// Windows, no console window.
pub fn tool_command(program: impl AsRef<std::ffi::OsStr>) -> tokio::process::Command {
    let mut command = tokio::process::Command::new(program);
    command.envs(tool_env());
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x0800_0000);
    }
    command
}

pub fn std_tool_command(program: impl AsRef<std::ffi::OsStr>) -> std::process::Command {
    let mut command = std::process::Command::new(program);
    command.envs(tool_env());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command
}

/// The host architecture as Android system images name it.
pub fn host_abi() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "arm64-v8a"
    } else {
        "x86_64"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_java_home_inside_nested_archive_folder() {
        let root = std::env::temp_dir().join(format!("yzpz-jdk-{}", uuid::Uuid::new_v4()));
        let home = root.join("jdk-17.0.12+7").join("Contents").join("Home");
        std::fs::create_dir_all(home.join("bin")).unwrap();
        std::fs::write(home.join("bin").join(format!("java{EXE}")), b"").unwrap();
        assert_eq!(find_java_home_under(&root, 4), Some(home));
        std::fs::remove_dir_all(root).unwrap();
    }
}
