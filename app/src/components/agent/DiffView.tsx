import React, { useMemo, useState } from 'react';
import { FileText } from '@phosphor-icons/react';
import hljs from 'highlight.js';

interface DiffViewProps {
  toolName: string;
  input: unknown;
  result?: unknown;
}

type DiffLine = {
  type: 'ctx' | 'add' | 'del' | 'hunk';
  text: string;
  oldNumber?: number;
  newNumber?: number;
};

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

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const pathFromText = (value: string): string | null => {
  const queryPath = value.match(/(?:edit|write|create|delete|rename|move)\s*:\s*([^\r\n"}]+)/i)?.[1]?.trim();
  if (queryPath) return queryPath;
  const resultPath = value.match(/(?:edited|created|deleted|moved)\s+([^\r\n"}]+)/i)?.[1]?.trim();
  return resultPath || null;
};

const extractPath = (value: unknown, depth = 0): string | null => {
  if (depth > 3) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed !== value) return extractPath(parsed, depth + 1) ?? pathFromText(value);
    } catch {
      // The result is plain text, which can still contain an editor path.
    }
    return pathFromText(value);
  }
  const obj = asRecord(value);
  if (!obj) return null;
  for (const key of ['path', 'filePath', 'file_path', 'target_path', 'new_path', 'directory', 'dir']) {
    if (typeof obj[key] === 'string' && obj[key]) return obj[key] as string;
  }
  for (const key of ['query', 'result', 'output', 'message', 'data']) {
    const path = extractPath(obj[key], depth + 1);
    if (path) return path;
  }
  return null;
};

const EDIT_TOOLS = new Set(['editor', 'apply_patch', 'write_file', 'create_file', 'delete_file', 'rename_file', 'create_directory', 'mkdir']);

const LINE_COLORS: Record<DiffLine['type'], string> = {
  ctx: 'text-[var(--text-secondary)] bg-transparent',
  add: 'text-emerald-300 bg-emerald-500/10',
  del: 'text-rose-300 bg-rose-500/10',
  hunk: 'text-[var(--accent)] bg-[var(--accent-light)]/10',
};

const MARK: Record<DiffLine['type'], string> = { ctx: ' ', add: '+', del: '-', hunk: '@' };

const languageFromPath = (path: string | null): string | null => {
  const fileName = path?.split(/[\\/]/).pop()?.toLowerCase() ?? '';
  const extension = fileName.split('.').pop() ?? '';
  const aliases: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    mjs: 'javascript', cjs: 'javascript', css: 'css', scss: 'scss',
    html: 'xml', vue: 'xml', svelte: 'xml', json: 'json', md: 'markdown',
    yml: 'yaml', yaml: 'yaml', py: 'python', rs: 'rust', go: 'go',
    java: 'java', kt: 'kotlin', sql: 'sql', sh: 'shell', bash: 'shell',
    ps1: 'powershell', xml: 'xml', svg: 'xml', cpp: 'cpp', c: 'c', h: 'c',
  };
  if (aliases[extension] && hljs.getLanguage(aliases[extension])) return aliases[extension];
  if (/^(dockerfile|makefile)$/i.test(fileName) && hljs.getLanguage(fileName)) return fileName;
  return null;
};

const highlightDiffLine = (text: string, language: string | null): string => {
  if (!text) return ' ';
  try {
    return language
      ? hljs.highlight(text, { language }).value
      : hljs.highlightAuto(text).value;
  } catch {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};

const escapeHtml = (text: string): string => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const DiffView: React.FC<DiffViewProps> = ({ toolName, input, result }) => {
  const { path, lines, stats } = useMemo(() => {
    const p = extractPath(input) ?? extractPath(result);
    const obj = asRecord(input) ?? asRecord(result);
    let computed: DiffLine[] = [];

    if (toolName === 'apply_patch' && typeof obj?.input === 'string' && obj.input) {
      computed = parseUnifiedDiff(obj.input);
    } else if (toolName === 'apply_patch' && typeof obj?.diff === 'string' && obj.diff) {
      computed = parseUnifiedDiff(obj.diff);
    } else if (toolName === 'editor') {
      const ops = Array.isArray(obj?.operations) ? obj.operations : obj?.operation ? [obj.operation] : [];
      const chunks: { old: string[]; new: string[] }[] = [];
      // The Cline editor's normal wire format is a single `old_text` /
      // `new_text` replacement. Capture it before handling older batched
      // operation formats used by other providers.
      if (typeof obj?.new_text === 'string') {
        chunks.push({
          old: typeof obj.old_text === 'string' ? obj.old_text.split('\n') : [],
          new: obj.new_text.split('\n'),
        });
      }
      for (const op of ops as Record<string, unknown>[]) {
        if (typeof op?.old_str === 'string' && typeof op?.new_str === 'string') {
          chunks.push({ old: op.old_str.split('\n'), new: op.new_str.split('\n') });
        } else if (typeof op?.old_str === 'string' && op?.op === 'delete') {
          chunks.push({ old: op.old_str.split('\n'), new: [] });
        } else if (typeof op?.new_str === 'string' && op?.op === 'insert') {
          chunks.push({ old: [], new: op.new_str.split('\n') });
        } else {
          // The current Cline runtime folds all workspace mutations into the
          // `editor` tool. Keep non-text operations visible too, rather than
          // leaving a blank panel when it creates, moves, or removes a folder.
          const operation = typeof op?.op === 'string' ? op.op : typeof op?.type === 'string' ? op.type : '';
          const target = [op?.path, op?.file_path, op?.directory, op?.dir, op?.new_path].find(
            (value): value is string => typeof value === 'string' && value.length > 0,
          );
          if (/mkdir|create.*dir|create_directory/i.test(operation)) {
            computed.push({ type: 'add', text: `Created folder: ${target ?? 'new folder'}` });
          } else if (/delete|remove/i.test(operation)) {
            computed.push({ type: 'del', text: `Deleted: ${target ?? 'file'}` });
          } else if (/rename|move/i.test(operation)) {
            const source = typeof op?.old_path === 'string' ? op.old_path : typeof op?.from === 'string' ? op.from : 'source';
            computed.push({ type: 'del', text: `Moved from: ${source}` });
            computed.push({ type: 'add', text: `Moved to: ${target ?? 'destination'}` });
          } else if (typeof op?.content === 'string' || typeof op?.new_content === 'string') {
            const content = typeof op.content === 'string' ? op.content : op.new_content as string;
            chunks.push({ old: [], new: content.split('\n') });
          }
        }
      }
      for (const chunk of chunks) computed = computed.concat(lcsDiff(chunk.old, chunk.new));
    } else if (toolName === 'write_file' || toolName === 'create_file') {
      const content = typeof obj?.content === 'string' ? obj.content : '';
      computed = content.split('\n').map((t): DiffLine => ({ type: 'add', text: t }));
    } else if (toolName === 'create_directory' || toolName === 'mkdir') {
      computed = [{ type: 'add', text: `Created folder: ${p ?? 'new folder'}` }];
    } else if (toolName === 'delete_file') {
      computed = [{ type: 'del', text: `Deleted file: ${p ?? 'file'}` }];
    } else if (toolName === 'rename_file') {
      const oldPath = typeof obj?.old_path === 'string' ? obj.old_path : typeof obj?.from === 'string' ? obj.from : 'source';
      const newPath = typeof obj?.new_path === 'string' ? obj.new_path : typeof obj?.to === 'string' ? obj.to : p ?? 'destination';
      computed = [
        { type: 'del', text: `Moved from: ${oldPath}` },
        { type: 'add', text: `Moved to: ${newPath}` },
      ];
    } else if (obj && typeof obj.content === 'string') {
      computed = obj.content.split('\n').map((t): DiffLine => ({ type: 'ctx', text: t }));
    } else {
      // Some SDK editor events only report "Edited <path>". Show the confirmed
      // file and make the missing patch explicit rather than exposing raw JSON
      // or inventing a diff that the tool did not supply.
      computed = [{ type: 'ctx', text: 'Change completed — a line-by-line patch was not returned by this tool.' }];
    }

    let oldNumber = 1;
    let newNumber = 1;
    const numbered = computed.map((line) => {
      if (line.type === 'hunk') return line;
      const next: DiffLine = { ...line };
      if (line.type !== 'add') next.oldNumber = oldNumber++;
      if (line.type !== 'del') next.newNumber = newNumber++;
      return next;
    });

    const stats = numbered.reduce(
      (acc, l) => {
        if (l.type === 'add') acc.add++;
        if (l.type === 'del') acc.del++;
        return acc;
      },
      { add: 0, del: 0 },
    );
    return { path: p, lines: numbered, stats };
  }, [toolName, input, result]);

  const highlightedLines = useMemo(() => {
    const language = languageFromPath(path);
    return lines.map((line) => ({
      ...line,
      html: line.type === 'hunk' ? escapeHtml(line.text) : highlightDiffLine(line.text, language),
    }));
  }, [lines, path]);

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
    <div className="premium-surface overflow-hidden rounded-xl">
      <div className="flex items-center gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2.5 py-1.5">
        <FileText size={12} className="text-[var(--text-secondary)]/70 flex-shrink-0" />
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
      <div className="diff-code max-h-64 overflow-auto custom-scrollbar premium-scrollbar bg-[var(--bg-main)]">
        <pre className="min-w-max font-mono text-[10px] leading-[1.65]">
          {highlightedLines.map((line, i) => (
            <div key={i} className={`flex min-h-[1.05rem] ${LINE_COLORS[line.type]}`}>
              <span className="w-8 flex-shrink-0 select-none border-r border-[var(--border-primary)]/40 pr-1 text-right text-[9px] leading-[1.8] opacity-40">{line.oldNumber ?? ''}</span>
              <span className="w-8 flex-shrink-0 select-none border-r border-[var(--border-primary)]/40 pr-1 text-right text-[9px] leading-[1.8] opacity-40">{line.newNumber ?? ''}</span>
              <span className="w-4 flex-shrink-0 text-center select-none opacity-70">{MARK[line.type]}</span>
              <span className="diff-code__text flex-1 whitespace-pre-wrap break-all px-1" dangerouslySetInnerHTML={{ __html: line.html }} />
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
};

export const isEditTool = (toolName: string): boolean => EDIT_TOOLS.has(toolName);
