import React, { useEffect, useState } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/react';
import { CaretDown, Sparkle, TextB, TextItalic, TextUnderline, ArrowRight } from '@phosphor-icons/react';
import { REWRITE_ACTIONS, type RewriteAction } from '../../utils/writing/prompts';

interface SelectionMenuProps {
  editor: Editor;
  busy: boolean;
  onAction: (action: RewriteAction, instruction?: string) => void;
}

export const SelectionMenu: React.FC<SelectionMenuProps> = ({ editor, busy, onAction }) => {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');

  useEffect(() => {
    const close = (): void => setOpen(false);
    editor.on('selectionUpdate', close);
    return () => { editor.off('selectionUpdate', close); };
  }, [editor]);

  const run = (action: RewriteAction, text?: string): void => {
    setOpen(false);
    setInstruction('');
    onAction(action, text);
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
          <button type="button" className="wr-bubble__ai" disabled={busy} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
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
      </div>
    </BubbleMenu>
  );
};
