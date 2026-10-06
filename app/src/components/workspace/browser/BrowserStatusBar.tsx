import React from 'react';
import {
  ArrowBendUpLeft,
  ArrowsClockwise,
  Check,
  CheckCircle,
  Copy,
  Ruler,
  Speedometer,
  WarningCircle,
  X,
} from '@phosphor-icons/react';

export type BrowserToolMode = 'inspect' | 'style' | 'capture' | 'apply' | null;

export interface BrowserStatusMessage {
  id: number;
  tone: 'error' | 'success' | 'info';
  text: string;
}

const MODE_COPY: Record<Exclude<BrowserToolMode, null>, { label: string; hint: string; tool: string }> = {
  inspect: { label: 'Inspect', hint: 'Click an element to edit it with an agent', tool: 'inspect' },
  style: { label: 'Pick style', hint: 'Click an element to copy its styles', tool: 'style' },
  capture: { label: 'Copy UI', hint: 'Click a component to capture it as a reference', tool: 'capture' },
  apply: { label: 'Apply style', hint: 'Click an element to apply the copied style', tool: 'apply' },
};

interface BrowserStatusBarProps {
  mode: BrowserToolMode;
  message: BrowserStatusMessage | null;
  pageTitle: string;
  loadDurationMs: number | null;
  viewportLabel: string;
  zoomPercent: number;
  autoReload: boolean;
  autoReloadAvailable: boolean;
  showApplyActions: boolean;
  onDismissMessage: () => void;
  onCancelMode: () => void;
  onToggleAutoReload: () => void;
  onUndoApplied: () => void;
  onKeepApplied: () => void;
  onCopyAppliedCss: () => void;
}

export const BrowserStatusBar: React.FC<BrowserStatusBarProps> = ({
  mode,
  message,
  pageTitle,
  loadDurationMs,
  viewportLabel,
  zoomPercent,
  autoReload,
  autoReloadAvailable,
  showApplyActions,
  onDismissMessage,
  onCancelMode,
  onToggleAutoReload,
  onUndoApplied,
  onKeepApplied,
  onCopyAppliedCss,
}) => {
  const modeCopy = mode ? MODE_COPY[mode] : null;

  return (
    <footer className="bx-status" aria-label="Browser status">
      <div className="bx-status__main" role="status" aria-live="polite">
        {message ? (
          <>
            <span className={`bx-status__item bx-status__message--${message.tone}`}>
              {message.tone === 'error'
                ? <WarningCircle size={13} aria-hidden="true" />
                : <CheckCircle size={13} aria-hidden="true" />}
            </span>
            <span className={`bx-status__message--${message.tone}`} title={message.text}>{message.text}</span>
            <button type="button" className="bx-btn bx-btn--sm" onClick={onDismissMessage} aria-label="Dismiss message">
              <X size={11} aria-hidden="true" />
            </button>
          </>
        ) : modeCopy ? (
          <>
            <span className={`bx-status__mode bx-tool--${modeCopy.tool}`}>
              <span className="bx-dot" aria-hidden="true" />
              {modeCopy.label}
            </span>
            <span className="bx-status__hint">{modeCopy.hint}</span>
            <button type="button" className="bx-btn bx-btn--sm bx-btn--label" onClick={onCancelMode}>
              <span className="bx-kbd">Esc</span> cancel
            </button>
          </>
        ) : (
          <span title={pageTitle}>{pageTitle}</span>
        )}
      </div>

      {showApplyActions && (
        <div className="bx-status__actions" role="group" aria-label="Applied style">
          <button type="button" className="bx-btn bx-btn--danger" onClick={onUndoApplied}>
            <ArrowBendUpLeft size={12} aria-hidden="true" /> Undo
          </button>
          <button type="button" className="bx-btn" onClick={onKeepApplied}>
            <Check size={12} aria-hidden="true" /> Keep
          </button>
          <button type="button" className="bx-btn" onClick={onCopyAppliedCss}>
            <Copy size={12} aria-hidden="true" /> Copy CSS
          </button>
        </div>
      )}

      {autoReloadAvailable && (
        <button
          type="button"
          className="bx-btn bx-btn--sm bx-btn--label bx-hide-compact"
          aria-pressed={autoReload}
          onClick={onToggleAutoReload}
          title={autoReload
            ? 'Auto-reload is on: localhost pages reload when workspace files change'
            : 'Auto-reload is off'}
        >
          <ArrowsClockwise size={12} aria-hidden="true" />
          Auto-reload {autoReload ? 'on' : 'off'}
        </button>
      )}
      <span className="bx-status__item bx-hide-narrow" title="Last page load time">
        <Speedometer size={12} aria-hidden="true" />
        {loadDurationMs !== null ? `${loadDurationMs} ms` : '—'}
      </span>
      <span className="bx-status__item" title="Page viewport in CSS pixels">
        <Ruler size={12} aria-hidden="true" />
        {viewportLabel}
      </span>
      <span className="bx-status__item bx-hide-compact" title="Zoom">{zoomPercent}%</span>
    </footer>
  );
};
