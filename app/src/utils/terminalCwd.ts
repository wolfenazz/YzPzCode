const ANSI_CONTROL_SEQUENCE_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const OSC_DIRECTORY_RE = /\x1b\]7;file:\/\/([^/\x07\x1b]*)([^\x07\x1b]*)(?:\x07|\x1b\\)/g;

const decodePath = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeDetectedPath = (path: string, shell: string, previousCwd: string): string | null => {
  let normalized = decodePath(path.trim());
  if (!normalized) return null;

  const shellName = shell.replaceAll('\\', '/').split('/').pop() ?? shell;
  const isWindowsShell = /(?:cmd|powershell|pwsh)(?:\.exe)?$/i.test(shellName);
  if (isWindowsShell) {
    // OSC 7 represents a Windows drive as /C:/path. Native filesystem calls
    // accept forward slashes, but matching the prompt style keeps the header
    // familiar and makes root paths unambiguous.
    if (/^\/[a-z]:\//i.test(normalized)) normalized = normalized.slice(1);
    if (/^[a-z]:\//i.test(normalized)) normalized = normalized.replaceAll('/', '\\');
  } else if (normalized === '~' || normalized.startsWith('~/')) {
    const homeMatch = previousCwd.match(/^(\/Users\/[^/]+|\/home\/[^/]+|\/root)(?:\/|$)/);
    if (!homeMatch) return null;
    normalized = `${homeMatch[1]}${normalized.slice(1)}`;
  }

  // Only absolute filesystem paths are useful to project detection. This also
  // ignores PowerShell providers such as HKLM: and prompt text from programs.
  const isAbsolute = /^[a-z]:[\\/]/i.test(normalized)
    || /^\\\\[^\\]+\\[^\\]+/.test(normalized)
    || normalized.startsWith('/');
  return isAbsolute ? normalized.replace(/[\\/]$/, '') || normalized : null;
};

/**
 * Finds the newest working directory advertised by a shell prompt. OSC 7 is
 * preferred when shell integration provides it; prompt parsing covers the
 * stock PowerShell, cmd, bash, and zsh prompts used by YzPzCode terminals.
 */
export function detectTerminalCwd(output: string, shell: string, previousCwd: string): string | null {
  let newestOscPath: string | null = null;
  let oscMatch: RegExpExecArray | null = OSC_DIRECTORY_RE.exec(output);
  while (oscMatch) {
    newestOscPath = oscMatch[2];
    oscMatch = OSC_DIRECTORY_RE.exec(output);
  }
  OSC_DIRECTORY_RE.lastIndex = 0;

  if (newestOscPath) {
    return normalizeDetectedPath(newestOscPath, shell, previousCwd);
  }

  const plain = output
    .replace(ANSI_CONTROL_SEQUENCE_RE, '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\r(?!\n)/g, '\n');
  const candidates: string[] = [];
  const promptPatterns = [
    // PowerShell: PS C:\work\project> (including its FileSystem provider prefix).
    /(?:^|\n)PS (?:Microsoft\.PowerShell\.Core\\FileSystem::)?((?:[a-z]:[\\/]|\\\\)[^\n>]*)>/gim,
    // Command Prompt: C:\work\project>
    /(?:^|\n)((?:[a-z]:[\\/]|\\\\)[^\n>]*)>/gim,
    // bash/zsh: user@host:/work/project$, /work/project %, or ~/project#
    /(?:^|\n)(?:[^@\n ]+@[^:\n ]+:)?((?:\/|~(?:\/|$))[^\n$#%]*)\s*[$#%]/gm,
  ];

  for (const pattern of promptPatterns) {
    let match: RegExpExecArray | null = pattern.exec(plain);
    while (match) {
      candidates.push(match[1]);
      match = pattern.exec(plain);
    }
  }

  const latest = candidates.at(-1);
  return latest ? normalizeDetectedPath(latest, shell, previousCwd) : null;
}

export function terminalDirectoryLabel(cwd: string): string {
  const trimmed = cwd.replace(/[\\/]+$/, '');
  if (!trimmed) return cwd;
  const segments = trimmed.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? cwd;
}
