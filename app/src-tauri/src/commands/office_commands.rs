//! Older Office formats (.doc, .ppt) → .docx / .pptx, so the in-app previews and the
//! Writing and Presentation studios (which read the Open XML formats) can open them.
//!
//! The converter is whatever the machine has: Microsoft Word / PowerPoint through COM
//! on Windows, then LibreOffice. The result is cached in the temp folder, keyed by the
//! source path, size and modified time, so a file is converted once until it changes.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};

use crate::filesystem::validation::validate_no_path_traversal;

const CONVERT_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OfficeKind {
    Word,
    PowerPoint,
}

impl OfficeKind {
    fn target_extension(self) -> &'static str {
        match self {
            OfficeKind::Word => "docx",
            OfficeKind::PowerPoint => "pptx",
        }
    }

    fn app_name(self) -> &'static str {
        match self {
            OfficeKind::Word => "Microsoft Word",
            OfficeKind::PowerPoint => "Microsoft PowerPoint",
        }
    }

    /// `--convert-to` argument: the extension plus the filter LibreOffice must use for it.
    fn libreoffice_target(self) -> &'static str {
        match self {
            OfficeKind::Word => "docx:MS Word 2007 XML",
            OfficeKind::PowerPoint => "pptx:Impress MS PowerPoint 2007 XML",
        }
    }
}

fn kind_for_extension(extension: &str) -> Option<OfficeKind> {
    match extension.to_ascii_lowercase().as_str() {
        "doc" | "dot" => Some(OfficeKind::Word),
        "ppt" | "pps" => Some(OfficeKind::PowerPoint),
        _ => None,
    }
}

fn cache_key(path: &Path, len: u64, modified: SystemTime) -> String {
    let stamp = modified
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut hasher = Sha256::new();
    hasher.update(path.to_string_lossy().as_bytes());
    hasher.update(len.to_le_bytes());
    hasher.update(stamp.to_le_bytes());
    hasher
        .finalize()
        .iter()
        .take(8)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Runs a prepared command, killing it when it outlives the timeout.
fn run_with_timeout(mut command: Command, timeout: Duration) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not start the converter: {e}"))?;
    let started = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if status.success() {
                    return Ok(());
                }
                let mut detail = String::new();
                if let Some(mut stderr) = child.stderr.take() {
                    use std::io::Read;
                    let _ = stderr.read_to_string(&mut detail);
                }
                let detail = detail.trim();
                return Err(if detail.is_empty() {
                    format!("the converter exited with {status}")
                } else {
                    detail.chars().take(400).collect()
                });
            }
            Ok(None) => {
                if started.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("the converter took too long (a password or a dialog may be blocking it)".into());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(format!("could not wait for the converter: {e}")),
        }
    }
}

/// PowerShell that drives Word / PowerPoint. Paths travel in the environment, never in the script text.
/// A running Office is left open: the app only quits when it has no other document of the person's.
#[cfg(target_os = "windows")]
fn office_script(kind: OfficeKind) -> &'static str {
    match kind {
        OfficeKind::Word => {
            r#"
$ErrorActionPreference = 'Stop'
$app = $null; $doc = $null
try {
  $app = New-Object -ComObject Word.Application
  $app.Visible = $false
  $app.DisplayAlerts = 0
  $doc = $app.Documents.Open($env:YZPZ_IN, $false, $true, $false, 'yzpz-no-password')
  $doc.SaveAs2($env:YZPZ_OUT, 12)
} finally {
  if ($doc) { $doc.Close(0) }
  if ($app -and $app.Documents.Count -eq 0) { $app.Quit() }
}
"#
        }
        OfficeKind::PowerPoint => {
            r#"
$ErrorActionPreference = 'Stop'
$app = $null; $pres = $null
try {
  $app = New-Object -ComObject PowerPoint.Application
  $pres = $app.Presentations.Open($env:YZPZ_IN, -1, 0, 0)
  $pres.SaveAs($env:YZPZ_OUT, 24)
} finally {
  if ($pres) { $pres.Close() }
  if ($app -and $app.Presentations.Count -eq 0) { $app.Quit() }
}
"#
        }
    }
}

#[cfg(target_os = "windows")]
fn convert_with_office(kind: OfficeKind, input: &Path, output: &Path) -> Result<(), String> {
    let mut command = Command::new("powershell.exe");
    command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            office_script(kind),
        ])
        .env("YZPZ_IN", input)
        .env("YZPZ_OUT", output);
    run_with_timeout(command, CONVERT_TIMEOUT)?;
    if output.metadata().map(|m| m.len() > 0).unwrap_or(false) {
        Ok(())
    } else {
        Err(format!("{} did not write a file", kind.app_name()))
    }
}

#[cfg(not(target_os = "windows"))]
fn convert_with_office(kind: OfficeKind, _input: &Path, _output: &Path) -> Result<(), String> {
    Err(format!("{} is only driven on Windows", kind.app_name()))
}

fn find_libreoffice() -> Option<PathBuf> {
    for name in ["soffice", "libreoffice"] {
        if let Ok(path) = which::which(name) {
            return Some(path);
        }
    }
    let fixed = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/bin/soffice",
        "/usr/local/bin/soffice",
        "/snap/bin/libreoffice",
    ];
    fixed.iter().map(PathBuf::from).find(|path| path.exists())
}

/// A file URL for LibreOffice's `-env:UserInstallation` (its own profile, so a running LibreOffice is not disturbed).
fn file_url(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    if text.starts_with('/') {
        format!("file://{text}")
    } else {
        format!("file:///{text}")
    }
}

fn convert_with_libreoffice(kind: OfficeKind, input: &Path, out_dir: &Path) -> Result<(), String> {
    let binary = find_libreoffice().ok_or("LibreOffice is not installed")?;
    let profile = out_dir.join(".lo-profile");
    let mut command = Command::new(binary);
    command
        .arg(format!("-env:UserInstallation={}", file_url(&profile)))
        .args(["--headless", "--norestore", "--convert-to", kind.libreoffice_target(), "--outdir"])
        .arg(out_dir)
        .arg(input);
    run_with_timeout(command, CONVERT_TIMEOUT)?;
    let _ = fs::remove_dir_all(&profile);
    Ok(())
}

fn convert(path: &str) -> Result<String, String> {
    validate_no_path_traversal(path).map_err(|e| e.to_string())?;
    let input = Path::new(path);
    let meta = input
        .metadata()
        .map_err(|_| format!("File does not exist: {path}"))?;
    if !meta.is_file() {
        return Err(format!("Not a file: {path}"));
    }
    let extension = input.extension().and_then(|e| e.to_str()).unwrap_or("");
    let kind = kind_for_extension(extension)
        .ok_or_else(|| format!("Not an older Word or PowerPoint file: {path}"))?;

    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("document");
    let key = cache_key(input, meta.len(), meta.modified().unwrap_or(UNIX_EPOCH));
    let out_dir = std::env::temp_dir().join("yzpzcode-office").join(key);
    let output = out_dir.join(format!("{stem}.{}", kind.target_extension()));
    if output.metadata().map(|m| m.len() > 0).unwrap_or(false) {
        return Ok(output.to_string_lossy().into_owned());
    }
    fs::create_dir_all(&out_dir).map_err(|e| format!("Could not prepare a working folder: {e}"))?;
    let _ = fs::remove_file(&output);

    let mut failures: Vec<String> = Vec::new();
    match convert_with_office(kind, input, &output) {
        Ok(()) => return Ok(output.to_string_lossy().into_owned()),
        Err(e) => failures.push(format!("{}: {e}", kind.app_name())),
    }
    let _ = fs::remove_file(&output);
    match convert_with_libreoffice(kind, input, &out_dir) {
        Ok(()) if output.metadata().map(|m| m.len() > 0).unwrap_or(false) => {
            return Ok(output.to_string_lossy().into_owned())
        }
        Ok(()) => failures.push("LibreOffice: it did not write a file".into()),
        Err(e) => failures.push(format!("LibreOffice: {e}")),
    }
    Err(format!(
        "This older .{extension} file needs Microsoft Office or LibreOffice to be read here, and neither could convert it ({})",
        failures.join("; ")
    ))
}

/// Converts a `.doc` / `.ppt` to `.docx` / `.pptx` and returns the converted file's path.
#[tauri::command]
pub async fn convert_legacy_office(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || convert(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_the_converter_by_extension() {
        assert_eq!(kind_for_extension("DOC"), Some(OfficeKind::Word));
        assert_eq!(kind_for_extension("ppt"), Some(OfficeKind::PowerPoint));
        assert_eq!(kind_for_extension("docx"), None);
        assert_eq!(kind_for_extension("xls"), None);
    }

    #[test]
    fn cache_key_changes_with_the_file() {
        let path = Path::new("C:/a/report.doc");
        let t = UNIX_EPOCH + Duration::from_secs(1_000);
        let a = cache_key(path, 10, t);
        assert_eq!(a, cache_key(path, 10, t));
        assert_ne!(a, cache_key(path, 11, t));
        assert_ne!(a, cache_key(path, 10, t + Duration::from_secs(1)));
        assert_ne!(a, cache_key(Path::new("C:/b/report.doc"), 10, t));
        assert_eq!(a.len(), 16);
    }

    #[test]
    fn file_urls_have_three_slashes_for_drive_paths() {
        assert_eq!(file_url(Path::new(r"C:\Temp\p")), "file:///C:/Temp/p");
        assert_eq!(file_url(Path::new("/tmp/p")), "file:///tmp/p");
    }

    #[test]
    fn rejects_other_files() {
        assert!(convert("does-not-exist.doc").is_err());
    }
}
