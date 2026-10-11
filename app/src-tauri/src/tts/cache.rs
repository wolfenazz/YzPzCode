//! Content-addressed WAV cache for synthesized narration.
//!
//! Key: SHA-256 of `text|model|voice|speed|bridgeVersion` (the plan names
//! SHA-1; SHA-256 is used instead because `sha2` is already a dependency and
//! fills the same content-addressing role, so identical text replays
//! instantly). Files live in `<appData>/tts/cache/<hex>.wav`; the oldest
//! entries are evicted past 500 MB. The frontend plays them through the
//! existing `yzpzmedia` protocol via `localFileUrl(absPath)`.

use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::AppHandle;

use super::env;

/// Bumped whenever the bridge changes its audio output; invalidates old WAVs.
pub const BRIDGE_VERSION: &str = "1";
/// Oldest cache files are evicted past this size.
pub const MAX_CACHE_BYTES: u64 = 500 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsCacheInfo {
    pub files: usize,
    pub bytes: u64,
    pub max_bytes: u64,
}

/// `<appData>/tts/cache` — synthesized WAVs keyed by content hash.
pub fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(env::tts_root(app)?.join("cache"))
}

pub fn cache_key(text: &str, model_id: &str, voice: &str, speed: f64) -> String {
    let canonical = format!("{text}|{model_id}|{voice}|{speed:.3}|{BRIDGE_VERSION}");
    format!("{:x}", Sha256::digest(canonical.as_bytes()))
}

pub fn cached_path(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    if key.len() != 64 || !key.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid narration cache key.".into());
    }
    Ok(cache_dir(app)?.join(format!("{key}.wav")))
}

/// Existing non-empty WAV for this exact request, if any.
pub async fn lookup(
    app: &AppHandle,
    text: &str,
    model_id: &str,
    voice: &str,
    speed: f64,
) -> Option<PathBuf> {
    let path = cached_path(app, &cache_key(text, model_id, voice, speed)).ok()?;
    let meta = tokio::fs::metadata(&path).await.ok()?;
    (meta.is_file() && meta.len() > 0).then_some(path)
}

fn dir_usage(dir: &Path) -> (usize, u64) {
    let mut files: usize = 0;
    let mut bytes: u64 = 0;
    let Ok(entries) = std::fs::read_dir(dir) else {
        return (0, 0);
    };
    for item in entries.flatten() {
        if let Ok(meta) = item.metadata() {
            if meta.is_file() {
                files += 1;
                bytes = bytes.saturating_add(meta.len());
            }
        }
    }
    (files, bytes)
}

pub async fn cache_info(app: &AppHandle) -> Result<TtsCacheInfo, String> {
    let dir = cache_dir(app)?;
    let (files, bytes) = tokio::task::spawn_blocking(move || dir_usage(&dir))
        .await
        .map_err(|e| format!("Could not inspect the narration cache: {e}"))?;
    Ok(TtsCacheInfo {
        files,
        bytes,
        max_bytes: MAX_CACHE_BYTES,
    })
}

/// Removes oldest-first (by modification time) until the cache fits the cap.
/// Returns bytes freed.
fn evict_oldest(dir: &Path) -> Result<u64, String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Ok(0);
    };
    let mut items: Vec<(SystemTime, u64, PathBuf)> = Vec::new();
    let mut total: u64 = 0;
    for item in entries.flatten() {
        let path = item.path();
        let Ok(meta) = item.metadata() else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        total = total.saturating_add(meta.len());
        // A file without readable mtime sorts as oldest, which is safe: it is
        // evicted first rather than kept forever.
        let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        items.push((modified, meta.len(), path));
    }
    if total <= MAX_CACHE_BYTES {
        return Ok(0);
    }
    items.sort_by(|a, b| a.0.cmp(&b.0));
    let mut freed: u64 = 0;
    for (_, size, path) in items {
        if total.saturating_sub(freed) <= MAX_CACHE_BYTES {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            freed = freed.saturating_add(size);
        }
    }
    Ok(freed)
}

pub async fn evict_if_needed(app: &AppHandle) -> Result<u64, String> {
    let dir = cache_dir(app)?;
    tokio::task::spawn_blocking(move || evict_oldest(&dir))
        .await
        .map_err(|e| format!("Could not trim the narration cache: {e}"))?
}

/// Deletes every cached WAV. Returns the number of files removed.
/// Surfaced as `tts_clear_cache` for the Settings → Narration manager.
pub async fn clear_cache(app: &AppHandle) -> Result<usize, String> {
    let dir = cache_dir(app)?;
    tokio::task::spawn_blocking(move || {
        let mut removed = 0;
        let Ok(entries) = std::fs::read_dir(&dir) else {
            return Ok(removed);
        };
        for item in entries.flatten() {
            let path = item.path();
            let is_file = item.metadata().map(|meta| meta.is_file()).unwrap_or(false);
            if is_file && std::fs::remove_file(&path).is_ok() {
                removed += 1;
            }
        }
        Ok(removed)
    })
    .await
    .map_err(|e| format!("Could not clear the narration cache: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_keys_are_stable_hex() {
        let first = cache_key("مرحبا", "silma", "auto", 1.0);
        assert_eq!(first.len(), 64);
        assert!(first.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(first, cache_key("مرحبا", "silma", "auto", 1.0));
        assert_ne!(first, cache_key("مرحبا", "silma", "ar-male", 1.0));
        assert_ne!(first, cache_key("مرحبا", "silma", "auto", 1.25));
        assert_ne!(first, cache_key("مرحبا!", "silma", "auto", 1.0));
        assert_ne!(first, cache_key("مرحبا", "kokoro", "auto", 1.0));
    }
}
