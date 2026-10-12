import { FIELD_BY_PATH, type ValidationIssue } from 'waycine';
import { copy } from '../copy/en';

/**
 * Validation issues as the app shows them: which ones are worth asking about,
 * which ones mean a restored project lost data, and a plain label for the
 * place an issue points at (`Stop 1: Latitude` instead of `stops[0].lat`).
 */

/** Codes that never block loading a file (unknown keys, empty tokens, repaired types). */
const HARMLESS_CODES: ReadonlySet<string> = new Set([
  'unknown-key',
  'token-no-data',
  'newer-version',
  'coerced',
]);

/** Issues worth asking about before loading a file (not unknown keys or empty tokens). */
export function blockingIssues(issues: readonly ValidationIssue[]): ValidationIssue[] {
  return issues.filter((i) => i.level === 'error' || !HARMLESS_CODES.has(i.code));
}

/**
 * Codes a project the app saved itself can carry without losing anything:
 * a new stop without a name, a project without visible stops.
 */
const EDITING_STATE_CODES: ReadonlySet<string> = new Set(['missing-city', 'no-stops']);

/** Issues of a restored autosave that mean a value was dropped or changed on the way back. */
export function restoreLossIssues(issues: readonly ValidationIssue[]): ValidationIssue[] {
  return blockingIssues(issues).filter((i) => !EDITING_STATE_CODES.has(i.code));
}

/** Catalog label of a catalog path, or null. */
function catalogLabel(path: string): string | null {
  return FIELD_BY_PATH.get(path)?.label ?? null;
}

const STOP = /^stops\[(\d+)\](?:\.(.+))?$/;
const RESULT = /^results\[(\d+)\](?:\.(.+))?$/;
const STAT = /^stats\.items\[(\d+)\](?:\.(.+))?$/;
const LAYOUT = /^layouts\.(landscape|portrait|square)\.(.+)$/;
const FONT = /^fonts\.(display|body)\.(.+)$/;

/**
 * A plain name for the place a validation issue points at, with 1-based
 * stop, result and stat numbers: `stops[0].lat` -> `Stop 1: Latitude`,
 * `layouts.portrait.title.size` -> `Title size (portrait layout)`.
 */
export function issueLabel(path: string): string {
  const names = copy.issues;
  if (path === '') return names.project;
  if (path === 'stops') return names.stops;
  const stop = STOP.exec(path);
  if (stop !== null) {
    const n = Number(stop[1]) + 1;
    const rest = stop[2];
    if (rest === undefined) return names.stop(n);
    const result = RESULT.exec(rest);
    if (result !== null) {
      const r = Number(result[1]) + 1;
      const key = result[2];
      const label = key === undefined ? null : catalogLabel(`stops[].results[].${key}`);
      return label === null ? names.result(n, r) : `${names.result(n, r)}: ${label}`;
    }
    return `${names.stop(n)}: ${catalogLabel(`stops[].${rest}`) ?? rest}`;
  }
  const stat = STAT.exec(path);
  if (stat !== null) {
    const n = Number(stat[1]) + 1;
    const key = stat[2];
    if (key === undefined) return names.stat(n);
    return `${names.stat(n)}: ${catalogLabel(`stats.items[].${key}`) ?? key}`;
  }
  const layout = LAYOUT.exec(path);
  if (layout !== null) {
    const label = catalogLabel(`layouts.*.${layout[2]}`);
    if (label !== null) return names.layout(label, layout[1] as string);
  }
  const font = FONT.exec(path);
  if (font !== null) {
    const label = catalogLabel(`fonts.*.${font[2]}`);
    if (label !== null) return `${copy.editor.fontRole[font[1] as 'display' | 'body']}: ${label}`;
  }
  return catalogLabel(path) ?? copy.sections[path] ?? path;
}

/** One issue as a line for people: `Stop length: Expected a number, got "fast"; using the default.` */
export function issueLine(issue: ValidationIssue): string {
  return `${issueLabel(issue.path)}: ${issue.message}`;
}
