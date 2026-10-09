//! Stock-photo search and download for the Presentation studio. The requests
//! run here, not in the webview, because the image hosts do not all allow
//! cross-origin downloads. Openverse needs no key; Unsplash and Pexels take
//! the user's own key.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const USER_AGENT: &str = concat!("YzPzCode/", env!("CARGO_PKG_VERSION"), " (presentation studio)");
const MAX_IMAGE_BYTES: usize = 25 * 1024 * 1024;
const PAGE_SIZE: u32 = 24;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StockImage {
    pub id: String,
    pub provider: String,
    pub thumb_url: String,
    pub full_url: String,
    pub width: u32,
    pub height: u32,
    pub title: String,
    pub author: String,
    pub license: String,
    pub source_url: String,
    /// Unsplash asks apps to call this when a photo is used.
    pub ping_url: Option<String>,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

fn text(value: &Value, path: &[&str]) -> String {
    let mut current = value;
    for key in path {
        match current.get(key) {
            Some(next) => current = next,
            None => return String::new(),
        }
    }
    match current {
        Value::String(text) => text.clone(),
        Value::Number(number) => number.to_string(),
        _ => String::new(),
    }
}

fn number(value: &Value, key: &str) -> u32 {
    value.get(key).and_then(Value::as_u64).unwrap_or(0) as u32
}

pub fn parse_openverse(body: &Value) -> Vec<StockImage> {
    body.get("results")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let full = text(item, &["url"]);
                    if full.is_empty() {
                        return None;
                    }
                    let license = format!("CC {} {}", text(item, &["license"]).to_uppercase(), text(item, &["license_version"]))
                        .trim()
                        .to_string();
                    Some(StockImage {
                        id: text(item, &["id"]),
                        provider: "openverse".into(),
                        thumb_url: {
                            let thumb = text(item, &["thumbnail"]);
                            if thumb.is_empty() { full.clone() } else { thumb }
                        },
                        full_url: full,
                        width: number(item, "width"),
                        height: number(item, "height"),
                        title: text(item, &["title"]),
                        author: text(item, &["creator"]),
                        license,
                        source_url: text(item, &["foreign_landing_url"]),
                        ping_url: None,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn parse_unsplash(body: &Value) -> Vec<StockImage> {
    body.get("results")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|item| StockImage {
                    id: text(item, &["id"]),
                    provider: "unsplash".into(),
                    thumb_url: text(item, &["urls", "small"]),
                    full_url: text(item, &["urls", "regular"]),
                    width: number(item, "width"),
                    height: number(item, "height"),
                    title: text(item, &["alt_description"]),
                    author: text(item, &["user", "name"]),
                    license: "Unsplash License".into(),
                    source_url: text(item, &["links", "html"]),
                    ping_url: Some(text(item, &["links", "download_location"])).filter(|url| !url.is_empty()),
                })
                .filter(|image| !image.full_url.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

pub fn parse_pexels(body: &Value) -> Vec<StockImage> {
    body.get("photos")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|item| StockImage {
                    id: text(item, &["id"]),
                    provider: "pexels".into(),
                    thumb_url: text(item, &["src", "medium"]),
                    full_url: text(item, &["src", "large2x"]),
                    width: number(item, "width"),
                    height: number(item, "height"),
                    title: text(item, &["alt"]),
                    author: text(item, &["photographer"]),
                    license: "Pexels License".into(),
                    source_url: text(item, &["url"]),
                    ping_url: None,
                })
                .filter(|image| !image.full_url.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn require_key(key: &Option<String>, provider: &str) -> Result<String, String> {
    key.as_deref()
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("Add your {provider} API key in Settings → Presentation → Images."))
}

#[tauri::command]
pub async fn stock_image_search(provider: String, query: String, page: Option<u32>, api_key: Option<String>) -> Result<Vec<StockImage>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let page = page.unwrap_or(1).clamp(1, 50).to_string();
    let size = PAGE_SIZE.to_string();
    let client = client()?;
    let request = match provider.as_str() {
        "openverse" => client
            .get("https://api.openverse.org/v1/images/")
            .query(&[("q", query), ("page", &page), ("page_size", &size), ("mature", "false")]),
        "unsplash" => client
            .get("https://api.unsplash.com/search/photos")
            .query(&[("query", query), ("page", &page), ("per_page", &size), ("orientation", "landscape")])
            .header("Authorization", format!("Client-ID {}", require_key(&api_key, "Unsplash")?))
            .header("Accept-Version", "v1"),
        "pexels" => client
            .get("https://api.pexels.com/v1/search")
            .query(&[("query", query), ("page", &page), ("per_page", &size), ("orientation", "landscape")])
            .header("Authorization", require_key(&api_key, "Pexels")?),
        other => return Err(format!("Unknown image provider: {other}")),
    };
    let response = request.send().await.map_err(|e| format!("Could not reach the image search: {e}"))?;
    let status = response.status();
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err("The image service refused the request. Check the API key in Settings → Presentation → Images.".into());
    }
    if status.as_u16() == 429 {
        return Err("The image service is rate limiting searches. Wait a minute and try again.".into());
    }
    if !status.is_success() {
        return Err(format!("The image search failed ({status})."));
    }
    let body: Value = response.json().await.map_err(|e| format!("Unexpected search result: {e}"))?;
    Ok(match provider.as_str() {
        "openverse" => parse_openverse(&body),
        "unsplash" => parse_unsplash(&body),
        _ => parse_pexels(&body),
    })
}

fn allowed_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "Not a valid image address.".to_string())?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("Only web images can be downloaded.".into());
    }
    match parsed.host_str() {
        Some(host) if host != "localhost" && !host.starts_with("127.") && host != "[::1]" => Ok(parsed),
        _ => Err("Only web images can be downloaded.".into()),
    }
}

/// File extension for an image content type.
pub fn image_extension(content_type: &str) -> &'static str {
    match content_type.split(';').next().unwrap_or("").trim() {
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        "image/bmp" => "bmp",
        "image/avif" => "avif",
        _ => "jpg",
    }
}

/// Downloads a chosen stock photo to `stem` plus the extension its content
/// type calls for. Returns the path written.
#[tauri::command]
pub async fn stock_image_download(
    url: String,
    stem: String,
    ping_url: Option<String>,
    api_key: Option<String>,
) -> Result<String, String> {
    crate::filesystem::validation::validate_no_path_traversal(&stem).map_err(|e| e.to_string())?;
    let target = allowed_url(&url)?;
    let client = client()?;
    if let (Some(ping), Some(key)) = (ping_url.filter(|value| !value.is_empty()), api_key.filter(|value| !value.is_empty())) {
        if let Ok(ping) = allowed_url(&ping) {
            // Best effort: Unsplash's download tracking must not block the download.
            let _ = client.get(ping).header("Authorization", format!("Client-ID {key}")).send().await;
        }
    }
    let response = client.get(target).send().await.map_err(|e| format!("Could not download the image: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Could not download the image ({}).", response.status()));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !content_type.starts_with("image/") {
        return Err("That address did not return an image.".into());
    }
    if response.content_length().unwrap_or(0) as usize > MAX_IMAGE_BYTES {
        return Err("The image is larger than 25 MB.".into());
    }
    let bytes = response.bytes().await.map_err(|e| format!("Could not download the image: {e}"))?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("The image is larger than 25 MB.".into());
    }
    let path = format!("{stem}.{}", image_extension(&content_type));
    if let Some(parent) = std::path::Path::new(&path).parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }
    tokio::fs::write(&path, &bytes).await.map_err(|e| format!("Could not save the image: {e}"))?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_each_provider() {
        let openverse = parse_openverse(&json!({ "results": [{ "id": "a", "url": "https://x/1.jpg", "thumbnail": "https://x/t.jpg", "width": 800, "height": 600, "creator": "Ann", "license": "by", "license_version": "4.0", "foreign_landing_url": "https://src" }, { "id": "no-url" }] }));
        assert_eq!(openverse.len(), 1);
        assert_eq!(openverse[0].license, "CC BY 4.0");
        assert_eq!(openverse[0].thumb_url, "https://x/t.jpg");

        let unsplash = parse_unsplash(&json!({ "results": [{ "id": "u", "width": 10, "height": 5, "urls": { "small": "s", "regular": "r" }, "user": { "name": "Bo" }, "links": { "html": "h", "download_location": "https://api.unsplash.com/d" } }] }));
        assert_eq!(unsplash[0].full_url, "r");
        assert_eq!(unsplash[0].ping_url.as_deref(), Some("https://api.unsplash.com/d"));

        let pexels = parse_pexels(&json!({ "photos": [{ "id": 7, "width": 1, "height": 1, "photographer": "Cy", "url": "p", "src": { "medium": "m", "large2x": "l" } }] }));
        assert_eq!(pexels[0].id, "7");
        assert_eq!(pexels[0].author, "Cy");
    }

    #[test]
    fn only_web_addresses_download() {
        assert!(allowed_url("https://images.example.com/a.jpg").is_ok());
        assert!(allowed_url("file:///C:/secret.png").is_err());
        assert!(allowed_url("http://localhost:8080/a.png").is_err());
        assert!(allowed_url("http://127.0.0.1/a.png").is_err());
        assert_eq!(image_extension("image/png"), "png");
        assert_eq!(image_extension("image/jpeg; charset=binary"), "jpg");
    }
}
