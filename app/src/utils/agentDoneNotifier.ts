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
 * Agents also pause mid-task (tool calls, file edits, waiting on a build),
 * so a quiet gap alone is weak evidence. Two things keep a still-working
 * agent from reading as finished: the quiet window is long enough to cover
 * short pauses, and output that resumes within RESUME_MS of a completion
 * reopens the run as working instead of leaving the pane stuck on "done".
 *
 * Extension panels are detected inside their webview (see
 * src-tauri/src/extension_host/webview-activity.js) and arrive as the
 * `extension-panel-task-complete` event.
 */

const AGENT_DONE_SOUND_URL = '/Sounds/Notification_sound.mp3';
const EXTENSION_DONE_SOUND_URL = encodeURI('/Sounds/Extension notification done.wav');
/** Silence that marks the end of an activity run. Long enough to cover
 * short mid-task pauses (tool calls, file writes) without crying done. */
const QUIET_MS = 5000;
/** Shorter runs (echo, slash-command menus, quick replies) don't notify. */
const MIN_BUSY_MS = 4000;
/** Output resuming this long after a completion reopens the run as working. */
const RESUME_MS = 60000;
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
  /** Last state reported via onChange. */
  private phase: AgentActivityState['phase'] = 'idle';
  /** When the current `done` was reported, and when its run started. Kept so
   * output that resumes shortly after a completion can reopen the run. */
  private doneAt = 0;
  private doneStartedAt = 0;
  /** A resumed run that has not shown itself as working yet; it must stream
   * past BUSY_SHOW_MS before it may complete again, so one stray chunk of
   * output cannot flip done straight back to done (replaying the sound). */
  private resumed = false;

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
    this.doneAt = 0;
    this.resumed = false;
  }

  /** The user interrupted the agent (Ctrl+C / Esc); don't notify for it. */
  disarm(): void {
    this.armed = false;
    this.watching = false;
    this.doneAt = 0;
    this.resumed = false;
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
    this.resumed = false;
    this.setIdle();
  }

  /** Terminal output arrived. */
  output(): void {
    const now = Date.now();
    if (this.resumed) {
      // Already reopened by an earlier chunk; armedAt stays at the resume
      // moment so sustained output still trips the busy threshold below.
    } else if (this.phase === 'done' && this.doneAt !== 0 && now - this.doneAt <= RESUME_MS) {
      // The run was closed during a mid-task pause and the agent is still
      // going. Reopen it as a continuation of the same run, but stay visibly
      // done until the output proves itself by streaming a while.
      this.armed = true;
      this.watching = true;
      this.armedAt = now;
      this.runStartedAt = this.doneStartedAt;
      this.resumed = true;
    } else {
      if (!this.quietTimer) this.runStartedAt = now;
      if (this.phase === 'done') this.doneAt = 0;
    }
    if (this.quietTimer) clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => this.endRun(), QUIET_MS);

    if (this.watching && this.busyStartedAt === null && now - this.armedAt >= BUSY_SHOW_MS) {
      this.busyStartedAt = this.resumed ? this.doneStartedAt : this.armedAt;
      this.doneAt = 0;
      this.resumed = false;
      this.emit({ phase: 'busy', startedAt: this.busyStartedAt });
    }
  }

  dispose(): void {
    if (this.quietTimer) clearTimeout(this.quietTimer);
    this.quietTimer = null;
    this.armed = false;
    this.watching = false;
    this.busyStartedAt = null;
    this.doneAt = 0;
    this.resumed = false;
  }

  private emit(state: AgentActivityState): void {
    this.phase = state.phase;
    this.onChange(state);
  }

  private setIdle(): void {
    if (this.busyStartedAt === null) return;
    this.busyStartedAt = null;
    this.emit({ phase: 'idle' });
  }

  private endRun(): void {
    this.quietTimer = null;
    const now = Date.now();
    const busyMs = now - QUIET_MS - this.runStartedAt;
    const wasBusy = this.busyStartedAt !== null;
    const startedAt = this.busyStartedAt ?? this.runStartedAt;
    this.watching = false;
    this.busyStartedAt = null;
    // A resumed run only counts when it visibly worked again; otherwise a
    // lone stray chunk after a real completion would replay the done state.
    const freshRun = !this.resumed || wasBusy;
    this.resumed = false;
    if (this.armed && busyMs >= MIN_BUSY_MS && freshRun) {
      this.armed = false;
      this.doneAt = now;
      this.doneStartedAt = startedAt;
      this.emit({ phase: 'done', durationMs: Math.max(0, now - QUIET_MS - startedAt), finishedAt: now });
    } else if (wasBusy) {
      this.emit({ phase: 'idle' });
    }
  }
}
