import React, { useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import {
  Keys,
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
} from '../SettingsKit';

const SHORTCUTS = [
  { category: 'Terminal', items: [
    { keys: ['Ctrl', 'C'], action: 'Copy selection' },
    { keys: ['Ctrl', 'V'], action: 'Paste' },
    { keys: ['Ctrl', 'F'], action: 'Search in terminal' },
    { keys: ['Ctrl', 'L'], action: 'Clear terminal' },
    { keys: ['Enter'], action: 'Find next match' },
    { keys: ['Shift', 'Enter'], action: 'Find previous match' },
    { keys: ['Esc'], action: 'Close search' },
  ]},
  { category: 'Editor and files', items: [
    { keys: ['Ctrl', 'P'], action: 'Quick open file' },
    { keys: ['Ctrl', 'Shift', 'F'], action: 'Find in files' },
    { keys: ['Ctrl', 'S'], action: 'Save file' },
    { keys: ['Ctrl', 'G'], action: 'Go to line' },
    { keys: ['Ctrl', 'Z'], action: 'Undo last explorer action' },
  ]},
  { category: 'Navigation', items: [
    { keys: ['Ctrl', 'Tab'], action: 'Switch workspace tab' },
    { keys: ['Ctrl', 'B'], action: 'Toggle sidebar' },
    { keys: ['Ctrl', 'Alt', 'B'], action: 'Toggle editor side panel' },
    { keys: ['Ctrl', 'Alt', 'M'], action: 'Show or hide the device window (Android emulator, iOS simulator)' },
    { keys: ['Ctrl', '`'], action: 'Toggle editor terminal panel' },
    { keys: ['Ctrl', 'Shift', '`'], action: 'New terminal in editor panel' },
    { keys: ['Ctrl', 'E'], action: 'Toggle view (Terminal ↔ Code, Write ↔ Files, or Slides ↔ Files in studio workspaces)' },
    { keys: ['Ctrl', 'W'], action: 'Close tab' },
    { keys: ['Ctrl', ','], action: 'Open settings' },
  ]},
  { category: 'Writing', items: [
    { keys: ['Ctrl', 'S'], action: 'Save the report' },
    { keys: ['Ctrl', 'Shift', 'E'], action: 'Export the report (PDF, Word, web page)' },
    { keys: ['Ctrl', 'Enter'], action: 'Insert a page break' },
    { keys: ['Esc'], action: 'Close the report wizard or export dialog' },
  ]},
  { category: 'Presentation', items: [
    { keys: ['Ctrl', 'S'], action: 'Save the presentation' },
    { keys: ['Ctrl', 'Shift', 'E'], action: 'Export the presentation (PowerPoint, PDF)' },
    { keys: ['Ctrl', 'Z'], action: 'Undo (Ctrl Y or Ctrl Shift Z to redo)' },
    { keys: ['Ctrl', 'D'], action: 'Duplicate the selected slides' },
    { keys: ['Del'], action: 'Delete the selected slides' },
    { keys: ['↑', '↓'], action: 'Previous or next slide' },
    { keys: ['Tab'], action: 'Indent a bullet while editing (Shift Tab to outdent)' },
    { keys: ['Esc'], action: 'Stop editing text, or close the wizard or a dialog' },
  ]},
  { category: 'Window', items: [
    { keys: ['F11'], action: 'Toggle fullscreen' },
  ]},
];

export const SettingsShortcuts: React.FC = () => {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const groups = SHORTCUTS
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !needle ||
          item.action.toLowerCase().includes(needle) ||
          item.keys.join('+').toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <SettingsStack>
      <div style={{ position: 'relative' }}>
        <MagnifyingGlass
          aria-hidden="true"
          size={15}
          style={{ position: 'absolute', top: '50%', left: '0.75rem', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}
        />
        <input
          aria-label="Search shortcuts"
          className="st-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search shortcuts"
          style={{ paddingLeft: '2.125rem' }}
          type="search"
          value={query}
        />
      </div>

      {groups.map((group) => (
        <SettingsGroup key={group.category} title={group.category}>
          {group.items.map((shortcut) => (
            <SettingsRow key={shortcut.action} label={shortcut.action}>
              <Keys keys={shortcut.keys} />
            </SettingsRow>
          ))}
        </SettingsGroup>
      ))}

      {groups.length === 0 && (
        <SettingsEmpty icon={MagnifyingGlass} title="No shortcuts found">
          Try a different word, like “save” or “tab”.
        </SettingsEmpty>
      )}
    </SettingsStack>
  );
};
