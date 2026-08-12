import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { htmlToPlainText, sanitizeRichText } from '../../utils/richText';

interface RichPromptEditorProps {
  initialHtml?: string;
  placeholder?: string;
  onChange?: (html: string) => void;
  onSubmit?: (plainText: string) => void;
  submitting?: boolean;
}

interface ActiveState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  bullet: boolean;
  ordered: boolean;
  quote: boolean;
  code: boolean;
}

type ToolbarActionKey = keyof ActiveState | 'link' | 'unlink' | 'clear';

interface ToolbarAction {
  key: ToolbarActionKey;
  label: string;
  icon: string;
  command: string;
  value?: string;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { key: 'bold', label: 'Bold', icon: 'material-symbols:format-bold-rounded', command: 'bold' },
  { key: 'italic', label: 'Italic', icon: 'material-symbols:format-italic-rounded', command: 'italic' },
  { key: 'underline', label: 'Underline', icon: 'material-symbols:format-underlined-rounded', command: 'underline' },
  { key: 'strike', label: 'Strikethrough', icon: 'material-symbols:format-strikethrough-rounded', command: 'strikeThrough' },
  {
    key: 'code',
    label: 'Inline code',
    icon: 'material-symbols:code-rounded',
    command: 'insertHTML',
    value: '<code class="rich-prompt-code">\u200b</code>',
  },
  { key: 'quote', label: 'Quote', icon: 'material-symbols:format-quote-rounded', command: 'formatBlock', value: 'blockquote' },
  { key: 'bullet', label: 'Bullet list', icon: 'material-symbols:format-list-bulleted-rounded', command: 'insertUnorderedList' },
  { key: 'ordered', label: 'Numbered list', icon: 'material-symbols:format-list-numbered-rounded', command: 'insertOrderedList' },
  { key: 'link', label: 'Insert link', icon: 'material-symbols:link-rounded', command: 'createLink' },
  { key: 'unlink', label: 'Remove link', icon: 'material-symbols:link-off-rounded', command: 'unlink' },
  { key: 'clear', label: 'Clear formatting', icon: 'material-symbols:format-clear-rounded', command: 'removeFormat' },
];

const EMPTY_ACTIVE: ActiveState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  bullet: false,
  ordered: false,
  quote: false,
  code: false,
};

const isInsideTag = (tag: string): boolean => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const el = selection.anchorNode?.parentElement;
  return el?.closest(tag) !== null;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const RichPromptEditor = memo(function RichPromptEditor({
  initialHtml,
  placeholder,
  onChange,
  onSubmit,
  submitting,
}: RichPromptEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);
  const [active, setActive] = useState<ActiveState>(EMPTY_ACTIVE);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const current = sanitizeRichText(el.innerHTML);
    const next = sanitizeRichText(initialHtml ?? '');
    if (current === next) return;
    el.innerHTML = next;
    const normalized = el.innerHTML.replace(/<br\s*\/?>/gi, '').trim();
    if (normalized === '') el.innerHTML = '';
  }, [initialHtml]);

  const emitChange = useCallback(() => {
    onChangeRef.current?.(editorRef.current?.innerHTML ?? '');
  }, []);

  const normalizeEmpty = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML.replace(/<br\s*\/?>/gi, '').trim();
    if (html === '') el.innerHTML = '';
  }, []);

  const refreshState = useCallback(() => {
    setActive({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strike: document.queryCommandState('strikeThrough'),
      bullet: document.queryCommandState('insertUnorderedList'),
      ordered: document.queryCommandState('insertOrderedList'),
      quote: document.queryCommandValue('formatBlock').toLowerCase() === 'blockquote',
      code: isInsideTag('code'),
    });
  }, []);

  const handleInput = useCallback(() => {
    normalizeEmpty();
    emitChange();
    refreshState();
  }, [emitChange, normalizeEmpty, refreshState]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing) return;

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (submitting) return;
        onSubmitRef.current?.(htmlToPlainText(editorRef.current?.innerHTML ?? ''));
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        document.execCommand('insertText', false, '  ');
        emitChange();
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        window.requestAnimationFrame(() => normalizeEmpty());
      }
    },
    [emitChange, normalizeEmpty, submitting],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const text = event.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
      emitChange();
      refreshState();
    },
    [emitChange, refreshState],
  );

  const handleAction = useCallback(
    (action: ToolbarAction) => {
      editorRef.current?.focus();
      if (action.command === 'createLink') {
        const url = window.prompt('Link URL:', 'https://');
        if (url) document.execCommand('createLink', false, url);
      } else if (action.command === 'insertHTML') {
        const selection = window.getSelection();
        const selected = selection ? selection.toString() : '';
        if (selected) {
          document.execCommand('insertHTML', false, `<code class="rich-prompt-code">${escapeHtml(selected)}</code>`);
        } else {
          document.execCommand('insertHTML', false, action.value);
        }
      } else {
        document.execCommand(action.command, false, action.value);
      }
      normalizeEmpty();
      refreshState();
      emitChange();
    },
    [emitChange, normalizeEmpty, refreshState],
  );

  const toolbarButtons = useMemo(
    () =>
      TOOLBAR_ACTIONS.map((action) => {
        const isActive = (action.key as keyof ActiveState) in active && action.key !== 'link' && action.key !== 'unlink' && action.key !== 'clear' && active[action.key as keyof ActiveState];
        return (
          <button
            key={action.key}
            type="button"
            title={action.label}
            aria-label={action.label}
            aria-pressed={isActive}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleAction(action)}
            className={`flex h-6 w-6 items-center justify-center rounded-[2px] transition-colors cursor-pointer ${
              isActive
                ? 'bg-zinc-800 text-emerald-300'
                : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100'
            }`}
          >
            <Icon icon={action.icon} className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        );
      }),
    [active, handleAction],
  );

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-px border border-b-0 border-zinc-800 bg-zinc-900 px-1.5 py-1 select-none">
        {toolbarButtons}
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        suppressContentEditableWarning
        spellCheck={false}
        data-placeholder={placeholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onKeyUp={refreshState}
        onMouseUp={refreshState}
        className="rich-prompt-editor min-h-[96px] max-h-[240px] w-full resize-y overflow-auto border border-zinc-800 bg-zinc-900/70 px-3 py-2.5 font-mono text-[11px] leading-5 text-zinc-200 outline-none whitespace-pre-wrap break-words transition-colors focus:border-zinc-600"
      />
    </div>
  );
});
