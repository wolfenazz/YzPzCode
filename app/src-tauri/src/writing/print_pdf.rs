//! PDF export for the Writing workspace.
//!
//! The frontend lays the report out into pages with paged.js and hands over
//! the finished HTML. It is served from memory through the `yzpzprint://`
//! scheme to a hidden webview, which WebView2 prints with the DevTools
//! `Page.printToPDF` call: it honours the CSS `@page` size, keeps text
//! selectable, and writes PDF bookmarks from the headings.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::http::{header, Request, Response, StatusCode};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const SCHEME: &str = "yzpzprint";
pub const PRINT_LABEL_PREFIX: &str = "writing-print-";
const LOAD_TIMEOUT: Duration = Duration::from_secs(30);
const PRINT_TIMEOUT: Duration = Duration::from_secs(60);

/// Print documents waiting to be loaded, by job id.
#[derive(Default, Clone)]
pub struct PrintJobs {
    jobs: Arc<Mutex<HashMap<String, Vec<u8>>>>,
}

impl PrintJobs {
    fn insert(&self, id: &str, html: String) {
        if let Ok(mut jobs) = self.jobs.lock() {
            jobs.insert(id.to_string(), html.into_bytes());
        }
    }

    fn remove(&self, id: &str) {
        if let Ok(mut jobs) = self.jobs.lock() {
            jobs.remove(id);
        }
    }

    fn get(&self, id: &str) -> Option<Vec<u8>> {
        self.jobs.lock().ok()?.get(id).cloned()
    }
}

fn plain(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .unwrap_or_default()
}

/// The job id in `/<job>/index.html`.
fn job_from_path(path: &str) -> Option<&str> {
    let mut parts = path.trim_start_matches('/').split('/');
    let job = parts.next()?;
    let file = parts.next()?;
    if parts.next().is_some() || file != "index.html" {
        return None;
    }
    valid_job_id(job).then_some(job)
}

fn valid_job_id(job: &str) -> bool {
    !job.is_empty() && job.len() <= 64 && job.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// Serves a print job, and only to the print webview created for it.
pub fn handle(
    jobs: &PrintJobs,
    webview_label: &str,
    request: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let Some(job) = job_from_path(request.uri().path()) else {
        return plain(StatusCode::NOT_FOUND, "Not found");
    };
    if webview_label != format!("{PRINT_LABEL_PREFIX}{job}") {
        return plain(
            StatusCode::FORBIDDEN,
            "Print documents are only served to their print view",
        );
    }
    match jobs.get(job) {
        Some(body) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(
                "Content-Security-Policy",
                "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:",
            )
            .body(body)
            .unwrap_or_default(),
        None => plain(StatusCode::NOT_FOUND, "Print job expired"),
    }
}

fn job_url(job: &str) -> Result<url::Url, String> {
    // WebView2 serves custom schemes on http://<scheme>.localhost.
    let raw = if cfg!(windows) {
        format!("http://{SCHEME}.localhost/{job}/index.html")
    } else {
        format!("{SCHEME}://localhost/{job}/index.html")
    };
    url::Url::parse(&raw).map_err(|e| e.to_string())
}

/// Lays out `html` in a hidden webview and writes it to `output_path` as PDF.
/// Returns false when the platform can only offer its print dialog instead.
pub async fn export_pdf(app: &AppHandle, html: String, output_path: &str) -> Result<bool, String> {
    crate::filesystem::validation::validate_no_path_traversal(output_path)
        .map_err(|e| e.to_string())?;
    let jobs = app.state::<PrintJobs>().inner().clone();
    let job = uuid::Uuid::new_v4().simple().to_string();
    jobs.insert(&job, html);

    let result = print_job(app, &job, output_path).await;
    jobs.remove(&job);
    result
}

async fn print_job(app: &AppHandle, job: &str, output_path: &str) -> Result<bool, String> {
    let label = format!("{PRINT_LABEL_PREFIX}{job}");
    let (loaded_tx, loaded_rx) = tokio::sync::oneshot::channel::<()>();
    let loaded_tx = Arc::new(Mutex::new(Some(loaded_tx)));
    let expected_host = if cfg!(windows) {
        format!("{SCHEME}.localhost")
    } else {
        "localhost".to_string()
    };

    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::CustomProtocol(job_url(job)?))
        .title("Exporting PDF")
        .visible(false)
        .skip_taskbar(true)
        .focused(false)
        .decorations(false)
        .inner_size(900.0, 1200.0)
        .on_navigation(move |url| url.host_str() == Some(expected_host.as_str()))
        .on_page_load(move |_window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                if let Some(tx) = loaded_tx.lock().ok().and_then(|mut slot| slot.take()) {
                    let _ = tx.send(());
                }
            }
        })
        .build()
        .map_err(|e| format!("Could not open the print view: {e}"))?;

    let outcome = async {
        tokio::time::timeout(LOAD_TIMEOUT, loaded_rx)
            .await
            .map_err(|_| "The report took too long to load for printing.".to_string())?
            .map_err(|_| "The print view closed before it loaded.".to_string())?;
        print_window(&window, output_path).await
    }
    .await;

    // destroy(), not close(): close() would fire the app-wide close-requested handler.
    let _ = window.destroy();
    outcome
}

#[cfg(windows)]
async fn print_window(window: &tauri::WebviewWindow, output_path: &str) -> Result<bool, String> {
    use base64::Engine;
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use windows_core::HSTRING;

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<String, String>>();
    let tx = Arc::new(Mutex::new(Some(tx)));
    let send = move |value: Result<String, String>| {
        if let Some(tx) = tx.lock().ok().and_then(|mut slot| slot.take()) {
            let _ = tx.send(value);
        }
    };

    window
        .with_webview(move |platform| {
            let fail = send.clone();
            let run = move || -> Result<(), String> {
                let core =
                    unsafe { platform.controller().CoreWebView2() }.map_err(|e| e.to_string())?;
                let params = serde_json::json!({
                    "printBackground": true,
                    "preferCSSPageSize": true,
                    "marginTop": 0,
                    "marginBottom": 0,
                    "marginLeft": 0,
                    "marginRight": 0,
                    "displayHeaderFooter": false,
                    "generateDocumentOutline": true,
                    "generateTaggedPDF": true,
                })
                .to_string();
                let method = HSTRING::from("Page.printToPDF");
                let params = HSTRING::from(params);
                let done = send.clone();
                let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                    move |result, json| {
                        done(match result {
                            Ok(()) => Ok(json),
                            Err(error) => Err(format!("WebView2 could not print: {error}")),
                        });
                        Ok(())
                    },
                ));
                unsafe { core.CallDevToolsProtocolMethod(&method, &params, &handler) }
                    .map_err(|e| e.to_string())
            };
            if let Err(error) = run() {
                fail(Err(error));
            }
        })
        .map_err(|e| e.to_string())?;

    let json = tokio::time::timeout(PRINT_TIMEOUT, rx)
        .await
        .map_err(|_| "Printing took too long.".to_string())?
        .map_err(|_| "The print view closed while printing.".to_string())??;
    let value: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| format!("Unexpected print result: {e}"))?;
    let data = value
        .get("data")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "The print result had no PDF data.".to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Could not decode the PDF: {e}"))?;
    if let Some(parent) = std::path::Path::new(output_path).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }
    tokio::fs::write(output_path, bytes)
        .await
        .map_err(|e| format!("Could not write the PDF: {e}"))?;
    Ok(true)
}

/// Elsewhere the webview can only show the system print dialog, which offers
/// "Save as PDF"; the print view stays open for it.
#[cfg(not(windows))]
async fn print_window(window: &tauri::WebviewWindow, _output_path: &str) -> Result<bool, String> {
    window.show().map_err(|e| e.to_string())?;
    window.print().map_err(|e| e.to_string())?;
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn job_paths_are_strict() {
        assert_eq!(job_from_path("/abc123/index.html"), Some("abc123"));
        assert_eq!(job_from_path("/abc123/other.html"), None);
        assert_eq!(job_from_path("/../index.html"), None);
        assert_eq!(job_from_path("/abc/index.html/extra"), None);
    }

    #[test]
    fn jobs_are_only_served_to_their_own_print_view() {
        let jobs = PrintJobs::default();
        jobs.insert("job1", "<p>hi</p>".into());
        let request = Request::builder()
            .uri("http://yzpzprint.localhost/job1/index.html")
            .body(Vec::new())
            .unwrap();
        assert_eq!(
            handle(&jobs, "writing-print-job1", &request).status(),
            StatusCode::OK
        );
        assert_eq!(
            handle(&jobs, "main", &request).status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            handle(&jobs, "writing-print-job2", &request).status(),
            StatusCode::FORBIDDEN
        );
        jobs.remove("job1");
        assert_eq!(
            handle(&jobs, "writing-print-job1", &request).status(),
            StatusCode::NOT_FOUND
        );
    }
}
