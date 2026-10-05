# Workspace setup

Select a project folder and open the workspace. The name is filled from the
folder; an edited name is preserved when changing folders. New workspaces start
with one terminal unless another default is selected in **Settings → Terminal →
Terminals in new workspaces**.

The page view shows the essential choices together. Guided setup has two steps:
**Project** and **Tools**. **More options** contains templates, project
initialization, IDE selection, and external terminal windows.

## Choose what opens

- **Terminals:** choose No terminals, 1, 2, 4, 6, or 8. CLI agents and tool CLIs
  are assigned with the + and − controls; unused terminals open as plain shells.
  Reducing the count trims allocations to fit, and No terminals clears them.
- **Extensions:** select installed assistants, or choose Install & add. The
  selected panels open in the Extensions view when the workspace launches without consuming terminal
  slots. Each supported assistant uses its bundled provider logo in setup,
  the workspace catalog, and panel headers.
- **No terminals:** use extensions on their own, or open directly in the editor
  when no extensions are selected. This choice makes no terminal creation IPC
  request. Terminals can still be added later from the workspace.

Custom templates retain extension selections and support zero terminals.
Missing extensions must be installed or deselected before opening a template.
Providers retired from the catalog are excluded when applying saved templates.

Extensions run inside the app, so selecting one disables external terminal mode.
External terminal windows remain available under More options when no extensions
are selected and at least one terminal is configured.

Launch behavior is covered by `npm run test:workspace-setup` from `app/`.
