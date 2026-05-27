import React from 'react';
import type { DesignerCodeTab, GeneratedDesign } from './types';
import { DESIGNER_SYSTEM_PROMPT } from './designerGenerator';

interface GeneratedCodePanelProps {
  design: GeneratedDesign | null;
  activeTab: DesignerCodeTab;
  onTabChange: (tab: DesignerCodeTab) => void;
}

const tabs: Array<{ id: DesignerCodeTab; label: string }> = [
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'map', label: 'Map' },
  { id: 'system', label: 'Prompt' },
];

const getCode = (design: GeneratedDesign | null, activeTab: DesignerCodeTab): string => {
  if (!design && activeTab !== 'system') return '';
  if (activeTab === 'html') return design?.html ?? '';
  if (activeTab === 'css') return design?.css ?? '';
  if (activeTab === 'map') return design?.customizationMap ?? '';
  return DESIGNER_SYSTEM_PROMPT;
};

export const GeneratedCodePanel: React.FC<GeneratedCodePanelProps> = ({ design, activeTab, onTabChange }) => {
  const code = getCode(design, activeTab);

  const copyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code).catch(console.error);
  };

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-zinc-800/80 bg-zinc-950/75">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 px-3 py-2">
        <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`h-7 rounded-md px-2.5 text-[9px] font-bold uppercase tracking-[0.16em] transition-colors cursor-pointer ${
                activeTab === tab.id ? 'bg-zinc-200 text-zinc-950' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={copyCode}
          disabled={!code}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 hover:text-zinc-100 disabled:opacity-40 cursor-pointer"
          title="Copy active code"
          aria-label="Copy active code"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 8h10v10H8zM6 16H4V4h12v2" />
          </svg>
        </button>
      </div>

      <pre className="min-h-0 flex-1 overflow-auto p-4 text-[11px] leading-5 text-zinc-300">
        <code>{code || 'Generate a design to create HTML, CSS, and an editable customization map.'}</code>
      </pre>
    </section>
  );
};
