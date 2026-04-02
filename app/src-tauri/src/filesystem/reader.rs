use std::fs;
use std::path::Path;

use base64::Engine;

use crate::filesystem::validation::validate_no_path_traversal;
use crate::types::FileContent;

const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024;

fn check_file_size(path: &Path) -> Result<(), String> {
    let metadata =
        fs::metadata(path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!(
            "File too large to open ({} bytes, maximum is 10 MB)",
            metadata.len()
        ));
    }
    Ok(())
}

pub fn read_file_content(file_path: &str) -> Result<FileContent, String> {
    validate_no_path_traversal(file_path).map_err(|e| e.to_string())?;
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }
    if path.is_dir() {
        return Err(format!("Path is a directory: {}", file_path));
    }

    check_file_size(&path)?;

    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))?;
    let language = detect_language(path).to_string();

    Ok(FileContent { content, language })
}

pub fn write_file_content(file_path: &str, content: &str) -> Result<(), String> {
    validate_no_path_traversal(file_path).map_err(|e| e.to_string())?;
    let path = Path::new(file_path);
    if !path.exists() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }

    fs::write(path, content).map_err(|e| format!("Failed to write file: {}", e))
}

fn detect_language(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "rs" => "rust",
        "py" => "python",
        "html" | "htm" => "html",
        "css" | "scss" | "sass" | "less" => "css",
        "json" => "json",
        "md" | "markdown" => "markdown",
        "toml" => "toml",
        "yaml" | "yml" => "yaml",
        "xml" => "xml",
        "sql" => "sql",
        "sh" | "bash" => "shell",
        "go" => "go",
        "java" => "java",
        "c" | "h" => "c",
        "cpp" | "cc" | "cxx" | "hpp" => "cpp",
        "rb" => "ruby",
        "php" => "php",
        "swift" => "swift",
        "kt" => "kotlin",
        "lua" => "lua",
        "dockerfile" => "dockerfile",
        "zig" => "zig",
        "pdf" => "pdf",
        "docx" => "docx",
        "doc" => "doc",
        "xlsx" => "xlsx",
        "xls" => "xls",
        _ => {
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_lowercase();
            match filename.as_str() {
                "dockerfile" => "dockerfile",
                "makefile" => "makefile",
                "cargo.toml" => "toml",
                "cargo.lock" => "toml",
                ".gitignore" | ".eslintignore" | ".prettierignore" => "plaintext",
                ".env" | ".env.local" | ".env.production" | ".env.development" => "plaintext",
                _ => "plaintext",
            }
        }
    }
}

pub fn read_file_as_base64(file_path: &str) -> Result<String, String> {
    validate_no_path_traversal(file_path).map_err(|e| e.to_string())?;
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }
    if path.is_dir() {
        return Err(format!("Path is a directory: {}", file_path));
    }

    check_file_size(&path)?;

    let bytes = fs::read(path).map_err(|e| format!("Failed to read file: {}", e))?;
    let mime_type = detect_mime_type(path);
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime_type, encoded))
}

fn detect_mime_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        "tiff" | "tif" => "image/tiff",
        "pdf" => "application/pdf",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc" => "application/msword",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xls" => "application/vnd.ms-excel",
        _ => "application/octet-stream",
    }
}

pub fn is_binary_file(file_path: &str) -> Result<bool, String> {
    validate_no_path_traversal(file_path).map_err(|e| e.to_string())?;
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }
    if path.is_dir() {
        return Err(format!("Path is a directory: {}", file_path));
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let binary_extensions: &[&str] = &[
        "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif", "tiff", "tif", "pdf", "docx",
        "doc", "xlsx", "xls",
    ];

    if binary_extensions.contains(&ext.as_str()) {
        return Ok(true);
    }

    if ext == "svg" {
        return Ok(false);
    }

    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) => return Err(format!("Failed to read file for binary check: {}", e)),
    };

    let check_len = bytes.len().min(8192);
    let sample = &bytes[..check_len];
    let text_count = sample
        .iter()
        .filter(|&&b| b == b'\t' || b == b'\n' || b == b'\r' || (32..=126).contains(&b))
        .count();

    Ok((text_count as f64 / check_len as f64) < 0.85)
}
