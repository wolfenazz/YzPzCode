# GitHub - cjpais/Handy: A free, open source, and extensible speech-to-text application that works completely offline. · GitHub

> Source: https://github.com/cjpais/handy
> Cached: 2026-09-27T13:30:29.536Z

---

# Handy

[](#handy)
[](https://discord.com/invite/WVBeWsNXK4)

**A free, open source, and extensible speech-to-text application that works completely offline.**

Handy is a cross-platform desktop application that provides simple, privacy-focused speech transcription. Press a shortcut, speak, and have your words appear in any text field. This happens on your own computer without sending any information to the cloud.

## Why Handy?

[](#why-handy)
Handy was created to fill the gap for a truly open source, extensible speech-to-text tool. As stated on [handy.computer](https://handy.computer):

- **Free**: Accessibility tooling belongs in everyone's hands, not behind a paywall

- **Open Source**: Together we can build further. Extend Handy for yourself and contribute to something bigger

- **Private**: Your voice stays on your computer. Get transcriptions without sending audio to the cloud

- **Simple**: One tool, one job. Transcribe what you say and put it into a text box

## How It Works

[](#how-it-works)

- **Press** a configurable keyboard shortcut: hold it to record and release to stop, or tap it to toggle recording on and off (Hold-only and Toggle-only modes are also available)

- **Speak** your words while the shortcut is active

- **Release** and Handy processes your speech using Whisper

- **Get** your transcribed text pasted directly into whatever app you're using

The process is entirely local:

- Silence is filtered using VAD (Voice Activity Detection) with Silero

Transcription uses your choice of models:

- **Whisper models** (Small/Medium/Turbo/Large) with GPU acceleration when available

- **Parakeet V3** - CPU-optimized model with excellent performance and automatic language detection

- Works on Windows, macOS, and Linux

## Quick Start

[](#quick-start)
### Installation

[](#installation)

Download the latest release from the [releases page](https://github.com/cjpais/Handy/releases) or the [website](https://handy.computer)

- **macOS**: Also available via [Homebrew cask](https://formulae.brew.sh/cask/handy): `brew install --cask handy`

**Windows**: Also available via [winget](https://github.com/microsoft/winget-pkgs): `winget install cjpais.Handy` 

**Note:** The Homebrew cask and winget package are not maintained by the Handy developers.
**Debian/Ubuntu**: Install the downloaded `.deb` with APT so required dependencies are installed automatically:
sudo apt install ./Handy_*.deb
Do not use `dpkg -i` unless the dependencies are already installed. If you already used it, run `sudo apt --fix-broken install`.

- Install the application

- Launch Handy and grant necessary system permissions (microphone, accessibility)

- Configure your preferred keyboard shortcuts in Settings

- Start transcribing!

### Development Setup

[](#development-setup)
For detailed build instructions including platform-specific requirements, see [BUILD.md](/cjpais/Handy/blob/main/BUILD.md).

## Sponsors

[](#sponsors)

  We're grateful for the support of our sponsors who help make Handy possible:
  

  
    
  
        
  
    
  
        
  
    
  
        
  
    
  

## Integrations

[](#integrations)
[](https://www.raycast.com/mattiacolombomc/handy)

Control Handy from [Raycast](https://www.raycast.com) — start/stop recording, browse transcript history, manage dictionary, switch models and languages.

[Source](https://github.com/mattiacolombomc/raycast-handy) · by [@mattiacolombomc](https://github.com/mattiacolombomc)

### Debug Mode

[](#debug-mode)
Handy includes an advanced debug mode for development and troubleshooting. Access it by pressing:

- **macOS**: `Cmd+Shift+D`

- **Windows/Linux**: `Ctrl+Shift+D`

### CLI Parameters

[](#cli-parameters)
Handy supports command-line flags for controlling a running instance and customizing startup behavior. These work on all platforms (macOS, Windows, Linux). Largely this is a beta feature.

**Remote control flags** (sent to an already-running instance via the single-instance plugin):

handy --toggle-transcription    # Toggle recording on/off
handy --toggle-post-process     # Toggle recording with post-processing on/off
handy --cancel                  # Cancel the current operation
**Startup flags:**

handy --start-hidden            # Start without showing the main window
handy --no-tray                 # Start without the system tray icon
handy --debug                   # Enable debug mode with verbose logging
handy --help                    # Show all available flags
Flags can be combined for autostart scenarios:

handy --start-hidden --no-tray
> 
**macOS tip:** When Handy is installed as an app bundle, invoke the binary directly:

/Applications/Handy.app/Contents/MacOS/Handy --toggle-transcription

## Known Issues & Current Limitations

[](#known-issues--current-limitations)
This project is actively being developed and has some [known issues](https://github.com/cjpais/Handy/issues). We believe in transparency about the current state:

### Bluetooth Headset Microphones (macOS)

[](#bluetooth-headset-microphones-macos)
Using a Bluetooth headset microphone on macOS may temporarily reduce playback quality or volume while recording because Bluetooth switches to bidirectional audio. Keep your headphones as the output device and select your Mac's built-in or an external microphone in Handy to avoid this.

### fn and Globe Key Shortcuts (macOS)

[](#fn-and-globe-key-shortcuts-macos)
Shortcuts that include the `fn` (Globe) key **only work on Apple keyboards** — your Mac's built-in keyboard or an Apple external keyboard. They will never trigger on a third-party keyboard, even while it is connected to the same Mac.

This is a hardware limitation rather than a Handy bug. `fn` is not part of the standard USB HID keyboard specification: Apple reports it through a vendor-specific usage that macOS honors only from Apple devices, while third-party keyboards handle their `Fn` key entirely in firmware and send nothing to the computer. There is no event for Handy to listen for.

If you switch between a MacBook keyboard and an external one, pick a shortcut built from standard modifiers (`ctrl`, `option`, `shift`, `command`) or a regular key instead.

### Linux Notes

[](#linux-notes)
**Text Input Tools:**

For reliable text input on Linux, install the appropriate tool for your display server:

Display Server
Recommended Tool
Install Command

X11
`xdotool`
`sudo apt install xdotool`

Wayland
`wtype`
`sudo apt install wtype`

Both
`dotool`
`sudo apt install dotool` (requires `input` group)

- **X11**: Install `xdotool` for both direct typing and clipboard paste shortcuts

- **Ubuntu 26.04**: Has Wayland display server by default. `wtype` does not work, you need to install `ydotool` and configure systemd as described [here](https://github.com/cjpais/Handy/pull/557#issuecomment-3781249267).

- **Wayland**: Install `wtype` (preferred) or `dotool` for text input to work correctly

- **dotool setup**: Requires adding your user to the `input` group: `sudo usermod -aG input $USER` (then log out and back in)

Without these tools, Handy falls back to enigo which may have limited compatibility, especially on Wayland.

**Wayland Support (Linux):**

- Limited support for Wayland display server

- Requires [`wtype`](https://github.com/atx/wtype) or [`dotool`](https://sr.ht/~geb/dotool/) for text input to work correctly (see [Linux Notes](#linux-notes) below for installation)

**Other Notes:**

**Runtime library dependency (`libgtk-layer-shell.so.0`)**:

Handy links `gtk-layer-shell` on Linux. If startup fails with `error while loading shared libraries: libgtk-layer-shell.so.0`, install the runtime package for your distro:

Distro
Package to install
Example command

Ubuntu/Debian
`libgtk-layer-shell0`
`sudo apt install libgtk-layer-shell0`

Fedora/RHEL
`gtk-layer-shell`
`sudo dnf install gtk-layer-shell`

Arch Linux
`gtk-layer-shell`
`sudo pacman -S gtk-layer-shell`

For building from source on Ubuntu/Debian, you may also need `libgtk-layer-shell-dev`.

The recording overlay is disabled by default on Linux (`Overlay Position: None`) because certain compositors treat it as the active window. When the overlay is visible it can steal focus, which prevents Handy from pasting back into the application that triggered transcription. If you enable the overlay anyway, be aware that clipboard-based pasting might fail or end up in the wrong window.

If you are having trouble with the app, running with the environment variable `WEBKIT_DISABLE_DMABUF_RENDERER=1` may help

If Handy fails to start reliably on Linux, see [Troubleshooting → Linux Startup Crashes or Instability](#linux-startup-crashes-or-instability).

**Global keyboard shortcuts (Wayland):** On Wayland, system-level shortcuts must be configured through your desktop environment or window manager. Use the [CLI flags](#cli-parameters) as the command for your custom shortcut.

**GNOME:**

- Open **Settings > Keyboard > Keyboard Shortcuts > Custom Shortcuts**

- Click the **+** button to add a new shortcut

- Set the **Name** to `Toggle Handy Transcription`

- Set the **Command** to `handy --toggle-transcription`

- Click **Set Shortcut** and press your desired key combination (e.g., `Super+O`)

**KDE Plasma:**

- Open **System Settings > Shortcuts > Custom Shortcuts**

- Click **Edit > New > Global Shortcut > Command/URL**

- Name it `Toggle Handy Transcription`

- In the **Trigger** tab, set your desired key combination

- In the **Action** tab, set the command to `handy --toggle-transcription`

**Sway / i3:**

Add to your config file (`~/.config/sway/config` or `~/.config/i3/config`):

bindsym $mod+o exec handy --toggle-transcription
**Hyprland:**

Add to your config file (`~/.config/hypr/hyprland.conf`):

bind = $mainMod, O, exec, handy --toggle-transcription

You can also trigger Handy externally via Unix signals or the CLI flags, which lets Wayland window managers or other hotkey daemons keep ownership of keybindings:

Action
Trigger

Toggle transcription
`pkill -USR2 -n handy` or `handy --toggle-transcription`

Toggle transcription with post-processing
`handy --toggle-post-process`

Example Sway config:

bindsym $mod+o exec pkill -USR2 -n handy
bindsym $mod+p exec handy --toggle-post-process
`pkill` here simply delivers the signal—it does not terminate the process.

> 
**Behavior change:** older releases also accepted `SIGUSR1` for toggling transcription with post-processing. WebKitGTK — the webview engine embedded in Handy on Linux — uses SIGUSR1 internally to coordinate JavaScript garbage collection, so listening for it caused phantom recordings and interrupted dictations every few minutes ([#1660](https://github.com/cjpais/Handy/issues/1660)). Handy no longer listens for SIGUSR1 on Linux; the post-processing toggle is still available via `handy --toggle-post-process`. **Remove any `pkill -USR1` bindings**: the signal is now delivered straight to WebKit's internal handler and can crash the app.

**Overlay & Pasting Issues (Linux):**

- The recording overlay window can interfere with pasting transcribed text into target applications on Linux (X11)

- **Solution:** Open **Settings > Advanced** and set **"Overlay Position"** to **"None"** to disable the overlay

- Enable **"Audio Feedback"** (also in Advanced) if you still want audible confirmation of recording state

- Users who upgrade from older versions or import settings from other platforms may need to manually apply this change

## Verify Release Signatures

[](#verify-release-signatures)
Handy release artifacts are signed with Tauri's updater signature format. The public key is stored in [`src-tauri/tauri.conf.json`](/cjpais/Handy/blob/main/src-tauri/tauri.conf.json) under `plugins.updater.pubkey`.

To verify a release manually, set `ARTIFACT` to the filename you downloaded, save the `pubkey` value from `src-tauri/tauri.conf.json` to `handy.pub.b64`, then decode the public key and matching `.sig` file from base64 and verify the artifact with `minisign`:

# Replace with the file you downloaded
ARTIFACT="Handy_0.8.1_amd64.AppImage"

python3 - "$ARTIFACT" <<'PY'
import base64, pathlib, sys

artifact = sys.argv[1]

pub = pathlib.Path("handy.pub.b64").read_text().strip()
pathlib.Path("handy.pub").write_bytes(base64.b64decode(pub))

sig = pathlib.Path(f"{artifact}.sig").read_text().strip()
pathlib.Path(f"{artifact}.minisig").write_bytes(base64.b64decode(sig))
PY

minisign -Vm "$ARTIFACT" \
  -p handy.pub \
  -x "$ARTIFACT.minisig"
On success, `minisign` prints:

```
Signature and comment signature verified

```

Do not use `gpg` for these `.sig` files.

## Troubleshooting

[](#troubleshooting)
### Previous Clipboard Content Is Pasted Instead of the Transcription

[](#previous-clipboard-content-is-pasted-instead-of-the-transcription)
If the transcription is correct in **History** but Handy inserts text you copied earlier, see [issue #502](https://github.com/cjpais/Handy/issues/502). With the standard clipboard paste method, Handy restores your previous clipboard after a fixed delay. Under load, the receiving application may read the clipboard only after that restoration.

- Open Handy's settings window and press `Cmd+Shift+D` (macOS) or `Ctrl+Shift+D` (Windows/Linux) to reveal **Debug**.

- On **macOS and Windows**, try **Reliable Paste (Beta)** in Debug with a clipboard paste method selected. It uses clipboard read notifications to delay restoration instead of relying on the standard fixed delay. Test it in the application where the problem occurs; it is still experimental.

- If Reliable Paste is disabled or unavailable, increase **Paste Delay (After)** in Debug and test again. This controls the wait before restoring your previous clipboard. **Paste Delay (Before)** controls the wait before sending the paste keystroke and addresses a different part of the operation. These delay settings apply to the standard paste path, not Reliable Paste.

If the problem persists, add your Handy version, operating system, receiving application, paste method, Reliable Paste setting, and before/after delays to the existing issue. Redact private dictated text before sharing logs.

### Manual Model Installation (For Proxy Users or Network Restrictions)

[](#manual-model-installation-for-proxy-users-or-network-restrictions)
If you're behind a proxy, firewall, or in a restricted network environment where Handy cannot download models automatically, you can manually download and install them. The URLs are publicly accessible from any browser.

#### Step 1: Find Your App Data Directory

[](#step-1-find-your-app-data-directory)

- Open Handy settings

- Navigate to the **About** section

Copy the "App Data Directory" path shown there, or use the shortcuts:

- **macOS**: `Cmd+Shift+D` to open debug menu

- **Windows/Linux**: `Ctrl+Shift+D` to open debug menu

The typical paths are:

- **macOS**: `~/Library/Application Support/com.pais.handy/`

- **Windows**: `C:\Users\{username}\AppData\Roaming\com.pais.handy\`

- **Linux**: `~/.co

... [Content truncated]