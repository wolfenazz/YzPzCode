use anyhow::{bail, Context, Result};
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl};
use uuid::Uuid;

const BRIDGE_ID: &str = "yzpzcode.panel-bridge";
const MAX_DOWNLOAD: u64 = 512 * 1024 * 1024;
const MAX_EXTRACTED: u64 = 2 * 1024 * 1024 * 1024;
const DOWNLOAD_ATTEMPTS: u32 = 3;

#[derive(Deserialize)]
struct RuntimeRelease {
    version: String,
    assets: Vec<RuntimeAsset>,
}

#[derive(Deserialize)]
struct RuntimeAsset {
    platform: String,
    url: String,
    sha256: String,
}

#[derive(Deserialize)]
struct CatalogEntry {
    id: String,
    name: String,
    publisher: String,
    description: String,
}

fn catalog_entries() -> &'static [CatalogEntry] {
    static CATALOG: OnceLock<Vec<CatalogEntry>> = OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!("../../../src/data/extensions.json"))
            .expect("The bundled extension catalog must contain valid JSON")
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionInfo {
    pub id: String,
    pub name: String,
    pub publisher: String,
    pub description: String,
    pub installed_version: Option<String>,
    pub registry_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionProgress {
    pub extension_id: String,
    pub stage: String,
    pub message: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

struct HostProcess {
    child: Child,
    url: url::Url,
    browser_data: PathBuf,
    workspace_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PanelOrigin {
    id: String,
    port: u16,
}

impl Drop for HostProcess {
    fn drop(&mut self) {
        stop_process_tree(&mut self.child);
    }
}

#[derive(Clone, Default)]
pub struct ExtensionHostManager {
    hosts: Arc<Mutex<HashMap<String, HostProcess>>>,
    operation: Arc<tokio::sync::Mutex<()>>,
    pending: Arc<Mutex<HashMap<String, String>>>,
    closed: Arc<Mutex<HashSet<String>>>,
}

struct StagingDirectory(PathBuf);

impl StagingDirectory {
    fn new(base: &Path, prefix: &str) -> Result<Self> {
        fs::create_dir_all(base)?;
        let path = base.join(format!("{prefix}-{}", Uuid::new_v4()));
        fs::create_dir(&path)?;
        Ok(Self(path))
    }
}

impl Drop for StagingDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn root(app: &AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_data_dir()?.join("extensions"))
}

fn entry(id: &str) -> Result<&'static CatalogEntry> {
    catalog_entries()
        .iter()
        .find(|entry| entry.id == id)
        .context("This extension is not in the supported catalog")
}

fn check_uuid(id: &str) -> Result<()> {
    Uuid::parse_str(id).context("Invalid panel or workspace identifier")?;
    Ok(())
}

fn extension_identity_matches(identity: &Value, id: &str) -> bool {
    let Some((namespace, name)) = id.split_once('.') else {
        return false;
    };
    identity["namespace"]
        .as_str()
        .or_else(|| identity["publisher"].as_str())
        .is_some_and(|actual| actual.eq_ignore_ascii_case(namespace))
        && identity["name"]
            .as_str()
            .is_some_and(|actual| actual.eq_ignore_ascii_case(name))
}

fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("YzPzCode-Extensions")
        .connect_timeout(Duration::from_secs(60))
        .timeout(Duration::from_secs(600))
        .build()
        .context("Could not create extension download client")
}

fn retryable(error: &reqwest::Error) -> bool {
    error.is_connect()
        || error.is_timeout()
        || error.is_body()
        || error.status().is_some_and(|status| {
            status == reqwest::StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
        })
}

fn network_error(address: &str, error: reqwest::Error) -> anyhow::Error {
    let host = error
        .url()
        .and_then(|url| url.host_str().map(str::to_owned))
        .or_else(|| {
            url::Url::parse(address)
                .ok()
                .and_then(|url| url.host_str().map(str::to_owned))
        })
        .unwrap_or_else(|| "the download server".to_string());
    let advice = if error.is_connect() || error.is_timeout() {
        " Check your connection and VPN/firewall access to this host. If your network requires a proxy, set HTTPS_PROXY before starting YzPzCode."
    } else {
        ""
    };
    anyhow::Error::new(error).context(format!("Could not download from {host}.{advice}"))
}

async fn get(
    app: &AppHandle,
    id: &str,
    client: &reqwest::Client,
    address: &str,
    message: &str,
) -> Result<reqwest::Response> {
    let address = trusted_download(address)?;
    for attempt in 1..=DOWNLOAD_ATTEMPTS {
        let result = client
            .get(address.clone())
            .timeout(Duration::from_secs(90))
            .send()
            .await
            .and_then(|response| {
                // A missing platform package is expected for universal extensions.
                if response.status() == reqwest::StatusCode::NOT_FOUND {
                    Ok(response)
                } else {
                    response.error_for_status()
                }
            });
        match result {
            Ok(response) => return Ok(response),
            Err(error) if attempt < DOWNLOAD_ATTEMPTS && retryable(&error) => {
                progress(
                    app,
                    id,
                    "retrying",
                    &format!(
                        "{message} Retrying connection ({}/{DOWNLOAD_ATTEMPTS})…",
                        attempt + 1
                    ),
                    0,
                    None,
                );
                tokio::time::sleep(Duration::from_secs(u64::from(attempt))).await;
            }
            Err(error) => return Err(network_error(address.as_str(), error)),
        }
    }
    unreachable!("download attempts always return a response or error")
}

fn progress(
    app: &AppHandle,
    id: &str,
    stage: &str,
    message: &str,
    downloaded: u64,
    total: Option<u64>,
) {
    let _ = app.emit(
        "extension-install-progress",
        ExtensionProgress {
            extension_id: id.to_string(),
            stage: stage.to_string(),
            message: message.to_string(),
            downloaded_bytes: downloaded,
            total_bytes: total,
        },
    );
}

fn trusted_download(url: &str) -> Result<url::Url> {
    let parsed = url::Url::parse(url)?;
    if parsed.scheme() != "https"
        || !matches!(
            parsed.host_str(),
            Some("github.com" | "api.github.com" | "open-vsx.org")
        )
    {
        bail!("The registry returned an untrusted download address");
    }
    Ok(parsed)
}

async fn download(
    app: &AppHandle,
    id: &str,
    client: &reqwest::Client,
    url: &str,
    path: &Path,
    message: &str,
) -> Result<String> {
    let address = trusted_download(url)?;
    for attempt in 1..=DOWNLOAD_ATTEMPTS {
        let result = download_once(app, id, client, &address, path, message).await;
        match result {
            Ok(hash) => return Ok(hash),
            Err(error)
                if attempt < DOWNLOAD_ATTEMPTS
                    && error
                        .downcast_ref::<reqwest::Error>()
                        .is_some_and(retryable) =>
            {
                progress(
                    app,
                    id,
                    "retrying",
                    &format!(
                        "{message} Retrying download ({}/{DOWNLOAD_ATTEMPTS})…",
                        attempt + 1
                    ),
                    0,
                    None,
                );
                tokio::time::sleep(Duration::from_secs(u64::from(attempt))).await;
            }
            Err(error) => {
                return match error.downcast::<reqwest::Error>() {
                    Ok(error) => Err(network_error(url, error)),
                    Err(error) => Err(error),
                };
            }
        }
    }
    unreachable!("download attempts always return a hash or error")
}

async fn download_once(
    app: &AppHandle,
    id: &str,
    client: &reqwest::Client,
    address: &url::Url,
    path: &Path,
    message: &str,
) -> Result<String> {
    progress(app, id, "downloading", message, 0, None);
    let mut response = client
        .get(address.clone())
        .send()
        .await?
        .error_for_status()?;
    let total = response.content_length();
    if total.is_some_and(|size| size > MAX_DOWNLOAD) {
        bail!("Extension download exceeds the size limit");
    }
    let mut output = tokio::fs::File::create(path).await?;
    let mut hash = Sha256::new();
    let mut bytes = 0;
    let mut last_report = 0;
    use tokio::io::AsyncWriteExt;
    while let Some(chunk) = response.chunk().await? {
        bytes += chunk.len() as u64;
        if bytes > MAX_DOWNLOAD {
            bail!("Extension download exceeds the size limit");
        }
        output.write_all(&chunk).await?;
        hash.update(&chunk);
        if bytes - last_report >= 1024 * 1024 {
            progress(app, id, "downloading", message, bytes, total);
            last_report = bytes;
        }
    }
    output.flush().await?;
    progress(app, id, "downloading", message, bytes, total);
    Ok(format!("{:x}", hash.finalize()))
}

fn platform() -> Result<(&'static str, &'static str)> {
    let os = match std::env::consts::OS {
        "windows" => "win32",
        "macos" => "darwin",
        "linux" => "linux",
        _ => bail!("Extension panels are unavailable on this platform"),
    };
    let arch = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        _ => bail!("Extension panels need an x64 or ARM64 system"),
    };
    Ok((os, arch))
}

fn runtime_paths(directory: &Path) -> (PathBuf, PathBuf) {
    (
        directory.join(if cfg!(windows) { "node.exe" } else { "node" }),
        directory.join("out/server-main.js"),
    )
}

fn runtime_ready(directory: &Path) -> bool {
    let (node, server) = runtime_paths(directory);
    node.is_file() && server.is_file() && directory.join("yzpz-runtime.json").is_file()
}

fn host_workspace_path(path: &Path) -> Result<PathBuf> {
    let value = path
        .to_str()
        .context("Workspace path must be valid Unicode")?;
    #[cfg(windows)]
    {
        // Windows canonicalize() produces extended-length paths. VS Code's URI
        // conversion expects the usual drive/UNC form instead of the \\?\ prefix.
        if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
            return Ok(PathBuf::from(format!(r"\\{unc}")));
        }
        if let Some(drive) = value.strip_prefix(r"\\?\") {
            return Ok(PathBuf::from(drive));
        }
    }
    Ok(PathBuf::from(value))
}

fn panel_url(origin_id: &str, port: u16, token: &str) -> Result<url::Url> {
    check_uuid(origin_id)?;
    let mut url = url::Url::parse(&format!("http://panel-{origin_id}.localhost:{port}/"))?;
    url.query_pairs_mut().append_pair("tkn", token);
    Ok(url)
}

fn reserve_panel_origin(profile: &Path) -> Result<(PanelOrigin, TcpListener)> {
    let saved_path = profile.join("panel-origin.json");
    let previous = if saved_path.exists() {
        let origin: PanelOrigin = serde_json::from_slice(&fs::read(&saved_path)?)
            .context("The assistant's saved browser address is invalid")?;
        Some(origin)
    } else {
        // Reuse the last app-owned WebView2 origin on the first upgrade instead
        // of abandoning the browser state from the previous implementation.
        recover_panel_origin(profile)
    };
    let (origin, listener) = if let Some(origin) = previous {
        check_uuid(&origin.id)?;
        if origin.port == 0 {
            bail!("The assistant's saved browser port is invalid");
        }
        // Never silently choose another port: that would create a new browser
        // origin and discard the assistant's visible saved state again.
        let listener = TcpListener::bind(("127.0.0.1", origin.port)).context(
            "The assistant's saved local address is already in use. Close other YzPzCode instances and retry",
        )?;
        (origin, listener)
    } else {
        let listener = TcpListener::bind("127.0.0.1:0")?;
        let origin = PanelOrigin {
            id: Uuid::new_v4().to_string(),
            port: listener.local_addr()?.port(),
        };
        (origin, listener)
    };
    if !saved_path.exists() {
        fs::create_dir_all(profile)?;
        let temporary = profile.join("panel-origin.json.tmp");
        fs::write(&temporary, serde_json::to_vec(&origin)?)?;
        fs::rename(temporary, saved_path)?;
    }
    Ok((origin, listener))
}

fn recover_panel_origin(profile: &Path) -> Option<PanelOrigin> {
    // Read only this assistant's browser profile. Do not inspect or modify the
    // system browser, cookies, IndexedDB, or provider credentials.
    let history = profile.join("webview-data/EBWebView/Default/History");
    let connection = rusqlite::Connection::open_with_flags(
        history,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .ok()?;
    let mut query = connection
        .prepare("SELECT url FROM urls ORDER BY last_visit_time DESC LIMIT 32")
        .ok()?;
    let rows = query.query_map([], |row| row.get::<_, String>(0)).ok()?;
    for address in rows.flatten() {
        let Ok(url) = url::Url::parse(&address) else {
            continue;
        };
        if url.scheme() != "http"
            || url.path() != "/"
            || !url.username().is_empty()
            || url.password().is_some()
        {
            continue;
        }
        let Some(id) = url
            .host_str()
            .and_then(|host| host.strip_prefix("panel-"))
            .and_then(|host| host.strip_suffix(".localhost"))
        else {
            continue;
        };
        if check_uuid(id).is_err() {
            continue;
        }
        if let Some(port) = url.port().filter(|port| *port != 0) {
            return Some(PanelOrigin {
                id: id.to_string(),
                port,
            });
        }
    }
    None
}

fn extract_runtime(archive: &Path, target: &Path) -> Result<()> {
    fs::create_dir_all(target)?;
    let mut archive = tar::Archive::new(GzDecoder::new(File::open(archive)?));
    let mut size = 0u64;
    for item in archive.entries()? {
        let mut item = item?;
        let kind = item.header().entry_type();
        // Runtime entry points are regular files; refuse archive links and traversal.
        if !kind.is_file() && !kind.is_dir() {
            continue;
        }
        size = size
            .checked_add(item.header().size()?)
            .context("Invalid runtime archive size")?;
        if size > MAX_EXTRACTED {
            bail!("Runtime archive exceeds the size limit");
        }
        if !item.unpack_in(target)? {
            bail!("Runtime archive contains an unsafe path");
        }
    }
    // Some release archives wrap their contents in a top-level directory.
    let (node, server) = runtime_paths(target);
    if !node.is_file() || !server.is_file() {
        let nested = fs::read_dir(target)?
            .filter_map(|item| item.ok())
            .map(|item| item.path())
            .find(|path| {
                let (node, server) = runtime_paths(path);
                node.is_file() && server.is_file()
            });
        if let Some(nested) = nested {
            for item in fs::read_dir(&nested)? {
                let item = item?;
                fs::rename(item.path(), target.join(item.file_name()))?;
            }
            fs::remove_dir(nested)?;
        }
    }
    let (node, server) = runtime_paths(target);
    if !node.is_file() || !server.is_file() {
        bail!("The runtime archive is missing its executable or server");
    }
    Ok(())
}

async fn latest_metadata(app: &AppHandle, id: &str, client: &reqwest::Client) -> Result<Value> {
    let (namespace, name) = id.split_once('.').context("Invalid extension identifier")?;
    let (os, arch) = platform()?;
    let address = format!("https://open-vsx.org/api/{namespace}/{name}/{os}-{arch}/latest");
    let response = get(app, id, client, &address, "Finding the extension package…").await?;
    let metadata: Value = if response.status() == reqwest::StatusCode::NOT_FOUND {
        get(
            app,
            id,
            client,
            &format!("https://open-vsx.org/api/{namespace}/{name}/universal/latest"),
            "Finding the universal extension package…",
        )
        .await?
        .error_for_status()?
        .json()
        .await?
    } else {
        response.error_for_status()?.json().await?
    };
    if !extension_identity_matches(&metadata, id) {
        bail!("The registry returned a different extension");
    }
    let expected_platform = format!("{os}-{arch}");
    if metadata["targetPlatform"]
        .as_str()
        .is_some_and(|target| target != "universal" && target != expected_platform)
    {
        bail!("This extension package does not support this platform");
    }
    Ok(metadata)
}

impl ExtensionHostManager {
    pub fn catalog(&self, app: &AppHandle) -> Result<Vec<ExtensionInfo>> {
        let base = root(app)?;
        Ok(catalog_entries()
            .iter()
            .map(|entry| {
                let manifest = base.join("installed").join(&entry.id).join("package.json");
                let version = fs::read(manifest)
                    .ok()
                    .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
                    .and_then(|value| value["version"].as_str().map(str::to_string));
                ExtensionInfo {
                    id: entry.id.to_string(),
                    name: entry.name.to_string(),
                    publisher: entry.publisher.to_string(),
                    description: entry.description.to_string(),
                    installed_version: version,
                    registry_url: format!(
                        "https://open-vsx.org/extension/{}",
                        entry.id.replace('.', "/")
                    ),
                }
            })
            .collect())
    }

    async fn ensure_runtime(&self, app: &AppHandle, id: &str) -> Result<PathBuf> {
        let base = root(app)?;
        let target = base.join("runtime");
        if runtime_ready(&target) {
            return Ok(target);
        }
        let client = client()?;
        // Resolve from bundled release metadata instead of requiring api.github.com
        // for every first install. URLs and SHA-256 digests come from the official release.
        let release: RuntimeRelease = serde_json::from_str(include_str!("runtime-release.json"))
            .context("Invalid bundled runtime release metadata")?;
        let (os, arch) = platform()?;
        let target_platform = format!("{os}-{arch}");
        let asset = release
            .assets
            .iter()
            .find(|asset| asset.platform == target_platform)
            .context("A graphical extension runtime is not available for this platform")?;
        fs::create_dir_all(&base)?;
        let staging = StagingDirectory::new(&base, "runtime")?;
        let archive = staging.0.join("runtime.tar.gz");
        let actual_hash = download(
            app,
            id,
            &client,
            &asset.url,
            &archive,
            "Downloading the graphical extension runtime…",
        )
        .await?;
        if !actual_hash.eq_ignore_ascii_case(&asset.sha256) {
            bail!("Runtime checksum verification failed");
        }
        progress(
            app,
            id,
            "extracting",
            "Preparing the graphical extension runtime…",
            0,
            None,
        );
        let extracted = staging.0.join("extracted");
        let archive_copy = archive.clone();
        let extracted_copy = extracted.clone();
        tokio::task::spawn_blocking(move || extract_runtime(&archive_copy, &extracted_copy))
            .await??;
        fs::write(
            extracted.join("yzpz-runtime.json"),
            serde_json::to_vec(&json!({ "version": release.version, "sha256": actual_hash }))?,
        )?;
        if target.exists() {
            fs::remove_dir_all(&target)?;
        }
        fs::rename(&extracted, &target)?;
        Ok(target)
    }

    /// Latest Open VSX version for each installed extension. Entries that cannot
    /// be checked (offline, not published) are omitted rather than failing.
    pub async fn latest_versions(&self, app: &AppHandle) -> Result<HashMap<String, String>> {
        let installed: Vec<String> = self
            .catalog(app)?
            .into_iter()
            .filter(|extension| extension.installed_version.is_some())
            .map(|extension| extension.id)
            .collect();
        let client = client()?;
        let mut versions = HashMap::new();
        for id in installed {
            if let Ok(metadata) = latest_metadata(app, &id, &client).await {
                if let Some(version) = metadata["version"].as_str() {
                    versions.insert(id, version.to_string());
                }
            }
        }
        Ok(versions)
    }

    pub async fn install(&self, app: &AppHandle, id: &str) -> Result<()> {
        entry(id)?;
        let _operation = self.operation.lock().await;
        let result = self.install_inner(app, id).await;
        if let Err(error) = &result {
            progress(app, id, "failed", &format!("{error:#}"), 0, None);
        }
        result
    }

    async fn install_inner(&self, app: &AppHandle, id: &str) -> Result<()> {
        self.ensure_runtime(app, id).await?;
        let base = root(app)?;
        let client = client()?;
        progress(
            app,
            id,
            "resolving",
            "Finding the latest extension package…",
            0,
            None,
        );
        let metadata = latest_metadata(app, id, &client).await?;
        let version = metadata["version"]
            .as_str()
            .context("Extension is unavailable in Open VSX")?;
        let url = metadata["files"]["download"]
            .as_str()
            .context("The extension has no downloadable package")?;
        let staging = StagingDirectory::new(&base, "package")?;
        let archive = staging.0.join("extension.vsix");
        let digest = download(
            app,
            id,
            &client,
            url,
            &archive,
            "Downloading the extension…",
        )
        .await?;
        let expected_hash = if let Some(address) = metadata["files"]["sha256"].as_str() {
            let checksum = get(
                app,
                id,
                &client,
                address,
                "Checking the extension checksum…",
            )
            .await?
            .error_for_status()?
            .text()
            .await?;
            checksum
                .split_whitespace()
                .find(|word| word.len() == 64 && word.chars().all(|c| c.is_ascii_hexdigit()))
                .context("Invalid extension checksum")?
                .to_string()
        } else {
            metadata["sha256"]
                .as_str()
                .context("The extension registry has no SHA-256 checksum")?
                .to_string()
        };
        if !digest.eq_ignore_ascii_case(&expected_hash) {
            bail!("Extension checksum verification failed");
        }
        progress(
            app,
            id,
            "extracting",
            "Installing the extension panel…",
            0,
            None,
        );
        let extracted = staging.0.join("extension");
        let archive_copy = archive.clone();
        let extracted_copy = extracted.clone();
        let id_copy = id.to_string();
        let version_copy = version.to_string();
        tokio::task::spawn_blocking(move || {
            extract_extension(&archive_copy, &extracted_copy, &id_copy, &version_copy)
        })
        .await??;
        let installed = base.join("installed");
        fs::create_dir_all(&installed)?;
        let target = installed.join(id);
        if target.exists() {
            // Update: keep the old copy until the new one is in place. Open panels
            // run from per-workspace copies, so they are unaffected.
            let backup = installed.join(format!("{id}.old-{}", Uuid::new_v4()));
            fs::rename(&target, &backup)?;
            if let Err(error) = fs::rename(&extracted, &target) {
                let _ = fs::rename(&backup, &target);
                return Err(error.into());
            }
            let _ = fs::remove_dir_all(backup);
        } else {
            fs::rename(extracted, target)?;
        }
        progress(
            app,
            id,
            "completed",
            "Extension installed. Open it in the terminal workspace.",
            0,
            None,
        );
        Ok(())
    }

    pub async fn start_panel(
        &self,
        app: &AppHandle,
        panel_id: &str,
        workspace_id: &str,
        workspace_path: &str,
        extension_id: &str,
    ) -> Result<()> {
        entry(extension_id)?;
        check_uuid(panel_id)?;
        check_uuid(workspace_id)?;
        let path =
            fs::canonicalize(workspace_path).context("Workspace directory does not exist")?;
        if !path.is_dir() {
            bail!("Extension panels need a workspace directory");
        }
        self.pending
            .lock()
            .map_err(|_| anyhow::anyhow!("Extension host lock failed"))?
            .insert(panel_id.to_string(), workspace_id.to_string());
        let result = self
            .start_panel_inner(app, panel_id, workspace_id, &path, extension_id)
            .await;
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(panel_id);
        }
        result
    }

    async fn start_panel_inner(
        &self,
        app: &AppHandle,
        panel_id: &str,
        workspace_id: &str,
        path: &Path,
        extension_id: &str,
    ) -> Result<()> {
        let _operation = self.operation.lock().await;
        if self
            .closed
            .lock()
            .map_err(|_| anyhow::anyhow!("Extension host lock failed"))?
            .contains(panel_id)
        {
            bail!("This extension panel was closed");
        }
        if self
            .hosts
            .lock()
            .map_err(|_| anyhow::anyhow!("Extension host lock failed"))?
            .contains_key(panel_id)
        {
            return Ok(());
        }
        let base = root(app)?;
        let runtime = base.join("runtime");
        if !runtime_ready(&runtime) {
            bail!("Install an extension to download its graphical runtime first");
        }
        let installed = base.join("installed").join(extension_id);
        if !installed.join("package.json").is_file() {
            bail!("Install this extension before opening it");
        }
        let profile = base.join("profiles").join(workspace_id).join(extension_id);
        let extensions = profile.join("extensions");
        fs::create_dir_all(&extensions)?;
        let version = read_manifest(&installed)?["version"]
            .as_str()
            .context("Invalid extension version")?
            .to_string();
        let destination = extensions.join(format!("{extension_id}-{version}"));
        if !destination.exists() {
            let staging = StagingDirectory::new(&profile, "copy")?;
            let source = installed.clone();
            let target = staging.0.join("extension");
            let staged = target.clone();
            tokio::task::spawn_blocking(move || copy_directory(&source, &target)).await??;
            fs::rename(staged, &destination)?;
        }
        write_bridge(&extensions)?;
        let host_path = host_workspace_path(path)?;
        let manifest = read_manifest(&installed)?;
        let panel_config = json!({
            "id": extension_id,
            "name": entry(extension_id)?.name,
            "hasNodeEntry": manifest["main"].is_string(),
            "containers": manifest["contributes"]["viewsContainers"],
            "views": manifest["contributes"]["views"],
        });
        let preload = profile.join("host-preload.cjs");
        fs::write(&preload, include_str!("host-preload.cjs"))?;
        fs::write(
            profile.join("panel-chrome.js"),
            include_str!("panel-chrome.js"),
        )?;
        fs::write(
            profile.join("panel-storage.cjs"),
            include_str!("panel-storage.cjs"),
        )?;
        fs::write(
            profile.join("panel-workbench.mjs"),
            include_str!("panel-workbench.mjs"),
        )?;
        fs::write(
            profile.join("panel-tunnel.cjs"),
            include_str!("panel-tunnel.cjs"),
        )?;
        fs::write(
            profile.join("antigravity-compat.cjs"),
            include_str!("antigravity-compat.cjs"),
        )?;
        fs::write(
            profile.join("provider-access.cjs"),
            include_str!("provider-access.cjs"),
        )?;
        let state_file = profile.join("panel-state.json");
        fs::write(&state_file, br#"{"stage":"starting"}"#)?;
        fs::write(profile.join("panel-action.json"), b"{}")?;
        let user_data = profile.join("user-data");
        let settings_dir = user_data.join("data").join("Machine");
        fs::create_dir_all(&settings_dir)?;
        let settings_path = settings_dir.join("settings.json");
        if !settings_path.exists() {
            fs::write(
                settings_path,
                serde_json::to_vec_pretty(&json!({
                    "workbench.startupEditor": "none", "workbench.activityBar.location": "hidden",
                    "workbench.statusBar.visible": false, "window.commandCenter": false,
                    "workbench.tips.enabled": false, "telemetry.telemetryLevel": "off",
                    "security.workspace.trust.enabled": true,
                    "extensions.autoCheckUpdates": false, "extensions.autoUpdate": false
                }))?,
            )?;
        }
        let (origin, listener) = reserve_panel_origin(&profile)?;
        let port = origin.port;
        let token = Uuid::new_v4().simple().to_string();
        // Cookies are scoped by hostname, not TCP port. Separate pane origins
        // prevent one host's vscode-tkn cookie from authenticating another.
        let hostname = format!("panel-{}.localhost", origin.id);
        let (node, server) = runtime_paths(&runtime);
        let log = File::create(profile.join("host.log"))?;
        let mut command = Command::new(node);
        command
            .arg("--require")
            .arg(&preload)
            .arg(server)
            .args([
                "--start-server",
                "--host",
                "127.0.0.1",
                "--port",
                &port.to_string(),
                "--connection-token",
                &token,
            ])
            .arg("--accept-server-license-terms")
            .arg("--server-data-dir")
            .arg(&user_data)
            .arg("--extensions-dir")
            .arg(&extensions)
            .arg("--default-folder")
            .arg(&host_path)
            .env("YZPZ_EXTENSION_ID", extension_id)
            .env("YZPZ_PANEL_CONFIG", serde_json::to_string(&panel_config)?)
            .env("YZPZ_PANEL_STATE_FILE", &state_file)
            .env("YZPZ_PANEL_ACTION_FILE", profile.join("panel-action.json"))
            .env("YZPZ_PANEL_HOSTNAME", &hostname)
            // The adapter serves this file at reh-web's original static URL,
            // retaining relative worker and resource resolution. Its embedding
            // URI resolver directs Antigravity's local iframe through the proxy,
            // which records resource failures and browser startup error locations
            // before the backend's scoped script bundle executes, protecting
            // the native window.ipc binding from generated provider names.
            .env(
                "YZPZ_RUNTIME_WORKBENCH_FILE",
                runtime.join("out/vs/code/browser/workbench/workbench.js"),
            )
            .env("YZPZ_WORKSPACE_PATH", &host_path)
            .env(
                "YZPZ_WORKSPACE_TRUST_FILE",
                base.join("profiles")
                    .join(workspace_id)
                    .join("workspace-trust.json"),
            )
            .env(
                "YZPZ_PANEL_STORAGE_FILE",
                profile.join("workbench-state.json"),
            )
            .env(
                "YZPZ_WEBVIEW_ASSETS_DIR",
                runtime.join("out/vs/workbench/contrib/webview/browser/pre"),
            )
            .current_dir(&host_path)
            .stdin(Stdio::null())
            .stdout(log.try_clone()?)
            .stderr(log);
        configure_process(&mut command);
        if let Some(main) = manifest["main"].as_str() {
            command.env("YZPZ_EXTENSION_ENTRY", destination.join(main));
        }
        if extension_id.eq_ignore_ascii_case("Google.google-antigravity") {
            let main = manifest["main"]
                .as_str()
                .context("Antigravity has no Node entry point")?;
            // The server's --require argument also reaches its extension-host
            // fork through execArgv. A synchronous loader hook covers imports.
            // The adapter changes only this exact verified entry in memory;
            // vendor archives, installed files, and saved provider data stay intact.
            command.env("YZPZ_ANTIGRAVITY_ENTRY", destination.join(main));
        }
        let url = panel_url(&origin.id, port, &token)?;
        // The host supplies a vscode-remote folder URI via --default-folder.
        // A file:// URI in the browser's `folder` query is interpreted as a
        // literal remote path, causing "Workspace does not exist" on every OS.
        let mut probe_url = url.clone();
        // Native browsers resolve *.localhost internally. The readiness client
        // connects to the bound IP directly without relying on system DNS.
        probe_url.set_host(Some("127.0.0.1"))?;
        // Chromium adds the origin and LevelDB manifest name below its data
        // directory. Nested workspace/assistant profiles exceed MAX_PATH on
        // Windows, making IndexedDB fall back to memory storage.
        #[cfg(windows)]
        let browser_data = {
            let browser_root = app.path().app_local_data_dir()?.join("webviews");
            let legacy_browser_data = profile.join("webview-data");
            let origin_id = origin.id.clone();
            tokio::task::spawn_blocking(move || {
                prepare_browser_data(&browser_root, &origin_id, &legacy_browser_data)
            })
            .await??
        };
        #[cfg(not(windows))]
        let browser_data = profile.join("webview-data");
        drop(listener);
        let mut host = HostProcess {
            child: command
                .spawn()
                .context("Could not start the graphical extension host")?,
            url,
            browser_data,
            workspace_id: workspace_id.to_string(),
        };
        let probe = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(2))
            .build()?;
        let mut ready = false;
        for _ in 0..120 {
            if self
                .closed
                .lock()
                .map_err(|_| anyhow::anyhow!("Extension host lock failed"))?
                .contains(panel_id)
            {
                bail!("This extension panel was closed");
            }
            if host.child.try_wait()?.is_some() {
                bail!(
                    "The extension runtime stopped during startup. See {}",
                    profile.join("host.log").display()
                );
            }
            if probe
                .get(probe_url.clone())
                .send()
                .await
                .is_ok_and(|response| {
                    response.status().is_success() || response.status().is_redirection()
                })
            {
                ready = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
        if !ready {
            bail!(
                "The graphical extension runtime did not become ready. See {}",
                profile.join("host.log").display()
            );
        }
        let closed = self
            .closed
            .lock()
            .map_err(|_| anyhow::anyhow!("Extension host lock failed"))?;
        if closed.contains(panel_id) {
            bail!("This extension panel was closed");
        }
        self.hosts
            .lock()
            .map_err(|_| anyhow::anyhow!("Extension host lock failed"))?
            .insert(panel_id.to_string(), host);
        Ok(())
    }

    pub fn sync_panel(
        &self,
        app: &AppHandle,
        panel_id: &str,
        bounds: PanelBounds,
        visible: bool,
    ) -> Result<()> {
        check_uuid(panel_id)?;
        let closed = self
            .closed
            .lock()
            .map_err(|_| anyhow::anyhow!("Extension host lock failed"))?;
        if closed.contains(panel_id) {
            return Ok(());
        }
        if [bounds.x, bounds.y, bounds.width, bounds.height]
            .iter()
            .any(|value| !value.is_finite())
        {
            bail!("Invalid extension panel bounds");
        }
        let label = format!("extension-panel-{panel_id}");
        let existing = app.get_webview(&label);
        if !visible || bounds.width < 1.0 || bounds.height < 1.0 {
            if let Some(webview) = existing {
                webview.hide()?;
            }
            return Ok(());
        }
        let (url, browser_data) = {
            let hosts = self
                .hosts
                .lock()
                .map_err(|_| anyhow::anyhow!("Extension host lock failed"))?;
            let host = hosts
                .get(panel_id)
                .context("The extension host is not running")?;
            (host.url.clone(), host.browser_data.clone())
        };
        let webview = if let Some(webview) = existing {
            webview
        } else {
            let window = app
                .get_window("main")
                .context("Main window is unavailable")?;
            let popup_app = app.clone();
            let builder = tauri::webview::WebviewBuilder::new(&label, WebviewUrl::External(url))
                .data_directory(browser_data)
                .accept_first_mouse(true)
                .on_new_window(move |url, _| {
                    if matches!(url.scheme(), "http" | "https") {
                        use tauri_plugin_opener::OpenerExt;
                        let _ = popup_app.opener().open_url(url.as_str(), None::<&str>);
                    }
                    tauri::webview::NewWindowResponse::Deny
                });
            window.add_child(
                builder,
                LogicalPosition::new(bounds.x, bounds.y),
                LogicalSize::new(bounds.width, bounds.height),
            )?
        };
        webview.set_auto_resize(false)?;
        webview.set_position(LogicalPosition::new(bounds.x.max(0.0), bounds.y.max(0.0)))?;
        webview.set_size(LogicalSize::new(bounds.width, bounds.height))?;
        webview.show()?;
        Ok(())
    }

    pub fn close_panel(&self, app: &AppHandle, panel_id: &str) -> Result<()> {
        check_uuid(panel_id)?;
        self.closed
            .lock()
            .map_err(|_| anyhow::anyhow!("Extension host lock failed"))?
            .insert(panel_id.to_string());
        if let Some(webview) = app.get_webview(&format!("extension-panel-{panel_id}")) {
            webview.close()?;
        }
        let removed = self
            .hosts
            .lock()
            .map_err(|_| anyhow::anyhow!("Extension host lock failed"))?
            .remove(panel_id);
        drop(removed);
        Ok(())
    }

    pub fn close_workspace(&self, app: &AppHandle, workspace_id: &str) -> Result<()> {
        let mut ids: Vec<String> = self
            .hosts
            .lock()
            .map_err(|_| anyhow::anyhow!("Extension host lock failed"))?
            .iter()
            .filter(|(_, host)| host.workspace_id == workspace_id)
            .map(|(id, _)| id.clone())
            .collect();
        ids.extend(
            self.pending
                .lock()
                .map_err(|_| anyhow::anyhow!("Extension host lock failed"))?
                .iter()
                .filter(|(_, workspace)| *workspace == workspace_id)
                .map(|(id, _)| id.clone()),
        );
        for id in ids {
            self.close_panel(app, &id)?;
        }
        Ok(())
    }

    pub fn shutdown(&self) {
        if let (Ok(pending), Ok(mut closed)) = (self.pending.lock(), self.closed.lock()) {
            closed.extend(pending.keys().cloned());
        }
        if let Ok(mut hosts) = self.hosts.lock() {
            let removed = std::mem::take(&mut *hosts);
            drop(hosts);
            drop(removed);
        }
    }
}

fn read_manifest(path: &Path) -> Result<Value> {
    serde_json::from_slice(&fs::read(path.join("package.json"))?)
        .context("Invalid extension manifest")
}

fn extract_extension(archive: &Path, target: &Path, id: &str, version: &str) -> Result<()> {
    let mut archive = zip::ZipArchive::new(File::open(archive)?)?;
    let mut total = 0u64;
    for index in 0..archive.len() {
        let mut item = archive.by_index(index)?;
        let path = item
            .enclosed_name()
            .context("Extension archive contains an unsafe path")?;
        let Ok(relative) = path.strip_prefix("extension") else {
            continue;
        };
        if relative.as_os_str().is_empty() {
            continue;
        }
        if item
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            bail!("Extension archive contains an unsupported symbolic link");
        }
        total = total
            .checked_add(item.size())
            .context("Invalid extension archive size")?;
        if total > MAX_EXTRACTED {
            bail!("Extension archive exceeds the size limit");
        }
        let destination = target.join(relative);
        if item.is_dir() {
            fs::create_dir_all(destination)?;
        } else {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)?;
            }
            std::io::copy(&mut item, &mut File::create(&destination)?)?;
            #[cfg(unix)]
            if let Some(mode) = item.unix_mode() {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(destination, fs::Permissions::from_mode(mode & 0o777))?;
            }
        }
    }
    let manifest = read_manifest(target)?;
    if !extension_identity_matches(&manifest, id) || manifest["version"].as_str() != Some(version) {
        bail!("The downloaded package does not match this extension");
    }
    Ok(())
}

fn copy_directory(source: &Path, target: &Path) -> Result<()> {
    fs::create_dir_all(target)?;
    for item in fs::read_dir(source)? {
        let item = item?;
        let destination = target.join(item.file_name());
        if item.file_type()?.is_dir() {
            copy_directory(&item.path(), &destination)?;
        } else {
            fs::copy(item.path(), destination)?;
        }
    }
    Ok(())
}

#[cfg(windows)]
fn prepare_browser_data(root: &Path, origin_id: &str, legacy: &Path) -> Result<PathBuf> {
    let id = Uuid::parse_str(origin_id).context("Invalid assistant browser profile ID")?;
    let destination = root.join(id.simple().to_string());
    if !destination.exists() {
        fs::create_dir_all(root)?;
        if legacy.is_dir() {
            let staging = StagingDirectory::new(root, "profile")?;
            let copy = staging.0.join("data");
            copy_directory(legacy, &copy).context(
                "Could not migrate the assistant browser profile. Close the app completely and reopen it",
            )?;
            fs::rename(copy, &destination)?;
        } else {
            fs::create_dir(&destination)?;
        }
    }
    Ok(destination)
}

fn write_bridge(extensions: &Path) -> Result<()> {
    let bridge = extensions.join(format!("{BRIDGE_ID}-1.0.0"));
    fs::create_dir_all(&bridge)?;
    fs::write(
        bridge.join("package.json"),
        serde_json::to_vec_pretty(&json!({
            "name": "panel-bridge", "publisher": "yzpzcode", "version": "1.0.0",
            "engines": { "vscode": "^1.85.0" }, "main": "./extension.js",
            "capabilities": { "untrustedWorkspaces": { "supported": true } },
            "extensionKind": ["workspace"], "activationEvents": ["onStartupFinished"]
        }))?,
    )?;
    fs::write(bridge.join("extension.js"), include_str!("panel-bridge.js"))?;
    fs::write(
        bridge.join("provider-access.cjs"),
        include_str!("provider-access.cjs"),
    )?;
    fs::write(
        bridge.join("panel-storage.cjs"),
        include_str!("panel-storage.cjs"),
    )?;
    Ok(())
}

fn configure_process(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
}

fn stop_process_tree(child: &mut Child) {
    if matches!(child.try_wait(), Ok(Some(_))) {
        return;
    }
    #[cfg(windows)]
    {
        let mut command = Command::new("taskkill");
        command
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        configure_process(&mut command);
        let _ = command.status();
    }
    #[cfg(unix)]
    {
        let _ = Command::new("kill")
            .args(["-TERM", "--", &format!("-{}", child.id())])
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn package(name: &str, manifest: &str) -> (StagingDirectory, PathBuf) {
        let temp = StagingDirectory::new(&std::env::temp_dir(), "yzpz-extension-test")
            .expect("test directory");
        let archive = temp.0.join("package.vsix");
        let mut zip = zip::ZipWriter::new(File::create(&archive).expect("test archive"));
        zip.start_file(name, SimpleFileOptions::default())
            .expect("archive entry");
        zip.write_all(manifest.as_bytes()).expect("entry content");
        zip.finish().expect("finish archive");
        (temp, archive)
    }

    #[test]
    fn registry_and_package_identity_allow_case_differences_for_every_assistant() {
        for extension in catalog_entries() {
            let (namespace, name) = extension.id.split_once('.').expect("catalog identifier");
            for (namespace, name) in [
                (namespace.to_ascii_lowercase(), name.to_ascii_lowercase()),
                (namespace.to_ascii_uppercase(), name.to_ascii_uppercase()),
            ] {
                assert!(
                    extension_identity_matches(
                        &json!({ "namespace": namespace, "name": name }),
                        &extension.id
                    ),
                    "registry identity for {}",
                    extension.id
                );
                assert!(
                    extension_identity_matches(
                        &json!({ "publisher": namespace, "name": name }),
                        &extension.id
                    ),
                    "package identity for {}",
                    extension.id
                );
            }
        }
        // The registry currently returns Kilo's name in lowercase.
        assert!(extension_identity_matches(
            &json!({ "namespace": "kilocode", "name": "kilo-code" }),
            "kilocode.Kilo-Code"
        ));
    }

    #[test]
    fn identity_checks_still_reject_wrong_or_missing_publishers_and_names() {
        for identity in [
            json!({ "namespace": "different", "name": "kilo-code" }),
            json!({ "namespace": "kilocode", "name": "different" }),
            json!({ "publisher": "different", "name": "kilo-code" }),
            json!({ "publisher": "kilocode", "name": "different" }),
            json!({ "namespace": "kilocode" }),
            json!({ "name": "kilo-code" }),
            json!({ "namespace": null, "name": 42 }),
        ] {
            assert!(!extension_identity_matches(&identity, "kilocode.Kilo-Code"));
        }
        assert!(!extension_identity_matches(&json!({}), "invalid"));
    }

    #[test]
    fn workspace_host_path_preserves_spaces_and_unicode() {
        let directory = StagingDirectory::new(&std::env::temp_dir(), "yzpz-workspace-path")
            .expect("test directory");
        let workspace = directory.0.join("project with spaces العربية");
        fs::create_dir(&workspace).expect("workspace directory");
        let canonical = fs::canonicalize(&workspace).expect("canonical workspace");
        let host_path = host_workspace_path(&canonical).expect("host path");
        assert!(host_path.is_dir());
        assert_eq!(
            fs::canonicalize(host_path).expect("canonical host path"),
            canonical
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_workspace_paths_drop_extended_prefixes() {
        assert_eq!(
            host_workspace_path(Path::new(r"\\?\C:\project with spaces")).expect("drive path"),
            PathBuf::from(r"C:\project with spaces")
        );
        assert_eq!(
            host_workspace_path(Path::new(r"\\?\UNC\server\share\project")).expect("UNC path"),
            PathBuf::from(r"\\server\share\project")
        );
    }

    #[test]
    fn pane_origins_isolate_authentication_even_on_the_same_port() {
        let first = panel_url("51974528-0538-4267-8bde-bec7a1ea59b3", 49990, "first-token")
            .expect("first pane URL");
        let second = panel_url(
            "61974528-0538-4267-8bde-bec7a1ea59b3",
            49990,
            "second-token",
        )
        .expect("second pane URL");
        assert_ne!(first.host_str(), second.host_str());
        assert!(first.host_str().expect("hostname").ends_with(".localhost"));
        assert_eq!(
            first
                .query_pairs()
                .find(|(key, _)| key == "tkn")
                .map(|(_, value)| value.to_string()),
            Some("first-token".to_string())
        );
        assert!(panel_url("invalid/hostname", 49990, "token").is_err());
    }

    #[test]
    fn browser_origin_survives_closing_reopening_and_authentication_rotation() {
        let profile = StagingDirectory::new(&std::env::temp_dir(), "yzpz-panel-origin")
            .expect("profile directory");
        let (first, reservation) = reserve_panel_origin(&profile.0).expect("first opening");
        let first_url = panel_url(&first.id, first.port, "old-token").expect("first URL");
        drop(reservation);
        let (reopened, reservation) = reserve_panel_origin(&profile.0).expect("reopened pane");
        let reopened_url = panel_url(&reopened.id, reopened.port, "new-token").expect("new URL");
        assert_eq!(first_url.origin(), reopened_url.origin());
        assert_ne!(first_url.query(), reopened_url.query());
        // The same vscode-remote authority and path preserve workspace trust
        // and workspace storage keys, while the browser keeps IndexedDB data.
        assert_eq!(first_url.host_str(), reopened_url.host_str());
        assert_eq!(first.port, reopened.port);
        drop(reservation);
    }

    #[cfg(windows)]
    #[test]
    fn windows_browser_profiles_use_short_persistent_paths_and_keep_legacy_data() {
        let temporary = StagingDirectory::new(&std::env::temp_dir(), "yzpz-browser-migration")
            .expect("test directory");
        let root = temporary.0.join("webviews");
        let legacy = temporary.0.join("legacy/EBWebView/Default");
        fs::create_dir_all(&legacy).expect("legacy browser folder");
        fs::write(legacy.join("Preferences"), "existing browser state").expect("legacy state");
        let id = "51974528-0538-4267-8bde-bec7a1ea59b3";
        let destination = prepare_browser_data(&root, id, &temporary.0.join("legacy"))
            .expect("migrated browser profile");
        assert_eq!(destination, root.join("51974528053842678bdebec7a1ea59b3"));
        let preferences = destination.join("EBWebView/Default/Preferences");
        assert_eq!(
            fs::read_to_string(&preferences).expect("copied state"),
            "existing browser state"
        );
        assert!(
            legacy.join("Preferences").exists(),
            "legacy data is retained"
        );
        fs::write(&preferences, "updated state").expect("updated browser state");
        prepare_browser_data(&root, id, &temporary.0.join("legacy")).expect("reopened profile");
        assert_eq!(
            fs::read_to_string(&preferences).expect("reopened state"),
            "updated state"
        );
        assert!(prepare_browser_data(&root, "../invalid", &temporary.0.join("legacy")).is_err());
        let other = prepare_browser_data(
            &root,
            "00e3bd07-46f7-4389-bb29-648ef472becd",
            &temporary.0.join("missing"),
        )
        .expect("separate assistant browser profile");
        assert_ne!(destination, other);
        let indexed_db_file =
            PathBuf::from(r"C:\Users\nasee\AppData\Local\com.yzpzcode.desktop\webviews")
                .join("51974528053842678bdebec7a1ea59b3")
                .join("EBWebView/Default/IndexedDB")
                .join(format!("http_panel-{id}.localhost_65535.indexeddb.leveldb"))
                .join("MANIFEST-000001");
        assert!(indexed_db_file.as_os_str().len() < 260);
    }

    #[test]
    fn assistant_profiles_have_distinct_persistent_browser_origins() {
        let profiles = StagingDirectory::new(&std::env::temp_dir(), "yzpz-panel-origins")
            .expect("profiles directory");
        let (kilo, _kilo_reservation) =
            reserve_panel_origin(&profiles.0.join("kilo")).expect("Kilo origin");
        let (codex, _codex_reservation) =
            reserve_panel_origin(&profiles.0.join("codex")).expect("Codex origin");
        assert_ne!(kilo.id, codex.id);
        assert_ne!(
            panel_url(&kilo.id, kilo.port, "token")
                .expect("Kilo URL")
                .origin(),
            panel_url(&codex.id, codex.port, "token")
                .expect("Codex URL")
                .origin()
        );
    }

    #[test]
    fn busy_saved_port_does_not_reset_an_assistants_browser_origin() {
        let profile = StagingDirectory::new(&std::env::temp_dir(), "yzpz-panel-port")
            .expect("profile directory");
        let (_, reservation) = reserve_panel_origin(&profile.0).expect("saved origin");
        let before = fs::read(profile.0.join("panel-origin.json")).expect("saved record");
        assert!(reserve_panel_origin(&profile.0).is_err());
        assert_eq!(
            fs::read(profile.0.join("panel-origin.json")).expect("unchanged record"),
            before
        );
        drop(reservation);
    }

    #[test]
    fn invalid_saved_origins_are_rejected_without_changing_profiles() {
        let profile = StagingDirectory::new(&std::env::temp_dir(), "yzpz-panel-origin-invalid")
            .expect("profile directory");
        for invalid in [
            r#"{"id":"external-host.example","port":49990}"#,
            r#"{"id":"51974528-0538-4267-8bde-bec7a1ea59b3","port":0}"#,
        ] {
            fs::write(profile.0.join("panel-origin.json"), invalid).expect("invalid record");
            assert!(reserve_panel_origin(&profile.0).is_err());
        }
    }

    #[test]
    fn upgrade_recovers_only_the_assistants_previous_local_browser_origin() {
        let profile = StagingDirectory::new(&std::env::temp_dir(), "yzpz-panel-origin-upgrade")
            .expect("profile directory");
        let history = profile.0.join("webview-data/EBWebView/Default/History");
        fs::create_dir_all(history.parent().expect("browser directory"))
            .expect("browser directory");
        let connection = rusqlite::Connection::open(&history).expect("test history");
        connection
            .execute("CREATE TABLE urls (url TEXT, last_visit_time INTEGER)", [])
            .expect("history table");
        let reservation = TcpListener::bind("127.0.0.1:0").expect("previous port");
        let port = reservation.local_addr().expect("previous address").port();
        let id = "51974528-0538-4267-8bde-bec7a1ea59b3";
        for (address, time) in [
            (
                format!("http://panel-{id}.localhost:{port}/?tkn=previous-token"),
                1,
            ),
            ("https://provider.example/sign-in".to_string(), 2),
            (
                format!(
                    "http://{}.panel-{id}.localhost:{port}/yzpz-webview/index.html",
                    "0".repeat(52)
                ),
                3,
            ),
            (format!("http://panel-external.example:{port}/"), 4),
        ] {
            connection
                .execute(
                    "INSERT INTO urls VALUES (?1, ?2)",
                    rusqlite::params![address, time],
                )
                .expect("history entry");
        }
        drop(connection);
        drop(reservation);
        let (migrated, _reservation) = reserve_panel_origin(&profile.0).expect("upgraded origin");
        assert_eq!(migrated.id, id);
        assert_eq!(migrated.port, port);
        let record =
            fs::read_to_string(profile.0.join("panel-origin.json")).expect("origin record");
        assert!(!record.contains("previous-token"));
    }

    #[test]
    fn extension_package_must_match_catalog_identity_and_version() {
        let (temp, archive) = package(
            "extension/package.json",
            r#"{"publisher":"kilocode","name":"kilo-code","version":"1.0.0"}"#,
        );
        assert!(extract_extension(
            &archive,
            &temp.0.join("valid"),
            "kilocode.Kilo-Code",
            "1.0.0"
        )
        .is_ok());
        assert!(extract_extension(
            &archive,
            &temp.0.join("wrong-publisher"),
            "openai.chatgpt",
            "1.0.0"
        )
        .is_err());
        assert!(extract_extension(
            &archive,
            &temp.0.join("wrong-version"),
            "kilocode.Kilo-Code",
            "2.0.0"
        )
        .is_err());
    }

    #[test]
    fn extension_package_cannot_escape_install_directory() {
        let (temp, archive) = package("extension/../../outside.json", "{}");
        assert!(extract_extension(
            &archive,
            &temp.0.join("installed"),
            "openai.chatgpt",
            "1.0.0"
        )
        .is_err());
        assert!(!temp.0.join("outside.json").exists());
    }

    #[test]
    fn unsupported_extensions_and_untrusted_downloads_are_rejected() {
        assert!(entry("untrusted.extension").is_err());
        assert!(entry("../openai.chatgpt").is_err());
        assert!(entry("Google.geminicodeassist").is_err());
        assert!(entry("Google.google-antigravity").is_ok());
        assert!(trusted_download("https://open-vsx.org/api/openai/chatgpt").is_ok());
        assert!(trusted_download("http://open-vsx.org/package.vsix").is_err());
        assert!(trusted_download("https://open-vsx.org.example.org/package.vsix").is_err());
        assert!(trusted_download("file:///C:/package.vsix").is_err());
    }

    #[test]
    fn failed_installation_staging_is_removed() {
        let temp = StagingDirectory::new(&std::env::temp_dir(), "yzpz-extension-test")
            .expect("test directory");
        let path = temp.0.clone();
        fs::write(path.join("partial.vsix"), "partial download").expect("partial file");
        drop(temp);
        assert!(!path.exists());
    }
}
