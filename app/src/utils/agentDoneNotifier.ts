/**
 * Detects when an AI agent CLI (Claude Code, Codex, OpenCode, Kilo, ...) has
 * finished a task, and plays the "done" notification sounds.
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

export class AgentActivityTracker {
  private armed = false;
  private runStartedAt = 0;
  private quietTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly onDone: () => void) {}

  /** The user submitted input to the agent; the next long run is a task. */
  arm(): void {
    this.armed = true;
    // Measure from the submit, not from the echo of the prompt being typed.
    this.runStartedAt = Date.now();
  }

  /** The user interrupted the agent (Ctrl+C / Esc); don't notify for it. */
  disarm(): void {
    this.armed = false;
  }

  /** Terminal output arrived. */
  output(): void {
    const now = Date.now();
    if (!this.quietTimer) this.runStartedAt = now;
    else clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => this.endRun(), QUIET_MS);
  }

  dispose(): void {
    if (this.quietTimer) clearTimeout(this.quietTimer);
    this.quietTimer = null;
    this.armed = false;
  }

  private endRun(): void {
    this.quietTimer = null;
    const busyMs = Date.now() - QUIET_MS - this.runStartedAt;
    if (this.armed && busyMs >= MIN_BUSY_MS) {
      this.armed = false;
      this.onDone();
    }
  }
}
