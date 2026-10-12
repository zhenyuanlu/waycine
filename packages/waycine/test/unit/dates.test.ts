import { describe, expect, it } from 'vitest';
import {
  dayNumber,
  formatDate,
  formatDateRange,
  monthNumber,
  parseIsoDate,
} from '../../src/core/dates.js';

describe('dates', () => {
  it('parses ISO dates and rejects impossible ones', () => {
    expect(parseIsoDate('2026-06-13')).toEqual({ year: 2026, month: 6, day: 13 });
    expect(parseIsoDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseIsoDate('2026-02-29')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('2026.06.13')).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
  });

  it('counts days without Date', () => {
    expect(dayNumber({ year: 1970, month: 1, day: 1 })).toBe(0);
    expect(dayNumber({ year: 2000, month: 3, day: 1 })).toBe(11017);
    expect(dayNumber({ year: 1969, month: 12, day: 31 })).toBe(-1);
    const a = dayNumber({ year: 2026, month: 6, day: 13 });
    const b = dayNumber({ year: 2026, month: 9, day: 19 });
    expect(b - a).toBe(98);
    expect(
      monthNumber({ year: 2026, month: 9, day: 1 }) - monthNumber({ year: 2026, month: 6, day: 1 }),
    ).toBe(3);
  });

  it('formats with YYYY / MMM / MM / M / DD / D', () => {
    const d = { year: 2026, month: 6, day: 3 };
    expect(formatDate(d, 'YYYY.MM.DD')).toBe('2026.06.03');
    expect(formatDate(d, 'MM.DD')).toBe('06.03');
    expect(formatDate(d, 'D MMM YYYY')).toBe('3 JUN 2026');
    expect(formatDate(d, 'M/D')).toBe('6/3');
    expect(formatDate(d, '')).toBe('');
  });

  it('formats ranges and hides dates when the format is empty', () => {
    expect(formatDateRange('2026-06-13', undefined, 'MM.DD', ' - ')).toBe('06.13');
    expect(formatDateRange('2026-06-13', '2026-06-14', 'MM.DD', ' - ')).toBe('06.13 - 06.14');
    expect(formatDateRange('2026-06-13', '2026-06-13', 'MM.DD', ' - ')).toBe('06.13');
    expect(formatDateRange('2026-06-13', '2026-06-01', 'MM.DD', ' - ')).toBe('06.13');
    expect(formatDateRange('2026-06-13', '2026-06-20', 'MMM YYYY', ' - ')).toBe('JUN 2026');
    expect(formatDateRange('2026-06-13', undefined, '', ' - ')).toBe('');
    expect(formatDateRange(undefined, '2026-06-14', 'MM.DD', ' - ')).toBe('');
  });
});
