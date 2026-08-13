// Shared truncation utilities for tool outputs.
//
// Faithful port of PI's tool-output truncation layer
// (github.com/earendil-works/pi, packages/coding-agent/src/core/tools/truncate.ts),
// adapted to YzPzCode's harness conventions (2-space indent, single quotes).
//
// Truncation is based on two independent limits — whichever hits first wins:
// - Line limit (default: 2000 lines)
// - Byte limit (default: 50KB)
//
// Never returns partial lines (except the bash tail truncation edge case).

// Local, non-assertion helpers for __selfTest. We deliberately avoid
// `node:assert` here: its assertion-typed signatures (asserts ...) trigger
// TS2775 under `strict` when called on inferred locals, and this module
// should stay dependency-free.
function expectEqual(actual: unknown, expected: unknown, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function expectTrue(cond: boolean, message?: string): void {
  if (!cond) {
    throw new Error(message ?? "Expected condition to be truthy");
  }
}

export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB
export const GREP_MAX_LINE_LENGTH = 500; // Max chars per grep match line

export interface TruncationResult {
  /** The truncated content */
  content: string;
  /** Whether truncation occurred */
  truncated: boolean;
  /** Which limit was hit: "lines", "bytes", or null if not truncated */
  truncatedBy: "lines" | "bytes" | null;
  /** Total number of lines in the original content */
  totalLines: number;
  /** Total number of bytes in the original content */
  totalBytes: number;
  /** Number of complete lines in the truncated output */
  outputLines: number;
  /** Number of bytes in the truncated output */
  outputBytes: number;
  /** Whether the last line was partially truncated (only for tail truncation edge case) */
  lastLinePartial: boolean;
  /** Whether the first line exceeded the byte limit (for head truncation) */
  firstLineExceedsLimit: boolean;
  /** The max lines limit that was applied */
  maxLines: number;
  /** The max bytes limit that was applied */
  maxBytes: number;
}

export interface TruncationOptions {
  /** Maximum number of lines (default: 2000) */
  maxLines?: number;
  /** Maximum number of bytes (default: 50KB) */
  maxBytes?: number;
}

function splitLinesForCounting(content: string): string[] {
  if (content.length === 0) {
    return [];
  }
  const lines = content.split("\n");
  if (content.endsWith("\n")) {
    lines.pop();
  }
  return lines;
}

/**
 * Format bytes as human-readable size.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
}

/**
 * Truncate content from the head (keep first N lines/bytes).
 * Suitable for file reads where you want to see the beginning.
 *
 * Never returns partial lines. If first line exceeds byte limit,
 * returns empty content with firstLineExceedsLimit=true.
 */
export function truncateHead(content: string, options: TruncationOptions = {}): TruncationResult {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  const totalBytes = Buffer.byteLength(content, "utf-8");
  const lines = splitLinesForCounting(content);
  const totalLines = lines.length;

  // Check if no truncation needed
  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      truncatedBy: null,
      totalLines,
      totalBytes,
      outputLines: totalLines,
      outputBytes: totalBytes,
      lastLinePartial: false,
      firstLineExceedsLimit: false,
      maxLines,
      maxBytes,
    };
  }

  // Check if first line alone exceeds byte limit
  const firstLineBytes = Buffer.byteLength(lines[0], "utf-8");
  if (firstLineBytes > maxBytes) {
    return {
      content: "",
      truncated: true,
      truncatedBy: "bytes",
      totalLines,
      totalBytes,
      outputLines: 0,
      outputBytes: 0,
      lastLinePartial: false,
      firstLineExceedsLimit: true,
      maxLines,
      maxBytes,
    };
  }

  // Collect complete lines that fit
  const outputLinesArr: string[] = [];
  let outputBytesCount = 0;
  let truncatedBy: "lines" | "bytes" = "lines";

  for (let i = 0; i < lines.length && i < maxLines; i++) {
    const line = lines[i];
    const lineBytes = Buffer.byteLength(line, "utf-8") + (i > 0 ? 1 : 0); // +1 for newline

    if (outputBytesCount + lineBytes > maxBytes) {
      truncatedBy = "bytes";
      break;
    }

    outputLinesArr.push(line);
    outputBytesCount += lineBytes;
  }

  // If we exited due to line limit
  if (outputLinesArr.length >= maxLines && outputBytesCount <= maxBytes) {
    truncatedBy = "lines";
  }

  const outputContent = outputLinesArr.join("\n");
  const finalOutputBytes = Buffer.byteLength(outputContent, "utf-8");

  return {
    content: outputContent,
    truncated: true,
    truncatedBy,
    totalLines,
    totalBytes,
    outputLines: outputLinesArr.length,
    outputBytes: finalOutputBytes,
    lastLinePartial: false,
    firstLineExceedsLimit: false,
    maxLines,
    maxBytes,
  };
}

/**
 * Truncate content from the tail (keep last N lines/bytes).
 * Suitable for bash output where you want to see the end (errors, final results).
 *
 * May return partial first line if the last line of original content exceeds byte limit.
 */
export function truncateTail(content: string, options: TruncationOptions = {}): TruncationResult {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  const totalBytes = Buffer.byteLength(content, "utf-8");
  const lines = splitLinesForCounting(content);
  const totalLines = lines.length;

  // Check if no truncation needed
  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      truncatedBy: null,
      totalLines,
      totalBytes,
      outputLines: totalLines,
      outputBytes: totalBytes,
      lastLinePartial: false,
      firstLineExceedsLimit: false,
      maxLines,
      maxBytes,
    };
  }

  // Work backwards from the end
  const outputLinesArr: string[] = [];
  let outputBytesCount = 0;
  let truncatedBy: "lines" | "bytes" = "lines";
  let lastLinePartial = false;

  for (let i = lines.length - 1; i >= 0 && outputLinesArr.length < maxLines; i--) {
    const line = lines[i];
    const lineBytes = Buffer.byteLength(line, "utf-8") + (outputLinesArr.length > 0 ? 1 : 0); // +1 for newline

    if (outputBytesCount + lineBytes > maxBytes) {
      truncatedBy = "bytes";
      // Edge case: if we haven't added ANY lines yet and this line exceeds maxBytes,
      // take the end of the line (partial)
      if (outputLinesArr.length === 0) {
        const truncatedLine = truncateStringToBytesFromEnd(line, maxBytes);
        outputLinesArr.unshift(truncatedLine);
        outputBytesCount = Buffer.byteLength(truncatedLine, "utf-8");
        lastLinePartial = true;
      }
      break;
    }

    outputLinesArr.unshift(line);
    outputBytesCount += lineBytes;
  }

  // If we exited due to line limit
  if (outputLinesArr.length >= maxLines && outputBytesCount <= maxBytes) {
    truncatedBy = "lines";
  }

  const outputContent = outputLinesArr.join("\n");
  const finalOutputBytes = Buffer.byteLength(outputContent, "utf-8");

  return {
    content: outputContent,
    truncated: true,
    truncatedBy,
    totalLines,
    totalBytes,
    outputLines: outputLinesArr.length,
    outputBytes: finalOutputBytes,
    lastLinePartial,
    firstLineExceedsLimit: false,
    maxLines,
    maxBytes,
  };
}

/**
 * Truncate a string to fit within a byte limit (from the end).
 * Handles multi-byte UTF-8 characters correctly.
 */
function truncateStringToBytesFromEnd(str: string, maxBytes: number): string {
  const buf = Buffer.from(str, "utf-8");
  if (buf.length <= maxBytes) {
    return str;
  }

  // Start from the end, skip maxBytes back
  let start = buf.length - maxBytes;

  // Find a valid UTF-8 boundary (start of a character)
  while (start < buf.length && (buf[start] & 0xc0) === 0x80) {
    start++;
  }

  return buf.slice(start).toString("utf-8");
}

/**
 * Truncate a single line to max characters, adding [truncated] suffix.
 * Used for grep match lines.
 */
export function truncateLine(
  line: string,
  maxChars: number = GREP_MAX_LINE_LENGTH,
): { text: string; wasTruncated: boolean } {
  if (line.length <= maxChars) {
    return { text: line, wasTruncated: false };
  }
  return { text: `${line.slice(0, maxChars)}... [truncated]`, wasTruncated: true };
}

/**
 * Opt-in self test for the truncation utilities.
 *
 * Run after building:
 *   node -e "import('./dist/truncate.js').then((m) => m.__selfTest())"
 *
 * Not invoked at module load — callers must opt in explicitly.
 *
 * @internal
 */
export function __selfTest(): void {
  // ── No-truncation passthrough ──────────────────────────────────────────
  const small = 'a\nbb\nccc\n';
  const head = truncateHead(small);
  expectEqual(head.content, small);
  expectEqual(head.truncated, false);
  expectEqual(head.truncatedBy, null);
  expectEqual(head.totalLines, 3);
  expectEqual(head.outputLines, 3);
  expectEqual(head.totalBytes, Buffer.byteLength(small, 'utf-8'));
  expectEqual(head.outputBytes, Buffer.byteLength(small, 'utf-8'));
  expectEqual(head.lastLinePartial, false);
  expectEqual(head.firstLineExceedsLimit, false);

  const tail = truncateTail(small);
  expectEqual(tail.content, small);
  expectEqual(tail.truncated, false);
  expectEqual(tail.truncatedBy, null);

  // ── Empty content ──────────────────────────────────────────────────────
  const emptyHead = truncateHead('');
  expectEqual(emptyHead.content, '');
  expectEqual(emptyHead.truncated, false);
  expectEqual(emptyHead.totalLines, 0);
  expectEqual(emptyHead.totalBytes, 0);
  expectEqual(emptyHead.outputLines, 0);
  expectEqual(emptyHead.outputBytes, 0);
  const emptyTail = truncateTail('');
  expectEqual(emptyTail.truncated, false);
  expectEqual(emptyTail.totalLines, 0);

  // ── Line-limit truncation (head keeps first N lines) ───────────────────
  const manyLines = Array.from({ length: 10 }, (_, i) => `line-${i}`).join('\n');
  const lineLimited = truncateHead(manyLines, { maxLines: 3 });
  expectEqual(lineLimited.truncated, true);
  expectEqual(lineLimited.truncatedBy, 'lines');
  expectEqual(lineLimited.totalLines, 10);
  expectEqual(lineLimited.outputLines, 3);
  expectEqual(lineLimited.content, 'line-0\nline-1\nline-2');

  // ── Byte-limit truncation (head, complete lines only) ──────────────────
  // "aaaa\nbbbb\ncccc": aaaa=4, bbbb=5, cccc=5 (with newline separators)
  const byteLimited = truncateHead('aaaa\nbbbb\ncccc\n', { maxBytes: 8 });
  expectEqual(byteLimited.truncated, true);
  expectEqual(byteLimited.truncatedBy, 'bytes');
  expectEqual(byteLimited.outputLines, 1);
  expectEqual(byteLimited.outputBytes, 4);
  expectEqual(byteLimited.content, 'aaaa');
  expectEqual(byteLimited.firstLineExceedsLimit, false);

  // ── First line exceeds byte limit ──────────────────────────────────────
  const firstLineHuge = 'x'.repeat(100) + '\nrest\n';
  const firstLineLimited = truncateHead(firstLineHuge, { maxBytes: 10 });
  expectEqual(firstLineLimited.truncated, true);
  expectEqual(firstLineLimited.truncatedBy, 'bytes');
  expectEqual(firstLineLimited.content, '');
  expectEqual(firstLineLimited.firstLineExceedsLimit, true);
  expectEqual(firstLineLimited.outputLines, 0);
  expectEqual(firstLineLimited.outputBytes, 0);

  // ── Tail line-limit truncation keeps LAST N lines in order ─────────────
  const tailLineLimited = truncateTail(manyLines, { maxLines: 3 });
  expectEqual(tailLineLimited.truncated, true);
  expectEqual(tailLineLimited.truncatedBy, 'lines');
  expectEqual(tailLineLimited.outputLines, 3);
  expectEqual(tailLineLimited.content, 'line-7\nline-8\nline-9');
  expectEqual(tailLineLimited.lastLinePartial, false);

  // ── Tail byte-limit truncation keeps last complete lines ───────────────
  const tailByteLimited = truncateTail('aaaa\nbbbb\ncccc\n', { maxBytes: 8 });
  expectEqual(tailByteLimited.truncated, true);
  expectEqual(tailByteLimited.truncatedBy, 'bytes');
  expectEqual(tailByteLimited.outputLines, 1);
  expectEqual(tailByteLimited.outputBytes, 4);
  expectEqual(tailByteLimited.content, 'cccc');
  expectEqual(tailByteLimited.lastLinePartial, false);

  // ── Tail partial line edge case (last line exceeds maxBytes) ───────────
  const tailPartial = truncateTail('start\n' + 'y'.repeat(100) + '\n', { maxBytes: 10 });
  expectEqual(tailPartial.truncated, true);
  expectEqual(tailPartial.truncatedBy, 'bytes');
  expectEqual(tailPartial.lastLinePartial, true);
  expectEqual(tailPartial.outputLines, 1);
  expectEqual(tailPartial.outputBytes, 10);
  expectEqual(tailPartial.content, 'y'.repeat(10));

  // ── UTF-8 multi-byte safety (never split a code point) ─────────────────
  // "é" = 2 bytes in UTF-8; keep the last 3 bytes of "ééééé" = 1 full "é"
  const utf8Tail = truncateTail('ééééé', { maxBytes: 3 });
  expectEqual(utf8Tail.lastLinePartial, true);
  expectEqual(utf8Tail.outputBytes, 2);
  expectEqual(utf8Tail.content, 'é');

  // Head byte limit must not split a multi-byte char inside the first line's
  // byte budget (still whole lines only — no partial lines allowed).
  const utf8Head = truncateHead('ééééé\nrest\n', { maxBytes: 6 });
  expectEqual(utf8Head.outputBytes, 0);
  expectEqual(utf8Head.content, '');

  // ── truncateLine ───────────────────────────────────────────────────────
  const lineShort = truncateLine('short');
  expectEqual(lineShort.text, 'short');
  expectEqual(lineShort.wasTruncated, false);

  const lineExact = truncateLine('x'.repeat(500));
  expectEqual(lineExact.wasTruncated, false);

  const lineTruncated = truncateLine('x'.repeat(500) + 'tail');
  expectEqual(lineTruncated.wasTruncated, true);
  expectEqual(lineTruncated.text.length, 500 + '... [truncated]'.length);
  expectTrue(lineTruncated.text.endsWith('... [truncated]'));

  const lineCustom = truncateLine('abcdefghij', 4);
  expectEqual(lineCustom.text, 'abcd... [truncated]');
  expectEqual(lineCustom.wasTruncated, true);

  // ── formatSize ─────────────────────────────────────────────────────────
  expectEqual(formatSize(0), '0B');
  expectEqual(formatSize(512), '512B');
  expectEqual(formatSize(12595), '12.3KB'); // 12595 / 1024 ≈ 12.2998
  expectEqual(formatSize(1024 * 1024 * 1.5), '1.5MB');

  // ── Trailing newline handling (no phantom extra line) ──────────────────
  const trailingNl = truncateHead('a\nb\n');
  expectEqual(trailingNl.totalLines, 2);
  expectEqual(trailingNl.truncated, false);

  console.log('[truncate] __selfTest: all assertions passed');
}
