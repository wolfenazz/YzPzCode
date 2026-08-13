import React, { useEffect, useState } from 'react';
import type { AgentQuestion } from '../../types';

interface QuestionCardProps {
  question: AgentQuestion;
  onAnswer: (requestId: string, answer: string) => void;
}

/**
 * Renders an agent `ask_question` prompt: the question plus 2–5 selectable
 * options and a Send button. Selecting an option and pressing Send resolves
 * the agent's question.
 */
export const QuestionCard: React.FC<QuestionCardProps> = ({ question, onAnswer }) => {
  const [selected, setSelected] = useState<string | null>(question.options[0] ?? null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSelected(question.options[0] ?? null);
    setSubmitting(false);
  }, [question]);

  const handleSend = () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    onAnswer(question.requestId, selected);
  };

  return (
    <div className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-light)]/10 overflow-hidden animate-scale-in">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--accent-border)]/40 bg-[var(--accent-light)]/15">
        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[var(--accent)] text-white">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 4v-4z" />
          </svg>
        </span>
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--accent)]">
          Question from the agent
        </span>
        <span className="ml-auto font-mono text-[8px] text-[var(--text-secondary)]/50">ask_question</span>
      </div>
      <div className="px-3 py-2.5 space-y-2.5">
        <p className="text-[12px] leading-relaxed text-[var(--text-primary)]">{question.question}</p>
        <div className="space-y-1.5">
          {question.options.map((opt, i) => {
            const active = selected === opt;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(opt)}
                className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-md border transition-all duration-100 cursor-pointer ${
                  active
                    ? 'border-[var(--accent-border)] bg-[var(--accent-light)]/25 text-[var(--text-primary)]'
                    : 'border-[var(--border-primary)] bg-[var(--bg-main)] text-[var(--text-secondary)] hover:border-[var(--accent-border)]/60 hover:text-[var(--text-primary)]'
                }`}
              >
                <span
                  className={`flex items-center justify-center w-4 h-4 rounded-full border shrink-0 transition-colors duration-100 ${
                    active ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border-primary)]'
                  }`}
                >
                  {active && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-[11px] leading-snug">{opt}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2 pt-0.5">
          <button
            type="button"
            onClick={handleSend}
            disabled={!selected || submitting}
            className="h-7 px-3.5 rounded-md bg-[var(--accent)] text-white text-[9px] font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-40 transition-all duration-100 cursor-pointer"
          >
            {submitting ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};
