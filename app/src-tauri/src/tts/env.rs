//! Python/ffmpeg/venv probing for local TTS narration.
//!
//! Synthesis runs in a per-user Python virtual environment under
//! `<appData>/tts/venv`, with weights in `<appData>/tts/models`. Everything
//! here is best-effort detection with plain-language messages so Settings can
//! explain what is missing and how to install it.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::utils::process::ProcessRunner;

/// Oldest Python the TTS bridge supports.
pub const MIN_PYTHON_MAJOR: u32 = 3;
/// Oldest Python the TTS bridge supports.
pub const MIN_PYTHON_MINOR: u32 = 10;
/// Warn when the volume holding TTS data has less free space than this (MB).
pub const MIN_DISK_FREE_MB: u64 = 2560;

/// Candidates are probed in order; the first usable one wins.
const CANDIDATES: &[&str] = &["python3", "python", "py"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonInfo {
    pub path: Option<String>,
    pub version: Option<String>,
    pub meets_minimum: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegInfo {
    pub path: Option<String>,
    pub available: bool,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VenvInfo {
    pub path: String,
    pub exists: bool,
    pub python_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvStatus {
    pub python: PythonInfo,
    pub ffmpeg: FfmpegInfo,
    pub venv: VenvInfo,
    pub disk_free_mb: Option<u64>,
    pub disk_warn: bool,
}

/// `<appData>/tts` — root for the venv, model weights, WAV cache and logs.
pub fn tts_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("tts"))
        .map_err(|e| format!("Could not resolve the app data folder: {e}"))
}

/// `<appData>/tts/venv` — the managed Python environment.
pub fn venv_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(tts_root(app)?.join("venv"))
}

/// `<appData>/tts/models` — Hugging Face weight snapshots per model id.
pub fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(tts_root(app)?.join("models"))
}

/// Python executable inside a venv.
pub fn venv_python_path(venv: &Path) -> PathBuf {
    if cfg!(target_os = "windows") {
        venv.join("Scripts").join("python.exe")
    } else {
        venv.join("bin").join("python")
    }
}

/// pip executable inside a venv.
fn venv_pip_path(venv: &Path) -> PathBuf {
    if cfg!(target_os = "windows") {
        venv.join("Scripts").join("pip.exe")
    } else {
        venv.join("bin").join("pip")
    }
}

/// Parses `Python 3.11.4` (patch tolerates trailing `+`/build tags).
fn parse_python_version(line: &str) -> Option<(u32, u32, u32)> {
    let rest = line.trim().strip_prefix("Python")?.trim();
    let mut parts = rest.split('.');
    let major = leading_digits(parts.next()?)?;
    let minor = leading_digits(parts.next()?)?;
    let patch = parts.next().map(leading_digits).unwrap_or(Some(0))?;
    Some((major, minor, patch))
}

fn leading_digits(text: &str) -> Option<u32> {
    let digits: String = text
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}

fn version_meets_minimum(major: u32, minor: u32) -> bool {
    (major, minor) >= (MIN_PYTHON_MAJOR, MIN_PYTHON_MINOR)
}

/// The Microsoft Store ships a 0-byte `python.exe` that opens the Store UI
/// when executed. Never launch it; treat it as missing.
fn is_store_stub(path: &str) -> bool {
    if !cfg!(target_os = "windows") {
        return false;
    }
    if !path.to_ascii_lowercase().contains("windowsapps") {
        return false;
    }
    std::fs::metadata(path).map(|meta| meta.len() == 0).unwrap_or(false)
}

fn probe_python(path: &str, args: &[&str]) -> Option<(String, (u32, u32, u32))> {
    let output = ProcessRunner::run_cmd_hidden(path, args).ok()?;
    if !output.status.success() {
        return None;
    }
    // `python --version` historically printed to stderr; read both streams.
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let line = text.lines().map(str::trim).find(|line| !line.is_empty())?;
    let (major, minor, patch) = parse_python_version(line)?;
    Some((
        format!("{major}.{minor}.{patch}"),
        (major, minor, patch),
    ))
}

/// Newest Python 3 minor the narration packages are known to install on
/// (Kokoro stops at 3.12, SILMA pins `numpy<=1.26.4`). Interpreters newer than
/// this are only a fallback, so upgrading the system Python never moves the
/// narration environment onto a version its packages cannot use.
const PREFERRED_PYTHON_MAX_MINOR: u32 = 12;

/// Newest installed interpreter within `MIN_PYTHON_MINOR..=PREFERRED_PYTHON_MAX_MINOR`,
/// found by version-specific name (`python3.12`) or the Windows `py` launcher
/// rather than by whatever `python` is first on PATH.
fn find_preferred_python() -> Option<PythonInfo> {
    for minor in (MIN_PYTHON_MINOR..=PREFERRED_PYTHON_MAX_MINOR).rev() {
        let path = if cfg!(target_os = "windows") {
            launcher_python(minor)
        } else {
            ProcessRunner::find_binary(&format!("python3.{minor}"))
        };
        let Some(path) = path.filter(|path| !is_store_stub(path)) else {
            continue;
        };
        let Some((version, (major, found_minor, _))) = probe_python(&path, &["--version"]) else {
            continue;
        };
        if major == MIN_PYTHON_MAJOR && found_minor == minor {
            return Some(PythonInfo {
                path: Some(path),
                version: Some(version),
                meets_minimum: true,
            });
        }
    }
    None
}

/// `sys.executable` of `py -3.<minor>`, if the launcher has that version.
fn launcher_python(minor: u32) -> Option<String> {
    let launcher = ProcessRunner::find_binary("py")?;
    let selector = format!("-{MIN_PYTHON_MAJOR}.{minor}");
    let output = ProcessRunner::run_cmd_hidden(
        &launcher,
        &[selector.as_str(), "-c", "import sys; print(sys.executable)"],
    )
    .ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())?
        .to_string();
    Path::new(&path).is_file().then_some(path)
}

/// The interpreter narration will use: the newest supported one, else the
/// first usable `python` on PATH. A too-old one is kept as fallback so the UI
/// can report its version instead of "not installed".
pub fn detect_python() -> PythonInfo {
    if let Some(preferred) = find_preferred_python() {
        return preferred;
    }
    let mut fallback: Option<PythonInfo> = None;
    for candidate in CANDIDATES {
        let Some(path) = ProcessRunner::find_binary(candidate) else {
            continue;
        };
        if is_store_stub(&path) {
            continue;
        }
        // The `py` launcher reports its own version for `--version`; `-3`
        // resolves to the newest installed Python 3 instead.
        let args: &[&str] = if *candidate == "py" {
            &["-3", "--version"]
        } else {
            &["--version"]
        };
        let Some((version, (major, minor, _))) = probe_python(&path, args) else {
            continue;
        };
        let info = PythonInfo {
            path: Some(path),
            version: Some(version),
            meets_minimum: version_meets_minimum(major, minor),
        };
        if info.meets_minimum {
            return info;
        }
        if fallback.is_none() {
            fallback = Some(info);
        }
    }
    fallback.unwrap_or(PythonInfo {
        path: None,
        version: None,
        meets_minimum: false,
    })
}

pub async fn detect_python_async() -> PythonInfo {
    tokio::task::spawn_blocking(detect_python)
        .await
        .unwrap_or(PythonInfo {
            path: None,
            version: None,
            meets_minimum: false,
        })
}

/// Parses `ffmpeg version 6.0-full_build-www.gyan.dev ...`. Only lines that
/// actually start with the `ffmpeg` banner count.
fn parse_ffmpeg_version(first_line: &str) -> Option<String> {
    let mut words = first_line.split_whitespace();
    if !words.next().is_some_and(|word| word.eq_ignore_ascii_case("ffmpeg")) {
        return None;
    }
    if !words.next().is_some_and(|word| word.eq_ignore_ascii_case("version")) {
        return None;
    }
    words.next().map(str::to_string)
}

pub fn detect_ffmpeg() -> FfmpegInfo {
    let Some(path) = ProcessRunner::find_binary("ffmpeg") else {
        return FfmpegInfo {
            path: None,
            available: false,
            version: None,
        };
    };
    let version = ProcessRunner::run_cmd_hidden(&path, &["-version"])
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| {
            let text = String::from_utf8_lossy(&output.stdout).into_owned();
            text.lines().next().and_then(parse_ffmpeg_version)
        });
    FfmpegInfo {
        path: Some(path),
        available: true,
        version,
    }
}

pub async fn detect_ffmpeg_async() -> FfmpegInfo {
    tokio::task::spawn_blocking(detect_ffmpeg)
        .await
        .unwrap_or(FfmpegInfo {
            path: None,
            available: false,
            version: None,
        })
}

/// Free megabytes on the volume holding `path`. Best effort; `None` means the
/// platform probe failed and callers must not warn.
pub fn disk_free_mb_for(path: &Path) -> Option<u64> {
    #[cfg(target_os = "windows")]
    {
        disk_free_mb_windows(path)
    }
    #[cfg(not(target_os = "windows"))]
    {
        disk_free_mb_unix(path)
    }
}

#[cfg(target_os = "windows")]
fn disk_free_mb_windows(path: &Path) -> Option<u64> {
    use std::path::{Component, Prefix};
    let drive = path.components().find_map(|component| match component {
        Component::Prefix(prefix) => match prefix.kind() {
            Prefix::Disk(disk) | Prefix::VerbatimDisk(disk) => {
                Some(format!("{}:", char::from(disk)))
            }
            _ => None,
        },
        _ => None,
    })?;
    let output =
        ProcessRunner::run_cmd_hidden("fsutil", &["volume", "diskfree", &drive]).ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().find(|line| line.contains("free bytes"))?;
    let digits: String = line
        .rsplit(':')
        .next()?
        .chars()
        .filter(|c| c.is_ascii_digit())
        .collect();
    digits
        .parse::<u64>()
        .ok()?
        .checked_div(1024 * 1024)
}

#[cfg(not(target_os = "windows"))]
fn disk_free_mb_unix(path: &Path) -> Option<u64> {
    let anchor = path.to_string_lossy().into_owned();
    let output = ProcessRunner::run_cmd_hidden("df", &["-k", &anchor]).ok()?;
    if !output.status.success() {
        return None;
    }
    let line = String::from_utf8_lossy(&output.stdout)
        .lines()
        .nth(1)?
        .to_string();
    line
        .split_whitespace()
        .nth(3)?
        .parse::<u64>()
        .ok()
        .map(|kb| kb / 1024)
}

/// What exists on disk right now, without creating anything.
pub fn venv_info(app: &AppHandle) -> VenvInfo {
    match venv_dir(app) {
        Ok(dir) => {
            let python = venv_python_path(&dir);
            VenvInfo {
                path: dir.to_string_lossy().into_owned(),
                exists: python.is_file(),
                python_path: Some(python.to_string_lossy().into_owned()),
            }
        }
        Err(_) => VenvInfo {
            path: String::new(),
            exists: false,
            python_path: None,
        },
    }
}

/// Creates the venv on first use. Model packages are installed per model on
/// demand (see [`pip_install`]), never all at once.
pub async fn ensure_venv(app: &AppHandle) -> Result<VenvInfo, String> {
    let dir = venv_dir(app)?;
    let python = detect_python_async().await;
    let system = match (python.path, python.version, python.meets_minimum) {
        (Some(path), _, true) => path,
        (Some(_), version, false) => {
            let display = version.as_deref().unwrap_or("unknown");
            return Err(format!(
                "Python {display} is too old for narration; install Python 3.10 or newer."
            ));
        }
        (None, _, _) => {
            return Err("Python 3.10 or newer is required for narration. Install it from https://www.python.org/downloads/ (Windows: `winget install Python.Python.3.12`) and relaunch YzPzCode.".into());
        }
    };
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Could not create the narration folder: {e}"))?;
    if !venv_python_path(&dir).is_file() {
        let dir_arg = dir.to_string_lossy().into_owned();
        let output = tokio::task::spawn_blocking(move || {
            ProcessRunner::run_cmd_hidden(&system, &["-m", "venv", &dir_arg])
        })
        .await
        .map_err(|e| format!("Could not create the narration environment: {e}"))?
        .map_err(|e| format!("Could not launch Python: {e}"))?;
        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if detail.is_empty() {
                return Err("Could not create the narration environment.".into());
            }
            return Err(format!("Could not create the narration environment: {detail}"));
        }
    }
    Ok(venv_info(app))
}

/// Runs each `pip install` step (arguments after `install`) in order inside
/// the venv. A model may need more than one step, e.g. a package installed
/// `--no-deps` followed by its dependencies.
pub async fn pip_install(app: &AppHandle, steps: &[&[&str]]) -> Result<(), String> {
    if steps.is_empty() {
        return Err("The model has no installable package.".into());
    }
    let venv = ensure_venv(app).await?;
    let pip = venv_pip_path(Path::new(&venv.path));
    if !pip.is_file() {
        return Err("The narration environment is missing pip.".into());
    }
    let pip_arg = pip.to_string_lossy().into_owned();
    for step in steps {
        let mut args: Vec<String> = vec![
            "--disable-pip-version-check".to_string(),
            "install".to_string(),
        ];
        args.extend(step.iter().map(|arg| arg.to_string()));
        let pip_arg = pip_arg.clone();
        let output = tokio::task::spawn_blocking(move || {
            let refs: Vec<&str> = args.iter().map(String::as_str).collect();
            ProcessRunner::run_cmd_hidden(&pip_arg, &refs)
        })
        .await
        .map_err(|e| format!("Could not install the narration voice: {e}"))?
        .map_err(|e| format!("Could not launch pip: {e}"))?;
        if !output.status.success() {
            return Err(pip_failure_message(&String::from_utf8_lossy(&output.stderr)));
        }
    }
    Ok(())
}

/// The few lines of pip's stderr that explain the failure (its last line is
/// often just a hint).
fn pip_failure_message(stderr: &str) -> String {
    let lines: Vec<&str> = stderr
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let long_path = lines
        .iter()
        .any(|line| line.contains("Long Path") || line.contains("long paths"));
    if long_path {
        return "Windows blocked the install because a file path is too long. Enable long paths (https://pip.pypa.io/warnings/enable-long-paths) and retry.".into();
    }
    let tail: Vec<&str> = lines
        .iter()
        .rev()
        .filter(|line| line.starts_with("ERROR") || line.starts_with('×') || line.starts_with('╰'))
        .take(3)
        .copied()
        .collect();
    let detail = if tail.is_empty() {
        lines.iter().rev().take(2).copied().collect::<Vec<_>>()
    } else {
        tail
    };
    if detail.is_empty() {
        return "Could not install the narration voice.".into();
    }
    let joined = detail.into_iter().rev().collect::<Vec<_>>().join(" ");
    format!("Could not install the narration voice: {joined}")
}

/// True when `import_name` (a top-level Python package) is installed in the
/// narration venv. Checked on disk so it needs no Python start-up.
pub fn package_installed(app: &AppHandle, import_name: &str) -> bool {
    let Ok(venv) = venv_dir(app) else {
        return false;
    };
    let site_packages: Vec<PathBuf> = if cfg!(target_os = "windows") {
        vec![venv.join("Lib").join("site-packages")]
    } else {
        std::fs::read_dir(venv.join("lib"))
            .map(|entries| {
                entries
                    .flatten()
                    .map(|entry| entry.path().join("site-packages"))
                    .collect()
            })
            .unwrap_or_default()
    };
    site_packages.iter().any(|dir| {
        dir.join(import_name).is_dir() || dir.join(format!("{import_name}.py")).is_file()
    })
}

/// `(major, minor)` of the Python the venv was created from (`pyvenv.cfg`).
pub fn venv_python_version(app: &AppHandle) -> Option<(u32, u32)> {
    let cfg = std::fs::read_to_string(venv_dir(app).ok()?.join("pyvenv.cfg")).ok()?;
    let line = cfg.lines().find_map(|line| {
        let (key, value) = line.split_once('=')?;
        let key = key.trim();
        (key == "version" || key == "version_info").then(|| value.trim().to_string())
    })?;
    let mut parts = line.split('.');
    Some((leading_digits(parts.next()?)?, leading_digits(parts.next()?)?))
}

pub async fn env_status(app: &AppHandle) -> EnvStatus {
    let (python, ffmpeg) = tokio::join!(detect_python_async(), detect_ffmpeg_async());
    let venv = venv_info(app);
    let disk_free_mb = tts_root(app).ok().as_deref().and_then(disk_free_mb_for);
    let disk_warn = disk_free_mb.is_some_and(|mb| mb < MIN_DISK_FREE_MB);
    EnvStatus {
        python,
        ffmpeg,
        venv,
        disk_free_mb,
        disk_warn,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_python_versions() {
        assert_eq!(parse_python_version("Python 3.11.4"), Some((3, 11, 4)));
        assert_eq!(parse_python_version("Python 3.10.0+"), Some((3, 10, 0)));
        assert_eq!(parse_python_version("  Python 3.12.1  "), Some((3, 12, 1)));
        assert_eq!(parse_python_version("Python 3.9"), Some((3, 9, 0)));
        assert_eq!(parse_python_version("Python"), None);
        assert_eq!(parse_python_version("pypy 3.10"), None);
    }

    #[test]
    fn enforces_minimum_version() {
        assert!(version_meets_minimum(3, 10));
        assert!(version_meets_minimum(3, 12));
        assert!(version_meets_minimum(4, 0));
        assert!(!version_meets_minimum(3, 9));
        assert!(!version_meets_minimum(2, 7));
    }

    #[test]
    fn parses_ffmpeg_version_line() {
        assert_eq!(
            parse_ffmpeg_version("ffmpeg version 6.0-full_build-www.gyan.dev Copyright (c)"),
            Some("6.0-full_build-www.gyan.dev".to_string())
        );
        assert_eq!(parse_ffmpeg_version("no version here"), None);
    }
}
