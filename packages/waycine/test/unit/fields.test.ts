import { describe, expect, it } from 'vitest';
import {
  DEFAULTS,
  FIELD_BY_PATH,
  FIELDS,
  type FieldDef,
  PROFILE_IDS,
  SECTIONS,
  validateProject,
} from '../../src/core/index.js';
import { LIVENESS_FIXTURES as LIVENESS_FIXTURE_MAKERS } from '../helpers/liveness-fixtures.js';
import { FIXTURE_PROJECTS, readFixtureProject } from '../helpers/projects.js';

/**
 * FIELDS coverage: every leaf of DEFAULTS has exactly one catalog entry and
 * every entry names a real setting. Arrays are leaves (`pins.rings`), except
 * the two lists of records, which have per-item entries: `stops[].` (DEFAULTS
 * has no stops) and `stats.items[].`.
 */

/** Leaves of DEFAULTS that are not settings. */
const NOT_SETTINGS = new Set(['version']);
/** Lists of records, covered by `<list>[].` entries. */
const RECORD_LISTS = new Set(['stops', 'stats.items']);

/** Every key of a stop, result and stat record (the `Stop`, `StopResult` and `StatItem` interfaces). */
const STOP_KEYS = [
  'id',
  'city',
  'lat',
  'lon',
  'event',
  'date',
  'endDate',
  'dateText',
  'partner',
  'region',
  'regionCode',
  'country',
  'durationSec',
  'hidden',
] as const;
const RESULT_KEYS = ['medal', 'text', 'count'] as const;
const STAT_KEYS = ['source', 'label', 'labelOne', 'value'] as const;
/** Optional settings outside DEFAULTS that still have an entry (custom output size). */
const OPTIONAL_PATHS = new Set(['output.width', 'output.height']);

/** Names of the liveness fixtures (the values `liveWhen` may take). */
const LIVENESS_FIXTURES = new Set(Object.keys(LIVENESS_FIXTURE_MAKERS));

/** `layouts.portrait.x` -> `layouts.*.x`, `fonts.body.x` -> `fonts.*.x`. */
function pattern(path: string): string {
  const parts = path.split('.');
  if ((parts[0] === 'layouts' || parts[0] === 'fonts') && parts.length > 1) parts[1] = '*';
  return parts.join('.');
}

/** Dotted paths of the leaves of `value` (arrays are leaves). */
function leaves(value: unknown, prefix = ''): string[] {
  if (RECORD_LISTS.has(prefix)) return [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

/** The value at a concrete dotted path. */
function valueAt(root: unknown, path: string): unknown {
  let node = root;
  for (const key of path.split('.')) {
    node = (node as Record<string, unknown> | undefined)?.[key];
  }
  return node;
}

/** Concrete DEFAULTS paths of a non-record field (one per profile or role). */
function concretePaths(field: FieldDef): string[] {
  if (field.path.startsWith('layouts.*.')) {
    return PROFILE_IDS.map((p) => field.path.replace('layouts.*.', `layouts.${p}.`));
  }
  if (field.path.startsWith('fonts.*.')) {
    return ['display', 'body'].map((r) => field.path.replace('fonts.*.', `fonts.${r}.`));
  }
  return [field.path];
}

function isRecordField(field: FieldDef): boolean {
  return field.path.startsWith('stops[].') || field.path.startsWith('stats.items[].');
}

describe('FIELDS coverage', () => {
  const defaultPatterns = new Set(
    leaves(DEFAULTS)
      .filter((p) => !NOT_SETTINGS.has(p))
      .map(pattern),
  );

  it('has one entry per path', () => {
    const paths = FIELDS.map((f) => f.path);
    expect(paths.filter((p, i) => paths.indexOf(p) !== i)).toEqual([]);
    expect(FIELD_BY_PATH.size).toBe(FIELDS.length);
  });

  it('covers every DEFAULTS leaf', () => {
    const missing = [...defaultPatterns].filter((p) => !FIELD_BY_PATH.has(p));
    expect(missing).toEqual([]);
  });

  it('names only real settings', () => {
    const stray: string[] = [];
    for (const field of FIELDS) {
      const { path } = field;
      if (path.startsWith('stops[].results[].')) {
        if (!(RESULT_KEYS as readonly string[]).includes(path.slice(18))) stray.push(path);
      } else if (path.startsWith('stops[].')) {
        if (!(STOP_KEYS as readonly string[]).includes(path.slice(8))) stray.push(path);
      } else if (path.startsWith('stats.items[].')) {
        if (!(STAT_KEYS as readonly string[]).includes(path.slice(14))) stray.push(path);
      } else if (!defaultPatterns.has(path) && !OPTIONAL_PATHS.has(path)) {
        stray.push(path);
      }
    }
    expect(stray).toEqual([]);
  });

  it('covers every stop, result and stat key', () => {
    for (const key of STOP_KEYS) expect(FIELD_BY_PATH.has(`stops[].${key}`), key).toBe(true);
    for (const key of RESULT_KEYS) {
      expect(FIELD_BY_PATH.has(`stops[].results[].${key}`), key).toBe(true);
    }
    for (const key of STAT_KEYS) expect(FIELD_BY_PATH.has(`stats.items[].${key}`), key).toBe(true);
  });
});

describe('FIELDS entries', () => {
  const sectionIds = new Set(SECTIONS.map((s) => s.id));

  it('are well formed', () => {
    for (const field of FIELDS) {
      const where = field.path;
      expect(sectionIds.has(field.section), where).toBe(true);
      expect(field.label.trim(), where).not.toBe('');
      expect(field.help.trim().endsWith('.'), where).toBe(true);
      expect(field.perProfile === true, where).toBe(field.path.startsWith('layouts.*.'));
      if (field.kind === 'number' || field.kind === 'tuple') {
        expect(field.min, where).toBeTypeOf('number');
        expect(field.max, where).toBeTypeOf('number');
        expect(field.step, where).toBeGreaterThan(0);
        expect((field.min ?? 0) < (field.max ?? 0), where).toBe(true);
      }
      if (field.kind === 'tuple') expect(field.length, where).toBeGreaterThan(0);
      if (field.kind === 'enum') expect(field.options?.length, where).toBeGreaterThan(1);
      if (field.liveWhen !== undefined) {
        expect(LIVENESS_FIXTURES.has(field.liveWhen), where).toBe(true);
        expect(field.live, where).not.toBe(false);
      }
    }
  });

  it('put basic entries only in the basic sections', () => {
    const basic = new Set(SECTIONS.filter((s) => s.level === 'basic').map((s) => s.id));
    for (const field of FIELDS.filter((f) => f.level === 'basic')) {
      expect(basic.has(field.section), field.path).toBe(true);
    }
  });

  it('agree with every default: kind, range, options and length', () => {
    for (const field of FIELDS) {
      if (isRecordField(field) || OPTIONAL_PATHS.has(field.path)) continue;
      for (const path of concretePaths(field)) {
        const value = valueAt(DEFAULTS, path);
        const where = `${path} = ${JSON.stringify(value)}`;
        switch (field.kind) {
          case 'number':
            if (value === null) {
              expect(field.nullable, where).toBe(true);
              break;
            }
            expect(value, where).toBeTypeOf('number');
            expect(value as number, where).toBeGreaterThanOrEqual(field.min ?? -Infinity);
            expect(value as number, where).toBeLessThanOrEqual(field.max ?? Infinity);
            break;
          case 'tuple':
            expect(Array.isArray(value), where).toBe(true);
            expect((value as number[]).length, where).toBe(field.length);
            for (const v of value as number[]) {
              expect(v, where).toBeGreaterThanOrEqual(field.min ?? -Infinity);
              expect(v, where).toBeLessThanOrEqual(field.max ?? Infinity);
            }
            break;
          case 'enum':
            expect(field.options, where).toContain(value);
            break;
          case 'bool':
            expect(value, where).toBeTypeOf('boolean');
            break;
          case 'color':
            expect(value, where).toMatch(/^#[0-9A-F]{6}$/);
            break;
          case 'text':
          case 'date':
            expect(value, where).toBeTypeOf('string');
            break;
        }
      }
    }
  });

  it('keep the test projects free of clamps', () => {
    for (const name of FIXTURE_PROJECTS) {
      const { issues } = validateProject(readFixtureProject(name));
      expect(
        issues.filter((i) => i.code === 'clamped'),
        name,
      ).toEqual([]);
    }
  });
});
