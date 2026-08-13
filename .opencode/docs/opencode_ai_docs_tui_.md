# TUI | OpenCode

> Source: https://opencode.ai/docs/tui/
> Cached: 2026-08-12T22:56:33.173Z

---

# TUI

Using the OpenCode terminal user interface.

       OpenCode provides an interactive terminal interface or TUI for working on your projects with an LLM.

Running OpenCode starts the TUI for the current directory.

Terminal window```
opencode
```

Or you can start it for a specific working directory.

Terminal window```
opencode /path/to/project
```

Once you’re in the TUI, you can prompt it with a message.

```
Give me a quick summary of the codebase.
```

## [File references](#file-references)

You can reference files in your messages using `@`. This does a fuzzy file search in the current working directory.

Tip

You can also use `@` to reference files in your messages.

```
How is auth handled in @packages/functions/src/api/index.ts?
```

The content of the file is added to the conversation automatically.

Configured [references](/docs/references) also appear in `@` autocomplete. Type `@alias` to add the reference root as context, or type `@alias/` to autocomplete files inside that reference.

```
Compare our setup with @docs/README.md
```

## [Bash commands](#bash-commands)

Start a message with `!` to run a shell command.

```
!ls -la
```

The output of the command is added to the conversation as a tool result.

## [Commands](#commands)

When using the OpenCode TUI, you can type `/` followed by a command name to quickly execute actions. For example:

```
/help
```

Most commands also have keyboard shortcuts using `ctrl+x` as the default leader key. [Learn more](/docs/keybinds).

Here are all available slash commands:

### [connect](#connect)

Add a provider to OpenCode. Allows you to select from available providers and add their API keys.

```
/connect
```

### [compact](#compact)

Compact the current session. *Alias*: `/summarize`

```
/compact
```

**Keybind:** `ctrl+x c`

### [details](#details)

Toggle tool execution details.

```
/details
```

### [editor](#editor)

Open external editor for composing messages. Uses the editor set in your `EDITOR` environment variable. [Learn more](#editor-setup).

```
/editor
```

**Keybind:** `ctrl+x e`

### [exit](#exit)

Exit OpenCode. *Aliases*: `/quit`, `/q`

```
/exit
```

**Keybind:** `ctrl+x q`

### [export](#export)

Export current conversation to Markdown and open in your default editor. Uses the editor set in your `EDITOR` environment variable. [Learn more](#editor-setup).

```
/export
```

**Keybind:** `ctrl+x x`

### [help](#help)

Show the help dialog.

```
/help
```

### [init](#init)

Guided setup for creating or updating `AGENTS.md`. [Learn more](/docs/rules).

```
/init
```

### [models](#models)

List available models.

```
/models
```

**Keybind:** `ctrl+x m`

### [new](#new)

Start a new session. *Alias*: `/clear`

```
/new
```

**Keybind:** `ctrl+x n`

### [redo](#redo)

Redo a previously undone message. Only available after using `/undo`.

Tip

Any file changes will also be restored.

Internally, this uses Git to manage the file changes. So your project needs to
be a Git repository.
```
/redo
```

**Keybind:** `ctrl+x r`

### [sessions](#sessions)

List and switch between sessions. *Aliases*: `/resume`, `/continue`

```
/sessions
```

**Keybind:** `ctrl+x l`

### [share](#share)

Share current session. [Learn more](/docs/share).

```
/share
```

### [themes](#themes)

List available themes.

```
/themes
```

**Keybind:** `ctrl+x t`

### [thinking](#thinking)

Toggle the visibility of thinking/reasoning blocks in the conversation. When enabled, you can see the model’s reasoning process for models that support extended thinking.

Note

This command only controls whether thinking blocks are **displayed** - it does not enable or disable the model’s reasoning capabilities. To toggle actual reasoning capabilities, use `ctrl+t` to cycle through model variants.

```
/thinking
```

### [undo](#undo)

Undo last message in the conversation. Removes the most recent user message, all subsequent responses, and any file changes.

Tip

Any file changes made will also be reverted.

Internally, this uses Git to manage the file changes. So your project needs to
be a Git repository.
```
/undo
```

**Keybind:** `ctrl+x u`

### [unshare](#unshare)

Unshare current session. [Learn more](/docs/share#un-sharing).

```
/unshare
```

## [Editor setup](#editor-setup)

Both the `/editor` and `/export` commands use the editor specified in your `EDITOR` environment variable.

  
 -  [  Linux/macOS ](#tab-panel-4) 
-  [  Windows (CMD) ](#tab-panel-5) 
-  [  Windows (PowerShell) ](#tab-panel-6) 
 
   Terminal window```
# Example for nano or vimexport EDITOR=nanoexport EDITOR=vim
# For GUI editors, VS Code, Cursor, VSCodium, Windsurf, Zed, etc.# include --waitexport EDITOR="code --wait"
```

To make it permanent, add this to your shell profile;
`~/.bashrc`, `~/.zshrc`, etc.  Terminal window```
set EDITOR=notepad
# For GUI editors, VS Code, Cursor, VSCodium, Windsurf, Zed, etc.# include --waitset EDITOR=code --wait
```

To make it permanent, use **System Properties** > Environment
Variables.  Terminal window```
$env:EDITOR = "notepad"
# For GUI editors, VS Code, Cursor, VSCodium, Windsurf, Zed, etc.# include --wait$env:EDITOR = "code --wait"
```

To make it permanent, add this to your PowerShell profile.

     
Popular editor options include:

- `code` - Visual Studio Code

- `cursor` - Cursor

- `windsurf` - Windsurf

- `nvim` - Neovim editor

- `vim` - Vim editor

- `nano` - Nano editor

- `notepad` - Windows Notepad

- `subl` - Sublime Text

Note

Some editors like VS Code need to be started with the `--wait` flag.

Some editors need command-line arguments to run in blocking mode. The `--wait` flag makes the editor process block until closed.

## [Configure](#configure)

You can customize TUI behavior through `tui.json` (or `tui.jsonc`).

tui.json```
{  "$schema": "https://opencode.ai/tui.json",  "theme": "opencode",  "leader_timeout": 2000,  "keybinds": {    "leader": "ctrl+x",    "command_list": "ctrl+p"  },  "scroll_speed": 3,  "scroll_acceleration": {    "enabled": false  },  "diff_style": "auto",  "cursor": {    "style": "block",    "blinking": true  },  "mouse": true,  "attention": {    "enabled": true,    "notifications": true,    "sound": true,    "volume": 0.4,    "sound_pack": "opencode.default",    "sounds": {      "error": "./sounds/error.mp3"    }  }}
```

This is separate from `opencode.json`, which configures server/runtime behavior.

`keybinds` is merged with built-in defaults, so you only need to configure the shortcuts you want to change.

### [Options](#options)

- `theme` - Sets your UI theme. [Learn more](/docs/themes).

- `keybinds` - Customizes keyboard shortcuts. [Learn more](/docs/keybinds).

- `leader_timeout` - Controls how long OpenCode waits after the leader key. Defaults to `2000`.

- `scroll_acceleration.enabled` - Enable macOS-style scroll acceleration for smooth, natural scrolling. When enabled, scroll speed increases with rapid scrolling gestures and stays precise for slower movements. **This setting takes precedence over `scroll_speed` and overrides it when enabled.**

- `scroll_speed` - Controls how fast the TUI scrolls when using scroll commands (minimum: `0.001`, supports decimal values). Defaults to `3`. **Note: This is ignored if `scroll_acceleration.enabled` is set to `true`.**

- `diff_style` - Controls diff rendering. `"auto"` adapts to terminal width, `"stacked"` always shows a single-column layout.

- `cursor` - Controls the terminal cursor in TUI input fields. `style` defaults to `"block"`, can be `"underline"`, `"line"`, or `"default"`; `blinking` defaults to `true`. When `style` is `"default"`, the terminal default cursor is restored, so `blinking` has no effect.

- `mouse` - Enable or disable mouse capture in the TUI (default: `true`). When disabled, the terminal’s native mouse selection/scrolling behavior is preserved.

- `attention` - Configures TUI desktop notifications and sounds. Disabled by default.

Use `OPENCODE_TUI_CONFIG` to load a custom TUI config path.

### [Attention](#attention)

The TUI can request attention for questions, permissions, session errors, and completed sessions. Enable it with `attention.enabled`; built-in events play sounds when triggered, and non-subagent events request desktop notifications only when the terminal is blurred.

- `enabled` - Enable all attention notifications and sounds. Defaults to `false`.

- `notifications` - Allow terminal-mediated desktop notifications when attention is enabled. Defaults to `true`.

- `sound` - Allow attention sounds when attention is enabled. Defaults to `true`.

- `volume` - Default sound volume from `0` to `1`. Defaults to `0.4`.

- `sound_pack` - Sound pack ID to use. Defaults to `opencode.default`.

- `sounds` - Override sound files for `default`, `question`, `permission`, `error`, `done`, or `subagent_done`. Paths can be absolute, `file://` URLs, or relative to `tui.json`.

## [Customization](#customization)

You can customize various aspects of the TUI view using the command palette (`ctrl+p`). These settings persist across restarts.

#### [Username display](#username-display)

Toggle whether your username appears in chat messages. Access this through:

- Command palette: Search for “username” or “hide username”

- The setting persists automatically and will be remembered across TUI sessions

  [Edit page](https://github.com/anomalyco/opencode/edit/dev/packages/web/src/content/docs/tui.mdx)[Found a bug? Open an issue](https://github.com/anomalyco/opencode/issues/new)[Join our Discord community](https://opencode.ai/discord)  Select language   EnglishالعربيةBosanskiDanskDeutschEspañolFrançaisItaliano日本語한국어Norsk BokmålPolskiPortuguês (Brasil)РусскийไทยTürkçe简体中文繁體中文       &copy; [Anomaly](https://anoma.ly)

Last updated: Aug 12, 2026