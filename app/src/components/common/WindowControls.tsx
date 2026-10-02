import type { FC } from 'react';
import { Minus, Square, X } from '@phosphor-icons/react';

interface WindowControlsProps {
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
  className?: string;
}

export const WindowControls: FC<WindowControlsProps> = ({
  onMinimize,
  onMaximize,
  onClose,
  className = '',
}) => {
  return (
    <div
      className={`workspace-window-controls ${className}`}
      role="group"
      aria-label="Window management"
    >
      <button
        onClick={onMinimize}
        className="workspace-window-control workspace-window-control--minimize"
        title="Minimize"
        aria-label="Minimize window"
        type="button"
      >
        <Minus size={12} weight="bold" aria-hidden="true" />
      </button>
      <button
        onClick={onMaximize}
        className="workspace-window-control workspace-window-control--maximize"
        title="Maximize"
        aria-label="Maximize window"
        type="button"
      >
        <Square size={10.5} weight="bold" aria-hidden="true" />
      </button>
      <div className="workspace-window-controls__divider" aria-hidden="true" />
      <button
        onClick={onClose}
        className="workspace-window-control workspace-window-control--close"
        title="Close"
        aria-label="Close window"
        type="button"
      >
        <X size={12} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
};
