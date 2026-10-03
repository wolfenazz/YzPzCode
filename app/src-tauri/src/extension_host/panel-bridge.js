const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const { saveTrust } = require('./panel-storage.cjs');
const { configureAssistant } = require('./provider-access.cjs');

let panelState = { stage: 'starting' };

function rememberTrust() {
  if (vscode.workspace.isTrusted && process.env.YZPZ_WORKSPACE_TRUST_FILE) {
    // Only save an approval reported by VS Code. Merely selecting a workspace
    // or pressing Review does not grant or remember trust.
    const folders = vscode.workspace.workspaceFolders || [];
    const normalized = value => {
      const result = path.resolve(value);
      return process.platform === 'win32' ? result.toLowerCase() : result;
    };
    if (folders.length === 1 && process.env.YZPZ_WORKSPACE_PATH &&
        normalized(folders[0].uri.fsPath) === normalized(process.env.YZPZ_WORKSPACE_PATH))
      saveTrust(process.env.YZPZ_WORKSPACE_TRUST_FILE, process.env.YZPZ_WORKSPACE_PATH, true);
  }
}

function state(value) {
  panelState = { ...panelState, ...value };
  if (process.env.YZPZ_PANEL_STATE_FILE) {
    fs.writeFileSync(`${process.env.YZPZ_PANEL_STATE_FILE}.tmp`, JSON.stringify(panelState));
    fs.renameSync(`${process.env.YZPZ_PANEL_STATE_FILE}.tmp`, process.env.YZPZ_PANEL_STATE_FILE);
  }
}

exports.activate = function (context) {
  const id = process.env.YZPZ_EXTENSION_ID;
  let lastAction;
  const actions = setInterval(async () => {
    try {
      const action = JSON.parse(fs.readFileSync(process.env.YZPZ_PANEL_ACTION_FILE, 'utf8'));
      if (!action.id || lastAction === action.id) return;
      lastAction = action.id;
      if (action.action === 'review-trust') {
        state({ stage: 'reviewingTrust' });
        await vscode.commands.executeCommand('workbench.trust.manage');
      } else if (action.action === 'back') {
        if (!vscode.workspace.isTrusted) {
          await vscode.commands.executeCommand('workbench.action.closeAllEditors');
          state({ stage: 'waitingTrust' });
        } else if (panelState.container) {
          await vscode.commands.executeCommand(panelState.container);
          state({ stage: 'ready' });
        }
      }
    } catch { /* No action has been submitted yet. */ }
  }, 250);
  context.subscriptions.push({ dispose: () => clearInterval(actions) });

  // Awaiting trust must not hold up the host's own startup activation phase.
  void openAssistant(context, id);
};

async function openAssistant(context, id) {
  try {
    if (!vscode.workspace.isTrusted) {
      state({ stage: 'waitingTrust' });
      await new Promise(resolve => {
        const listener = vscode.workspace.onDidGrantWorkspaceTrust(() => { listener.dispose(); resolve(); });
        context.subscriptions.push(listener);
      });
    }
    rememberTrust();
    state({ stage: 'activating' });
    let extension;
    for (let attempt = 0; attempt < 120; attempt++) {
      extension = vscode.extensions.getExtension(id);
      if (extension) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!extension) throw new Error(`${id} is not enabled in the workspace extension host.`);
    await configureAssistant(vscode, extension);
    const api = await extension.activate();
    if (id.toLowerCase() === 'google.google-antigravity')
      await configureAssistant(vscode, extension, api);
    const contributions = extension.packageJSON.contributes || {};
    const containers = contributions.viewsContainers || {};
    const commands = new Set(await vscode.commands.getCommands(true));
    const candidates = [...(containers.secondarySidebar || []), ...(containers.activitybar || []), ...(containers.panel || [])];
    let lastError;
    for (const container of candidates) {
      const command = `workbench.view.extension.${container.id}`;
      if (!commands.has(command)) continue;
      try {
        await vscode.commands.executeCommand(command);
        const views = (contributions.views || {})[container.id] || [];
        const view = views.find(item => item.type === 'webview') || views[0];
        if (view && commands.has(`${view.id}.focus`)) await vscode.commands.executeCommand(`${view.id}.focus`);
        state({ stage: 'ready', container: command });
        // Settings, config files, diffs and custom editors all use the editor
        // part. Expose it when the provider opens/focuses a tab, across providers.
        const tabs = vscode.window.tabGroups;
        const showEditor = () => {
          if (!['ready', 'editor'].includes(panelState.stage)) return;
          state({ stage: tabs.activeTabGroup?.activeTab ? 'editor' : 'ready' });
        };
        context.subscriptions.push(tabs.onDidChangeTabs(showEditor), tabs.onDidChangeTabGroups(showEditor));
        return;
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error(`${id} does not expose an available graphical view container.`);
  } catch (error) {
    state({ stage: 'error', message: `Could not open ${id}: ${String(error)}` });
    console.error('[YzPzCode extension panel]', error);
  }
}
