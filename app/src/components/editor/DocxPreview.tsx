import React, { memo, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { renderAsync } from 'docx-preview';
import { OpenInOfficeButton } from './OpenInOfficeButton';
import { usePreviewRefresh } from '../../hooks/usePreviewRefresh';

interface DocxPreviewProps {
  filePath: string;
  fileName: string;
}

const DocxPreviewInner: React.FC<DocxPreviewProps> = ({ filePath, fileName }) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const { refreshKey, refresh } = usePreviewRefresh(filePath);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    invoke<string>('read_file_as_base64', { path: filePath })
      .then(async (dataUrl) => {
        if (cancelled) return;
        const rawBase64 = dataUrl.split(',')[1];
        const binaryString = atob(rawBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        if (!bodyRef.current) return;
        if (bodyRef.current.firstChild) bodyRef.current.replaceChildren();
        if (styleRef.current?.firstChild) styleRef.current.replaceChildren();

        await renderAsync(
          bytes.buffer,
          bodyRef.current,
          styleRef.current ?? undefined,
          {
            className: 'docx',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            renderHeaders: true,
            renderFooters: true,
            renderFootnotes: true,
            renderEndnotes: true,
          }
        );
        if (cancelled) return;
        const text = bodyRef.current?.innerText ?? '';
        setWordCount(text ? text.trim().split(/\s+/).length : 0);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [filePath, refreshKey]);

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div className="text-[10px] uppercase tracking-widest opacity-50">Failed to load document</div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-[#262626]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0 border-zinc-800/60 bg-zinc-950">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-600 font-mono tracking-wider">
            {fileName}
          </span>
          {loading && (
            <svg className="w-3 h-3 animate-spin text-zinc-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
        {!loading && wordCount > 0 && (
          <span className="text-[9px] text-zinc-700 font-mono">
            ~{wordCount} words
          </span>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            title="Refresh preview"
            aria-label="Refresh preview"
            className="p-1 rounded transition-colors cursor-pointer hover:bg-zinc-800 text-zinc-500 disabled:opacity-30"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4.58 9a8 8 0 0114.42 1M19.42 15a8 8 0 01-14.42-1" />
            </svg>
          </button>
          {!loading && (
            <OpenInOfficeButton filePath={filePath} appName="Word" />
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-8 docx-preview-dark">
        <div className="max-w-3xl mx-auto docx-content-dark">
          {/* docx-preview injects its rendered content + styles into these */}
          <div ref={styleRef} />
          <div ref={bodyRef} />
          {!loading && wordCount === 0 && (
            <div className="flex items-center justify-center py-12 text-zinc-500">
              <div className="text-[10px] uppercase tracking-widest opacity-50">Empty document</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const DocxPreview = memo(DocxPreviewInner);
