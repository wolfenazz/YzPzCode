import React, { useState, useEffect } from 'react';
import logo from '../../../assets/YzPzCodeLogo.png';
import tauriLogo from '../../../assets/tauri.svg';
import typescriptLogo from '../../../assets/typescript.svg';

const AUTHORS = [
  { name: 'Naseem', role: 'Co-Founder & Developer' },
  { name: 'Noor', role: 'Co-Founder & Designer' },
  { name: 'Khalid', role: 'Co-Founder & Engineer' },
];

const TECH_STACK = [
  {
    name: 'Tauri v2',
    desc: 'Desktop Framework',
    icon: <img src={tauriLogo} alt="Tauri" className="w-4 h-4" />,
  },
  {
    name: 'React 19',
    desc: 'UI Library',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="2" fill="#61DAFB" />
        <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#61DAFB" strokeWidth="1" />
        <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#61DAFB" strokeWidth="1" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#61DAFB" strokeWidth="1" transform="rotate(120 12 12)" />
      </svg>
    ),
  },
  {
    name: 'TypeScript',
    desc: 'Language',
    icon: <img src={typescriptLogo} alt="TypeScript" className="w-4 h-4" />,
  },
  {
    name: 'Rust',
    desc: 'Backend',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2L3 7v10l9 5 9-5V7l-9-5z"
          stroke="#DEA584"
          strokeWidth="1.2"
          fill="none"
        />
        <text x="12" y="15" textAnchor="middle" fill="#DEA584" fontSize="8" fontFamily="monospace" fontWeight="bold">
          R
        </text>
      </svg>
    ),
  },
  {
    name: 'Zustand',
    desc: 'State Management',
    icon: (
      <span className="text-[10px] font-mono font-bold text-amber-400/80 leading-none select-none">Z</span>
    ),
  },
  {
    name: 'Tailwind CSS',
    desc: 'Styling',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
        <path d="M12 6c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.3.74 1.9 1.35C13.33 10.79 14.5 12 17 12c2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.3-.74-1.9-1.35C15.67 7.21 14.5 6 12 6zm-5 8c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.3.74 1.9 1.35C8.33 18.79 9.5 20 12 20c2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.3-.74-1.9-1.35C14.67 15.21 13.5 14 7 14z"
          fill="#38BDF8"
        />
      </svg>
    ),
  },
  {
    name: 'portable-pty',
    desc: 'Terminal Engine',
    icon: (
      <span className="text-[10px] font-mono font-bold text-green-400/70 leading-none select-none">&gt;_</span>
    ),
  },
  {
    name: 'CodeMirror 6',
    desc: 'Code Editor',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="#D43157" strokeWidth="1.2" />
        <path d="M7 8h3M7 12h5M7 16h4" stroke="#D43157" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
];

const ExternalLinkIcon = () => (
  <svg className="w-3 h-3 text-zinc-600 group-hover:text-[var(--accent)] opacity-50 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

const GitHubIcon = () => (
  <svg className="w-4 h-4 text-zinc-500 group-hover:text-[var(--accent)] opacity-60 transition-colors" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

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
    <div className="space-y-8 font-mono">
      <div>
        <h2 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
          About
        </h2>
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">
          Application information and credits
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-lg bg-[#080810]/60 border border-[#1a1a2e]/30 flex items-center justify-center p-1.5">
              <img src={logo} alt="YzPzCode" className="w-16 h-16 object-contain" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100 tracking-wider">YzPzCode</h3>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">
                Multi-terminal AI development environment
              </p>
              <p className="text-xs text-zinc-400 mt-1.5">
                Version {appVersion || '---'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-4">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
            Built By
          </h3>

          <div className="space-y-2">
            {AUTHORS.map((author) => (
              <div
                key={author.name}
                className="flex items-center justify-between px-4 py-3 bg-[#080810]/30 border border-[#1a1a2e]/20 rounded-lg hover:border-[var(--accent-border)] transition-colors duration-150"
              >
                <p className="text-xs text-zinc-300 font-medium">{author.name}</p>
                <p className="text-[10px] text-zinc-500">{author.role}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-4">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
            Tech Stack
          </h3>

          <div className="grid grid-cols-2 gap-2">
            {TECH_STACK.map((tech) => (
              <div
                key={tech.name}
                className="flex items-center gap-2.5 px-3 py-2.5 bg-[#080810]/30 border border-[#1a1a2e]/20 rounded-lg"
              >
                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                  {tech.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-zinc-300 font-medium leading-tight">{tech.name}</p>
                  <p className="text-[9px] text-zinc-600 leading-tight mt-0.5">{tech.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-4">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
            Links
          </h3>

          <div className="space-y-2">
            <a
              href="https://github.com/wolfenazz/YzPzCode"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 bg-[#080810]/30 border border-[#1a1a2e]/20 rounded-lg hover:border-[var(--accent-border)] transition-all duration-150 group"
            >
              <div className="flex items-center gap-3">
                <GitHubIcon />
                <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">
                  GitHub Repository
                </span>
              </div>
              <ExternalLinkIcon />
            </a>

            <a
              href="https://github.com/wolfenazz/YzPzCode/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 bg-[#080810]/30 border border-[#1a1a2e]/20 rounded-lg hover:border-[var(--accent-border)] transition-all duration-150 group"
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-zinc-500 group-hover:text-[var(--accent)] opacity-60 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">
                  Report an Issue
                </span>
              </div>
              <ExternalLinkIcon />
            </a>
          </div>
        </div>

        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-3">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
            License
          </h3>
          <p className="text-[10px] text-zinc-500">
            YzPzCode is proprietary software. All rights reserved.
          </p>
          <p className="text-[10px] text-zinc-600">
            Copyright &copy; 2026 Naseem, Noor &amp; Khalid.
          </p>
        </div>
      </div>
    </div>
  );
};
