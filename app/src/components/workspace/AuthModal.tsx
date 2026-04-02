import React, { useState, useEffect } from 'react';
import { AgentType } from '../../types';

interface AuthModalProps {
  agent: AgentType;
  onClose: () => void;
  getAuthInstructions: (agent: AgentType) => Promise<string[]>;
  theme: 'dark' | 'light';
}

export const AuthModal: React.FC<AuthModalProps> = ({ agent, onClose, getAuthInstructions, theme }) => {
  const [instructions, setInstructions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const isLight = theme === 'light';

  useEffect(() => {
    getAuthInstructions(agent).then((instr) => {
      setInstructions(instr);
      setLoading(false);
    });
  }, [agent, getAuthInstructions]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-50 font-mono">
      <div className={`border rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl ${
        isLight ? 'bg-gray-700 border-gray-500' : 'bg-zinc-950 border-zinc-800'
      }`}>
        <h3 className={`text-sm font-bold mb-4 tracking-widest uppercase border-b pb-2 ${
          isLight ? 'text-zinc-800 border-zinc-300' : 'text-zinc-100 border-zinc-800'
        }`}>
          &gt; Auth: {agent}
        </h3>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <svg className={`w-6 h-6 animate-spin ${isLight ? 'text-gray-300' : 'text-zinc-600'}`} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : (
          <div className="space-y-4">
            <p className={`text-xs uppercase tracking-widest ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>Execute instructions:</p>
            <ul className={`space-y-2 p-4 border rounded-sm ${
              isLight ? 'bg-zinc-50 border-zinc-300' : 'bg-zinc-900/50 border-zinc-800'
            }`}>
              {instructions.map((instr, i) => (
                <li key={i} className={`text-xs flex gap-2 ${isLight ? 'text-gray-200' : 'text-zinc-300'}`}>
                  <span className={`select-none ${isLight ? 'text-gray-300' : 'text-zinc-600'}`}>{'$>'}</span>
                  <span>{instr}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-8 flex justify-end">
          <button
            onClick={onClose}
            className={`px-6 py-2 border transition-colors uppercase tracking-widest text-xs rounded-sm cursor-pointer ${
              isLight
                ? 'bg-zinc-200 text-zinc-700 border-zinc-300 hover:bg-zinc-300 hover:text-zinc-900'
                : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-100'
            }`}
          >
            [ Close ]
          </button>
        </div>
      </div>
    </div>
  );
};
