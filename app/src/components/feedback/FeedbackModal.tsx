import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node) && isOpen) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setName('');
      setContact('');
      setSubmitState('idle');
      setErrorMessage('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!message.trim()) return;

    setSubmitState('loading');
    setErrorMessage('');

    try {
      await invoke('send_feedback', {
        message: message.trim(),
        name: name.trim() || null,
        contact: contact.trim() || null,
      });
      setSubmitState('success');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setSubmitState('error');
      setErrorMessage(String(err));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 font-mono">
      <div
        ref={modalRef}
        className="w-full max-w-lg mx-4 bg-zinc-950 border border-zinc-800 shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-zinc-600"></span>
            <span className="text-xs text-zinc-400 uppercase tracking-widest">Feedback</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-zinc-300"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {submitState === 'success' ? (
            <div className="py-8 text-center">
              <div className="flex items-center justify-center gap-2 text-emerald-500 mb-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm uppercase tracking-widest">Sent</span>
              </div>
              <p className="text-xs text-zinc-500">Thank you for your feedback</p>
            </div>
          ) : (
            <>
              <div>
                <label className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
                  <span className="text-zinc-600">$</span>
                  <span>Message</span>
                  <span className="text-rose-500">*</span>
                </label>
                <textarea
                  ref={inputRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="// your feedback here..."
                  rows={5}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 resize-none leading-relaxed"
                  disabled={submitState === 'loading'}
                  spellCheck={false}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
                    <span className="text-zinc-600">$</span>
                    <span>Name</span>
                    <span className="text-zinc-700">[opt]</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="anonymous"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600"
                    disabled={submitState === 'loading'}
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
                    <span className="text-zinc-600">$</span>
                    <span>Contact</span>
                    <span className="text-zinc-700">[opt]</span>
                  </label>
                  <input
                    type="text"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="email/discord"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600"
                    disabled={submitState === 'loading'}
                    spellCheck={false}
                  />
                </div>
              </div>

              {submitState === 'error' && (
                <div className="flex items-start gap-2 p-3 bg-rose-950/30 border border-rose-900/50 text-xs text-rose-400">
                  <span className="text-rose-500">[!]</span>
                  <span className="leading-relaxed">{errorMessage || 'Transmission failed'}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                <span className="text-[10px] text-zinc-600">ctrl+enter to send</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors uppercase tracking-widest"
                    disabled={submitState === 'loading'}
                  >
                    [ Cancel ]
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!message.trim() || submitState === 'loading'}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 text-zinc-300 disabled:cursor-not-allowed transition-colors uppercase tracking-widest border border-zinc-700 disabled:border-zinc-800"
                  >
                    {submitState === 'loading' ? (
                      <>
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span>Sending...</span>
                      </>
                    ) : (
                      <span>[ Send ]</span>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
