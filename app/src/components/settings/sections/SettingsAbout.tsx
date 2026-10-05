import React, { useState, useEffect } from 'react';
import { ArrowSquareOut, Bug, GithubLogo, Scales, UsersThree } from '@phosphor-icons/react';
import logo from '../../../assets/YzPzCodeLogo.png';
import tauriLogo from '../../../assets/tauri.svg';
import typescriptLogo from '../../../assets/typescript.svg';
import {
  Badge,
  SettingsBlock,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
} from '../SettingsKit';

const AUTHORS = [
  { name: 'Naseem', role: 'Co-Founder & Developer' },
  { name: 'Noor', role: 'Co-Founder & Designer' },
  { name: 'Khalid', role: 'Co-Founder & Engineer' },
];

const TECH_STACK = [
  {
    name: 'Tauri v2',
    desc: 'Desktop framework',
    icon: <img src={tauriLogo} alt="" width={16} height={16} />,
  },
  {
    name: 'React 19',
    desc: 'UI library',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    icon: <img src={typescriptLogo} alt="" width={16} height={16} />,
  },
  {
    name: 'Rust',
    desc: 'Backend',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="#DEA584" strokeWidth="1.2" fill="none" />
        <text x="12" y="15" textAnchor="middle" fill="#DEA584" fontSize="8" fontFamily="monospace" fontWeight="bold">R</text>
      </svg>
    ),
  },
  {
    name: 'Zustand',
    desc: 'State management',
    icon: <span style={{ color: '#e0a93b', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>Z</span>,
  },
  {
    name: 'Tailwind CSS',
    desc: 'Styling',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 6c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.3.74 1.9 1.35C13.33 10.79 14.5 12 17 12c2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.3-.74-1.9-1.35C15.67 7.21 14.5 6 12 6zm-5 8c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.3.74 1.9 1.35C8.33 18.79 9.5 20 12 20c2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.3-.74-1.9-1.35C14.67 15.21 13.5 14 7 14z" fill="#38BDF8" />
      </svg>
    ),
  },
  {
    name: 'portable-pty',
    desc: 'Terminal engine',
    icon: <span style={{ color: '#4ade80', fontSize: 10, fontWeight: 700, lineHeight: 1 }}>&gt;_</span>,
  },
  {
    name: 'CodeMirror 6',
    desc: 'Code editor',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="#D43157" strokeWidth="1.2" />
        <path d="M7 8h3M7 12h5M7 16h4" stroke="#D43157" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
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
    <SettingsStack>
      <SettingsGroup>
        <SettingsBlock>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <img alt="YzPzCode" src={logo} style={{ width: '3.5rem', height: '3.5rem', objectFit: 'contain' }} />
            <div>
              <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                YzPzCode <Badge>{appVersion ? `v${appVersion}` : '…'}</Badge>
              </p>
              <p style={{ margin: '0.1875rem 0 0', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                A multi-terminal development environment for AI coding tools.
              </p>
            </div>
          </div>
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup title="Links">
        <SettingsRow
          as="a"
          description="Source code and releases"
          href="https://github.com/wolfenazz/YzPzCode"
          icon={<GithubLogo size={16} aria-hidden="true" />}
          label="GitHub repository"
        >
          <ArrowSquareOut size={15} aria-hidden="true" color="var(--text-secondary)" />
        </SettingsRow>
        <SettingsRow
          as="a"
          description="Found a bug or have an idea? Tell us."
          href="https://github.com/wolfenazz/YzPzCode/issues"
          icon={<Bug size={16} aria-hidden="true" />}
          label="Report an issue"
        >
          <ArrowSquareOut size={15} aria-hidden="true" color="var(--text-secondary)" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Built by">
        {AUTHORS.map((author) => (
          <SettingsRow
            description={author.role}
            icon={<UsersThree size={16} aria-hidden="true" />}
            key={author.name}
            label={author.name}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="Built with">
        <SettingsBlock>
          <div className="st-options st-options--wide">
            {TECH_STACK.map((tech) => (
              <div className="st-option st-option--row st-option--static" key={tech.name}>
                <span style={{ display: 'grid', width: '1.25rem', placeItems: 'center' }}>{tech.icon}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="st-option__name">{tech.name}</span>
                  <span className="st-option__sub">{tech.desc}</span>
                </span>
              </div>
            ))}
          </div>
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup title="License">
        <SettingsRow
          description="YzPzCode is proprietary software. All rights reserved. Copyright © 2026 Naseem, Noor & Khalid."
          icon={<Scales size={16} aria-hidden="true" />}
          label="Proprietary"
        />
        <SettingsRow
          description="Workspace view and update icons: Solar by 480 Design, licensed under CC BY 4.0."
          icon={<Scales size={16} aria-hidden="true" />}
          label="Third-party icons"
        />
      </SettingsGroup>
    </SettingsStack>
  );
};
