import { useState } from 'react';
import { PencilSimple, Play, Plus, Trash } from '@phosphor-icons/react';
import { RunConfigEditor } from '../../common/RunConfigEditor';
import { useRunConfigStore } from '../../../stores/runConfigStore';
import type { ApplicationRunConfig } from '../../../types';
import {
  Button,
  Notice,
  SettingsBlock,
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
} from '../SettingsKit';

const newConfig = (): ApplicationRunConfig => ({
  id: crypto.randomUUID(),
  name: '',
  projectPath: '',
  workingDirectory: '',
  command: '',
  buildCommand: '',
});

export function SettingsRuns(): React.JSX.Element {
  const configs = useRunConfigStore((state) => state.configs);
  const saveConfig = useRunConfigStore((state) => state.saveConfig);
  const removeConfig = useRunConfigStore((state) => state.removeConfig);
  const [editing, setEditing] = useState<ApplicationRunConfig | null>(null);

  return (
    <SettingsStack>
      <Notice>
        Python, C, C++, C#, JavaScript/TypeScript, Rust, Go, Java, Dart, Ruby, PHP, Swift, Lua, Perl, R and Flutter
        projects are detected automatically. Add a saved configuration for another language, a specific app or a
        development server.
      </Notice>

      <SettingsGroup
        action={
          <Button disabled={editing !== null} icon={Plus} onClick={() => setEditing(newConfig())} size="sm" variant="primary">
            Add configuration
          </Button>
        }
        title="Saved configurations"
      >
        {editing && (
          <SettingsBlock>
            <RunConfigEditor
              initial={editing}
              key={editing.id}
              onCancel={() => setEditing(null)}
              onSave={(config) => {
                saveConfig(config);
                setEditing(null);
              }}
            />
          </SettingsBlock>
        )}

        {configs.length === 0 && !editing && (
          <SettingsEmpty icon={Play} title="No saved configurations">
            Automatic targets still appear in each terminal’s Run button.
          </SettingsEmpty>
        )}

        {configs.map((config) => (
          <SettingsRow
            description={
              <>
                <span className="st-truncate" style={{ display: 'block' }} title={config.projectPath || undefined}>
                  {config.projectPath || 'Every project'}
                </span>
                <code className="st-mono st-truncate" style={{ display: 'block', marginTop: '0.25rem' }} title={config.command}>
                  {config.command}
                </code>
              </>
            }
            icon={<Play size={16} aria-hidden="true" />}
            key={config.id}
            label={config.name}
          >
            <Button
              aria-label={`Edit ${config.name}`}
              disabled={editing?.id === config.id}
              icon={PencilSimple}
              iconOnly
              onClick={() => setEditing(config)}
              size="sm"
              title="Edit"
              variant="ghost"
            />
            <Button
              aria-label={`Delete ${config.name}`}
              icon={Trash}
              iconOnly
              onClick={() => removeConfig(config.id)}
              size="sm"
              title="Delete"
              variant="ghost"
            />
          </SettingsRow>
        ))}
      </SettingsGroup>
    </SettingsStack>
  );
}
