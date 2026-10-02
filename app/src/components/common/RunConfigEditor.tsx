import { useState } from 'react';
import type { ApplicationRunConfig } from '../../types';

const WINDOWS = navigator.userAgent.toLowerCase().includes('windows');
const CPP_BUILD = WINDOWS ? '(if not exist .yzpz-run mkdir .yzpz-run) && g++ main.cpp -o .yzpz-run/app.exe' : 'mkdir -p .yzpz-run && g++ main.cpp -o .yzpz-run/app';
const C_BUILD = CPP_BUILD.replace('g++ main.cpp', 'gcc main.c');
const NATIVE_RUN = WINDOWS ? '.yzpz-run\\app.exe' : './.yzpz-run/app';
const PRESETS = [
  ['Custom command', '', ''],
  ['Python', 'python -u main.py', ''],
  ['FastAPI', 'python -u -m uvicorn main:app --reload', ''],
  ['Flask', 'python -u -m flask --app app run --debug', ''],
  ['Django', 'python -u manage.py runserver', ''],
  ['C++', `${CPP_BUILD} && ${NATIVE_RUN}`, CPP_BUILD],
  ['C', `${C_BUILD} && ${NATIVE_RUN}`, C_BUILD],
  ['C# / .NET', 'dotnet run --project App.csproj', 'dotnet build App.csproj'],
  ['Node.js', 'npm run dev', 'npm run build'],
  ['Rust', 'cargo run', 'cargo build'],
  ['Go', 'go run .', 'go build ./...'],
  ['Java (JDK 11+)', 'java Main.java', 'javac Main.java'],
  ['Kotlin', 'java -jar app.jar', 'kotlinc Main.kt -include-runtime -d app.jar'],
  ['Dart', 'dart run', ''],
  ['Ruby', 'ruby main.rb', ''],
  ['PHP server', 'php -S localhost:8000', ''],
  ['Swift', 'swift run', 'swift build'],
  ['Lua', 'lua main.lua', ''],
  ['R', 'Rscript main.R', ''],
  ['Perl', 'perl main.pl', ''],
  ['Flutter', 'flutter run', 'flutter build web'],
];

interface RunConfigEditorProps {
  initial: ApplicationRunConfig;
  onSave: (config: ApplicationRunConfig) => void;
  onCancel: () => void;
}

export function RunConfigEditor({ initial, onSave, onCancel }: RunConfigEditorProps): React.JSX.Element {
  const [draft, setDraft] = useState(initial);
  const fieldClass = 'w-full rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]';
  const fields: { key: keyof Omit<ApplicationRunConfig, 'id'>; label: string; placeholder?: string; required?: boolean; multiline?: boolean }[] = [
    { key: 'name', label: 'Name', required: true },
    { key: 'projectPath', label: 'Project directory', placeholder: 'Leave empty to use in every project' },
    { key: 'workingDirectory', label: 'Working directory', placeholder: "Leave empty to use the terminal's directory" },
    { key: 'command', label: 'Run command and arguments', required: true, multiline: true },
    { key: 'buildCommand', label: 'Build command (optional)', multiline: true },
  ];
  return (
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      if (!draft.name.trim() || !draft.command.trim()) return;
      onSave({ ...draft, name: draft.name.trim(), command: draft.command.trim(), projectPath: draft.projectPath.trim(), workingDirectory: draft.workingDirectory.trim() });
    }}>
      <label className="block space-y-1 text-sm">Start from a preset
        <select defaultValue="Custom command" className={fieldClass} onChange={(event) => {
          const preset = PRESETS.find(([name]) => name === event.target.value);
          if (preset) setDraft((previous) => ({ ...previous, name: preset[0], command: preset[1], buildCommand: preset[2] }));
        }}>{PRESETS.map(([name]) => <option key={name}>{name}</option>)}</select>
      </label>
      {fields.map((field) => <label key={field.key} className="block space-y-1 text-sm">{field.label}
        {field.multiline ? <textarea required={field.required} rows={2} spellCheck={false} value={draft[field.key]} className={`${fieldClass} font-mono`} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} /> : <input autoFocus={field.key === 'name'} required={field.required} value={draft[field.key]} placeholder={field.placeholder} className={fieldClass} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} />}
      </label>)}
      <p className="text-xs leading-5 text-[var(--text-secondary)]">Commands use Command Prompt on Windows and your login shell on macOS/Linux. Include arguments in the command. Build is a separate action; use &amp;&amp; to build before running. Required runtimes and dependencies must be installed.</p>
      <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="app-button">Cancel</button><button type="submit" disabled={!draft.name.trim() || !draft.command.trim()} className="app-button bg-[var(--accent-light)] text-[var(--accent-text)] disabled:opacity-40">Save run configuration</button></div>
    </form>
  );
}
