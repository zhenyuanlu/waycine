/**
 * "Import list...": pasted or uploaded CSV / TSV with the columns
 * `city, lat, lon, date, event, partner, region` (a header row may name and
 * reorder them; without one that order is assumed). Rows without
 * coordinates are looked up by city later, at most `MAX_LOOKUPS` of them.
 */
import { MAX_LAT } from 'waycine';

/** Rows without coordinates that one import may look up. */
export const MAX_LOOKUPS = 50;

/** Columns in their default order. */
export const IMPORT_COLUMNS = ['city', 'lat', 'lon', 'date', 'event', 'partner', 'region'] as const;
/** An import column. */
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Header names accepted for each column (lower case). */
const ALIASES: Readonly<Record<ImportColumn, readonly string[]>> = {
  city: ['city', 'name', 'place', 'location', 'stop', 'town'],
  lat: ['lat', 'latitude'],
  lon: ['lon', 'lng', 'long', 'longitude'],
  date: ['date', 'start', 'start date', 'day'],
  event: ['event', 'title', 'description', 'what'],
  partner: ['partner', 'extra', 'extra line', 'credit', 'team'],
  region: ['region', 'state', 'province'],
};

/** Why a row cannot be imported as is. */
export type ImportProblem =
  | 'no-city'
  | 'bad-lat'
  | 'bad-lon'
  | 'half-coords'
  | 'bad-date'
  | 'too-many-lookups'
  | 'over-limit';

/** One data row. */
export interface ImportRow {
  /** 1-based line number in the text. */
  line: number;
  city: string;
  lat?: number;
  lon?: number;
  /** ISO date. */
  date?: string;
  event?: string;
  partner?: string;
  region?: string;
  /** Problems; a row with any is skipped. */
  problems: ImportProblem[];
  /** No coordinates: the city will be looked up. */
  lookup: boolean;
}

/** Result of `parseStopList`. */
export interface ImportParse {
  rows: ImportRow[];
  delimiter: ',' | '\t' | ';';
  header: boolean;
}

/** Splits CSV text into records of fields (RFC 4180 quotes, any line ending). */
export function splitRecords(
  text: string,
  delimiter: string,
): { line: number; fields: string[] }[] {
  const records: { line: number; fields: string[] }[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  const endField = (): void => {
    fields.push(field);
    field = '';
  };
  const endRecord = (): void => {
    endField();
    if (fields.some((f) => f.trim() !== '')) records.push({ line: recordLine, fields });
    fields = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === '') {
      field = '';
      quoted = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += ch;
    }
  }
  if (field !== '' || fields.length > 0) endRecord();
  return records;
}

function detectDelimiter(text: string): ImportParse['delimiter'] {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  if (first.includes('\t')) return '\t';
  const commas = (first.match(/,/g) ?? []).length;
  const semicolons = (first.match(/;/g) ?? []).length;
  return semicolons > commas ? ';' : ',';
}

function columnOf(name: string): ImportColumn | null {
  const key = name.trim().toLowerCase().replace(/[_-]+/g, ' ');
  for (const column of IMPORT_COLUMNS) {
    if (ALIASES[column].includes(key)) return column;
  }
  return null;
}

const ISO = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/;

/** ISO `YYYY-MM-DD` of a date written as `2026-06-13`, `2026.06.13` or `2026/6/13`; null otherwise. */
export function parseImportDate(text: string): string | null {
  const m = ISO.exec(text.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (mo < 1 || mo > 12 || d < 1 || d > days) return null;
  return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseNumber(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Parses a pasted or uploaded stop list. Never throws. */
export function parseStopList(text: string): ImportParse {
  const delimiter = detectDelimiter(text);
  const records = splitRecords(text.replace(/^\uFEFF/, ''), delimiter);
  const first = records[0];
  const named = first?.fields.map(columnOf) ?? [];
  const header = named.filter((c) => c !== null).length >= 2 || named[0] === 'city';
  const columns: (ImportColumn | null)[] = header ? named : [...IMPORT_COLUMNS];
  const data = header ? records.slice(1) : records;
  let lookups = 0;

  const rows = data.map(({ line, fields }): ImportRow => {
    const cell = (column: ImportColumn): string => {
      const i = columns.indexOf(column);
      return i < 0 ? '' : (fields[i] ?? '').trim();
    };
    const row: ImportRow = { line, city: cell('city'), problems: [], lookup: false };
    const lat = parseNumber(cell('lat'));
    const lon = parseNumber(cell('lon'));
    if (lat !== null && (Number.isNaN(lat) || Math.abs(lat) > MAX_LAT))
      row.problems.push('bad-lat');
    if (lon !== null && (Number.isNaN(lon) || Math.abs(lon) > 180)) row.problems.push('bad-lon');
    if ((lat === null) !== (lon === null)) row.problems.push('half-coords');
    if (lat !== null && lon !== null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
      row.lat = lat;
      row.lon = lon;
    }
    const dateText = cell('date');
    if (dateText !== '') {
      const iso = parseImportDate(dateText);
      if (iso === null) row.problems.push('bad-date');
      else row.date = iso;
    }
    for (const key of ['event', 'partner', 'region'] as const) {
      const value = cell(key);
      if (value !== '') row[key] = value;
    }
    if (row.city === '') row.problems.push('no-city');
    if (lat === null && lon === null && row.city !== '') {
      row.lookup = true;
      lookups++;
      if (lookups > MAX_LOOKUPS) row.problems.push('too-many-lookups');
    }
    return row;
  });
  return { rows, delimiter, header };
}

/**
 * Marks the usable rows beyond `room` (the stops that still fit in the
 * project) as `over-limit`, so the import never takes a project past 99
 * stops. Rows with other problems stay as they are.
 */
export function limitRows(rows: readonly ImportRow[], room: number): ImportRow[] {
  let taken = 0;
  return rows.map((row) => {
    if (row.problems.length > 0) return row;
    if (taken < room) {
      taken += 1;
      return row;
    }
    return { ...row, problems: [...row.problems, 'over-limit'] };
  });
}
