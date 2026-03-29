import React from 'react';
import { HelpTooltip } from '../common/HelpTooltip';

interface DirectorySelectorProps {
  selectedPath: string;
  onSelectDirectory: () => void;
}

export const DirectorySelector: React.FC<DirectorySelectorProps> = ({
  selectedPath,
  onSelectDirectory,
}) => {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <label className="block text-xs font-medium text-zinc-400 font-mono uppercase tracking-[0.15em]">
          Workspace Directory
        </label>
        <HelpTooltip text="The root folder for your project. All terminals will open with this as their working directory." />
      </div>
      <div className="flex gap-2">
        <div className="flex-1 px-3.5 py-2.5 bg-theme-main border border-theme rounded-md text-zinc-400 font-mono text-sm truncate">
          {selectedPath || '~/No/directory/selected'}
        </div>
        <button
          type="button"
          onClick={onSelectDirectory}
          className="px-5 py-2.5 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-md hover:bg-zinc-700 hover:text-white font-mono text-xs transition-colors duration-150 uppercase tracking-[0.1em] cursor-pointer"
        >
          Browse
        </button>
      </div>
      {selectedPath && (
        <p className="mt-1.5 text-[10px] text-emerald-500/70 font-mono tracking-wide">
          Valid directory selected
        </p>
      )}
    </div>
  );
};
