import React from 'react';
import type { DesignerDevice, GeneratedDesign } from './types';

interface DesignPreviewProps {
  design: GeneratedDesign | null;
  previewDevice: DesignerDevice;
}

const deviceFrameClass: Record<DesignerDevice, string> = {
  responsive: 'h-full w-full',
  desktop: 'h-[720px] w-[1180px]',
  tablet: 'h-[760px] w-[820px]',
  mobile: 'h-[760px] w-[390px]',
};

const buildPreviewDocument = (design: GeneratedDesign): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${design.css}</style>
  </head>
  <body>${design.html}</body>
</html>`;

export const DesignPreview: React.FC<DesignPreviewProps> = ({ design, previewDevice }) => {
  if (!design) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950">
        <div className="max-w-sm rounded-lg border border-dashed border-zinc-800 bg-zinc-950/70 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-500">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5h16v14H4zM8 9h8M8 13h5" />
            </svg>
          </div>
          <h3 className="mt-4 text-[11px] font-black uppercase tracking-[0.22em] text-zinc-300">Designer waiting</h3>
          <p className="mt-2 text-[11px] leading-5 text-zinc-500">Generate a first version to preview responsive HTML and CSS.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[radial-gradient(circle_at_20%_0%,rgba(34,197,94,0.08),transparent_28%),#070707] p-4">
      <div className="flex min-h-full items-center justify-center">
        <div
          className={`${deviceFrameClass[previewDevice]} overflow-hidden rounded-lg border border-zinc-800 bg-black shadow-[0_30px_80px_rgba(0,0,0,0.5)] ${
            previewDevice === 'responsive' ? 'min-h-full' : 'shrink-0'
          }`}
        >
          <iframe
            title="Designer preview"
            sandbox="allow-same-origin"
            srcDoc={buildPreviewDocument(design)}
            className="h-full w-full border-0 bg-white"
          />
        </div>
      </div>
    </div>
  );
};
