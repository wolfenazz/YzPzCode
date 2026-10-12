// Excel date serials (1900 system with its leap-year bug) and date text parsing.
// Dependency-free.

const MS_PER_DAY = 86400000;
/** Serial of 1970-01-01 in the 1900 system. */
const UNIX_EPOCH_SERIAL = 25569;

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_SHORT = MONTH_NAMES.map((name) => name.slice(0, 3));
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = DAY_NAMES.map((name) => name.slice(0, 3));

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

/** Calendar date of a serial. 60 is Excel's fictional 1900-02-29; 0 is "1900-01-00". */
export function serialToYmd(serial: number): Ymd {
  const day = Math.floor(serial);
  if (day === 60) return { y: 1900, m: 2, d: 29 };
  if (day < 1) return { y: 1900, m: 1, d: 0 };
  const shifted = day < 60 ? day + 1 : day;
  const date = new Date((shifted - UNIX_EPOCH_SERIAL) * MS_PER_DAY);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

/** Serial of a calendar date; months and days may overflow like `DATE()`. */
export function ymdToSerial(y: number, m: number, d: number): number {
  const year = y >= 0 && y < 100 ? 1900 + y : y;
  const date = new Date(0);
  date.setUTCFullYear(year, m - 1, d);
  date.setUTCHours(0, 0, 0, 0);
  const days = Math.round(date.getTime() / MS_PER_DAY) + UNIX_EPOCH_SERIAL;
  return days < 61 ? days - 1 : days;
}

export interface Hms {
  h: number;
  m: number;
  s: number;
}

/** Hours, minutes and seconds of the fractional part, rounded to the second. */
export function serialToHms(serial: number): Hms {
  const fraction = serial - Math.floor(serial);
  let total = Math.round(fraction * 86400);
  if (total >= 86400) total = 0;
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

/** 1 = Sunday … 7 = Saturday, with Excel's offset for dates before March 1900. */
export const weekdayOf = (serial: number): number => ((((Math.floor(serial) - 1) % 7) + 7) % 7) + 1;

export const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Today's serial (local date). */
export function todaySerial(now = new Date()): number {
  return ymdToSerial(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function nowSerial(now = new Date()): number {
  return todaySerial(now) + (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
}

const monthFromName = (name: string): number => {
  const lower = name.toLowerCase();
  if (lower.length < 3) return 0;
  return MONTH_NAMES.findIndex((month) => month.toLowerCase().startsWith(lower)) + 1;
};

const validYmd = (y: number, m: number, d: number): boolean => m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m) && y >= 1900 && y <= 9999;

const expandYear = (value: number, digits: number): number => (digits <= 2 ? (value < 30 ? 2000 + value : 1900 + value) : value);

export interface ParsedDate {
  serial: number;
  /** A number format that shows the date the way it was typed. */
  format: string;
  hasTime: boolean;
}

/** Date and/or time text (`3/4/2026`, `2026-03-04`, `4 Mar 2026`, `13:45`, `3/4/2026 1:30 PM`) to a serial. */
export function parseDateText(input: string): ParsedDate | null {
  const text = input.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  let datePart = text;
  let timePart = '';
  const timeMatch = /(?:^|\s|T)(\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s?[AaPp][Mm])?)$/.exec(text);
  if (timeMatch) {
    timePart = timeMatch[1];
    datePart = text.slice(0, timeMatch.index).trim();
  }

  let serial: number | null = null;
  let format = '';
  if (datePart) {
    let m: RegExpExecArray | null;
    if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(datePart))) {
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (validYmd(y, mo, d)) { serial = ymdToSerial(y, mo, d); format = 'yyyy-mm-dd'; }
    } else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(datePart))) {
      // US order (month first) like Excel's default; fall back to day first when the month is impossible.
      const a = Number(m[1]);
      const b = Number(m[2]);
      const y = expandYear(Number(m[3]), m[3].length);
      if (validYmd(y, a, b)) { serial = ymdToSerial(y, a, b); format = 'm/d/yyyy'; }
      else if (validYmd(y, b, a)) { serial = ymdToSerial(y, b, a); format = 'd/m/yyyy'; }
    } else if ((m = /^(\d{1,2})[ -]([A-Za-z]{3,9})\.?,?[ -](\d{2,4})$/.exec(datePart))) {
      const month = monthFromName(m[2]);
      const y = expandYear(Number(m[3]), m[3].length);
      const d = Number(m[1]);
      if (month && validYmd(y, month, d)) { serial = ymdToSerial(y, month, d); format = 'd-mmm-yy'; }
    } else if ((m = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{2,4})$/.exec(datePart))) {
      const month = monthFromName(m[1]);
      const y = expandYear(Number(m[3]), m[3].length);
      const d = Number(m[2]);
      if (month && validYmd(y, month, d)) { serial = ymdToSerial(y, month, d); format = 'mmm d, yyyy'; }
    }
    if (serial === null) return null;
  }

  let fraction: number | null = null;
  if (timePart) {
    const t = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:\s?([AaPp])[Mm])?$/.exec(timePart);
    if (!t) return null;
    let hours = Number(t[1]);
    const minutes = Number(t[2]);
    const seconds = t[3] ? Number(t[3]) : 0;
    const meridiem = t[4]?.toLowerCase();
    if (minutes > 59 || seconds > 59) return null;
    if (meridiem) {
      if (hours < 1 || hours > 12) return null;
      hours = (hours % 12) + (meridiem === 'p' ? 12 : 0);
    } else if (hours > 23) return null;
    fraction = (hours * 3600 + minutes * 60 + seconds) / 86400;
    if (!datePart) format = t[3] ? (meridiem ? 'h:mm:ss AM/PM' : 'h:mm:ss') : meridiem ? 'h:mm AM/PM' : 'h:mm';
    else format = `${format} ${t[3] ? 'h:mm:ss' : 'h:mm'}`;
  }
  if (serial === null && fraction === null) return null;
  return { serial: (serial ?? 0) + (fraction ?? 0), format, hasTime: fraction !== null };
}
