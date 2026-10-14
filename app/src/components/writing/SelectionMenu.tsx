import React, { useEffect, useRef, useState } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/react';
import { CaretDown, CircleNotch, SpeakerHigh, Sparkle, Stop, TextB, TextItalic, TextUnderline, ArrowRight } from '@phosphor-icons/react';
import { REWRITE_ACTIONS, type RewriteAction } from '../../utils/writing/prompts';
import { useTtsPlayback } from '../../hooks/useTtsPlayback';
import { useTtsStore } from '../../stores/ttsStore';
import { ttsBilingual } from '../../utils/tts/strings';
import { REPORT_NARRATION_MAX_CHARS, selectionNarrationText } from './reportNarration';

interface SelectionMenuProps {
  editor: Editor;
  busy: boolean;
  onAction: (action: RewriteAction, instruction?: string) => void;
  onToast?: (message: string) => void;
}

export const SelectionMenu: React.FC<SelectionMenuProps> = ({ editor, busy, onAction, onToast }) => {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  /** The editor range when the menu opened; focusing the input must not lose it. */
  const savedRange = useRef<{ from: number; to: number } | null>(null);
  const ttsEnabled = useTtsStore((state) => state.enabled);
  const { status: ttsStatus, errorMsg: ttsError, speak: ttsSpeak, stop: ttsStop } = useTtsPlayback();

  useEffect(() => {
    if (ttsError) onToast?.(ttsError);
  }, [ttsError, onToast]);

  useEffect(() => {
    const close = (): void => setOpen(false);
    editor.on('selectionUpdate', close);
    return () => { editor.off('selectionUpdate', close); };
  }, [editor]);

  const toggleOpen = (): void => {
    if (!open) {
      const { empty, from, to } = editor.state.selection;
      savedRange.current = empty ? null : { from, to };
    }
    setOpen((value) => !value);
  };

  const run = (action: RewriteAction, text?: string): void => {
    const saved = savedRange.current;
    savedRange.current = null;
    setOpen(false);
    setInstruction('');
    if (saved) {
      const size = editor.state.doc.content.size;
      const from = Math.max(0, Math.min(saved.from, size));
      const to = Math.max(0, Math.min(saved.to, size));
      if (to > from) editor.commands.setTextSelection({ from, to });
    }
    onAction(action, text);
  };

  const ttsBusy = ttsStatus === 'preparing' || ttsStatus === 'synthesizing' || ttsStatus === 'playing';
  // Text is captured synchronously on click, before the bubble auto-closes.
  const narrateSelection = (): void => {
    if (ttsBusy) {
      ttsStop();
      return;
    }
    const text = selectionNarrationText(editor);
    if (!text) {
      onToast?.(ttsBilingual('selectOrSection'));
      return;
    }
    if (text.length > REPORT_NARRATION_MAX_CHARS) {
      onToast?.(ttsBilingual('tooLong'));
      return;
    }
    void ttsSpeak(text);
  };

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 10 }}
      shouldShow={({ editor: current, state }) => {
        const { empty } = state.selection;
        if (empty || !current.isEditable) return false;
        // Atom nodes (cover, figures, citations) have their own controls.
        const node = (state.selection as { node?: { type: { name: string } } }).node;
        return !node;
      }}
    >
      <div className="wr-bubble" onMouseDown={(event) => { if ((event.target as HTMLElement).tagName !== 'INPUT') event.preventDefault(); }}>
        <button type="button" className={`wr-icon-btn${editor.isActive('bold') ? ' is-active' : ''}`} aria-label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}><TextB size={15} weight="bold" /></button>
        <button type="button" className={`wr-icon-btn${editor.isActive('italic') ? ' is-active' : ''}`} aria-label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}><TextItalic size={15} /></button>
        <button type="button" className={`wr-icon-btn${editor.isActive('underline') ? ' is-active' : ''}`} aria-label="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}><TextUnderline size={15} /></button>
        <span className="wr-bubble__sep" />
        <div style={{ position: 'relative' }}>
          <button type="button" className="wr-bubble__ai" disabled={busy} onClick={toggleOpen} aria-expanded={open}>
            <Sparkle size={14} weight="fill" /> {busy ? 'Working…' : 'Ask AI'} <CaretDown size={11} />
          </button>
          {open && (
            <div className="wr-bubble__menu">
              {REWRITE_ACTIONS.map((action) => (
                <button key={action.id} type="button" className="wr-bubble__item" onClick={() => run(action.id)}>
                  <strong>{action.label}</strong>
                  <span>{action.hint}</span>
                </button>
              ))}
              <form className="wr-bubble__custom" onSubmit={(event) => { event.preventDefault(); if (instruction.trim()) run('custom', instruction.trim()); }}>
                <input className="wr-input" style={{ height: 32, fontSize: 12 }} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Or tell it what to do…" autoFocus />
                <button type="submit" className="wr-icon-btn" style={{ width: 32, height: 32 }} aria-label="Run instruction" disabled={!instruction.trim()}><ArrowRight size={14} /></button>
              </form>
            </div>
          )}
        </div>
        {ttsEnabled && (
          <>
            <span className="wr-bubble__sep" />
            <button
              type="button"
              className="wr-bubble__ai"
              dir="auto"
              aria-label={ttsBusy ? 'Stop narration · إيقاف السرد' : 'Read selection aloud · قراءة المحدد بصوت عالٍ'}
              title={ttsBusy ? 'Stop narration · إيقاف السرد' : 'Read selection aloud · قراءة المحدد بصوت عالٍ'}
              aria-pressed={ttsBusy}
              onClick={narrateSelection}
            >
              {ttsStatus === 'preparing' || ttsStatus === 'synthesizing'
                ? <CircleNotch size={14} className="animate-spin" aria-hidden="true" />
                : ttsBusy
                  ? <Stop size={14} weight="fill" aria-hidden="true" />
                  : <SpeakerHigh size={14} aria-hidden="true" />}
              {ttsBusy ? 'Stop' : 'Read aloud'}
            </button>
          </>
        )}
      </div>
    </BubbleMenu>
  );
};
