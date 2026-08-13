import React, { memo, useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PPTXViewer } from 'pptx-viewer';
import { OpenInOfficeButton } from './OpenInOfficeButton';
import { usePreviewRefresh } from '../../hooks/usePreviewRefresh';

interface PptxPreviewProps {
  filePath: string;
  fileName: string;
}

const PptxPreviewInner: React.FC<PptxPreviewProps> = ({ filePath, fileName }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PPTXViewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [slideCount, setSlideCount] = useState(0);
  const [currentSlide, setCurrentSlide] = useState(1);
  const [zoom, setZoom] = useState(1);
  const { refreshKey, refresh } = usePreviewRefresh(filePath);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    const init = async () => {
      try {
        const dataUrl = await invoke<string>('read_file_as_base64', { path: filePath });
        if (cancelled) return;
        const rawBase64 = dataUrl.split(',')[1];
        const binaryString = atob(rawBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        if (!containerRef.current) return;
        const viewer = new PPTXViewer(containerRef.current, {
          initialSlide: 0,
          keyboardNavigation: false,
          showControls: false,
          onLoad: (pres) => {
            if (cancelled) return;
            setSlideCount(pres.slides.length);
            setCurrentSlide(1);
            setLoading(false);
          },
          onSlideChange: (index) => {
            if (!cancelled) setCurrentSlide(index + 1);
          },
          onError: () => {
            if (!cancelled) {
              setError(true);
              setLoading(false);
            }
          },
        });

        // The ArrayBuffer must remain valid for the whole lifetime of the
        // viewer, so we copy it (don't pass the shared Uint8Array buffer).
        const arrayBuffer = bytes.slice().buffer;
        viewerRef.current = viewer;
        await viewer.load(arrayBuffer);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [filePath, refreshKey]);

  const goToSlide = useCallback((page: number) => {
    if (!viewerRef.current) return;
    viewerRef.current.goToSlide(page - 1);
  }, []);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 3)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.25, 0.5)), []);

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div className="text-[10px] uppercase tracking-widest opacity-50">Failed to load presentation</div>
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
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToSlide(currentSlide - 1)}
              disabled={currentSlide <= 1}
              className={`p-1 rounded transition-colors cursor-pointer disabled:opacity-30 ${'hover:bg-zinc-800 text-zinc-500'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className={`text-[10px] min-w-[50px] text-center font-mono ${'text-zinc-600'}`}>
              {currentSlide} / {slideCount}
            </span>
            <button
              onClick={() => goToSlide(currentSlide + 1)}
              disabled={currentSlide >= slideCount}
              className={`p-1 rounded transition-colors cursor-pointer disabled:opacity-30 ${'hover:bg-zinc-800 text-zinc-500'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div className={`w-px h-3 ${'bg-zinc-700'}`} />
          <div className="flex items-center gap-1">
            <button
              onClick={zoomOut}
              className={`p-1 rounded transition-colors cursor-pointer ${'hover:bg-zinc-800 text-zinc-500'}`}
              title="Zoom out"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <span className={`text-[10px] min-w-[40px] text-center font-mono ${'text-zinc-600'}`}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={zoomIn}
              className={`p-1 rounded transition-colors cursor-pointer ${'hover:bg-zinc-800 text-zinc-500'}`}
              title="Zoom in"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
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
            <OpenInOfficeButton filePath={filePath} appName="PowerPoint" />
          )}
        </div>
      </div>

      <div className={`flex-1 overflow-auto p-4 ${'bg-zinc-950'}`}>
        <div className="flex justify-center min-w-fit mx-auto">
          <div
            ref={containerRef}
            className="pptx-viewer-container"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              width: 800,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export const PptxPreview = memo(PptxPreviewInner);
