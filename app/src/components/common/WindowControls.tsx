import type { FC } from 'react';
import { Minus, Square, X } from '@phosphor-icons/react';

interface WindowControlsProps {
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}

export const WindowControls: FC<WindowControlsProps> = ({ onMinimize, onMaximize, onClose }) => (
  <div className="window-controls" role="group" aria-label="Window management">
    <button
      onClick={onMinimize}
      className="window-control"
      title="Minimize"
      aria-label="Minimize window"
      type="button"
    >
      <Minus size={13} aria-hidden="true" />
    </button>
    <button
      onClick={onMaximize}
      className="window-control"
      title="Maximize"
      aria-label="Maximize window"
      type="button"
    >
      <Square size={11} aria-hidden="true" />
    </button>
    <button
      onClick={onClose}
      className="window-control window-control--close"
      title="Close"
      aria-label="Close window"
      type="button"
    >
      <X size={13} aria-hidden="true" />
    </button>
  </div>
);
