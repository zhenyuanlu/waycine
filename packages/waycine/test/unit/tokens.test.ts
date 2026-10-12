import { describe, expect, it } from 'vitest';
import { formatNumber, missingTokenKeys, replaceTokens } from '../../src/core/tokens.js';

describe('text tokens', () => {
  const values = {
    n: 3,
    total: 7,
    stops: 7,
    regions: 5,
    countries: 1,
    months: 4,
    days: 99,
    km: 2340,
    mi: 1454,
    year: 2026,
  };

  it('replaces plain, padded and plural tokens', () => {
    expect(replaceTokens('RACE {n:02} / {total:02}', values)).toBe('RACE 03 / 07');
    expect(replaceTokens('{n} of {total}', values)).toBe('3 of 7');
    expect(replaceTokens('{stops|RACE|RACES}  /  {regions|STATE|STATES}', values)).toBe(
      '7 RACES  /  5 STATES',
    );
    expect(replaceTokens('{countries|COUNTRY|COUNTRIES}', values)).toBe('1 COUNTRY');
    expect(replaceTokens('{km} KM / {mi} MI', values)).toBe('2,340 KM / 1,454 MI');
    expect(replaceTokens('{months} months, {days} days', values)).toBe('4 months, 99 days');
    expect(replaceTokens('{year} SEASON', values)).toBe('2026 SEASON');
    expect(replaceTokens('{n:03}', { n: 12 })).toBe('012');
    expect(replaceTokens('{total:02}', { total: 120 })).toBe('120');
  });

  it('keeps unknown, valueless and malformed tokens literal', () => {
    expect(replaceTokens('{foo} {n}', { total: 7 })).toBe('{foo} {n}');
    expect(replaceTokens('{n:2} {n|ONE} {n|A|B|C} {stops', values)).toBe(
      '{n:2} {n|ONE} {n|A|B|C} {stops',
    );
    expect(replaceTokens('{ n }', values)).toBe('{ n }');
  });

  it('preserves whitespace and all other text', () => {
    expect(replaceTokens('  {stops}   STOPS  ', values)).toBe('  7   STOPS  ');
    expect(replaceTokens('', values)).toBe('');
    expect(replaceTokens('no tokens here', values)).toBe('no tokens here');
  });

  it('formats numbers with en-US grouping', () => {
    expect(formatNumber(2340)).toBe('2,340');
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(7)).toBe('7');
    expect(formatNumber(2.5)).toBe('2.5');
  });

  it('can leave out tokens without data, with one neighbouring separator', () => {
    const some = { stops: 8, km: 3376 };
    const opts = { dropMissing: true };
    expect(
      replaceTokens(
        '{stops|CITY|CITIES}  /  {countries|COUNTRY|COUNTRIES}  /  {km} KM',
        some,
        opts,
      ),
    ).toBe('8 CITIES  /  3,376 KM');
    expect(replaceTokens('{countries|C|CS}  /  {km} KM', some, opts)).toBe('3,376 KM');
    expect(replaceTokens('{km} KM | {days|DAY|DAYS}', some, opts)).toBe('3,376 KM');
    // Only the token goes: text after a plain token stays (use the plural form for labels).
    expect(replaceTokens('{km} KM | {days} DAYS', some, opts)).toBe('3,376 KM DAYS');
    expect(replaceTokens('{year} TOUR', some, opts)).toBe(' TOUR');
    // Ordinary text around the token is never taken for the internal marker.
    expect(replaceTokens('E000 / 0 / {countries}', some, opts)).toBe('E000 / 0');
    // Unknown keys and malformed tokens still stay literal.
    expect(replaceTokens('{foo} / {stops', some, opts)).toBe('{foo} / {stops');
    expect(missingTokenKeys('{stops} {countries} {n} {countries} {foo}', some)).toEqual([
      'countries',
      'n',
    ]);
  });
});
