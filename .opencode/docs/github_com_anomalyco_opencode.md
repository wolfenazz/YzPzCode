# GitHub - anomalyco/opencode: The open source coding agent. · GitHub

> Source: https://github.com/anomalyco/opencode
> Cached: 2026-08-14T14:49:48.210Z

---

The open source AI coding agent.

  [](https://opencode.ai/discord)
  [](https://www.npmjs.com/package/opencode-ai)
  [](https://github.com/anomalyco/opencode/actions/workflows/publish.yml)

  [English](/anomalyco/opencode/blob/dev/README.md) |
  [简体中文](/anomalyco/opencode/blob/dev/README.zh.md) |
  [繁體中文](/anomalyco/opencode/blob/dev/README.zht.md) |
  [한국어](/anomalyco/opencode/blob/dev/README.ko.md) |
  [Deutsch](/anomalyco/opencode/blob/dev/README.de.md) |
  [Español](/anomalyco/opencode/blob/dev/README.es.md) |
  [Français](/anomalyco/opencode/blob/dev/README.fr.md) |
  [Italiano](/anomalyco/opencode/blob/dev/README.it.md) |
  [Dansk](/anomalyco/opencode/blob/dev/README.da.md) |
  [日本語](/anomalyco/opencode/blob/dev/README.ja.md) |
  [Polski](/anomalyco/opencode/blob/dev/README.pl.md) |
  [Русский](/anomalyco/opencode/blob/dev/README.ru.md) |
  [Bosanski](/anomalyco/opencode/blob/dev/README.bs.md) |
  [العربية](/anomalyco/opencode/blob/dev/README.ar.md) |
  [Norsk](/anomalyco/opencode/blob/dev/README.no.md) |
  [Português (Brasil)](/anomalyco/opencode/blob/dev/README.br.md) |
  [ไทย](/anomalyco/opencode/blob/dev/README.th.md) |
  [Türkçe](/anomalyco/opencode/blob/dev/README.tr.md) |
  [Українська](/anomalyco/opencode/blob/dev/README.uk.md) |
  [বাংলা](/anomalyco/opencode/blob/dev/README.bn.md) |
  [Ελληνικά](/anomalyco/opencode/blob/dev/README.gr.md) |
  [Tiếng Việt](/anomalyco/opencode/blob/dev/README.vi.md)

[](https://opencode.ai)

### Installation

[](#installation)
# YOLO
curl -fsSL https://opencode.ai/install | bash

# Package managers
npm i -g opencode-ai@latest        # or bun/pnpm/yarn
scoop install opencode             # Windows
choco install opencode             # Windows
brew install anomalyco/tap/opencode # macOS and Linux (recommended, always up to date)
brew install opencode              # macOS and Linux (official brew formula, updated less)
sudo pacman -S opencode            # Arch Linux (Stable)
paru -S opencode-bin               # Arch Linux (Latest from AUR)
mise use -g opencode               # Any OS
nix run nixpkgs#opencode           # or github:anomalyco/opencode for latest dev branch
Tip

Remove versions older than 0.1.x before installing.

### Desktop App (BETA)

[](#desktop-app-beta)
OpenCode is also available as a desktop application. Download directly from the [releases page](https://github.com/anomalyco/opencode/releases) or [opencode.ai/download](https://opencode.ai/download).

Platform
Download

macOS (Apple Silicon)
`opencode-desktop-mac-arm64.dmg`

macOS (Intel)
`opencode-desktop-mac-x64.dmg`

Windows
`opencode-desktop-windows-x64.exe`

Linux
`.deb`, `.rpm`, or `.AppImage`

# macOS (Homebrew)
brew install --cask opencode-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/opencode-desktop
#### Installation Directory

[](#installation-directory)
The install script respects the following priority order for the installation path:

- `$OPENCODE_INSTALL_DIR` - Custom installation directory

- `$XDG_BIN_DIR` - XDG Base Directory Specification compliant path

- `$HOME/bin` - Standard user binary directory (if it exists or can be created)

- `$HOME/.opencode/bin` - Default fallback

# Examples
OPENCODE_INSTALL_DIR=/usr/local/bin curl -fsSL https://opencode.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://opencode.ai/install | bash
### Agents

[](#agents)
OpenCode includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work

**plan** - Read-only agent for analysis and code exploration

- Denies file edits by default

- Asks permission before running bash commands

- Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.
Learn more about [agents](https://opencode.ai/docs/agents).

### Documentation

[](#documentation)
For more info on how to configure OpenCode, [**head over to our docs**](https://opencode.ai/docs).

### Contributing

[](#contributing)
If you're interested in contributing to OpenCode, please read our [contributing docs](/anomalyco/opencode/blob/dev/CONTRIBUTING.md) before submitting a pull request.

### Building on OpenCode

[](#building-on-opencode)
If you are working on a project that's related to OpenCode and is using "opencode" as part of its name, for example "opencode-dashboard" or "opencode-mobile", please add a note to your README to clarify that it is not built by the OpenCode team and is not affiliated with us in any way.

**Join our community** [Discord](https://discord.gg/opencode) | [X.com](https://x.com/opencode)