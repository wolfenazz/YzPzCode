import React, { useState } from 'react';
import { ArrowUp, Check, Image as ImageIcon, Plus, Stack, Stop, X } from '@phosphor-icons/react';
import type { PickedElement } from '../../stores/designSessionStore';
import { quickActionsFor, scopeLabel } from '../../utils/design/quickActions';
import type { DesignKind } from '../../utils/design/types';
import { BoardSizePicker } from './BoardSizePicker';

interface DesignPromptBarProps {
  kind: DesignKind;
  boardCount: number;
  selectedCount: number;
  picked: PickedElement | null;
  busy: boolean;
  /** A finished change waiting for Keep or Discard. */
  reviewing: boolean;
  status: string | null;
  onSend: (instruction: string) => void;
  /** A new board described in the box, drawn by the AI at the chosen size. */
  onAddDrawn: (brief: string, format: string) => void;
  /** An empty canvas at the chosen size (preset or custom); drawn later on request. */
  onAddBlank: (format: string) => void;
  /** Alternatives of the board in scope. */
  onVersions: () => void;
  onStop: () => void;
  onKeep: () => void;
  onDiscard: () => void;
  onClearPicked: () => void;
  onHoldBefore: (holding: boolean) => void;
  /** Pictures already in the project (assets/…). */
  pictures?: Array<{ path: string; name: string }>;
  /** Put a picture inside the picked element: a project picture, or null to choose a file. */
  onPutPicture?: (path: string | null) => void;
  /** Take the picture out of the picked element. */
  onRemovePicture?: () => void;
  /** Open the picture panel on the picture already placed in the picked element. */
  onAdjustPicture?: () => void;
}

/** The floating bar under the canvas: tell the AI what to change, add boards, or review what it changed. */
export const DesignPromptBar: React.FC<DesignPromptBarProps> = ({ kind, boardCount, selectedCount, picked, busy, reviewing, status, onSend, onAddDrawn, onAddBlank, onVersions, onStop, onKeep, onDiscard, onClearPicked, onHoldBefore, pictures = [], onPutPicture, onRemovePicture, onAdjustPicture }) => {
  const [text, setText] = useState('');
  const [pictureMenu, setPictureMenu] = useState(false);
  const [newMenu, setNewMenu] = useState(false);
  /** What the size picker makes: an empty canvas, or a board drawn from the box's text. */
  const [newMode, setNewMode] = useState<null | 'blank' | 'drawn'>(null);
  const scope = scopeLabel({ picked: Boolean(picked), selected: selectedCount, total: boardCount });
  const quick = quickActionsFor(kind, picked ? 'element' : selectedCount > 0 ? 'boards' : 'all');

  const send = (instruction = text): void => {
    const value = instruction.trim();
    if (!value || busy || boardCount === 0) return;
    onSend(value);
    setText('');
  };

  const closeNew = (): void => {
    setNewMenu(false);
    setNewMode(null);
  };

  if (reviewing) {
    return (
      <div className="dz-bar" role="region" aria-label="Review the change">
        <span className="dz-bar__status">The AI changed the design. Keep it?</span>
        <span className="dz-composer__spacer" />
        <button type="button" className="dz-btn" onPointerDown={() => onHoldBefore(true)} onPointerUp={() => onHoldBefore(false)} onPointerLeave={() => onHoldBefore(false)} title="Hold to see the design as it was">Hold for before</button>
        <button type="button" className="dz-btn" onClick={onDiscard}><X size={13} /> Discard</button>
        <button type="button" className="dz-btn dz-btn--primary" onClick={onKeep}><Check size={13} weight="bold" /> Keep</button>
      </div>
    );
  }

  return (
    <div className="dz-bar" role="region" aria-label="Ask the AI">
      <div className="dz-bar__top">
        <span className="dz-bar__scope">
          {scope}
          {picked && <button type="button" className="dz-chip__remove" aria-label="Clear the picked element" onClick={onClearPicked}><X size={11} /></button>}
        </span>
        {picked && <span className="dz-bar__picked" title={picked.label}>{picked.label}</span>}
        {picked && onPutPicture && (
          <span className="dz-menu-anchor">
            <button type="button" className="dz-btn dz-btn--sm" disabled={busy} aria-haspopup="menu" aria-expanded={pictureMenu} title="Put a picture inside this element (cut to its shape, kept inside its border)" onClick={() => setPictureMenu((value) => !value)}>
              <ImageIcon size={13} /> Add picture
            </button>
            {pictureMenu && (
              <div className="dz-menu" role="menu">
                <button type="button" role="menuitem" className="dz-menu__item" onClick={() => { setPictureMenu(false); onPutPicture(null); }}><span>Choose from computer…</span></button>
                {onAdjustPicture && <button type="button" role="menuitem" className="dz-menu__item" onClick={() => { setPictureMenu(false); onAdjustPicture(); }}><span>Adjust picture…</span></button>}
                {onRemovePicture && <button type="button" role="menuitem" className="dz-menu__item" data-danger="true" onClick={() => { setPictureMenu(false); onRemovePicture(); }}><span>Remove picture</span></button>}
                {pictures.length > 0 && <div className="dz-menu__group">In this project</div>}
                {pictures.slice(0, 12).map((entry) => (
                  <button key={entry.path} type="button" role="menuitem" className="dz-menu__item" onClick={() => { setPictureMenu(false); onPutPicture(entry.path); }}><span dir="auto">{entry.name}</span></button>
                ))}
              </div>
            )}
          </span>
        )}
        <span className="dz-composer__spacer" />
        {status && <span className="dz-bar__status">{status}</span>}
      </div>
      <div className="dz-bar__row">
        <textarea
          dir="auto"
          className="dz-bar__input"
          rows={1}
          value={text}
          disabled={busy}
          aria-label="Ask the AI to change the design"
          placeholder={picked ? 'What should change about this element?' : 'What should change? e.g. “make the header darker” — or “make 3 versions”, “another image at 1200×628”'}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <span className="dz-menu-anchor">
          <button type="button" className="dz-btn dz-btn--ghost" aria-haspopup="menu" aria-expanded={newMenu} title="Add another board: an empty canvas, or one drawn from the description in the box" onClick={() => { setNewMenu((value) => !value); setNewMode(null); }}>
            <Plus size={13} /> New
          </button>
          {newMenu && !newMode && (
            <div className="dz-menu" role="menu">
              <button type="button" role="menuitem" className="dz-menu__item" onClick={() => setNewMode('blank')}><span>Blank board…</span></button>
              <button type="button" role="menuitem" className="dz-menu__item" disabled={text.trim().length < 4} onClick={() => setNewMode('drawn')}><span>Draw from the description…</span></button>
            </div>
          )}
          {newMenu && newMode && (
            <div className="dz-menu" role="dialog" aria-label={newMode === 'blank' ? 'Blank board' : 'Draw a new board'}>
              <div className="dz-menu__group">{newMode === 'blank' ? 'Blank board' : 'Draw from the description'}</div>
              <BoardSizePicker
                kind={kind}
                label={newMode === 'blank' ? 'Add blank board' : 'Draw new board'}
                disabled={busy || (newMode === 'drawn' && text.trim().length < 4)}
                onCancel={closeNew}
                onCreate={(format) => {
                  if (newMode === 'drawn') onAddDrawn(text.trim(), format);
                  else onAddBlank(format);
                  setText('');
                  closeNew();
                }}
              />
            </div>
          )}
        </span>
        <button type="button" className="dz-btn dz-btn--ghost" disabled={busy || boardCount === 0} title="Make three alternatives of the board in scope" onClick={onVersions}>
          <Stack size={13} /> Versions
        </button>
        {busy ? (
          <button type="button" className="dz-btn" onClick={onStop}><Stop size={12} weight="fill" /> Stop</button>
        ) : (
          <button type="button" className="dz-btn dz-btn--primary dz-btn--icon" aria-label="Send" disabled={!text.trim() || boardCount === 0} onClick={() => send()}><ArrowUp size={14} weight="bold" /></button>
        )}
      </div>
      {!busy && (
        <div className="dz-bar__quick">
          {quick.map((entry) => <button key={entry.label} type="button" className="dz-hints__item" onClick={() => send(entry.instruction)}>{entry.label}</button>)}
        </div>
      )}
    </div>
  );
};
