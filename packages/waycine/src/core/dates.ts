/**
 * Calendar dates without `Date` (the core must stay clock-free): ISO parsing,
 * day and month arithmetic, and the date-format tokens used by
 * `text.cardDate` / `text.pinDate`.
 */

/** A proleptic Gregorian calendar date. */
export interface CivilDate {
  /** Year, 1..9999. */
  year: number;
  /** Month, 1..12. */
  month: number;
  /** Day of month, 1..31. */
  day: number;
}

/** Month abbreviations for the `MMM` token. */
export const MONTH_ABBR: readonly string[] = Object.freeze([
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
]);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for Gregorian leap years. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in `month` (1..12) of `year`. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** Parses an ISO `YYYY-MM-DD` date; null when missing, malformed or not a real day. */
export function parseIsoDate(text: string | undefined): CivilDate | null {
  if (text === undefined) {
    return null;
  }
  const m = ISO_DATE.exec(text);
  if (m === null) {
    return null;
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

/** Days since 1970-01-01 (negative before), by the civil-from-days inverse (H. Hinnant). */
export function dayNumber(d: CivilDate): number {
  const y = d.month <= 2 ? d.year - 1 : d.year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (d.month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Months since year 0 (`year * 12 + month - 1`), for calendar-month spans. */
export function monthNumber(d: CivilDate): number {
  return d.year * 12 + d.month - 1;
}

/** -1, 0 or 1 as `a` is before, equal to or after `b`. */
export function compareDates(a: CivilDate, b: CivilDate): number {
  const da = dayNumber(a);
  const db = dayNumber(b);
  return da < db ? -1 : da > db ? 1 : 0;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * Formats `d` with a format string. Tokens, longest match first: `YYYY`
 * (4-digit year), `MMM` (JAN..DEC), `MM` / `M` (month, padded / plain), `DD` /
 * `D` (day, padded / plain). Everything else is copied verbatim.
 */
export function formatDate(d: CivilDate, format: string): string {
  let out = '';
  let i = 0;
  while (i < format.length) {
    if (format.startsWith('YYYY', i)) {
      out += pad(d.year, 4);
      i += 4;
    } else if (format.startsWith('MMM', i)) {
      out += MONTH_ABBR[d.month - 1] ?? '';
      i += 3;
    } else if (format.startsWith('MM', i)) {
      out += pad(d.month, 2);
      i += 2;
    } else if (format.startsWith('M', i)) {
      out += String(d.month);
      i += 1;
    } else if (format.startsWith('DD', i)) {
      out += pad(d.day, 2);
      i += 2;
    } else if (format.startsWith('D', i)) {
      out += String(d.day);
      i += 1;
    } else {
      out += format[i];
      i += 1;
    }
  }
  return out;
}

/**
 * Formats a stop's date or date range: '' without a valid start date or with
 * an empty format; `start + separator + end` when a valid end date differs
 * from the start and formats differently.
 */
export function formatDateRange(
  date: string | undefined,
  endDate: string | undefined,
  format: string,
  separator: string,
): string {
  const start = parseIsoDate(date);
  if (start === null || format === '') {
    return '';
  }
  const first = formatDate(start, format);
  const end = parseIsoDate(endDate);
  if (end === null || compareDates(end, start) <= 0) {
    return first;
  }
  const last = formatDate(end, format);
  return last === first ? first : `${first}${separator}${last}`;
}
