//! OS clipboard bridge for the explorer. Files copied in the OS file manager
//! (Windows CF_HDROP, macOS file URLs, X11 uri-list) paste into the explorer,
//! files copied in the explorer paste into the OS file manager, and a copied
//! image pastes as a PNG file.

use anyhow::{anyhow, Result};
use clipboard_rs::common::RustImage;
use clipboard_rs::{Clipboard, ClipboardContent, ClipboardContext, ContentFormat};
use serde::Serialize;
use std::path::{Path, PathBuf};

use super::validation::validate_no_path_traversal;

/// Windows marks a cut with this registered format: a little-endian DWORD
/// holding DROPEFFECT_MOVE (2) for a cut, DROPEFFECT_COPY (1, often | LINK 4)
/// for a copy.
const WINDOWS_DROP_EFFECT: &str = "Preferred DropEffect";
const DROPEFFECT_COPY: u32 = 1;
const DROPEFFECT_MOVE: u32 = 2;
/// GNOME/Nautilus equivalent: "cut\nfile:///a\nfile:///b" (or "copy\n...").
const GNOME_COPIED_FILES: &str = "x-special/gnome-copied-files";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardSnapshot {
    /// Local paths of the files on the clipboard (empty when there are none).
    pub paths: Vec<String>,
    /// `"copy"` or `"cut"`.
    pub operation: String,
    /// True when the clipboard holds an image and no files.
    pub has_image: bool,
}

fn context() -> Result<ClipboardContext> {
    ClipboardContext::new().map_err(|e| anyhow!("Cannot open the clipboard: {e}"))
}

/// Turns a clipboard file entry (a plain path, or a `file://` URI on X11)
/// into a local path.
pub(crate) fn clipboard_entry_to_path(entry: &str) -> Option<String> {
    let entry = entry.trim().trim_end_matches('\0');
    if entry.is_empty() {
        return None;
    }
    if entry.starts_with("file://") {
        return url::Url::parse(entry)
            .ok()
            .and_then(|u| u.to_file_path().ok())
            .map(|p| p.to_string_lossy().to_string())
            .or_else(|| entry.strip_prefix("file://").map(str::to_string));
    }
    Some(entry.to_string())
}

/// Reads the cut/copy intent the OS file manager attached to the file list.
pub(crate) fn parse_cut_marker(windows_effect: Option<&[u8]>, gnome: Option<&[u8]>) -> bool {
    if let Some(bytes) = windows_effect {
        if bytes.len() >= 4 {
            let effect = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
            return effect & DROPEFFECT_MOVE != 0 && effect & DROPEFFECT_COPY == 0;
        }
    }
    if let Some(bytes) = gnome {
        let text = String::from_utf8_lossy(bytes);
        return text.lines().next().map(str::trim) == Some("cut");
    }
    false
}

pub fn read_clipboard() -> Result<ClipboardSnapshot> {
    let ctx = context()?;
    let paths: Vec<String> = if ctx.has(ContentFormat::Files) {
        ctx.get_files()
            .unwrap_or_default()
            .iter()
            .filter_map(|entry| clipboard_entry_to_path(entry))
            .collect()
    } else {
        Vec::new()
    };

    let cut = if paths.is_empty() {
        false
    } else {
        let windows = ctx.get_buffer(WINDOWS_DROP_EFFECT).ok();
        let gnome = if cfg!(target_os = "linux") {
            ctx.get_buffer(GNOME_COPIED_FILES).ok()
        } else {
            None
        };
        parse_cut_marker(windows.as_deref(), gnome.as_deref())
    };

    let has_image = paths.is_empty() && ctx.has(ContentFormat::Image);
    Ok(ClipboardSnapshot {
        paths,
        operation: if cut { "cut" } else { "copy" }.to_string(),
        has_image,
    })
}

/// Puts `paths` on the OS clipboard as files, marked as a cut or a copy.
/// An empty list clears the clipboard.
pub fn write_clipboard_files(paths: &[String], cut: bool) -> Result<()> {
    let ctx = context()?;
    if paths.is_empty() {
        return ctx
            .clear()
            .map_err(|e| anyhow!("Cannot clear the clipboard: {e}"));
    }
    for path in paths {
        validate_no_path_traversal(path)?;
    }

    let mut contents = vec![ClipboardContent::Files(paths.to_vec())];
    let effect = if cut {
        DROPEFFECT_MOVE
    } else {
        DROPEFFECT_COPY
    };
    if cfg!(target_os = "windows") {
        contents.push(ClipboardContent::Other(
            WINDOWS_DROP_EFFECT.to_string(),
            effect.to_le_bytes().to_vec(),
        ));
    } else if cfg!(target_os = "linux") {
        let mut gnome = String::from(if cut { "cut" } else { "copy" });
        for path in paths {
            if let Ok(uri) = url::Url::from_file_path(path) {
                gnome.push('\n');
                gnome.push_str(uri.as_str());
            }
        }
        contents.push(ClipboardContent::Other(
            GNOME_COPIED_FILES.to_string(),
            gnome.into_bytes(),
        ));
    }

    ctx.set(contents)
        .map_err(|e| anyhow!("Cannot write files to the clipboard: {e}"))
}

/// First `<stem>.png`, `<stem>-1.png`, ... that does not exist in `dir`.
pub(crate) fn unique_png_path(dir: &Path, stem: &str) -> PathBuf {
    let first = dir.join(format!("{stem}.png"));
    if !first.exists() {
        return first;
    }
    (1..)
        .map(|n| dir.join(format!("{stem}-{n}.png")))
        .find(|candidate| !candidate.exists())
        .expect("an unused file name always exists")
}

/// Saves the clipboard image into `destination_dir` and returns the new path.
pub fn paste_clipboard_image(destination_dir: &str) -> Result<String> {
    validate_no_path_traversal(destination_dir)?;
    let dir = Path::new(destination_dir);
    if !dir.is_dir() {
        return Err(anyhow!("Destination is not a directory: {destination_dir}"));
    }
    let ctx = context()?;
    if !ctx.has(ContentFormat::Image) {
        return Err(anyhow!("The clipboard does not contain an image"));
    }
    let image = ctx
        .get_image()
        .map_err(|e| anyhow!("Cannot read the clipboard image: {e}"))?;
    let png = image
        .to_png()
        .map_err(|e| anyhow!("Cannot encode the clipboard image: {e}"))?;
    let target = unique_png_path(dir, "image");
    std::fs::write(&target, png.get_bytes())?;
    Ok(target.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_drop_effect_distinguishes_cut_from_copy() {
        assert!(parse_cut_marker(Some(&2u32.to_le_bytes()), None));
        assert!(!parse_cut_marker(Some(&5u32.to_le_bytes()), None));
        assert!(!parse_cut_marker(Some(&1u32.to_le_bytes()), None));
        assert!(!parse_cut_marker(Some(&[2u8]), None));
    }

    #[test]
    fn gnome_marker_reads_first_line() {
        assert!(parse_cut_marker(None, Some(b"cut\nfile:///tmp/a")));
        assert!(!parse_cut_marker(None, Some(b"copy\nfile:///tmp/a")));
        assert!(!parse_cut_marker(None, None));
    }

    #[test]
    fn plain_paths_pass_through_and_blank_entries_are_dropped() {
        assert_eq!(
            clipboard_entry_to_path("C:\\work\\a.txt"),
            Some("C:\\work\\a.txt".to_string())
        );
        assert_eq!(clipboard_entry_to_path("  \0"), None);
    }

    #[cfg(unix)]
    #[test]
    fn file_uris_are_decoded() {
        assert_eq!(
            clipboard_entry_to_path("file:///tmp/my%20file.txt"),
            Some("/tmp/my file.txt".to_string())
        );
    }

    #[test]
    fn png_names_skip_existing_files() {
        let dir = std::env::temp_dir().join(format!("yzpz-clip-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(unique_png_path(&dir, "image"), dir.join("image.png"));
        std::fs::write(dir.join("image.png"), b"x").unwrap();
        std::fs::write(dir.join("image-1.png"), b"x").unwrap();
        assert_eq!(unique_png_path(&dir, "image"), dir.join("image-2.png"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
