import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  At,
  CheckCircle,
  ChatCenteredText,
  CircleNotch,
  User,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
].join(',');

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const successTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setMessage('');
    setName('');
    setContact('');
    setSubmitState('idle');
    setErrorMessage('');

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      window.clearTimeout(focusTimer);
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !modalRef.current) return;

      const focusableElements = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleDialogKeyDown);
    return () => document.removeEventListener('keydown', handleDialogKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = async (): Promise<void> => {
    if (!message.trim() || submitState === 'loading') return;

    setSubmitState('loading');
    setErrorMessage('');

    try {
      await invoke('send_feedback', {
        message: message.trim(),
        name: name.trim() || null,
        contact: contact.trim() || null,
      });
      setSubmitState('success');
      successTimerRef.current = window.setTimeout(onClose, 2200);
    } catch (err) {
      setSubmitState('error');
      setErrorMessage(String(err));
    }
  };

  const handleMessageKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            aria-describedby="feedback-description"
            className="app-surface app-surface--raised relative w-full max-w-[560px] overflow-hidden"
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <header className="flex items-start justify-between gap-4 border-b border-[var(--border-primary)] px-6 py-5">
              <div className="flex min-w-0 items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--accent-border)] bg-[var(--accent-light)] text-[var(--accent)]">
                  <ChatCenteredText size={20} weight="regular" aria-hidden="true" />
                </div>
                <div className="min-w-0 pt-0.5">
                  <h2 id="feedback-title" className="text-[15px] font-semibold tracking-[-0.015em] text-[var(--text-primary)]">
                    Share feedback
                  </h2>
                  <p id="feedback-description" className="mt-1 max-w-[44ch] text-xs leading-5 text-[var(--text-secondary)]">
                    Tell us what slowed you down or what would make YzPzCode better.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="app-icon-button shrink-0"
                aria-label="Close feedback"
                title="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            <AnimatePresence mode="wait" initial={false}>
              {submitState === 'success' ? (
                <motion.section
                  key="success"
                  className="flex min-h-[300px] flex-col items-center justify-center px-8 py-12 text-center"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  aria-live="polite"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-500">
                    <CheckCircle size={26} weight="regular" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-[15px] font-semibold text-[var(--text-primary)]">Feedback sent</h3>
                  <p className="mt-1.5 max-w-[34ch] text-xs leading-5 text-[var(--text-secondary)]">
                    Thank you. Your note helps us decide what to improve next.
                  </p>
                </motion.section>
              ) : (
                <motion.form
                  key="form"
                  className="px-6 pb-5 pt-5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSubmit();
                  }}
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label htmlFor="feedback-message" className="text-xs font-medium text-[var(--text-primary)]">
                        Your feedback <span className="text-[var(--accent)]">*</span>
                      </label>
                      <span className="text-[10px] tabular-nums text-[var(--text-secondary)]">
                        {message.length}/4000
                      </span>
                    </div>
                    <textarea
                      id="feedback-message"
                      ref={inputRef}
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      onKeyDown={handleMessageKeyDown}
                      placeholder="What happened? What did you expect instead?"
                      maxLength={4000}
                      className="app-input min-h-[148px] resize-none px-3.5 py-3 text-[13px] leading-5 placeholder:text-[var(--text-secondary)]/55"
                      disabled={submitState === 'loading'}
                      required
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
                        <User size={13} className="text-[var(--text-secondary)]" aria-hidden="true" />
                        Name <span className="font-normal text-[var(--text-secondary)]">· Optional</span>
                      </span>
                      <input
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="How should we address you?"
                        maxLength={100}
                        className="app-input text-[13px] placeholder:text-[var(--text-secondary)]/55"
                        disabled={submitState === 'loading'}
                        autoComplete="name"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
                        <At size={13} className="text-[var(--text-secondary)]" aria-hidden="true" />
                        Contact <span className="font-normal text-[var(--text-secondary)]">· Optional</span>
                      </span>
                      <input
                        type="text"
                        value={contact}
                        onChange={(event) => setContact(event.target.value)}
                        placeholder="Email or Discord"
                        maxLength={160}
                        className="app-input text-[13px] placeholder:text-[var(--text-secondary)]/55"
                        disabled={submitState === 'loading'}
                      />
                    </label>
                  </div>

                  <p className="mt-2.5 text-[10px] leading-4 text-[var(--text-secondary)]">
                    Add contact details only if you are comfortable with us following up.
                  </p>

                  <AnimatePresence>
                    {submitState === 'error' && (
                      <motion.div
                        role="alert"
                        className="mt-4 flex items-start gap-2.5 rounded-[var(--radius-control)] border border-rose-500/25 bg-rose-500/8 px-3 py-2.5 text-xs text-rose-400"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                      >
                        <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                        <span className="leading-5">{errorMessage || 'We could not send your feedback. Please try again.'}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <footer className="mt-5 flex flex-col-reverse gap-3 border-t border-[var(--border-primary)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
                      <kbd className="rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-1.5 py-0.5">Ctrl / ⌘</kbd>
                      <span>+</span>
                      <kbd className="rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-1.5 py-0.5">Enter</kbd>
                      <span className="ml-1">to send</span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={onClose}
                        className="app-button app-button--quiet"
                        disabled={submitState === 'loading'}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!message.trim() || submitState === 'loading'}
                        className="app-button app-button--primary min-w-[118px] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {submitState === 'loading' ? (
                          <>
                            <CircleNotch size={15} className="animate-spin" aria-hidden="true" />
                            Sending
                          </>
                        ) : (
                          <>
                            Send feedback
                            <ArrowRight size={14} aria-hidden="true" />
                          </>
                        )}
                      </button>
                    </div>
                  </footer>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
