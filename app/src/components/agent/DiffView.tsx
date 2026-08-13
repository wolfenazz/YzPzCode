import React, { useMemo, useState } from 'react';

interface DiffViewProps {
  toolName: string;
  input: unknown;
}

type DiffLine = { type: 'ctx' | 'add' | 'del' | 'hunk'; text: string };

/** LCS line diff (bounded) — no external dependency. */
const lcsDiff = (oldLines: string[], newLines: string[]): DiffLine[] => {
  const n = oldLines.length;
  const m = newLines.length;
  if (n * m > 250_000) {
    // Fallback for huge inputs: everything removed + added.
    return [
      ...oldLines.map((t): DiffLine => ({ type: 'del', text: t })),
      ...newLines.map((t): DiffLine => ({ type: 'add', text: t })),
    ];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      out.push({ type: 'ctx', text: oldLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: oldLines[i] });
      i++;
    } else {
      out.push({ type: 'add', text: newLines[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: 'del', text: oldLines[i++] });
  while (j < m) out.push({ type: 'add', text: newLines[j++] });
  return out;
};

/** Parse a unified diff string (from apply_patch tool input). */
const parseUnifiedDiff = (diff: string): DiffLine[] => {
  const raw = diff.replace(/\r\n/g, '\n').split('\n');
  const out: DiffLine[] = [];
  let started = false;
  for (const line of raw) {
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      continue;
    }
    if (line.startsWith('@@')) {
      out.push({ type: 'hunk', text: line });
      started = true;
      continue;
    }
    if (!started) continue;
    if (line.startsWith('-') && !line.startsWith('---')) out.push({ type: 'del', text: line.slice(1) });
    else if (line.startsWith('+') && !line.startsWith('+++')) out.push({ type: 'add', text: line.slice(1) });
    else if (line.startsWith('\\')) out.push({ type: 'ctx', text: '\\' });
    else out.push({ type: 'ctx', text: line });
  }
  return out;
};

const extractPath = (input: unknown): string | null => {
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (typeof obj.path === 'string' && obj.path) return obj.path;
    if (typeof obj.filePath === 'string' && obj.filePath) return obj.filePath;
    if (typeof obj.file_path === 'string' && obj.file_path) return obj.file_path;
  }
  return null;
};

const EDIT_TOOLS = new Set(['editor', 'apply_patch', 'write_file', 'create_file', 'delete_file', 'rename_file']);

const LINE_COLORS: Record<DiffLine['type'], string> = {
  ctx: 'text-[var(--text-secondary)] bg-transparent',
  add: 'text-emerald-300 bg-emerald-500/10',
  del: 'text-rose-300 bg-rose-500/10',
  hunk: 'text-[var(--accent)] bg-[var(--accent-light)]/10',
};

const MARK: Record<DiffLine['type'], string> = { ctx: ' ', add: '+', del: '-', hunk: '@' };

export const DiffView: React.FC<DiffViewProps> = ({ toolName, input }) => {
  const { path, lines, stats } = useMemo(() => {
    const p = extractPath(input);
    if (!input || typeof input !== 'object') return { path: p, lines: [] as DiffLine[], stats: { add: 0, del: 0 } };

    const obj = input as Record<string, unknown>;
    let computed: DiffLine[] = [];

    if (toolName === 'apply_patch' && typeof obj.diff === 'string' && obj.diff) {
      computed = parseUnifiedDiff(obj.diff);
    } else if (toolName === 'editor') {
      const ops = Array.isArray(obj.operations) ? obj.operations : obj.operation ? [obj.operation] : [];
      const chunks: { old: string[]; new: string[] }[] = [];
      for (const op of ops as Record<string, unknown>[]) {
        if (typeof op?.old_str === 'string' && typeof op?.new_str === 'string') {
          chunks.push({ old: op.old_str.split('\n'), new: op.new_str.split('\n') });
        } else if (typeof op?.old_str === 'string' && op?.op === 'delete') {
          chunks.push({ old: op.old_str.split('\n'), new: [] });
        } else if (typeof op?.new_str === 'string' && op?.op === 'insert') {
          chunks.push({ old: [], new: op.new_str.split('\n') });
        }
      }
      for (const chunk of chunks) computed = computed.concat(lcsDiff(chunk.old, chunk.new));
    } else if (toolName === 'write_file' || toolName === 'create_file') {
      const content = typeof obj.content === 'string' ? obj.content : '';
      computed = content.split('\n').map((t): DiffLine => ({ type: 'add', text: t }));
    } else {
      const content = typeof obj.content === 'string' ? obj.content : JSON.stringify(input, null, 2);
      computed = content.split('\n').map((t): DiffLine => ({ type: 'ctx', text: t }));
    }

    const stats = computed.reduce(
      (acc, l) => {
        if (l.type === 'add') acc.add++;
        if (l.type === 'del') acc.del++;
        return acc;
      },
      { add: 0, del: 0 },
    );
    return { path: p, lines: computed, stats };
  }, [toolName, input]);

  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      const text = lines.map((l) => `${l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '}${l.text}`).join('\n');
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable
    }
  };

  if (lines.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-primary)]">
      <div className="flex items-center gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2.5 py-1.5">
        <svg className="w-3 h-3 text-[var(--text-secondary)]/70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="font-mono text-[10px] font-bold text-[var(--text-primary)] truncate">
          {path ?? toolName}
        </span>
        <span className="ml-auto flex items-center gap-2 font-mono text-[9px] tabular-nums flex-shrink-0">
          <button
            onClick={() => void handleCopy()}
            className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/50 hover:text-[var(--text-primary)] cursor-pointer"
          >
            {copied ? 'copied ✓' : 'copy'}
          </button>
          <span className="text-emerald-500">+{stats.add}</span>
          <span className="text-rose-500">-{stats.del}</span>
        </span>
      </div>
      <div className="max-h-64 overflow-auto custom-scrollbar bg-[var(--bg-main)]">
        <pre className="min-w-max font-mono text-[10px] leading-[1.6]">
          {lines.map((line, i) => (
            <div key={i} className={`flex ${LINE_COLORS[line.type]}`}>
              <span className="w-4 flex-shrink-0 text-center select-none opacity-70">{MARK[line.type]}</span>
              <span className="flex-1 whitespace-pre-wrap break-all px-1">{line.text || ' '}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
};

export const isEditTool = (toolName: string): boolean => EDIT_TOOLS.has(toolName);
