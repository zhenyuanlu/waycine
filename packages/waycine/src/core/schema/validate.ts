import { daysInMonth } from '../dates.js';
import { computeStats, statTokenValues } from '../stats.js';
import { missingTokenKeys } from '../tokens.js';
import { createDefaultProject, DEFAULTS } from './defaults.js';
import { FIELD_BY_PATH } from './fields.js';
import { cloneJson, isPlainObject, type PlainObject } from './json.js';
import { migrateProject } from './migrate.js';
import { evenOutputSide, MAX_OUTPUT_SIDE, MIN_OUTPUT_SIDE } from './output.js';
import {
  MAX_LAT,
  MAX_STOPS,
  MEDALS,
  STAT_SOURCES,
  type StatItem,
  type Stop,
  type StopResult,
  type ValidationIssue,
  type ValidationResult,
  type WaycineProject,
} from './types.js';

/** Stop entries looked at before the rest are dropped unread (skipped entries count too). */
const MAX_SCANNED_STOPS = MAX_STOPS * 10;

/** Enum settings validation leaves open: any text is kept (theme ids are suggestions). */
const OPEN_ENUMS = new Set(['theme.id']);

/** Number lists whose length may differ from the default, with their length limits. */
const LISTS: ReadonlyMap<string, readonly [number, number]> = new Map([['pins.rings', [0, 4]]]);

/** Optional keys that are not in DEFAULTS but are part of the schema. */
const OPTIONAL_KEYS: ReadonlyMap<string, 'string' | 'outputSide'> = new Map<
  string,
  'string' | 'outputSide'
>([
  ['$schema', 'string'],
  ['output.width', 'outputSide'],
  ['output.height', 'outputSide'],
  ['fonts.*.localId', 'string'],
]);

/** Keys validated by dedicated code rather than the DEFAULTS shape. */
const SPECIAL = new Set(['version', 'stops', 'stats.items']);

const STOP_TEXT_KEYS = ['event', 'dateText', 'partner', 'region', 'regionCode', 'country'] as const;
const STOP_KEYS = new Set<string>([
  'id',
  'city',
  'lat',
  'lon',
  'date',
  'endDate',
  'results',
  'durationSec',
  'hidden',
  ...STOP_TEXT_KEYS,
]);
const RESULT_KEYS = new Set(['medal', 'text', 'count']);
const STAT_KEYS = new Set(['source', 'label', 'labelOne', 'value']);

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HEX3 = /^#[0-9a-fA-F]{3}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOOSE_DATE = /^(\d{4})[./](\d{1,2})[./](\d{1,2})$/;

/** What each stat token needs from the stops, for the `token-no-data` warning. */
const TOKEN_NEEDS: Readonly<Record<string, string>> = {
  regions: 'a region or region code',
  countries: 'a country or region code',
  months: 'a date',
  days: 'a date',
  year: 'a date',
};

/** Text templates checked for tokens without data. */
const TEMPLATES = ['title', 'subtitle', 'description', 'kicker'] as const;

/**
 * Warns about template tokens whose statistic has no data in the visible
 * stops (no country, no dates): the video leaves such a token out, with one
 * neighbouring separator.
 */
function checkTokenData(project: WaycineProject, report: Report): void {
  const visible = project.stops.filter((stop) => stop.hidden !== true);
  if (visible.length === 0) return;
  const values = statTokenValues(computeStats(visible));
  for (const field of TEMPLATES) {
    for (const key of missingTokenKeys(project.text[field], values)) {
      const need = TOKEN_NEEDS[key];
      if (need === undefined) continue;
      report.warn(
        `text.${field}`,
        'token-no-data',
        `{${key}} has no data: no visible stop has ${need}, so the video leaves the token out.`,
      );
    }
  }
}

/** Collects issues while walking the input. */
class Report {
  readonly issues: ValidationIssue[] = [];

  error(path: string, code: ValidationIssue['code'], message: string): void {
    this.issues.push({ level: 'error', path, code, message });
  }

  warn(path: string, code: ValidationIssue['code'], message: string): void {
    this.issues.push({ level: 'warning', path, code, message });
  }
}

function join(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

/** `layouts.portrait.x` -> `layouts.*.x`; `fonts.body.x` -> `fonts.*.x`. */
function patternOf(path: string): string {
  const parts = path.split('.');
  if ((parts[0] === 'layouts' || parts[0] === 'fonts') && parts.length > 1) {
    parts[1] = '*';
  }
  return parts.join('.');
}

function describe(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'a list';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}...` : value);
  }
  return typeof value === 'object' ? 'an object' : String(value);
}

/** Finite number, or a numeric string (reported as coerced). */
function toNumber(value: unknown, path: string, report: Report): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) {
      report.warn(path, 'coerced', `Read the text ${describe(value)} as the number ${n}.`);
      return n;
    }
  }
  return undefined;
}

function toBoolean(value: unknown, path: string, report: Report): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === 'false') {
    report.warn(path, 'coerced', `Read the text ${describe(value)} as a yes/no value.`);
    return value === 'true';
  }
  return undefined;
}

function toText(value: unknown, path: string, report: Report): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    report.warn(path, 'coerced', `Read the number ${value} as text.`);
    return String(value);
  }
  return undefined;
}

/** `#RGB` / `#RRGGBB` in any case -> `#RRGGBB` upper-case. */
function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  if (HEX6.test(value)) {
    return value.toUpperCase();
  }
  if (HEX3.test(value)) {
    const [r, g, b] = [value[1] ?? '0', value[2] ?? '0', value[3] ?? '0'];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return undefined;
}

/** ISO `YYYY-MM-DD` for a valid calendar date, accepting `YYYY.MM.DD` and `YYYY/M/D` (reported). */
function toIsoDate(value: unknown, path: string, report: Report): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const iso = ISO_DATE.exec(value);
  const loose = iso ? undefined : LOOSE_DATE.exec(value);
  const m = iso ?? loose;
  if (!m) {
    return undefined;
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return undefined;
  }
  const out = `${m[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (loose) {
    report.warn(path, 'coerced', `Read the date ${describe(value)} as ${out}.`);
  }
  return out;
}

/** Clamps with the FIELDS min/max of `pattern`, reporting changes. */
function clampByField(value: number, path: string, pattern: string, report: Report): number {
  const field = FIELD_BY_PATH.get(pattern);
  if (!field) {
    return value;
  }
  let out = value;
  if (field.min !== undefined && out < field.min) {
    out = field.min;
  }
  if (field.max !== undefined && out > field.max) {
    out = field.max;
  }
  if (out !== value) {
    report.warn(path, 'clamped', `${value} is out of range for "${field.label}"; using ${out}.`);
  }
  return out;
}

function mergeEnum(
  def: string | number,
  input: unknown,
  path: string,
  domain: readonly (string | number)[],
  report: Report,
): string | number {
  if (domain.includes(input as string | number)) {
    return input as string | number;
  }
  if (typeof def === 'number') {
    const n = toNumber(input, path, report);
    if (n !== undefined) {
      let nearest = def;
      for (const option of domain) {
        if (typeof option === 'number' && Math.abs(option - n) < Math.abs(nearest - n)) {
          nearest = option;
        }
      }
      if (Math.abs(nearest - n) >= 1e-3) {
        report.warn(path, 'invalid-enum', `${n} is not supported; using ${nearest}.`);
      }
      return nearest;
    }
  }
  report.warn(
    path,
    'invalid-enum',
    `${describe(input)} is not one of ${domain.join(', ')}; using ${String(def)}.`,
  );
  return def;
}

function mergeNumberList(
  def: readonly unknown[],
  input: unknown,
  path: string,
  pattern: string,
  report: Report,
): unknown[] {
  const limits = LISTS.get(pattern);
  if (!Array.isArray(input)) {
    report.warn(
      path,
      'wrong-type',
      `Expected a list of numbers, got ${describe(input)}; using the default.`,
    );
    return cloneJson([...def]);
  }
  const lengthOk = limits
    ? input.length >= limits[0] && input.length <= limits[1]
    : input.length === def.length;
  const values = input.map((item, i) => toNumber(item, `${path}[${i}]`, report));
  if (!lengthOk || values.some((v) => v === undefined)) {
    report.warn(
      path,
      'wrong-type',
      `Expected ${limits ? 'a list of' : String(def.length)} numbers, got ${describe(input)}; using the default.`,
    );
    return cloneJson([...def]);
  }
  return values;
}

/** Merges `input` onto the default `def`, following the DEFAULTS shape. */
function mergeValue(def: unknown, input: unknown, path: string, report: Report): unknown {
  if (input === undefined) {
    return cloneJson(def);
  }
  const pattern = patternOf(path);
  const field = FIELD_BY_PATH.get(pattern);
  const nullable = field?.nullable === true;

  if (nullable && input === null) {
    return null;
  }
  if (isPlainObject(def)) {
    if (!isPlainObject(input)) {
      report.warn(
        path,
        'wrong-type',
        `Expected an object, got ${describe(input)}; using the defaults.`,
      );
      return cloneJson(def);
    }
    return mergeObject(def, input, path, report);
  }
  if (Array.isArray(def)) {
    return mergeNumberList(def, input, path, pattern, report);
  }

  const domain = field?.kind === 'enum' && !OPEN_ENUMS.has(pattern) ? field.options : undefined;
  if (domain && (typeof def === 'string' || typeof def === 'number')) {
    return mergeEnum(def, input, path, domain, report);
  }
  if (typeof def === 'number' || (def === null && nullable)) {
    const n = toNumber(input, path, report);
    if (n === undefined) {
      report.warn(
        path,
        'wrong-type',
        `Expected a number, got ${describe(input)}; using the default.`,
      );
      return def;
    }
    return clampByField(n, path, pattern, report);
  }
  if (typeof def === 'boolean') {
    const b = toBoolean(input, path, report);
    if (b === undefined) {
      report.warn(
        path,
        'wrong-type',
        `Expected true or false, got ${describe(input)}; using the default.`,
      );
      return def;
    }
    return b;
  }
  if (typeof def === 'string') {
    if (path.startsWith('theme.') && path !== 'theme.id') {
      const color = normalizeColor(input);
      if (color === undefined) {
        report.warn(
          path,
          'invalid-color',
          `${describe(input)} is not a #RRGGBB colour; using ${def}.`,
        );
        return def;
      }
      return color;
    }
    const s = toText(input, path, report);
    if (s === undefined) {
      report.warn(path, 'wrong-type', `Expected text, got ${describe(input)}; using the default.`);
      return def;
    }
    return s;
  }
  return cloneJson(input);
}

function mergeObject(
  def: PlainObject,
  input: PlainObject,
  path: string,
  report: Report,
): PlainObject {
  const out: PlainObject = {};
  for (const [key, defValue] of Object.entries(def)) {
    const childPath = join(path, key);
    if (SPECIAL.has(childPath)) {
      continue;
    }
    out[key] = mergeValue(defValue, input[key], childPath, report);
  }
  for (const [key, value] of Object.entries(input)) {
    const childPath = join(path, key);
    if (key in def || SPECIAL.has(childPath)) {
      continue;
    }
    const optional = OPTIONAL_KEYS.get(patternOf(childPath));
    if (optional === 'string') {
      const s = toText(value, childPath, report);
      if (s === undefined) {
        report.warn(childPath, 'wrong-type', `Expected text, got ${describe(value)}; dropped.`);
      } else {
        out[key] = s;
      }
    } else if (optional === 'outputSide') {
      const n = toNumber(value, childPath, report);
      if (n === undefined) {
        report.warn(
          childPath,
          'wrong-type',
          `Expected a number of pixels, got ${describe(value)}; dropped.`,
        );
      } else {
        const side = evenOutputSide(n);
        if (side !== n) {
          report.warn(
            childPath,
            'clamped',
            `${n} px is not an even size between ${MIN_OUTPUT_SIDE} and ${MAX_OUTPUT_SIDE}; using ${side}.`,
          );
        }
        out[key] = side;
      }
    } else {
      report.warn(
        childPath,
        'unknown-key',
        `Unknown setting "${childPath}" was kept but is not used.`,
      );
      out[key] = cloneJson(value);
    }
  }
  return out;
}

function validateResults(raw: unknown, path: string, report: Report): StopResult[] | undefined {
  if (!Array.isArray(raw)) {
    report.warn(path, 'wrong-type', `Expected a list of results, got ${describe(raw)}; dropped.`);
    return undefined;
  }
  const out: StopResult[] = [];
  raw.forEach((item, j) => {
    const p = `${path}[${j}]`;
    if (!isPlainObject(item)) {
      report.warn(p, 'wrong-type', `Expected a result object, got ${describe(item)}; dropped.`);
      return;
    }
    let medal: StopResult['medal'] = 'none';
    if (item.medal === 'qual') {
      report.warn(`${p}.medal`, 'coerced', 'Read the medal "qual" as "ring".');
      medal = 'ring';
    } else if ((MEDALS as readonly unknown[]).includes(item.medal)) {
      medal = item.medal as StopResult['medal'];
    } else if (item.medal !== undefined) {
      report.warn(
        `${p}.medal`,
        'invalid-enum',
        `${describe(item.medal)} is not one of ${MEDALS.join(', ')}; using none.`,
      );
    }
    const text = item.text === undefined ? '' : toText(item.text, `${p}.text`, report);
    if (text === undefined) {
      report.warn(
        `${p}.text`,
        'wrong-type',
        `Expected text, got ${describe(item.text)}; using an empty line.`,
      );
    }
    const result: StopResult & PlainObject = { medal, text: text ?? '' };
    if (item.count !== undefined) {
      const n = toNumber(item.count, `${p}.count`, report);
      if (n === undefined) {
        report.warn(
          `${p}.count`,
          'wrong-type',
          `Expected a count from 1 to 5, got ${describe(item.count)}; using 1.`,
        );
        result.count = 1;
      } else {
        const count = Math.min(5, Math.max(1, Math.round(n)));
        if (count !== n) {
          report.warn(
            `${p}.count`,
            'clamped',
            `Medal count ${n} must be a whole number from 1 to 5; using ${count}.`,
          );
        }
        result.count = count;
      }
    }
    for (const [key, value] of Object.entries(item)) {
      if (!RESULT_KEYS.has(key)) {
        report.warn(
          `${p}.${key}`,
          'unknown-key',
          `Unknown result field "${key}" was kept but is not used.`,
        );
        result[key] = cloneJson(value);
      }
    }
    out.push(result);
  });
  return out;
}

function validateStop(
  item: PlainObject,
  i: number,
  ids: Set<string>,
  report: Report,
): Stop | undefined {
  const p = `stops[${i}]`;
  const lat = toNumber(item.lat, `${p}.lat`, report);
  const lon = toNumber(item.lon, `${p}.lon`, report);
  if (lat === undefined || lon === undefined) {
    report.error(
      p,
      'invalid-stop',
      `Stop ${i + 1} has no valid latitude and longitude; it was skipped.`,
    );
    return undefined;
  }
  const clampedLat = Math.min(MAX_LAT, Math.max(-MAX_LAT, lat));
  if (clampedLat !== lat) {
    report.warn(
      `${p}.lat`,
      'clamped',
      `Latitude ${lat} is outside +-${MAX_LAT}; using ${clampedLat}.`,
    );
  }
  // Leave in-range values untouched: the modulo arithmetic below is not exact.
  let wrappedLon = lon;
  if (lon <= -180 || lon > 180) {
    wrappedLon = ((((lon + 180) % 360) + 360) % 360) - 180;
    if (wrappedLon === -180) {
      wrappedLon = 180;
    }
  }
  if (wrappedLon !== lon) {
    report.warn(`${p}.lon`, 'clamped', `Longitude ${lon} was wrapped to ${wrappedLon}.`);
  }

  let id = toText(item.id, `${p}.id`, report) ?? '';
  if (id === '') {
    id = `stop-${i + 1}`;
  }
  if (ids.has(id)) {
    let k = 2;
    while (ids.has(`${id}-${k}`)) {
      k++;
    }
    report.warn(
      `${p}.id`,
      'duplicate-id',
      `Stop id "${id}" is used twice; renamed to "${id}-${k}".`,
    );
    id = `${id}-${k}`;
  }
  ids.add(id);

  let city = item.city === undefined ? undefined : toText(item.city, `${p}.city`, report);
  if (city === undefined || city === '') {
    report.warn(`${p}.city`, 'missing-city', `Stop ${i + 1} has no name.`);
    city = '';
  }

  const stop: Stop & PlainObject = { id, city, lat: clampedLat, lon: wrappedLon };
  for (const key of STOP_TEXT_KEYS) {
    if (item[key] === undefined) {
      continue;
    }
    const s = toText(item[key], `${p}.${key}`, report);
    if (s === undefined) {
      report.warn(
        `${p}.${key}`,
        'wrong-type',
        `Expected text, got ${describe(item[key])}; dropped.`,
      );
    } else {
      stop[key] = s;
    }
  }
  for (const key of ['date', 'endDate'] as const) {
    if (item[key] === undefined) {
      continue;
    }
    const d = toIsoDate(item[key], `${p}.${key}`, report);
    if (d === undefined) {
      report.warn(
        `${p}.${key}`,
        'invalid-date',
        `${describe(item[key])} is not a date (YYYY-MM-DD); dropped.`,
      );
    } else {
      stop[key] = d;
    }
  }
  if (item.results !== undefined) {
    const results = validateResults(item.results, `${p}.results`, report);
    if (results) {
      stop.results = results;
    }
  }
  if (item.durationSec !== undefined) {
    const n = toNumber(item.durationSec, `${p}.durationSec`, report);
    if (n === undefined) {
      report.warn(
        `${p}.durationSec`,
        'wrong-type',
        `Expected seconds, got ${describe(item.durationSec)}; dropped.`,
      );
    } else {
      stop.durationSec = clampByField(n, `${p}.durationSec`, 'stops[].durationSec', report);
    }
  }
  if (item.hidden !== undefined) {
    const b = toBoolean(item.hidden, `${p}.hidden`, report);
    if (b === undefined) {
      report.warn(
        `${p}.hidden`,
        'wrong-type',
        `Expected true or false, got ${describe(item.hidden)}; dropped.`,
      );
    } else {
      stop.hidden = b;
    }
  }
  for (const [key, value] of Object.entries(item)) {
    if (!STOP_KEYS.has(key)) {
      report.warn(
        `${p}.${key}`,
        'unknown-key',
        `Unknown stop field "${key}" was kept but is not used.`,
      );
      stop[key] = cloneJson(value);
    }
  }
  return stop;
}

function validateStops(raw: unknown, report: Report): Stop[] {
  if (!Array.isArray(raw)) {
    report.error('stops', 'no-stops', 'A project needs at least one stop.');
    return [];
  }
  const ids = new Set<string>();
  const out: Stop[] = [];
  // Stop once MAX_STOPS stops are kept, and scan at most MAX_SCANNED_STOPS
  // entries: a short share link can hold tens of thousands of stops, and
  // renaming duplicate ids is linear per stop.
  const scanEnd = Math.min(raw.length, MAX_SCANNED_STOPS);
  let i = 0;
  for (; i < scanEnd && out.length < MAX_STOPS; i++) {
    const item: unknown = raw[i];
    if (!isPlainObject(item)) {
      report.error(
        `stops[${i}]`,
        'invalid-stop',
        `Stop ${i + 1} is ${describe(item)}, not a stop; it was skipped.`,
      );
      continue;
    }
    const stop = validateStop(item, i, ids, report);
    if (stop) {
      out.push(stop);
    }
  }
  if (i < raw.length) {
    report.warn(
      'stops',
      'too-many-stops',
      `Only the first ${MAX_STOPS} of ${raw.length} stops are kept.`,
    );
  }
  if (!out.some((stop) => stop.hidden !== true)) {
    report.error('stops', 'no-stops', 'A project needs at least one visible stop.');
  }
  return out;
}

function validateStatItems(raw: unknown, report: Report): StatItem[] {
  const path = 'stats.items';
  if (raw === undefined) {
    return cloneJson(DEFAULTS.stats.items);
  }
  if (!Array.isArray(raw)) {
    report.warn(
      path,
      'wrong-type',
      `Expected a list of stats, got ${describe(raw)}; using the defaults.`,
    );
    return cloneJson(DEFAULTS.stats.items);
  }
  const out: StatItem[] = [];
  raw.forEach((item, j) => {
    const p = `${path}[${j}]`;
    if (!isPlainObject(item) || !(STAT_SOURCES as readonly unknown[]).includes(item.source)) {
      report.warn(
        p,
        'invalid-stat',
        `Stat ${j + 1} needs a source (${STAT_SOURCES.join(', ')}); dropped.`,
      );
      return;
    }
    const stat: StatItem & PlainObject = {
      source: item.source as StatItem['source'],
      label: '',
    };
    if (item.label !== undefined) {
      const label = toText(item.label, `${p}.label`, report);
      if (label === undefined) {
        report.warn(
          `${p}.label`,
          'wrong-type',
          `Expected text, got ${describe(item.label)}; using an empty label.`,
        );
      } else {
        stat.label = label;
      }
    }
    for (const key of ['labelOne', 'value'] as const) {
      if (item[key] !== undefined) {
        const s = toText(item[key], `${p}.${key}`, report);
        if (s === undefined) {
          report.warn(
            `${p}.${key}`,
            'wrong-type',
            `Expected text, got ${describe(item[key])}; dropped.`,
          );
        } else {
          stat[key] = s;
        }
      }
    }
    if (stat.source === 'custom' && stat.value === undefined) {
      report.warn(p, 'invalid-stat', `Stat ${j + 1} is custom but has no value.`);
    }
    for (const [key, value] of Object.entries(item)) {
      if (!STAT_KEYS.has(key)) {
        report.warn(
          `${p}.${key}`,
          'unknown-key',
          `Unknown stat field "${key}" was kept but is not used.`,
        );
        stat[key] = cloneJson(value);
      }
    }
    out.push(stat);
  });
  return out;
}

/**
 * Validates and repairs a parsed project file. Never throws.
 *
 * Deep-merges the input onto `DEFAULTS`, coerces and clamps values, keeps
 * unknown keys (with a warning) so a newer file survives load-and-save, and
 * reports everything in `issues`. `error` issues mean the project cannot be
 * rendered as is (for example no usable stop); the returned project is still
 * complete and type-correct.
 */
export function validateProject(input: unknown): ValidationResult {
  const report = new Report();
  try {
    if (!isPlainObject(input)) {
      report.error('', 'not-object', `A project must be a JSON object, not ${describe(input)}.`);
      report.error('stops', 'no-stops', 'A project needs at least one stop.');
      return { project: createDefaultProject(), issues: report.issues };
    }
    const migrated = migrateProject(input);
    report.issues.push(...migrated.issues);
    const data = migrated.data;

    const project = mergeObject(DEFAULTS as unknown as PlainObject, data, '', report);
    project.version = DEFAULTS.version;
    project.stops = validateStops(data.stops, report);
    const stats = project.stats as PlainObject;
    stats.items = validateStatItems(
      isPlainObject(data.stats) ? data.stats.items : undefined,
      report,
    );

    const output = project.output as PlainObject;
    if (output.aspect === 'custom' && (output.width === undefined || output.height === undefined)) {
      report.warn(
        'output',
        'wrong-type',
        'A custom format needs a width and a height; using 1920x1080.',
      );
      output.width ??= 1920;
      output.height ??= 1080;
    }
    checkTokenData(project as unknown as WaycineProject, report);
    return { project: project as unknown as WaycineProject, issues: report.issues };
  } catch (error) {
    report.error('', 'not-object', `The project could not be read: ${String(error)}.`);
    return { project: createDefaultProject(), issues: report.issues };
  }
}
