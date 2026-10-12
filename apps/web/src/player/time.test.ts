import { describe, expect, it } from 'vitest';
import { formatBytes, formatClock, formatEta } from './time';

describe('time and size formatting', () => {
  it('formats the player clock as m:ss.t', () => {
    expect(formatClock(0)).toBe('0:00.0');
    expect(formatClock(14.68)).toBe('0:14.7');
    expect(formatClock(59.96)).toBe('1:00.0');
    expect(formatClock(65.25)).toBe('1:05.3');
    expect(formatClock(-3)).toBe('0:00.0');
  });

  it('formats a remaining time as m:ss, rounding up', () => {
    expect(formatEta(0)).toBe('0:00');
    expect(formatEta(8.2)).toBe('0:09');
    expect(formatEta(61)).toBe('1:01');
  });

  it('formats byte counts in decimal units', () => {
    expect(formatBytes(0)).toBe('1 KB');
    expect(formatBytes(999)).toBe('1 KB');
    expect(formatBytes(12_345_678)).toBe('12.3 MB');
    expect(formatBytes(2_500_000_000)).toBe('2.50 GB');
  });
});
