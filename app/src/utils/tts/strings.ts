import { detectLang } from './langDetect';
import type { TtsLang } from './types';

/**
 * Task 8 polish: single source for narration limits + bilingual (EN/AR)
 * user-facing strings.
 *
 * Limits mirror the backend single-shot ceiling (`MAX_TEXT_CHARS = 6000` in
 * `src-tauri/src/tts/bridge.rs` and `tts_bridge.py`, `REPORT_NARRATION_MAX_CHARS`
 * in `reportNarration.ts`). Texts above `TTS_CHUNK_HINT_CHARS` synthesize in
 * ~250-char chunks with progress + Cancel; texts above `TTS_MAX_CHARS` are
 * refused with a bilingual message instead of a backend round-trip.
 */
export const TTS_MAX_CHARS = 6000;
/** Above this, tooltips note that synthesis runs in chunks. */
export const TTS_CHUNK_HINT_CHARS = 2000;

export type TtsStringKey =
  | 'emptyNotes'
  | 'tooLong'
  | 'chunkNote'
  | 'missingModel'
  | 'pythonMissing'
  | 'ffmpegMissing'
  | 'downloadFailed'
  | 'synthFailed'
  | 'cancelled'
  | 'cachedReplay'
  | 'selectOrSection';

interface Bilingual {
  en: string;
  ar: string;
}

const STRINGS: Record<TtsStringKey, Bilingual> = {
  emptyNotes: {
    en: 'Add speaker notes to narrate',
    ar: 'أضف ملاحظات المتحدث للسرد',
  },
  tooLong: {
    en: `This text is too long to narrate in one go (${TTS_MAX_CHARS} characters max) — select a smaller part.`,
    ar: `هذا النص طويل جدًا للسرد دفعة واحدة (بحد أقصى ${TTS_MAX_CHARS} حرف) — حدد جزءًا أصغر.`,
  },
  chunkNote: {
    en: 'Long text synthesizes in chunks with progress and Cancel; replay is instant from cache.',
    ar: 'تُحوَّل النصوص الطويلة إلى مقاطع صوتية مع شريط تقدم وزر إلغاء، وإعادة التشغيل فورية من الذاكرة.',
  },
  missingModel: {
    en: 'Download this voice first (Settings → Narration).',
    ar: 'حمّل هذا الصوت أولًا (الإعدادات ← السرد).',
  },
  pythonMissing: {
    en: 'Python 3.10+ is required for narration.',
    ar: 'السرد يحتاج بايثون 3.10 أو أحدث.',
  },
  ffmpegMissing: {
    en: 'ffmpeg is required to prepare narration voices.',
    ar: 'مطلوب ffmpeg لتجهيز أصوات السرد.',
  },
  downloadFailed: {
    en: 'Voice download failed — check the connection and disk space, then retry.',
    ar: 'فشل تنزيل الصوت — تحقق من الاتصال ومساحة القرص ثم أعد المحاولة.',
  },
  synthFailed: {
    en: 'Narration failed — retry, then check Settings → Narration for the log.',
    ar: 'فشل السرد — أعد المحاولة، ثم راجع الإعدادات ← السرد لسجل الأخطاء.',
  },
  cancelled: {
    en: 'Narration cancelled.',
    ar: 'تم إلغاء السرد.',
  },
  cachedReplay: {
    en: 'Playing from cache.',
    ar: 'تشغيل من الذاكرة المخزنة.',
  },
  selectOrSection: {
    en: 'Select text or put the cursor in a section to narrate.',
    ar: 'حدد نصًا أو ضع المؤشر داخل قسم للسرد.',
  },
};

/** One language's string (UI picks by detected text language where it matters). */
export function ttsString(key: TtsStringKey, lang: TtsLang = 'en'): string {
  return STRINGS[key][lang];
}

/** Combined `EN · AR` toast/message text (single-line, `dir="auto"` at the call site). */
export function ttsBilingual(key: TtsStringKey): string {
  const entry: Bilingual = STRINGS[key];
  return `${entry.en} · ${entry.ar}`;
}

/** `rtl` for Arabic text so tooltips/popovers mirror via logical props. */
export function ttsDirForText(text: string): 'rtl' | 'ltr' {
  return detectLang(text) === 'ar' ? 'rtl' : 'ltr';
}

/** True when the text exceeds the backend single-shot ceiling. */
export function isTtsOverLimit(text: string): boolean {
  return text.trim().length > TTS_MAX_CHARS;
}

/** True when the text is long enough to synthesize in chunks (progress + Cancel). */
export function needsTtsChunkNote(text: string): boolean {
  const len: number = text.trim().length;
  return len > TTS_CHUNK_HINT_CHARS && len <= TTS_MAX_CHARS;
}

/**
 * Message for a failed voice download/install. The connection-and-disk hint is
 * only right for network or disk errors; any other reason (wrong Python
 * version, a package that will not install) is shown as the backend wrote it.
 */
export function ttsDownloadError(raw: string): string {
  const looksLikeNetworkOrDisk: boolean =
    /could not reach|could not download|timed out|timeout|connection|network|dns|no space|disk|hugging face/i.test(
      raw,
    );
  if (looksLikeNetworkOrDisk) return `${ttsBilingual('downloadFailed')} (${raw})`;
  return `Voice setup failed · فشل تجهيز الصوت: ${raw}`;
}

/**
 * Maps raw backend/transport errors to bilingual user messages. Unknown errors
 * keep their detail (appended after the generic synth-failed line) so logs stay
 * debuggable while the UI stays bilingual.
 */
export function ttsFriendlyError(raw: string): string {
  const lower: string = raw.toLowerCase();
  if (lower.includes('download the') && lower.includes('voice')) return ttsBilingual('missingModel');
  if (lower.includes('python')) return `${ttsBilingual('pythonMissing')} (${raw})`;
  if (lower.includes('ffmpeg')) return `${ttsBilingual('ffmpegMissing')} (${raw})`;
  if (lower.includes('cancelled')) return ttsBilingual('cancelled');
  if (lower.includes('too long')) return ttsBilingual('tooLong');
  return `${ttsBilingual('synthFailed')} (${raw})`;
}
