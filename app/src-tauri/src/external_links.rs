//! Keeps the app's own webview on the app.
//!
//! Without a guard, clicking any link in the UI (an `<a href>`, a
//! `target="_blank"` anchor, a `window.open` call, or a file dropped on the
//! window) navigates the whole app window to that page, and there is no way
//! back. These handlers allow navigation only within the app's own origin and
//! send everything else to the system browser.

use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Runtime, Url};
use tauri_plugin_opener::OpenerExt;

/// Whether `url` belongs to the app itself, so the main webview may load it.
pub fn is_app_url(url: &Url, dev_url: Option<&Url>) -> bool {
    match url.scheme() {
        // Bundled frontend: `tauri://localhost` on macOS/Linux,
        // `http(s)://tauri.localhost` on Windows.
        "tauri" => true,
        "http" | "https" => {
            url.host_str() == Some("tauri.localhost")
                || dev_url.is_some_and(|dev| dev.origin() == url.origin())
        }
        // In-page documents: `about:blank`/`about:srcdoc` iframes, blob downloads.
        "about" | "blob" | "data" => true,
        _ => false,
    }
}

fn open_externally<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
        if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
            eprintln!("Warning: failed to open {url} in the system browser: {error}");
        }
    }
}

fn dev_url<R: Runtime>(app: &AppHandle<R>) -> Option<Url> {
    if tauri::is_dev() {
        app.config().build.dev_url.clone()
    } else {
        None
    }
}

/// `on_navigation` handler: allow app pages, open anything else externally.
pub fn navigation_handler<R: Runtime>(app: AppHandle<R>) -> impl Fn(&Url) -> bool + Send + 'static {
    let dev_url = dev_url(&app);
    move |url| {
        if is_app_url(url, dev_url.as_ref()) {
            return true;
        }
        open_externally(&app, url);
        false
    }
}

/// `on_new_window` handler: popups never open inside the app.
pub fn new_window_handler<R: Runtime>(
    app: AppHandle<R>,
) -> impl Fn(Url, NewWindowFeatures) -> NewWindowResponse<R> + Send + Sync + 'static {
    move |url, _| {
        open_externally(&app, &url);
        NewWindowResponse::Deny
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(value: &str) -> Url {
        Url::parse(value).unwrap()
    }

    #[test]
    fn allows_bundled_app_origins() {
        assert!(is_app_url(&url("tauri://localhost/index.html"), None));
        assert!(is_app_url(&url("http://tauri.localhost/"), None));
        assert!(is_app_url(
            &url("https://tauri.localhost/drawio/index.html"),
            None
        ));
        assert!(is_app_url(&url("about:blank"), None));
        assert!(is_app_url(&url("about:srcdoc"), None));
    }

    #[test]
    fn allows_dev_server_only_when_configured() {
        let dev = url("http://localhost:8745");
        assert!(is_app_url(
            &url("http://localhost:8745/settings"),
            Some(&dev)
        ));
        assert!(!is_app_url(&url("http://localhost:8745/"), None));
        assert!(!is_app_url(&url("http://localhost:3000/"), Some(&dev)));
    }

    #[test]
    fn rejects_external_pages() {
        assert!(!is_app_url(
            &url("https://github.com/wolfenazz/YzPzCode"),
            None
        ));
        assert!(!is_app_url(&url("http://example.com/"), None));
        assert!(!is_app_url(&url("https://tauri.localhost.evil.com/"), None));
        assert!(!is_app_url(&url("mailto:someone@example.com"), None));
        assert!(!is_app_url(&url("file:///C:/Users/me/notes.txt"), None));
    }
}
