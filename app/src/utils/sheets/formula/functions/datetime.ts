// Date and time functions (Excel serials).

import { daysInMonth, isLeapYear, nowSerial, parseDateText, serialToHms, serialToYmd, todaySerial, weekdayOf, ymdToSerial } from '../../dates';
import { NUM, VALUE, isError, toNumber, type Scalar } from '../values';
import { flattenCells, numFn, scalarFn, type FnTable } from './helpers';

const serialArg = (value: Scalar): number | ReturnType<typeof toNumber> => toNumber(value);

/** Same day of the month `months` away, clamped to the month's length. */
function addMonths(serial: number, months: number): number {
  const { y, m, d } = serialToYmd(serial);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12 + 12) % 12 + 1;
  return ymdToSerial(year, month, Math.min(d, daysInMonth(year, month)));
}

const isWeekend = (serial: number): boolean => {
  const day = weekdayOf(serial);
  return day === 1 || day === 7;
};

function days360(start: number, end: number, european: boolean): number {
  const a = serialToYmd(start);
  const b = serialToYmd(end);
  let d1 = a.d;
  let d2 = b.d;
  if (european) {
    if (d1 === 31) d1 = 30;
    if (d2 === 31) d2 = 30;
  } else {
    const lastFeb = (ymd: { y: number; m: number; d: number }): boolean => ymd.m === 2 && ymd.d === daysInMonth(ymd.y, 2);
    if (lastFeb(a) && lastFeb(b)) d2 = 30;
    if (lastFeb(a)) d1 = 30;
    if (d2 === 31 && d1 >= 30) d2 = 30;
    if (d1 === 31) d1 = 30;
  }
  return (b.y - a.y) * 360 + (b.m - a.m) * 30 + (d2 - d1);
}

function isoWeek(serial: number): number {
  const ymd = serialToYmd(serial);
  const date = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86400000 + 1) / 7);
}

export const DATETIME_FUNCTIONS: FnTable = {
  TODAY: { min: 0, max: 0, fn: (_args, env) => todaySerial(env.now) },
  NOW: { min: 0, max: 0, fn: (_args, env) => nowSerial(env.now) },
  DATE: numFn(3, 3, ([y, m, d]) => {
    const serial = ymdToSerial(Math.trunc(y), Math.trunc(m), Math.trunc(d));
    return serial < 0 ? NUM : serial;
  }),
  TIME: numFn(3, 3, ([h, m, s]) => {
    const total = Math.trunc(h) * 3600 + Math.trunc(m) * 60 + Math.trunc(s);
    return total < 0 ? NUM : (total % 86400) / 86400;
  }),
  YEAR: numFn(1, 1, ([n]) => serialToYmd(n).y),
  MONTH: numFn(1, 1, ([n]) => serialToYmd(n).m),
  DAY: numFn(1, 1, ([n]) => serialToYmd(n).d),
  HOUR: numFn(1, 1, ([n]) => serialToHms(n).h),
  MINUTE: numFn(1, 1, ([n]) => serialToHms(n).m),
  SECOND: numFn(1, 1, ([n]) => serialToHms(n).s),
  WEEKDAY: numFn(1, 2, ([n, type]) => {
    const day = weekdayOf(n);
    switch (type ?? 1) {
      case 1: case 17: return day;
      case 2: case 11: return ((day + 5) % 7) + 1;
      case 3: return (day + 5) % 7;
      case 12: return ((day + 4) % 7) + 1;
      case 13: return ((day + 3) % 7) + 1;
      case 14: return ((day + 2) % 7) + 1;
      case 15: return ((day + 1) % 7) + 1;
      case 16: return (day % 7) + 1;
      default: return NUM;
    }
  }),
  WEEKNUM: numFn(1, 2, ([n, type]) => {
    const { y } = serialToYmd(n);
    if (type === 21) return isoWeek(n);
    const startDay = (type ?? 1) === 2 || type === 11 ? 2 : 1;
    const jan1 = ymdToSerial(y, 1, 1);
    const offset = (weekdayOf(jan1) - startDay + 7) % 7;
    return Math.floor((Math.floor(n) - jan1 + offset) / 7) + 1;
  }),
  ISOWEEKNUM: numFn(1, 1, ([n]) => isoWeek(n)),
  DATEVALUE: scalarFn(1, 1, ([s]) => {
    if (typeof s === 'number') return Math.floor(s);
    const parsed = parseDateText(String(s));
    return parsed ? Math.floor(parsed.serial) : VALUE;
  }),
  TIMEVALUE: scalarFn(1, 1, ([s]) => {
    const parsed = parseDateText(String(s));
    return parsed ? parsed.serial - Math.floor(parsed.serial) : VALUE;
  }),
  EDATE: numFn(2, 2, ([start, months]) => addMonths(Math.floor(start), Math.trunc(months))),
  EOMONTH: numFn(2, 2, ([start, months]) => {
    const moved = addMonths(Math.floor(start), Math.trunc(months));
    const { y, m } = serialToYmd(moved);
    return ymdToSerial(y, m, daysInMonth(y, m));
  }),
  DAYS: numFn(2, 2, ([end, start]) => Math.floor(end) - Math.floor(start)),
  DAYS360: numFn(2, 3, ([start, end, method]) => days360(Math.floor(start), Math.floor(end), Boolean(method))),
  DATEDIF: scalarFn(3, 3, ([a, b, unit]) => {
    const start = serialArg(a);
    const end = serialArg(b);
    if (isError(start)) return start;
    if (isError(end)) return end;
    if (start > end) return NUM;
    const s = serialToYmd(Math.floor(start));
    const e = serialToYmd(Math.floor(end));
    let years = e.y - s.y;
    let months = e.m - s.m;
    let days = e.d - s.d;
    if (days < 0) {
      months -= 1;
      days += daysInMonth(e.m === 1 ? e.y - 1 : e.y, e.m === 1 ? 12 : e.m - 1);
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    switch (String(unit).toUpperCase()) {
      case 'Y': return years;
      case 'M': return years * 12 + months;
      case 'D': return Math.floor(end) - Math.floor(start);
      case 'MD': return days;
      case 'YM': return months;
      case 'YD': {
        let anniversary = ymdToSerial(e.y, s.m, s.d);
        if (anniversary > Math.floor(end)) anniversary = ymdToSerial(e.y - 1, s.m, s.d);
        return Math.floor(end) - anniversary;
      }
      default: return NUM;
    }
  }),
  NETWORKDAYS: {
    min: 2, max: 3,
    fn: (args, env) => {
      const start = toNumber(args[0] as Scalar);
      const end = toNumber(args[1] as Scalar);
      if (isError(start)) return start;
      if (isError(end)) return end;
      const holidays = new Set(args[2] === undefined ? [] : flattenCells([args[2]], env).filter((c): c is number => typeof c === 'number').map(Math.floor));
      const lo = Math.floor(Math.min(start, end));
      const hi = Math.floor(Math.max(start, end));
      let count = 0;
      for (let d = lo; d <= hi; d += 1) if (!isWeekend(d) && !holidays.has(d)) count += 1;
      return start <= end ? count : -count;
    },
  },
  WORKDAY: {
    min: 2, max: 3,
    fn: (args, env) => {
      const start = toNumber(args[0] as Scalar);
      const days = toNumber(args[1] as Scalar);
      if (isError(start)) return start;
      if (isError(days)) return days;
      const holidays = new Set(args[2] === undefined ? [] : flattenCells([args[2]], env).filter((c): c is number => typeof c === 'number').map(Math.floor));
      let current = Math.floor(start);
      let remaining = Math.trunc(days);
      const step = remaining < 0 ? -1 : 1;
      while (remaining !== 0) {
        current += step;
        if (!isWeekend(current) && !holidays.has(current)) remaining -= step;
      }
      return current;
    },
  },
  YEARFRAC: numFn(2, 3, ([a, b, basis]) => {
    const start = Math.floor(Math.min(a, b));
    const end = Math.floor(Math.max(a, b));
    switch (basis ?? 0) {
      case 0: return days360(start, end, false) / 360;
      case 4: return days360(start, end, true) / 360;
      case 2: return (end - start) / 360;
      case 3: return (end - start) / 365;
      case 1: {
        const s = serialToYmd(start);
        const e = serialToYmd(end);
        let total = 0;
        for (let y = s.y; y <= e.y; y += 1) total += isLeapYear(y) ? 366 : 365;
        return (end - start) / (total / (e.y - s.y + 1));
      }
      default: return NUM;
    }
  }),
};
