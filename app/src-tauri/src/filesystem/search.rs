//! Cross-file content search (the "find in files" workflow). Walks the
//! workspace with the same ignore rules as the explorer, scans line-by-line
//! with a size/binary cap, and returns bounded results for the SearchPanel.

use std::io::BufRead;
use std::path::Path;

use ignore::WalkBuilder;
use serde::Serialize;

use super::explorer::is_noise_dir_pub;

/// Skip files larger than this — matches a single editor session's budget and
/// keeps the search snappy inside giant generated files.
const MAX_SCAN_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_SNIPPET_CHARS: usize = 220;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    /// Repo-relative path with forward slashes.
    pub path: String,
    /// 1-based line number.
    pub line: u32,
    /// A trimmed snippet of the matching line (capped).
    pub text: String,
    /// 1-based column of the first match on the line.
    pub column: u32,
}

pub fn search_files(
    dir_path: &str,
    query: &str,
    case_sensitive: bool,
    max_results: usize,
) -> Result<Vec<SearchResult>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    crate::filesystem::validation::validate_no_path_traversal(dir_path)
        .map_err(|e| e.to_string())?;

    let root = Path::new(dir_path);
    if !root.exists() || !root.is_dir() {
        return Err(format!("Directory does not exist: {}", dir_path));
    }

    let needle = query.to_string();
    let needle_lower = query.to_lowercase();
    let cap = if max_results == 0 { 500 } else { max_results };

    let mut builder = WalkBuilder::new(root);
    builder
        .hidden(false)
        .ignore(false)
        .parents(false)
        .git_ignore(false)
        .git_global(false)
        .git_exclude(false)
        .filter_entry(|e| !is_noise_dir_pub(&e.file_name().to_string_lossy()));

    let mut results: Vec<SearchResult> = Vec::new();
    'files: for entry in builder.build().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Ok(metadata) = std::fs::metadata(path) else {
            continue;
        };
        let len = metadata.len();
        if len == 0 || len > MAX_SCAN_FILE_BYTES {
            continue;
        }

        let Ok(file) = std::fs::File::open(path) else {
            continue;
        };

        // Cheap binary sniff: a NUL byte in the first 8 KB means "not text".
        {
            use std::io::Read;
            let mut probe = if let Ok(probe) = file.try_clone() {
                probe
            } else {
                break 'files;
            };
            let mut head = [0u8; 8192];
            let mut total = 0usize;
            loop {
                let Ok(n) = probe.read(&mut head[total..]) else {
                    break;
                };
                if n == 0 {
                    break;
                }
                total += n;
                if total >= head.len() {
                    break;
                }
            }
            if head[..total].contains(&0) {
                continue;
            }
        }

        let rel = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");

        let reader = std::io::BufReader::new(file);
        for (idx, line) in reader.lines().enumerate() {
            let Ok(line) = line else { continue };
            let found_column = if case_sensitive {
                line.find(&needle).map(|c| c as u32 + 1)
            } else {
                line.to_lowercase()
                    .find(&needle_lower)
                    .map(|c| c as u32 + 1)
            };
            if let Some(column) = found_column {
                results.push(SearchResult {
                    path: rel.clone(),
                    line: idx as u32 + 1,
                    text: line.trim().chars().take(MAX_SNIPPET_CHARS).collect(),
                    column,
                });
                if results.len() >= cap {
                    break 'files;
                }
            }
        }
    }

    Ok(results)
}
