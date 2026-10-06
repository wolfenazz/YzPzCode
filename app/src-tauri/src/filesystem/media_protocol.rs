//! `yzpzmedia://` — streams local files to the main webview so the editor can
//! preview audio, video and other binary files in place. Responses honour HTTP
//! `Range` requests, which lets `<audio>`/`<video>` seek through large files
//! without loading them into memory or round-tripping them through base64.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use tauri::http::{header, Method, Request, Response, StatusCode};

use crate::filesystem::validation::validate_no_path_traversal;

pub const SCHEME: &str = "yzpzmedia";

/// Only the app UI may read files; the in-app browser and extension panels run
/// untrusted pages in their own webviews and must not reach the filesystem.
const TRUSTED_WEBVIEW: &str = "main";

/// Largest body served for an open-ended (`bytes=N-`) range request. Media
/// elements ask for the rest of the file and then follow up as they play.
const MAX_OPEN_RANGE: u64 = 4 * 1024 * 1024;

#[derive(Debug, PartialEq, Eq)]
enum ByteRange {
    /// Inclusive start and end offsets.
    Satisfiable(u64, u64),
    Unsatisfiable,
}

pub fn handle(webview_label: &str, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.method() == Method::OPTIONS {
        return cors(Response::builder().status(StatusCode::NO_CONTENT))
            .body(Vec::new())
            .unwrap_or_default();
    }
    if webview_label != TRUSTED_WEBVIEW {
        return error(
            StatusCode::FORBIDDEN,
            "Media access is limited to the app window",
        );
    }
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return error(
            StatusCode::METHOD_NOT_ALLOWED,
            "Only GET and HEAD are supported",
        );
    }

    let Some(file_path) = path_from_uri(&request.uri().to_string()) else {
        return error(StatusCode::BAD_REQUEST, "Missing file path");
    };
    if validate_no_path_traversal(&file_path).is_err() {
        return error(StatusCode::BAD_REQUEST, "Invalid file path");
    }

    let path = Path::new(&file_path);
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return error(StatusCode::NOT_FOUND, "File does not exist")
        }
        Err(e) => return error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };
    let size = match file.metadata() {
        Ok(meta) if meta.is_dir() => return error(StatusCode::BAD_REQUEST, "Path is a directory"),
        Ok(meta) => meta.len(),
        Err(e) => return error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };

    let mime = mime_type(
        path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase()
            .as_str(),
    );
    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| parse_range(value, size));

    let builder = cors(Response::builder())
        .header(header::CONTENT_TYPE, mime)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "no-cache");

    let (builder, start, len) = match range {
        Some(ByteRange::Unsatisfiable) => {
            return cors(Response::builder())
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::CONTENT_RANGE, format!("bytes */{}", size))
                .body(Vec::new())
                .unwrap_or_default();
        }
        Some(ByteRange::Satisfiable(start, end)) => (
            builder.status(StatusCode::PARTIAL_CONTENT).header(
                header::CONTENT_RANGE,
                format!("bytes {}-{}/{}", start, end, size),
            ),
            start,
            end - start + 1,
        ),
        None => (builder.status(StatusCode::OK), 0, size),
    };
    let builder = builder.header(header::CONTENT_LENGTH, len);

    if request.method() == Method::HEAD {
        return builder.body(Vec::new()).unwrap_or_default();
    }

    let mut body = Vec::with_capacity(len as usize);
    let read = file
        .seek(SeekFrom::Start(start))
        .and_then(|_| (&mut file).take(len).read_to_end(&mut body));
    match read {
        Ok(_) => builder.body(body).unwrap_or_default(),
        Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    }
}

/// Reads the `path` query parameter. The frontend builds the URL with
/// `convertFileSrc('', 'yzpzmedia')`, which differs per platform
/// (`http://yzpzmedia.localhost/` on Windows, `yzpzmedia://localhost/` elsewhere).
fn path_from_uri(uri: &str) -> Option<String> {
    let parsed = url::Url::parse(uri).ok()?;
    let path = parsed
        .query_pairs()
        .find(|(key, _)| key == "path")
        .map(|(_, value)| value.into_owned())?;
    (!path.is_empty()).then_some(path)
}

/// Parses the first range of a `Range: bytes=…` header. Returns `None` when the
/// header is malformed so the caller falls back to sending the whole file.
fn parse_range(value: &str, size: u64) -> Option<ByteRange> {
    let spec = value
        .trim()
        .strip_prefix("bytes=")?
        .split(',')
        .next()?
        .trim();
    let (start, end) = spec.split_once('-')?;
    let (start, end) = (start.trim(), end.trim());

    if start.is_empty() {
        let suffix: u64 = end.parse().ok()?;
        if suffix == 0 || size == 0 {
            return Some(ByteRange::Unsatisfiable);
        }
        return Some(ByteRange::Satisfiable(
            size.saturating_sub(suffix),
            size - 1,
        ));
    }

    let start: u64 = start.parse().ok()?;
    if start >= size {
        return Some(ByteRange::Unsatisfiable);
    }
    let end = if end.is_empty() {
        (start + MAX_OPEN_RANGE - 1).min(size - 1)
    } else {
        let end: u64 = end.parse().ok()?;
        if end < start {
            return None;
        }
        end.min(size - 1)
    };
    Some(ByteRange::Satisfiable(start, end))
}

fn cors(builder: tauri::http::response::Builder) -> tauri::http::response::Builder {
    builder
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, HEAD, OPTIONS")
        .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Range")
        .header(
            header::ACCESS_CONTROL_EXPOSE_HEADERS,
            "Content-Range, Content-Length, Accept-Ranges",
        )
}

fn error(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    cors(Response::builder())
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .unwrap_or_default()
}

pub fn mime_type(extension: &str) -> &'static str {
    match extension {
        "mp3" => "audio/mpeg",
        "wav" | "wave" => "audio/wav",
        "ogg" | "oga" | "opus" => "audio/ogg",
        "flac" => "audio/flac",
        "m4a" | "m4b" => "audio/mp4",
        "aac" => "audio/aac",
        "weba" => "audio/webm",
        "aif" | "aiff" => "audio/aiff",
        "mid" | "midi" => "audio/midi",
        "wma" => "audio/x-ms-wma",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "ogv" => "video/ogg",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "wmv" => "video/x-ms-wmv",
        "3gp" => "video/3gpp",
        "ts" | "mts" | "m2ts" => "video/mp2t",
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
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_bounded_and_open_ranges() {
        assert_eq!(
            parse_range("bytes=0-99", 1000),
            Some(ByteRange::Satisfiable(0, 99))
        );
        assert_eq!(
            parse_range("bytes=900-5000", 1000),
            Some(ByteRange::Satisfiable(900, 999))
        );
        assert_eq!(
            parse_range("bytes=10-", 1000),
            Some(ByteRange::Satisfiable(10, 999))
        );
        assert_eq!(
            parse_range("bytes=0-", 100 * 1024 * 1024),
            Some(ByteRange::Satisfiable(0, MAX_OPEN_RANGE - 1))
        );
    }

    #[test]
    fn parses_suffix_ranges() {
        assert_eq!(
            parse_range("bytes=-100", 1000),
            Some(ByteRange::Satisfiable(900, 999))
        );
        assert_eq!(
            parse_range("bytes=-5000", 1000),
            Some(ByteRange::Satisfiable(0, 999))
        );
        assert_eq!(
            parse_range("bytes=-0", 1000),
            Some(ByteRange::Unsatisfiable)
        );
    }

    #[test]
    fn rejects_out_of_bounds_and_malformed_ranges() {
        assert_eq!(
            parse_range("bytes=1000-", 1000),
            Some(ByteRange::Unsatisfiable)
        );
        assert_eq!(parse_range("bytes=0-", 0), Some(ByteRange::Unsatisfiable));
        assert_eq!(parse_range("bytes=50-10", 1000), None);
        assert_eq!(parse_range("items=0-10", 1000), None);
        assert_eq!(parse_range("bytes=abc", 1000), None);
    }

    #[test]
    fn reads_path_from_both_url_shapes() {
        assert_eq!(
            path_from_uri("http://yzpzmedia.localhost/?path=C%3A%5CUsers%5Cme%5Csong%20one.mp3")
                .as_deref(),
            Some("C:\\Users\\me\\song one.mp3")
        );
        assert_eq!(
            path_from_uri("yzpzmedia://localhost/?path=%2Fhome%2Fme%2Fclip.mp4").as_deref(),
            Some("/home/me/clip.mp4")
        );
        assert_eq!(path_from_uri("yzpzmedia://localhost/"), None);
    }

    #[test]
    fn refuses_untrusted_webviews() {
        let request = Request::builder()
            .uri("yzpzmedia://localhost/?path=%2Fetc%2Fhosts")
            .body(Vec::new())
            .unwrap();
        assert_eq!(
            handle("browser-tab-1", &request).status(),
            StatusCode::FORBIDDEN
        );
    }

    #[test]
    fn serves_requested_byte_range() {
        let dir = std::env::temp_dir().join(format!("yzpz-media-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("clip.mp3");
        std::fs::write(&file, b"0123456789").unwrap();
        let uri = format!(
            "yzpzmedia://localhost/?path={}",
            url::form_urlencoded::byte_serialize(file.to_string_lossy().as_bytes())
                .collect::<String>()
        );

        let request = Request::builder()
            .uri(uri.as_str())
            .header(header::RANGE, "bytes=2-5")
            .body(Vec::new())
            .unwrap();
        let response = handle("main", &request);
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.body(), b"2345");
        assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes 2-5/10");
        assert_eq!(response.headers()[header::CONTENT_TYPE], "audio/mpeg");

        let request = Request::builder()
            .uri(uri.as_str())
            .body(Vec::new())
            .unwrap();
        let response = handle("main", &request);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.body(), b"0123456789");

        std::fs::remove_dir_all(dir).unwrap();
    }
}
