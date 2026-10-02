import { useState } from 'react';
import { RunConfigEditor } from '../../common/RunConfigEditor';
import { useRunConfigStore } from '../../../stores/runConfigStore';
import type { ApplicationRunConfig } from '../../../types';

export function SettingsRuns(): React.JSX.Element {
  const configs = useRunConfigStore((state) => state.configs);
  const saveConfig = useRunConfigStore((state) => state.saveConfig);
  const removeConfig = useRunConfigStore((state) => state.removeConfig);
  const [editing, setEditing] = useState<ApplicationRunConfig | null>(null);
  return (
    <div className="space-y-6">
      <p className="text-sm leading-6 text-[var(--text-secondary)]">Manage commands available from each terminal's Run button. Automatic detection covers Python, C, C++, C#, JavaScript/TypeScript, Rust, Go, Java, Dart, Ruby, PHP, Swift, Lua, Perl, R, and Flutter. Add a saved configuration for another language, a specific application, or a development server.</p>
      <button type="button" className="app-button" onClick={() => setEditing({ id: crypto.randomUUID(), name: '', projectPath: '', workingDirectory: '', command: '', buildCommand: '' })}>Add run configuration</button>
      {editing && <div className="border border-[var(--border-primary)] rounded p-5"><RunConfigEditor key={editing.id} initial={editing} onCancel={() => setEditing(null)} onSave={(config) => { saveConfig(config); setEditing(null); }} /></div>}
      {!configs.length && <p className="text-sm text-[var(--text-secondary)]">No saved configurations yet. Automatic targets are still available in terminal headers.</p>}
      {configs.map((config) => <div key={config.id} className="flex items-start justify-between gap-4 border-b border-[var(--border-primary)] pb-4">
        <div className="min-w-0"><h2 className="text-sm font-medium">{config.name}</h2><p className="mt-1 break-all text-xs text-[var(--text-secondary)]">{config.projectPath || 'Every project'}</p><code className="mt-2 block break-all text-xs">{config.command}</code></div>
        <div className="flex shrink-0 gap-2"><button type="button" className="app-button" onClick={() => setEditing(config)}>Edit</button><button type="button" className="app-button" onClick={() => removeConfig(config.id)}>Delete</button></div>
      </div>)}
    </div>
  );
}
