# CLI commands | Gemini CLI

> Source: https://www.geminicli.com/docs/reference/commands
> Cached: 2026-08-12T22:57:21.548Z

---

#  CLI commands 

       Copy as Markdown Copied!             Gemini CLI supports several built-in commands to help you manage your session,
customize the interface, and control its behavior. These commands are prefixed
with a forward slash (`/`), an at symbol (`@`), or an exclamation mark (`!`).
## Slash commands (`/`)

[Section titled “Slash commands (/)”](#slash-commands)
Slash commands provide meta-level control over the CLI itself.

### Built-in Commands

[Section titled “Built-in Commands”](#built-in-commands)
### `/about`

[Section titled “/about”](#about)

- **Description:** Show version info. Share this information when filing issues.

### `/agents`

[Section titled “/agents”](#agents)

- **Description:** Manage local and remote subagents.

**Sub-commands:**

**`list`**:

**Description:** Lists all discovered agents, including built-in, local,
and remote agents.
- **Usage:** `/agents list`

**`reload`** (alias: `refresh`):

**Description:** Rescans agent directories (`~/.gemini/agents` and
`.gemini/agents`) and reloads the registry.
- **Usage:** `/agents reload`

**`enable`**:

- **Description:** Enables a specific subagent.

- **Usage:** `/agents enable &#x3C;agent-name>`

**`disable`**:

- **Description:** Disables a specific subagent.

- **Usage:** `/agents disable &#x3C;agent-name>`

**`config`**:

**Description:** Opens a configuration dialog for the specified agent to
adjust its model, temperature, or execution limits.
- **Usage:** `/agents config &#x3C;agent-name>`

### `/auth`

[Section titled “/auth”](#auth)

- **Description:** Open a dialog that lets you change the authentication method.

### `/bug`

[Section titled “/bug”](#bug)

**Description:** File an issue about Gemini CLI. By default, the issue is
filed within the GitHub repository for Gemini CLI. The string you enter after
`/bug` will become the headline for the bug being filed. The default `/bug`
behavior can be modified using the `advanced.bugCommand` setting in your
`.gemini/settings.json` files.

### `/chat`

[Section titled “/chat”](#chat)

**Description:** Alias for `/resume`. Both commands now expose the same
session browser action and checkpoint subcommands.
**Menu layout when typing `/chat` (or `/resume`)**:

`-- auto --`

- `list` (selecting this opens the auto-saved session browser)

`-- checkpoints --`

- `list`, `save`, `resume`, `delete`, `share` (manual tagged checkpoints)

Unique prefixes (for example `/cha` or `/resu`) resolve to the same grouped
menu.

**Sub-commands:**

**`debug`**

- **Description:** Export the most recent API request as a JSON payload.

**`delete &#x3C;tag>`**

- **Description:** Deletes a saved conversation checkpoint.

- **Equivalent:** `/resume delete &#x3C;tag>`

**`list`**

- **Description:** Lists available tags for manually saved checkpoints.

**Note:** This command only lists chats saved within the current project.
Because chat history is project-scoped, chats saved in other project
directories will not be displayed.
- **Equivalent:** `/resume list`

**`resume &#x3C;tag>`**

- **Description:** Resumes a conversation from a previous save.

**Note:** You can only resume chats that were saved within the current
project. To resume a chat from a different project, you must run the
Gemini CLI from that project’s directory.
- **Equivalent:** `/resume resume &#x3C;tag>`

**`save &#x3C;tag>`**

**Description:** Saves the current conversation history. You must add a
`&#x3C;tag>` for identifying the conversation state.
**Details on checkpoint location:** The default locations for saved chat
checkpoints are:

- Linux/macOS: `~/.gemini/tmp/&#x3C;project_hash>/`

- Windows: `C:\Users\&#x3C;YourUsername>\.gemini\tmp\&#x3C;project_hash>\`

**Behavior:** Chats are saved into a project-specific directory,
determined by where you run the CLI. Consequently, saved chats are only
accessible when working within that same project.
**Note:** These checkpoints are for manually saving and resuming
conversation states. For automatic checkpoints created before file
modifications, see the
[Checkpointing documentation](/docs/cli/checkpointing).
- **Equivalent:** `/resume save &#x3C;tag>`

**`share [filename]`**

**Description:** Writes the current conversation to a provided Markdown or
JSON file. If no filename is provided, then the CLI will generate one.
- **Usage:** `/chat share file.md` or `/chat share file.json`.

- **Equivalent:** `/resume share [filename]`

### `/clear`

[Section titled “/clear”](#clear)

**Description:** Clear the terminal screen, including the visible session
history and scrollback within the CLI. The underlying session data (for
history recall) might be preserved depending on the exact implementation, but
the visual display is cleared.
- **Keyboard shortcut:** Press **Ctrl+L** at any time to perform a clear action.

### `/commands`

[Section titled “/commands”](#commands)

- **Description:** Manage custom slash commands loaded from `.toml` files.

**Sub-commands:**

**`list`**:

**Description:** List available custom command `.toml` files from all
sources (user-level `~/.gemini/commands/`, project-level
`&#x3C;project>/.gemini/commands/`, and active extensions).
- **Usage:** `/commands list`

**`reload`**:

**Description:** Reload custom command definitions from all sources
(user-level `~/.gemini/commands/`, project-level
`&#x3C;project>/.gemini/commands/`, MCP prompts, and extensions). Use this to
pick up new or modified `.toml` files without restarting the CLI.
- **Usage:** `/commands reload`

### `/compress`

[Section titled “/compress”](#compress)

**Description:** Replace the entire chat context with a summary. This saves on
tokens used for future tasks while retaining a high level summary of what has
happened.

### `/copy`

[Section titled “/copy”](#copy)

**Description:** Copies the last output produced by Gemini CLI to your
clipboard, for easy sharing or reuse.
**Behavior:**

- Local sessions use system clipboard tools (pbcopy/xclip/clip).

- Remote sessions (SSH/WSL) use OSC 52 and require terminal support.

**Note:** This command requires platform-specific clipboard tools to be
installed.

On Linux, it requires `xclip` or `xsel`. You can typically install them
using your system’s package manager.
On macOS, it requires `pbcopy`, and on Windows, it requires `clip`. These
tools are typically pre-installed on their respective systems.

### `/directory` (or `/dir`)

[Section titled “/directory (or /dir)”](#directory-or-dir)

- **Description:** Manage workspace directories for multi-directory support.

**Sub-commands:**

**`add`**:

**Description:** Add a directory to the workspace. The path can be
absolute or relative to the current working directory. Moreover, the
reference from home directory is supported as well.
- **Usage:** `/directory add &#x3C;path1>,&#x3C;path2>`

**Note:** Disabled in restrictive sandbox profiles. If you’re using that,
use `--include-directories` when starting the session instead.

**`show`**:

**Description:** Display all directories added by `/directory add` and
`--include-directories`.
- **Usage:** `/directory show`

### `/docs`

[Section titled “/docs”](#docs)

- **Description:** Open Gemini CLI documentation in your browser.

### `/editor`

[Section titled “/editor”](#editor)

- **Description:** Open a dialog for selecting supported editors.

### `/extensions`

[Section titled “/extensions”](#extensions)

**Description:** Manage extensions. See
[Gemini CLI Extensions](/docs/extensions).
**Sub-commands:**

**`config`**:

- **Description:** Configure extension settings.

**`disable`**:

- **Description:** Disable an extension.

**`enable`**:

- **Description:** Enable an extension.

**`explore`**:

- **Description:** Open extensions page in your browser.

**`install`**:

- **Description:** Install an extension from a git repo or local path.

**`link`**:

- **Description:** Link an extension from a local path.

**`list`**:

- **Description:** List active extensions.

**`restart`**:

- **Description:** Restart all extensions.

**`uninstall`**:

- **Description:** Uninstall an extension.

**`update`**:

- **Description:** Update extensions. Usage: update |—all

### `/help` (or `/?`)

[Section titled “/help (or /?)”](#help-or)

**Description:** Display help information about Gemini CLI, including
available commands and their usage.

### `/hooks`

[Section titled “/hooks”](#hooks)

**Description:** Manage hooks, which allow you to intercept and customize
Gemini CLI behavior at specific lifecycle events.
**Sub-commands:**

**`disable-all`**:

- **Description:** Disable all enabled hooks.

**`disable &#x3C;hook-name>`**:

- **Description:** Disable a hook by name.

**`enable-all`**:

- **Description:** Enable all disabled hooks.

**`enable &#x3C;hook-name>`**:

- **Description:** Enable a hook by name.

**`list`** (or `show`, `panel`):

- **Description:** Display all registered hooks with their status.

### `/ide`

[Section titled “/ide”](#ide)

- **Description:** Manage IDE integration.

**Sub-commands:**

**`disable`**:

- **Description:** Disable IDE integration.

**`enable`**:

- **Description:** Enable IDE integration.

**`install`**:

- **Description:** Install required IDE companion.

**`status`**:

- **Description:** Check status of IDE integration.

### `/init`

[Section titled “/init”](#init)

**Description:** To help users easily create a `GEMINI.md` file, this command
analyzes the current directory and generates a tailored context file, making
it simpler for them to provide project-specific instructions to the Gemini
agent.

### `/mcp`

[Section titled “/mcp”](#mcp)

- **Description:** Manage configured Model Context Protocol (MCP) servers.

**Sub-commands:**

**`auth`**:

- **Description:** Authenticate with an OAuth-enabled MCP server.

- **Usage:** `/mcp auth &#x3C;server-name>`

**Details:** If `&#x3C;server-name>` is provided, it initiates the OAuth flow
for that server. If no server name is provided, it lists all configured
servers that support OAuth authentication.

**`desc`**

- **Description:** List configured MCP servers and tools with descriptions.

**`disable`**

- **Description:** Disable an MCP server.

**`enable`**

- **Description:** Enable a disabled MCP server.

**`list`** or **`ls`**:

**Description:** List configured MCP servers and tools. This is the
default action if no subcommand is specified.

**`reload`**:

**Description:** Reloads all MCP servers and re-discovers their available
tools.

**`schema`**:

**Description:** List configured MCP servers and tools with descriptions
and schemas.

### `/memory`

[Section titled “/memory”](#memory)

**Description:** Manage the AI’s instructional context (hierarchical memory
loaded from `GEMINI.md` files).
**Sub-commands:**

**`list`**:

**Description:** Lists the paths of the GEMINI.md files in use for
hierarchical memory.

**`refresh`**:

**Description:** Reload the hierarchical instructional memory from all
`GEMINI.md` files found in the configured locations (global,
project/ancestors, and sub-directories). This command updates the model
with the latest `GEMINI.md` content.

**`show`**:

**Description:** Display the full, concatenated content of the current
hierarchical memory that has been loaded from all `GEMINI.md` files. This
lets you inspect the instructional context being provided to the Gemini
model.

**Note:** For more details on how `GEMINI.md` files contribute to
hierarchical memory, see the
[CLI Configuration documentation](/docs/reference/configuration).

### `/model`

[Section titled “/model”](#model)

- **Description:** Manage model configuration.

**Sub-commands:**

**`manage`**:

- **Description:** Opens a dialog to configure the model.

**`set`**:

- **Description:** Set the model to use.

- **Usage:** `/model set &#x3C;model-name> [--persist]`

### `/permissions`

[Section titled “/permissions”](#permissions)

- **Description:** Manage folder trust settings and other permissions.

**Sub-commands:**

**`trust`**:

- **Description:** Manage folder trust settings.

- **Usage:** `/permissions trust [&#x3C;directory-path>]`

### `/plan`

[Section titled “/plan”](#plan)

**Description:** Switch to Plan Mode (read-only) and view the current plan if
one has been generated.

**Note:** This feature is enabled by default. It can be disabled via the
`general.plan.enabled` setting in your configuration.

**Sub-commands:**

**`copy`**:

- **Description:** Copy the currently approved plan to your clipboard.

### `/policies`

[Section titled “/policies”](#policies)

- **Description:** Manage policies.

**Sub-commands:**

**`list`**:

- **Description:** List all active policies grouped by mode.

### `/privacy`

[Section titled “/privacy”](#privacy)

**Description:** Display the Privacy Notice and allow users to select whether
they consent to the collection of their data for service improvement purposes.

### `/quit` (or `/exit`)

[Section titled “/quit (or /exit)”](#quit-or-exit)

- **Description:** Exit Gemini CLI.

**Flags:**

**`--delete`** *(optional)*: Exit and permanently delete the current
session’s history and temporary files (chat recording, tool outputs). Useful
for privacy or one-off tasks where you don’t want to leave any traces.
- **Usage:** `/quit --delete` or `/exit --delete`

### `/restore`

[Section titled “/restore”](#restore)

**Description:** Restores the project files to the state they were in just
before a tool was executed. This is particularly useful for undoing file edits
made by a tool. If run without a tool call ID, it will list available
checkpoints to restore from.
- **Usage:** `/restore [tool_call_id]`

**Note:** Only available if checkpointing is configured via
[settings](/docs/reference/configuration). See
[Checkpointing documentation](/docs/cli/checkpointing) for more details.

### `/rewind`

[Section titled “/rewind”](#rewind)

**Description:** Navigates backward through the conversation history, letting
you review past interactions and potentially revert both chat state and file
changes.
- **Usage:** Press **Esc** twice as a shortcut.

**Features:**

- **Select Interaction:** Preview user prompts and file changes.

**Action Selection:** Choose to rewind history only, revert code changes
only, or both.

### `/resume`

[Section titled “/resume”](#resume)

**Description:** Browse and resume previous conversation sessions, and manage
manual chat checkpoints.
**Features:**

**Auto sessions:** Run `/resume` to open the interactive session browser for
automatically saved conversations.
**Chat checkpoints:** Use checkpoint subcommands directly (`/resume save`,
`/resume resume`, etc.).
- **Management:** Delete unwanted sessions directly from the browser

- **Resume:** Select any session to resume and continue the conversation

**Search:** Use `/` to search through conversation content across all
sessions
**Session Browser:** Interactive interface showing all saved sessions with
timestamps, message counts, and first user message for context
- **Sorting:** Sort sessi

... [Content truncated]