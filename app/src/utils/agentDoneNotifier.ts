/**
 * Detects when an AI agent CLI (Claude Code, Codex, OpenCode, Kilo, ...) is
 * working on a task and when it has finished, and plays the "done"
 * notification sounds. The pane's working glow follows the same tracker.
 *
 * Agent TUIs repaint continuously while they work (spinners, elapsed-time
 * counters), and go silent once they are back at the prompt. So a task is:
 * the user submits input (Enter), output then streams for at least
 * MIN_BUSY_MS, and finally goes quiet for QUIET_MS.
 *
 * Extension panels are detected inside their webview (see
 * src-tauri/src/extension_host/webview-activity.js) and arrive as the
 * `extension-panel-task-complete` event.
 */

const AGENT_DONE_SOUND_URL = '/Sounds/Notification_sound.mp3';
const EXTENSION_DONE_SOUND_URL = encodeURI('/Sounds/Extension notification done.wav');
/** Silence that marks the end of an activity run. */
const QUIET_MS = 3000;
/** Shorter runs (echo, slash-command menus, quick replies) don't notify. */
const MIN_BUSY_MS = 4000;
/** Several panes finishing together play the sound once. */
const SOUND_COOLDOWN_MS = 1500;

const sounds = new Map<string, { audio: HTMLAudioElement; lastPlayedAt: number }>();

function playSound(url: string, volume: number): void {
  const now = Date.now();
  let sound = sounds.get(url);
  if (sound && now - sound.lastPlayedAt < SOUND_COOLDOWN_MS) return;
  try {
    if (!sound) {
      sound = { audio: new Audio(url), lastPlayedAt: 0 };
      sounds.set(url, sound);
    }
    sound.lastPlayedAt = now;
    sound.audio.volume = Math.min(1, Math.max(0, volume / 100));
    sound.audio.currentTime = 0;
    void sound.audio.play().catch((error: unknown) => {
      console.warn('Failed to play notification sound:', error);
    });
  } catch (error) {
    console.warn('Failed to play notification sound:', error);
  }
}

export function playAgentDoneSound(volume: number): void {
  playSound(AGENT_DONE_SOUND_URL, volume);
}

export function playExtensionDoneSound(volume: number): void {
  playSound(EXTENSION_DONE_SOUND_URL, volume);
}

/**
 * Output must still be streaming this long after a submit before the pane
 * shows as working, so a quick menu pick or slash command doesn't flash it.
 */
const BUSY_SHOW_MS = 600;
/** Typing this early into a working run means it was a menu, not a task. */
const BUSY_CANCEL_MS = 800;

/** Mouse, focus and other reports the terminal sends on its own (not typing). */
const TERMINAL_REPORT_RE = /^\x1b\[(?:<[\d;]+[mM]|M[\s\S]{3}|[IO]|\d+;\d+R|\?[\d;]*c)/;

export type AgentActivityState =
  | { phase: 'idle' }
  | { phase: 'busy'; startedAt: number }
  | { phase: 'done'; durationMs: number; finishedAt: number };

export class AgentActivityTracker {
  private armed = false;
  private armedAt = 0;
  private runStartedAt = 0;
  private quietTimer: ReturnType<typeof setTimeout> | null = null;
  /** Armed for the working indicator; cleared at the end of every run. */
  private watching = false;
  private busyStartedAt: number | null = null;

  /**
   * `onChange` reports the working indicator; `{ phase: 'done' }` is the
   * same moment the done sound plays.
   */
  constructor(private readonly onChange: (state: AgentActivityState) => void) {}

  /** The user submitted input to the agent; the next long run is a task. */
  arm(): void {
    const now = Date.now();
    this.armed = true;
    this.watching = true;
    this.armedAt = now;
    // Measure from the submit, not from the echo of the prompt being typed.
    this.runStartedAt = now;
  }

  /** The user interrupted the agent (Ctrl+C / Esc); don't notify for it. */
  disarm(): void {
    this.armed = false;
    this.watching = false;
    this.setIdle();
  }

  /**
   * The user typed something other than a submit. Before the agent visibly
   * starts working that means the Enter picked a menu entry or the user is
   * writing the next prompt, so the echo must not read as a task.
   */
  typed(data: string): void {
    if (TERMINAL_REPORT_RE.test(data)) return;
    const now = Date.now();
    if (this.busyStartedAt !== null) {
      // Typing ahead while the agent works is fine; only a run that just
      // started was most likely the echo of a menu.
      if (now - this.busyStartedAt >= BUSY_CANCEL_MS) return;
    } else if (now - this.armedAt < BUSY_SHOW_MS) {
      return;
    }
    this.armed = false;
    this.watching = false;
    this.setIdle();
  }

  /** Terminal output arrived. */
  output(): void {
    const now = Date.now();
    if (!this.quietTimer) this.runStartedAt = now;
    else clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => this.endRun(), QUIET_MS);

    if (this.watching && this.busyStartedAt === null && now - this.armedAt >= BUSY_SHOW_MS) {
      this.busyStartedAt = this.armedAt;
      this.onChange({ phase: 'busy', startedAt: this.armedAt });
    }
  }

  dispose(): void {
    if (this.quietTimer) clearTimeout(this.quietTimer);
    this.quietTimer = null;
    this.armed = false;
    this.watching = false;
    this.busyStartedAt = null;
  }

  private setIdle(): void {
    if (this.busyStartedAt === null) return;
    this.busyStartedAt = null;
    this.onChange({ phase: 'idle' });
  }

  private endRun(): void {
    this.quietTimer = null;
    const now = Date.now();
    const busyMs = now - QUIET_MS - this.runStartedAt;
    const wasBusy = this.busyStartedAt !== null;
    const startedAt = this.busyStartedAt ?? this.runStartedAt;
    this.watching = false;
    this.busyStartedAt = null;
    if (this.armed && busyMs >= MIN_BUSY_MS) {
      this.armed = false;
      this.onChange({ phase: 'done', durationMs: Math.max(0, now - QUIET_MS - startedAt), finishedAt: now });
    } else if (wasBusy) {
      this.onChange({ phase: 'idle' });
    }
  }
}
