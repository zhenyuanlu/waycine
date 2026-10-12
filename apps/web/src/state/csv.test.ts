import { describe, expect, it } from 'vitest';
import { limitRows, MAX_LOOKUPS, parseImportDate, parseStopList, splitRecords } from './csv';

describe('splitRecords', () => {
  it('handles quotes, escaped quotes, embedded delimiters and newlines, and CRLF', () => {
    const text = 'a,"b, c","say ""hi"""\r\n"multi\nline",x,\r\n\r\nlast,1,2';
    expect(splitRecords(text, ',')).toEqual([
      { line: 1, fields: ['a', 'b, c', 'say "hi"'] },
      { line: 2, fields: ['multi\nline', 'x', ''] },
      { line: 5, fields: ['last', '1', '2'] },
    ]);
  });
});

describe('parseStopList', () => {
  it('reads the default column order without a header', () => {
    const { rows, header, delimiter } = parseStopList(
      'Boston,42.369,-71.121,2026-06-13,Harbor race,Crew A,MA\nProvidence,41.824,-71.4128',
    );
    expect(header).toBe(false);
    expect(delimiter).toBe(',');
    expect(rows).toEqual([
      {
        line: 1,
        city: 'Boston',
        lat: 42.369,
        lon: -71.121,
        date: '2026-06-13',
        event: 'Harbor race',
        partner: 'Crew A',
        region: 'MA',
        problems: [],
        lookup: false,
      },
      { line: 2, city: 'Providence', lat: 41.824, lon: -71.4128, problems: [], lookup: false },
    ]);
  });

  it('follows a header that renames and reorders columns (TSV)', () => {
    const { rows, header, delimiter } = parseStopList(
      'Date\tName\tLatitude\tLng\tState\n2026.07.04\tProvidence\t41.824\t-71.4128\tRI\n',
    );
    expect(header).toBe(true);
    expect(delimiter).toBe('\t');
    expect(rows[0]).toMatchObject({
      line: 2,
      city: 'Providence',
      lat: 41.824,
      lon: -71.4128,
      date: '2026-07-04',
      region: 'RI',
      problems: [],
    });
  });

  it('marks rows without coordinates for lookup, and reports bad rows', () => {
    const { rows } = parseStopList(
      [
        'city;lat;lon;date',
        'Worcester;;;2026-07-11',
        ';42;-71;',
        'Nowhere;95;10;',
        'Half;42;;',
        'Bad date;42;-71;2026-02-30',
        'Text;abc;-71;',
      ].join('\n'),
    );
    expect(rows.map((r) => [r.city, r.lookup, r.problems])).toEqual([
      ['Worcester', true, []],
      ['', false, ['no-city']],
      ['Nowhere', false, ['bad-lat']],
      ['Half', false, ['half-coords']],
      ['Bad date', false, ['bad-date']],
      ['Text', false, ['bad-lat']],
    ]);
  });

  it('looks up at most 50 rows', () => {
    const text = Array.from({ length: MAX_LOOKUPS + 3 }, (_, i) => `Town ${i}`).join('\n');
    const { rows } = parseStopList(text);
    expect(rows.filter((r) => r.lookup)).toHaveLength(MAX_LOOKUPS + 3);
    expect(rows.filter((r) => r.problems.includes('too-many-lookups'))).toHaveLength(3);
  });

  it('marks usable rows past the 99-stop room as over the limit', () => {
    const text = Array.from({ length: 5 }, (_, i) => `Town ${i},1,${i}`).join('\n');
    const rows = limitRows(parseStopList(`Nowhere,95,1\n${text}`).rows, 3);
    expect(rows.map((r) => r.problems)).toEqual([
      ['bad-lat'],
      [],
      [],
      [],
      ['over-limit'],
      ['over-limit'],
    ]);
    expect(limitRows(rows, 0).filter((r) => r.problems.length === 0)).toHaveLength(0);
  });

  it('keeps text as typed and ignores a byte order mark', () => {
    const { rows } = parseStopList(
      `${String.fromCharCode(0xfeff)}city,lat,lon,date,event\nBoston,42,-71,,"500M  6TH"`,
    );
    expect(rows[0]?.event).toBe('500M  6TH');
    expect(rows[0]?.city).toBe('Boston');
  });
});

describe('parseImportDate', () => {
  it('accepts ISO, dotted and slashed dates and checks the calendar', () => {
    expect(parseImportDate('2026-06-13')).toBe('2026-06-13');
    expect(parseImportDate('2026.6.3')).toBe('2026-06-03');
    expect(parseImportDate('2024/02/29')).toBe('2024-02-29');
    expect(parseImportDate('2026/02/29')).toBeNull();
    expect(parseImportDate('13/06/2026')).toBeNull();
  });
});
