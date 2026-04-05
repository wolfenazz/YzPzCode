import React, { useState, useEffect } from 'react';

const AUTHORS = [
  { name: 'Naseem', role: 'Co-Founder & Developer' },
  { name: 'Noor', role: 'Co-Founder & Designer' },
  { name: 'Khalid', role: 'Co-Founder & Engineer' },
];

export const SettingsAbout: React.FC = () => {
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    if ('__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/app').then(({ getVersion }) => {
        getVersion().then(setAppVersion);
      });
    } else {
      setAppVersion('dev');
    }
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-bold text-zinc-100 tracking-widest uppercase mb-1">About</h2>
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Application information and credits</p>
      </div>

      <div className="space-y-6">
        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <span className="text-2xl font-mono font-bold text-theme-main">YZ</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100 tracking-wider">YzPzCode</h3>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">Multi-terminal AI development environment</p>
              <p className="text-xs text-zinc-400 mt-1">Version {appVersion || '---'}</p>
            </div>
          </div>
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Built By</h3>
          
          <div className="space-y-3">
            {AUTHORS.map((author) => (
              <div
                key={author.name}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-900/30 border border-zinc-800/50"
              >
                <p className="text-xs text-zinc-300 font-medium">{author.name}</p>
                <p className="text-[10px] text-zinc-500">{author.role}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Tech Stack</h3>
          
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: 'Tauri v2', desc: 'Desktop Framework' },
              { name: 'React 19', desc: 'UI Library' },
              { name: 'TypeScript', desc: 'Language' },
              { name: 'Rust', desc: 'Backend' },
              { name: 'Zustand', desc: 'State Management' },
              { name: 'Tailwind CSS', desc: 'Styling' },
              { name: 'portable-pty', desc: 'Terminal Engine' },
              { name: 'CodeMirror 6', desc: 'Code Editor' },
            ].map((tech) => (
              <div
                key={tech.name}
                className="px-3 py-2 rounded-lg bg-zinc-900/30 border border-zinc-800/50"
              >
                <p className="text-xs text-zinc-300 font-medium">{tech.name}</p>
                <p className="text-[9px] text-zinc-600">{tech.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Links</h3>
          
          <div className="space-y-2">
            <a
              href="https://github.com/wolfenazz/YzPzCode"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-900/30 border border-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-800/30 transition-all duration-150 group"
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">GitHub Repository</span>
              </div>
              <svg className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>

            <a
              href="https://github.com/wolfenazz/YzPzCode/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-900/30 border border-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-800/30 transition-all duration-150 group"
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">Report an Issue</span>
              </div>
              <svg className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-3">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">License</h3>
          <p className="text-[10px] text-zinc-500">
            YzPzCode is proprietary software. All rights reserved.
          </p>
          <p className="text-[10px] text-zinc-600">
            Copyright © 2026 Naseem, Noor & Khalid.
          </p>
        </div>
      </div>
    </div>
  );
};
