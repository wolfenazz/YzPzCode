export const sourceControlContent = `# Source Control

The Source Control panel is a GitHub Desktop-style Git interface built into the workspace. It replaces the file explorer in the sidebar when opened.

## The Panel

The panel has two tabs: **Changes** and **History**.

### Header

The header always shows your current state:

- **Current branch** name
- **Remote** URL, or "No remote configured"
- **Ahead / behind badges** (\`↑n\` / \`↓n\`) showing unpushed and unfetched commits
- A link to the repository on GitHub
- Three buttons: **Fetch**, **Pull**, and **Push** to sync with the remote

## Changes Tab

Lists every changed file with per-file add and deletion counts and status colors.

- **Filter box**: Search changed files by name
- **Funnel toggle**: Show only untracked changes or all changes
- **Changed files count** with a refresh button
- Hovering a file reveals four actions:
  - **Compare with HEAD**: Opens the diff for that file
  - **Discard changes**: Reverts the file (asks for confirmation first)
  - **Stage** (+) and **Unstage** (-) the file

You can also stage and unstage directly from the file explorer context menu.

## Committing

The commit bar at the bottom has:

- **Summary** (required) and an optional **Description**
- A **"Push to \<remote\> after commit"** checkbox to commit and push in one step
- A **"Commit N files to \<branch\>"** button

## History Tab

- Lists the current branch, other local branches (click one to check it out), and the last 20 commits
- Each entry shows the commit message, short hash, author, and date

## Git Badges Everywhere

Git status is integrated across the app:

- File explorer badges show modified, added, deleted, and untracked files
- Diff statistics appear per file
- The file watcher updates statuses in real time as you edit

> **Tip:** Keep the Source Control panel open next to your agent terminals. When an agent finishes editing files, review its changes as diffs and stage only what you want to keep.
`;
