import React, { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ImagePreviewProps {
  filePath: string;
  fileName: string;
  theme: 'dark' | 'light';
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif', 'tiff', 'tif']);

const imageCache = new Map<string, string>();
const MAX_CACHE_SIZE = 20;

export const isImageFile = (extension: string | null): boolean => {
  return extension ? IMAGE_EXTENSIONS.has(extension.toLowerCase()) : false;
};

export const ImagePreview: React.FC<ImagePreviewProps> = ({ filePath, fileName, theme }) => {
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [src, setSrc] = useState<string | null>(() => imageCache.get(filePath) ?? null);
  const [error, setError] = useState(false);
  const workspaceRef = useRef<string | null>(null);

  useEffect(() => {
    const lastSep = filePath.lastIndexOf('/');
    const lastBack = filePath.lastIndexOf('\\');
    const parentDir = lastSep > lastBack ? filePath.substring(0, lastSep) : lastBack > 0 ? filePath.substring(0, lastBack) : filePath;

    if (workspaceRef.current && workspaceRef.current !== parentDir) {
      imageCache.clear();
    }
    workspaceRef.current = parentDir;

    const cached = imageCache.get(filePath);
    if (cached) {
      setSrc(cached);
      setError(false);
      setNaturalSize(null);
      return;
    }

    let cancelled = false;
    setError(false);
    setNaturalSize(null);

    invoke<string>('read_file_as_base64', { path: filePath })
      .then((dataUrl) => {
        if (cancelled) return;
        if (imageCache.size >= MAX_CACHE_SIZE) {
          const firstKey = imageCache.keys().next().value;
          if (firstKey) imageCache.delete(firstKey);
        }
        imageCache.set(filePath, dataUrl);
        setSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => { cancelled = true; };
  }, [filePath]);

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 5)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.25, 0.1)), []);
  const fitView = useCallback(() => setZoom(1), []);

  if (error) {
    return (
      <div className={`absolute inset-0 flex items-center justify-center ${theme === 'light' ? 'bg-zinc-100' : 'bg-zinc-950'}`}>
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <div className="text-[10px] uppercase tracking-widest opacity-50">
            Failed to load image
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`absolute inset-0 flex flex-col overflow-hidden ${theme === 'light' ? 'bg-zinc-100' : 'bg-zinc-950'}`}>
      <div className={`flex items-center justify-between px-3 py-1.5 border-b shrink-0 ${theme === 'light' ? 'border-zinc-300' : 'border-theme'}`}>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-600'} font-mono tracking-wider`}>
            {fileName}
          </span>
          {naturalSize && (
            <span className={`text-[9px] ${theme === 'light' ? 'text-zinc-400' : 'text-zinc-700'} font-mono`}>
              {naturalSize.w} x {naturalSize.h}
            </span>
          )}
          {!src && !error && (
            <svg className="w-3 h-3 animate-spin text-zinc-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            className={`p-1 rounded transition-colors cursor-pointer ${theme === 'light' ? 'hover:bg-zinc-200 text-zinc-500' : 'hover:bg-zinc-800 text-zinc-500'}`}
            title="Zoom out"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className={`text-[10px] min-w-[40px] text-center font-mono ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-600'}`}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className={`p-1 rounded transition-colors cursor-pointer ${theme === 'light' ? 'hover:bg-zinc-200 text-zinc-500' : 'hover:bg-zinc-800 text-zinc-500'}`}
            title="Zoom in"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={fitView}
            className={`p-1 rounded transition-colors cursor-pointer ${theme === 'light' ? 'hover:bg-zinc-200 text-zinc-500' : 'hover:bg-zinc-800 text-zinc-500'}`}
            title="Reset zoom"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-auto flex items-center justify-center"
        style={{
          backgroundImage: theme === 'light'
            ? 'linear-gradient(45deg, #e4e4e7 25%, transparent 25%), linear-gradient(-45deg, #e4e4e7 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e4e4e7 75%), linear-gradient(-45deg, transparent 75%, #e4e4e7 75%)'
            : 'linear-gradient(45deg, #18181b 25%, transparent 25%), linear-gradient(-45deg, #18181b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18181b 75%), linear-gradient(-45deg, transparent 75%, #18181b 75%)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
        }}
      >
        {src && (
          <img
            src={src}
            alt={fileName}
            onError={() => setError(true)}
            onLoad={handleLoad}
            className="max-w-full max-h-full object-contain transition-transform duration-150"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            draggable={false}
          />
        )}
      </div>
    </div>
  );
};
