import React, { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { EditorActionButton } from './EditorActionButton';
import { formatBytes, localFileUrl } from '../../utils/mediaFiles';

interface BinaryPreviewProps {
  filePath: string;
  fileName: string;
}

const CHUNK_BYTES = 16 * 1024;
const MAX_BYTES = 1024 * 1024;
const BYTES_PER_ROW = 16;

// Magic numbers for the formats people most often stumble on in a project tree.
const SIGNATURES: { label: string; bytes: number[]; offset?: number }[] = [
  { label: 'ZIP archive', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { label: 'GZIP archive', bytes: [0x1f, 0x8b] },
  { label: '7-Zip archive', bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { label: 'RAR archive', bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07] },
  { label: 'Windows executable', bytes: [0x4d, 0x5a] },
  { label: 'ELF executable', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { label: 'Mach-O binary', bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  { label: 'WebAssembly module', bytes: [0x00, 0x61, 0x73, 0x6d] },
  { label: 'SQLite database', bytes: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66] },
  { label: 'PDF document', bytes: [0x25, 0x50, 0x44, 0x46] },
  { label: 'PNG image', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { label: 'JPEG image', bytes: [0xff, 0xd8, 0xff] },
  { label: 'GIF image', bytes: [0x47, 0x49, 0x46, 0x38] },
  { label: 'RIFF container (WAV/AVI/WebP)', bytes: [0x52, 0x49, 0x46, 0x46] },
  { label: 'MP3 audio (ID3)', bytes: [0x49, 0x44, 0x33] },
  { label: 'Ogg container', bytes: [0x4f, 0x67, 0x67, 0x53] },
  { label: 'FLAC audio', bytes: [0x66, 0x4c, 0x61, 0x43] },
  { label: 'MPEG-4 container', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  { label: 'Matroska/WebM container', bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { label: 'WOFF2 font', bytes: [0x77, 0x4f, 0x46, 0x32] },
  { label: 'WOFF font', bytes: [0x77, 0x4f, 0x46, 0x46] },
  { label: 'Java class file', bytes: [0xca, 0xfe, 0xba, 0xbe] },
];

const detectFormat = (bytes: Uint8Array): string | null =>
  SIGNATURES.find(({ bytes: sig, offset = 0 }) => sig.every((byte, i) => bytes[offset + i] === byte))?.label ?? null;

const toHexRows = (bytes: Uint8Array, base: number): string => {
  const rows: string[] = [];
  for (let row = 0; row < bytes.length; row += BYTES_PER_ROW) {
    const slice = bytes.subarray(row, row + BYTES_PER_ROW);
    let hex = '';
    let ascii = '';
    for (let i = 0; i < BYTES_PER_ROW; i++) {
      if (i === 8) hex += ' ';
      if (i < slice.length) {
        hex += `${slice[i].toString(16).padStart(2, '0')} `;
        ascii += slice[i] >= 0x20 && slice[i] < 0x7f ? String.fromCharCode(slice[i]) : '.';
      } else {
        hex += '   ';
      }
    }
    rows.push(`${(base + row).toString(16).padStart(8, '0')}  ${hex} ${ascii}`);
  }
  return rows.join('\n');
};

/** Read-only hex view for binary files that have no dedicated previewer. */
export const BinaryPreview: React.FC<BinaryPreviewProps> = ({ filePath, fileName }) => {
  const [size, setSize] = useState<number | null>(null);
  const [chunks, setChunks] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(0);
  const [format, setFormat] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChunk = useCallback(async (start: number): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch(localFileUrl(filePath), { headers: { Range: `bytes=${start}-${start + CHUNK_BYTES - 1}` } });
      if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (start === 0) setFormat(detectFormat(bytes));
      setChunks((current) => [...current, toHexRows(bytes, start)]);
      setLoaded(start + bytes.length);
    } catch (err) {
      setError(`Could not read the file: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    setChunks([]); setLoaded(0); setFormat(null); setError(null);
    let cancelled = false;
    invoke<number>('get_file_size', { path: filePath })
      .then((bytes) => {
        if (cancelled) return;
        setSize(bytes);
        if (bytes > 0) void loadChunk(0);
      })
      .catch((err: unknown) => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [filePath, loadChunk]);

  const canLoadMore = size !== null && loaded < size && loaded < MAX_BYTES;

  return <div className="absolute inset-0 flex flex-col overflow-hidden bg-[var(--bg-primary)]">
    <div className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border-primary)] px-3 py-1">
      <span className="min-w-0 truncate text-[11px] tabular-nums text-[var(--text-secondary)]">
        {['Binary file', format, size !== null && formatBytes(size), size !== null && size > 0 && `showing ${formatBytes(loaded)}`].filter(Boolean).join(' · ')}
      </span>
      <EditorActionButton label="Open with the system's default app" onClick={() => void openPath(filePath).catch((err: unknown) => setError(`Could not open ${fileName}: ${String(err)}`))}>
        <ArrowSquareOut size={14} /><span>Open externally</span>
      </EditorActionButton>
    </div>
    {error && <div role="alert" className="shrink-0 border-b border-[var(--border-primary)] px-3 py-2 text-xs text-rose-400">{error}</div>}
    <div className="min-h-0 flex-1 overflow-auto">
      {size === 0
        ? <p className="p-6 text-xs text-[var(--text-secondary)]">This file is empty.</p>
        : <pre className="px-4 py-3 font-mono text-[12px] leading-[1.6] text-[var(--text-primary)] select-text">{chunks.join('\n')}</pre>}
      {canLoadMore && <div className="px-4 pb-4">
        <button type="button" disabled={loading} onClick={() => void loadChunk(loaded)}
          className="cursor-pointer rounded-md border border-[var(--border-primary)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:cursor-default disabled:opacity-40">
          {loading ? 'Loading…' : `Load next ${formatBytes(CHUNK_BYTES)}`}
        </button>
      </div>}
      {size !== null && loaded >= MAX_BYTES && loaded < size && <p className="px-4 pb-4 text-xs text-[var(--text-secondary)]">The hex view stops at {formatBytes(MAX_BYTES)}. Open the file externally to see the rest.</p>}
    </div>
  </div>;
};
