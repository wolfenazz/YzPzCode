import React from 'react';
import type { DesignerBreakpoints, DesignerDevice } from './types';

interface ResponsivePreviewControlsProps {
  previewDevice: DesignerDevice;
  breakpoints: DesignerBreakpoints;
  onPreviewDeviceChange: (device: DesignerDevice) => void;
  onBreakpointsChange: (breakpoints: DesignerBreakpoints) => void;
}

const previewOptions: Array<{ id: DesignerDevice; label: string; icon: React.ReactNode }> = [
  {
    id: 'responsive',
    label: 'Responsive',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5h16v10H4zM8 19h8" />,
  },
  {
    id: 'desktop',
    label: 'Desktop',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5h16v11H4zM9 20h6" />,
  },
  {
    id: 'tablet',
    label: 'Tablet',
    icon: <rect x="6" y="3" width="12" height="18" rx="2" strokeWidth={1.5} />,
  },
  {
    id: 'mobile',
    label: 'Mobile',
    icon: <rect x="8" y="2.5" width="8" height="19" rx="2" strokeWidth={1.5} />,
  },
];

export const ResponsivePreviewControls: React.FC<ResponsivePreviewControlsProps> = ({
  previewDevice,
  breakpoints,
  onPreviewDeviceChange,
  onBreakpointsChange,
}) => {
  const updateBreakpoint = (key: keyof DesignerBreakpoints, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onBreakpointsChange({ ...breakpoints, [key]: parsed });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-950/80 px-3 py-2">
      <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950 p-1">
        {previewOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => onPreviewDeviceChange(option.id)}
            className={`flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-[9px] font-bold uppercase tracking-[0.16em] transition-colors cursor-pointer ${
              previewDevice === option.id
                ? 'bg-zinc-200 text-zinc-950'
                : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100'
            }`}
            title={option.label}
            aria-label={option.label}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {option.icon}
            </svg>
            <span className="hidden xl:inline">{option.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(breakpoints).map(([key, value]) => (
          <label key={key} className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-600">{key}</span>
            <input
              type="number"
              min={320}
              max={1920}
              value={value}
              onChange={(event) => updateBreakpoint(key as keyof DesignerBreakpoints, event.target.value)}
              className="w-14 bg-transparent text-[10px] font-semibold text-zinc-300 outline-none"
            />
          </label>
        ))}
      </div>
    </div>
  );
};
