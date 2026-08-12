import React, { memo, useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface PdfPreviewProps {
  filePath: string;
  fileName: string;
}

const PdfPreviewInner: React.FC<PdfPreviewProps> = ({ filePath, fileName }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const renderTaskRef = useRef<any>(null);

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
        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [filePath]);

  useEffect(() => {
    if (!pdfDoc || !containerRef.current) return;

    const renderPage = async () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }

      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.boxShadow = '0 2px 12px rgba(0,0,0,0.5)';
      canvas.style.borderRadius = '2px';

      const task = page.render({ canvas, viewport });
      renderTaskRef.current = task;

      try {
        await task.promise;
        renderTaskRef.current = null;
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          containerRef.current.appendChild(canvas);
        }
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException') {
          console.error('PDF render error:', e);
        }
      }
    };

    renderPage();

    return () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }
    };
  }, [pdfDoc, currentPage, scale]);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 5)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.5)), []);

  if (error) {
    return (
      <div className={`absolute inset-0 flex items-center justify-center ${'bg-zinc-950'}`}>
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div className="text-[10px] uppercase tracking-widest opacity-50">Failed to load PDF</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`absolute inset-0 flex flex-col overflow-hidden ${'bg-zinc-950'}`}>
      <div className={`flex items-center justify-between px-3 py-1.5 border-b shrink-0 ${'border-zinc-800/60'}`}>
        <div className="flex items-center gap-3">
          <span className={`text-[10px] ${'text-zinc-600'} font-mono tracking-wider`}>
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
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className={`p-1 rounded transition-colors cursor-pointer disabled:opacity-30 ${'hover:bg-zinc-800 text-zinc-500'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className={`text-[10px] min-w-[50px] text-center font-mono ${'text-zinc-600'}`}>
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
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
              {Math.round(scale * 100)}%
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
        </div>
      </div>

      <div className={`flex-1 overflow-auto p-4 ${'bg-zinc-950'}`}>
        <div ref={containerRef} className="flex justify-center min-w-fit mx-auto" />
      </div>
    </div>
  );
};

export const PdfPreview = memo(PdfPreviewInner);
