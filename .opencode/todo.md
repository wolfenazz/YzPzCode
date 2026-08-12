# Mission: Remove light mode completely — dark mode only

User direction: "Remove the light mode completely. Make only dark mode. Remove the
theme toggle button (not needed anymore). Make dark the default for the system."

## Approach
- Lock `theme` to `"dark"` in appStore (remove `toggleTheme` action + drop `theme`
  from persisted partialize so a stored "light" never restores).
- Delete `ThemeToggleButton.tsx` + remove it from all screens/headers.
- Remove `.light-theme` CSS and all light sub-theme blocks (markdown-light,
  docx-preview-light, spreadsheet-light, etc.) — keep only dark.
- Strip every `theme === 'light' ? X : Y` ternary / `isLight` variable to its dark
  branch; remove now-unused `theme` props/imports.
- Simplify ACCENT_COLOR_MAP to single hex (dark values).
- Monaco stays `vs-dark`; Terminal xterm themes keep dark.

## M1: Core — store + App.tsx + ThemeToggleButton removal | status: completed
### T1.1: appStore | agent:Commander
- [x] S1.1.1: Remove `toggleTheme` from interface + impl; keep `theme: "dark"` locked | verified: no toggleTheme refs; theme: "dark" (type + default)
- [x] S1.1.2: Remove `theme` from persisted partialize (line ~1310) | verified: theme removed from partialize
### T1.2: App.tsx | agent:Commander
- [x] S1.2.1: Remove `light-theme` class application; remove toggleTheme/onThemeToggle props | verified: App.tsx has no theme refs
- [x] S1.2.2: Simplify ACCENT_COLOR_MAP to single hex per accent (dark values) | verified
### T1.3: Delete ThemeToggleButton + CSS | agent:Commander
- [x] S1.3.1: Delete app/src/components/common/ThemeToggleButton.tsx | verified: deleted
- [x] S1.3.2: Remove `.light-theme` block + light sub-themes from styles.css; enforce dark color-scheme | verified: 0 light refs; color-scheme: dark; dark selectors intact

## M2: Toggle-button usages removal | status: completed
### T2.1: Screens & headers | agent:Worker
- [x] S2.1.1: DocsScreen.tsx — remove onThemeToggle prop, theme button, light-theme class | verified
- [x] S2.1.2: SetupScreen.tsx + NodeJsCheckScreen.tsx — remove ThemeToggleButton + light-theme class | verified
- [x] S2.1.3: SettingsScreen.tsx — remove ThemeToggleButton import/usage | verified
- [x] S2.1.4: Workspace.tsx + WorkspaceHeader.tsx — remove toggleTheme + ThemeToggleButton + onThemeToggle | verified
- [x] S2.1.5: ContextMenu.tsx — remove onThemeToggle prop + theme action item | verified
- [x] S2.1.6: SettingsAppearance.tsx — remove Theme toggle SettingsToggle block | verified
- [x] S2.1.7: DesignerPage.tsx — remove toggleTheme button + data-theme attr | verified

## M3: Strip light branches from components | status: completed
### T3.1: Editor components | agent:Worker
- [x] S3.1.1: FileEditor.tsx — remove isLightTheme/vs-light; Monaco always vs-dark; drop unused theme props | verified: theme="vs-dark", 0 isLightTheme
- [x] S3.1.2: EditorTabs.tsx — dark-only tab styles | verified
- [x] S3.1.3: Preview components (Docx/Image/Pdf/Spreadsheet/Markdown) — dark-only classes | verified
- [x] S3.1.4: QuickOpenPalette.tsx — dark-only styles + prop removed from Workspace caller | verified
### T3.2: Workspace components | agent:Worker
- [x] S3.2.1: TerminalPane/TerminalHeader/TerminalGrid/NewTerminalDialog/CliStatusBadge/AuthModal/QuickActions — remove isLight ternaries (keep dark) | verified: 0 isLight refs; terminalTheme locked to DARK_TERMINAL_THEME

## M4: Verification | status: completed
### T4.1: Review Block | agent:Reviewer | depends:T3.2
- [x] S4.1.1: `npx tsc --noEmit` - zero type errors | verified: TSC_EXIT=0 (fresh run, full project)
- [x] S4.1.2: `npm run build` passes | verified: BUILD_EXIT=0 (built in 1m 29s, fresh run)
- [x] S4.1.3: Diff review: no light-theme remnants (`light-theme`, `markdown-light`, `theme === 'light'`, `isLight`, `toggleTheme`, `onThemeToggle`), dark default confirmed | verified: ALL greps 0 matches (light-theme/markdown-light/docx-*-light/spreadsheet-light=0, isLightTheme/toggleTheme/onThemeToggle=0, isLight non-designer=0, theme==='light'=0, theme:'dark'\|'light' props=0); dark default: color-scheme: dark, appStore theme:"dark" locked, DesignerPage data-theme="dark"
