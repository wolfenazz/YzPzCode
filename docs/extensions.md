# Graphical workspace extensions

The Extensions button sits immediately after Explorer in the workspace header.
`Ctrl+Shift+X` opens the catalog. Install an assistant and choose Open to add its
original graphical extension panel to the terminal grid. Different assistants
can run alongside shell and CLI terminals. Panels support dragging, resizing,
focus layouts, workspace switching, and closing.

## Runtime and installation

The catalog contains Kilo Code, Cline, OpenAI Codex (`openai.chatgpt`), Claude
Code, Continue, Google Antigravity, Amazon Q Developer, Tabby, Windsurf Plugin,
and Mistral Vibe. Packages come from Open VSX. An extension's availability and behavior depend
on its published package, operating system, and compatibility with VSCodium.
This is a curated catalog; arbitrary Marketplace or VSIX installation is not
exposed.

Gemini Code Assist was removed from the catalog after Google ended consumer
access on June 18, 2026. Existing Gemini panes are removed from restored layouts;
their downloaded packages and provider data are retained. Google's deprecation
notice leaves Standard and Enterprise subscriptions unaffected:
https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals.

Antigravity uses the official `Google.google-antigravity` Open VSX package and
the original `antigravity.panel` webview. Google documents the extension at
https://antigravity.google/docs/ide/extensions/vscode/ and links its official
Marketplace listing. Open VSX version 1.5.0 publishes a universal Node package,
which the installer selects when a platform-specific package is absent. The
extension installs its own `agy` backend and requires Google account sign-in.
Package identity, checksum, contributed-view compatibility, and local backend
startup were inspected; OAuth callbacks and provider requests still need desktop
validation in this host.

Antigravity's backend serves its UI with a `frame-ancestors` policy that permits
plain localhost but excludes the pane's isolated `.localhost` origins. Its
native `asExternalUri` call now uses the runtime's explicit embedding URI
resolver alongside a host-owned tunnel provider for loopback services. A tunnel
factory alone does not register an external URI resolver in reh-web. Each
service gets a dedicated proxy listener on `127.0.0.1`; only the
current pane and its webview origins are added to the backend's embedding policy.
Other CSP directives, CSRF credentials, and foreign origins are retained. HTTP
requests, root-relative assets, redirects, and WebSocket traffic are forwarded
to the original loopback port. Creating tunnels requires the authenticated host
UI, the Antigravity catalog ID, and native saved workspace trust. The verified
runtime archive and installed vendor package are not modified. The host adapts
the runtime's embedding options when serving its original workbench module URL,
including reh-web's `/stable-<commit>/static/` prefix;
a query parameter refreshes an earlier cached module. Other assistants keep
their existing runtime behavior.

Antigravity's proxy records startup resource status codes, WebSocket upgrade
results, browser error source locations, and whether the app root has rendered.
The diagnostic script is served by the app-owned proxy before the provider
bundle. It does not collect error messages, query strings, page text, prompts,
or provider state. Browser reports require the proxy's own origin and a bounded
JSON body. These records appear under `YzPzCode Antigravity startup` in `host.log`.
Panel documents request identity encoding so the hook also runs when the backend
normally gzips its HTML. Other assets retain compression, except the adapted
main script described below.

Antigravity's Closure bundle declares a global `ipc` function. Wry defines a
non-configurable `window.ipc` bridge in the native webview, so that declaration
causes a parse-time SyntaxError and an empty app root. The proxy scopes `/main.js`
inside a function called with `globalThis`, keeping generated names local while
retaining its original `this` value and explicit global exports. The adapted
script requests identity encoding and disables stale backend validators; its
document URL also refreshes older cached scripts. The native IPC binding and
provider permission restrictions are retained. Vendor files are unchanged.

The current Antigravity package stops backend startup after 15 seconds, which
can interrupt an already-listening server while it initializes saved state. An
app-owned Node preload raises that readiness deadline to 60 seconds and the
executable version probe to 15 seconds. It matches only the exact installed
Antigravity entry and known source signatures, adapting compilation in memory;
unrecognized package shapes retain their original behavior. The original HTTP
health check, version validation, failure handling, and saved data are retained.

The first installation downloads VSCodium's platform-specific `reh-web` runtime
from the pinned official GitHub release in `runtime-release.json`. The installer
uses bundled URLs and SHA-256 digests, so installation no longer requires a
successful request to GitHub's `releases/latest` API. The bundled Node runtime hosts the extensions;
no separate VS Code or Node installation is required. Runtime downloads are
checked against the bundled release's SHA-256 digest. VSIX extraction rejects unsafe paths
and verifies the package publisher, name, and version. Incomplete downloads are
removed, and progress and failures appear in the catalog. Connection timeouts,
interrupted transfers, HTTP 429, and server errors are retried up to three times.
Each transfer retry starts a fresh staging file. Connections allow 60 seconds;
package transfers allow ten minutes. Final errors identify the failed host.
Networks that require a proxy can set `HTTPS_PROXY` before launching the app.
Downloading still requires access to GitHub's release asset servers and Open VSX.

Registry and package identities are compared without regard to ASCII letter
case. For example, the catalog's `kilocode.Kilo-Code` matches Open VSX's
`kilocode.kilo-code`. A different publisher or extension name is rejected, and
package versions and SHA-256 checksums still require an exact match.

To update the runtime, refresh the platform URLs and SHA-256 digests in
`runtime-release.json` from the official VSCodium release assets. The catalog and
pane headers use bundled provider icons, including Continue, Amazon Q, and Tabby;
their rendering does not require a network request.

Each assistant runs in a local host bound to `127.0.0.1` with a random connection
token, and its graphical view appears in a native child webview. Each pane uses
its own persistent `panel-<uuid>.localhost:<port>` origin and browser data directory.
On Windows, browser data lives in the shorter local app data path
`webviews/<origin UUID without hyphens>/`. Keeping this directory outside the
nested workspace/assistant profile prevents Chromium's IndexedDB manifest paths
from exceeding Windows path limits. Existing browser data is copied there once;
the legacy profile is retained and an existing destination is never overwritten.
The origin UUID and port are saved in each workspace/assistant profile's
`panel-origin.json`; they do not change when its pane is closed, recreated, or
the app restarts. This keeps browser IndexedDB/local storage and the remote
workspace authority stable.
An upgrade can recover the previous address from that assistant's own WebView2
profile without modifying browser storage. Cookies are
scoped by hostname rather than port, so assistants must not share a `127.0.0.1`
browser origin on separate ports. Readiness checks still connect directly to
the loopback IP. A busy saved port reports an error instead of silently changing
the address and making saved state appear lost. Retry opening uses the authenticated entry URL to refresh the
host cookie instead of reloading an unauthenticated root page. The folder is
passed with `--default-folder`, allowing the server to supply a `vscode-remote`
workspace URI. Windows extended path prefixes are normalized before launch.
`--server-data-dir` keeps each assistant's data and logs in its own profile.

An app-owned Node preload adapts the workbench HTML before startup; the verified
runtime archive remains intact. It selects the workspace Node host for assistants
with a Node entry point. Webview bootstrap files use hashed subdomains of each
pane's `.localhost` hostname for iframe origins instead of `vscode-cdn.net`,
retaining VS Code's origin validation. The
public asset route serves only `index.html`, `fake.html`, and `service-worker.js`
from the runtime. Status and trust-review actions require the host's connection
token. The frame CSP allows local iframe origins while retaining the other
script, worker, and connection policies.

A small bridge waits for workspace trust, activates the assistant, and focuses
an available contributed view. A loading/error screen is shown until that view
has completed its iframe handshake. Only the selected assistant's part is
visible and expanded to fit the pane; Explorer, Welcome, editor, title bar,
activity bar, and status bar are
hidden. The assistant iframe's overlay is mounted outside the sidebar by the
runtime, so it receives explicit viewport bounds instead of depending on CSS
anchor support in the installed webview engine. The assistant webview is matched
to its owning view using the runtime's DOM owner or anchor metadata;
an editor webview from the same extension, such as a Getting Started page,
cannot replace the chat iframe. Requested anchor metadata is retained
even on engines that do not support CSS anchor layout. The original assistant webview
and its actions are retained. Rejected HTTP requests are recorded in `host.log`
without query strings, cookies, or tokens. Workspace trust review temporarily
shows the host's permissions editor. The first approval uses the runtime's
normal workspace trust review. Extension webviews cannot invoke
YzPzCode's application commands.

Extensions run with the user's OS privileges and can read and modify the opened
workspace through VS Code APIs. VS Code workspace trust remains enabled. Sign-in
and provider setup happen in the original assistant UI. Browser popups open in
the system browser. Extension dependencies on desktop-only features, custom
protocol callbacks, or proprietary VS Code services may limit compatibility.

## Persistence and lifecycle

Installed extensions and the runtime live in the app data directory under
`extensions/`. Each workspace and assistant has a separate persistent profile
for settings, sign-in, and extension state. Open panes and their order are saved
in the frontend store. Hosts start when their workspace becomes visible and stay
alive while changing views. Closing a pane or workspace stops its host process
tree. App exit stops remaining hosts. Reopening a pane retains its profile.

The browser workbench's committed IndexedDB changes are also saved atomically
to each assistant profile's `workbench-state.json`. This covers native workbench
setup and onboarding flags even when stopping the development process interrupts
browser shutdown. An app-owned startup module restores these values before
importing the original workbench module. On upgrade, existing browser values are
captured before subsequent changes are mirrored; saved tables are restored
including deletions. Unrelated provider browser databases are not mirrored.

The bridge records workspace trust only after VS Code reports the actual opened
folder as trusted. The approval lives in the workspace profile's
`workspace-trust.json`, shared by its assistants and matched against the folder
path. It is restored into the native trust database before startup. A new folder
still needs approval; merely pressing Review does not grant trust. Native
revocations are persisted and synchronized between open assistant panes. Importing
an older browser snapshot cannot revoke a newer approval from another pane.
These persistence paths apply to both development and production builds.

## Validation

Frontend: `node node_modules/typescript/bin/tsc --noEmit` from `app/`.
Backend: `cargo clippy -- -D warnings` and `cargo test extension_host::tests` from
`app/src-tauri/`.
Host adapter/bridge/presentation:
`node --test src/extension_host/host-preload.test.cjs src/extension_host/panel-bridge.test.cjs src/extension_host/panel-chrome.test.cjs src/extension_host/panel-storage.test.cjs src/extension_host/panel-tunnel.test.cjs`
from `app/src-tauri/`.

Identity regression checks cover every catalog entry with lowercase and uppercase
registry/package identities, plus wrong or missing publishers/names. Archive
checks cover package identity/version, unsafe paths, and cleanup on failure.
Workspace path checks include spaces, Unicode, and Windows drive/UNC prefixes.
Pane URL checks ensure separate cookie hostnames even on the same port.
Origin regression checks cover reopening, authentication-token rotation,
separate assistant profiles, busy ports, invalid records, and upgrade recovery
that excludes external and iframe addresses.
Windows browser profile checks cover short manifest paths, migration without
removing legacy data, retaining newer state on reopen, and per-assistant isolation.
The JavaScript tests use mocked extension APIs and DOM objects to check startup
configuration, trust handling, container fallback, assistant-only visibility,
iframe readiness, overlay sizing rules, and authenticated retry navigation.
Storage checks cover separate-process disk recovery, exact table restoration,
Unicode setup values, deleted onboarding keys, matching-folder approval,
revocation, and committed-transaction mirroring.
Bootstrap failures record their stage and error in `host.log` through an
authenticated, same-origin diagnostic route; URL query strings are redacted.
These checks do not execute the providers' actual extensions.

A desktop smoke check should install and open each catalog entry, complete its
provider sign-in, send a prompt, check a file change in Explorer, and verify that
panels survive workspace/view switches. Check modal visibility, drag/resize,
closing during startup, and process cleanup on app exit. Compile and archive
checks alone do not establish assistant compatibility.
