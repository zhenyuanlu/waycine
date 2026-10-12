import { computeStats, statTokenValues, type WaycineProject } from 'waycine';
import { copy } from '../copy/en';

/**
 * The text-template model behind the chip field: splitting a template into
 * text and tokens, reading and writing one token, naming tokens in words and
 * the tokens an INSERT row offers. No DOM and no editor imports, so the
 * controls, the summaries and the tests can all use it.
 */

/** `{key}`, `{key:0W}` or `{key|ONE|MANY}` (the engine's token syntax). */
const TOKEN = /\{([A-Za-z]+)(?::0(\d{1,2})|\|([^{}|]*)\|([^{}|]*))?\}/g;
const KEYS = new Set([
  'n',
  'total',
  'stops',
  'regions',
  'countries',
  'months',
  'days',
  'km',
  'mi',
  'year',
]);
export const COUNT_KEYS = ['stops', 'regions', 'countries', 'months', 'days', 'km', 'mi'] as const;

type Segment = { kind: 'text'; text: string } | { kind: 'token'; raw: string; key: string };

/** Splits a template into text and (known) tokens. */
export function splitTemplate(template: string): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const m of template.matchAll(TOKEN)) {
    const key = m[1] ?? '';
    if (!KEYS.has(key)) continue;
    if (m.index > at) out.push({ kind: 'text', text: template.slice(at, m.index) });
    out.push({ kind: 'token', raw: m[0], key });
    at = m.index + m[0].length;
  }
  if (at < template.length) out.push({ kind: 'text', text: template.slice(at) });
  return out;
}

export interface TokenParts {
  key: string;
  width?: number;
  one?: string;
  many?: string;
}

export function parseToken(raw: string): TokenParts | null {
  const m = new RegExp(TOKEN.source).exec(raw);
  if (!m || m[0] !== raw) return null;
  const parts: TokenParts = { key: m[1] ?? '' };
  if (m[2] !== undefined) parts.width = Number(m[2]);
  if (m[3] !== undefined) parts.one = m[3];
  if (m[4] !== undefined) parts.many = m[4];
  return parts;
}

export function buildToken(p: TokenParts): string {
  if (p.one !== undefined && p.many !== undefined) return `{${p.key}|${p.one}|${p.many}}`;
  if (p.width !== undefined && p.width > 1) return `{${p.key}:0${p.width}}`;
  return `{${p.key}}`;
}

/** Count chips (Count / One / Many) and number chips (Digits) have an editor; plain values do not. */
export function editableToken(p: TokenParts): boolean {
  return p.many !== undefined || p.key === 'n' || p.key === 'total';
}

/** A template as words, its tokens named like their chips: `RACE [number] / [total]`. */
export function templateWords(template: string): string {
  return splitTemplate(template)
    .map((seg) => {
      if (seg.kind === 'text') return seg.text;
      const parts = parseToken(seg.raw);
      const name = copy.text.chipLabel[seg.key] ?? seg.key;
      return parts?.many === undefined ? `[${name}]` : `[${name} ${parts.many}]`;
    })
    .join('');
}

/** One INSERT choice: the token it inserts and the chip key that names it. */
interface InsertToken {
  token: string;
  key: string;
}

/**
 * "STATE" for a journey through the United States (the season), "REGION"
 * elsewhere: the noun a regions count inserts with.
 */
function regionNoun(p: WaycineProject): { one: string; many: string } {
  const placed = p.stops.filter((s) => s.hidden !== true);
  const us = placed.filter((s) => {
    const country = (s.country ?? '').trim().toUpperCase();
    const code = (s.regionCode ?? '').trim().toUpperCase();
    return country === 'US' || country === 'USA' || code.startsWith('US-');
  }).length;
  return placed.length > 0 && us * 2 >= placed.length
    ? { one: 'STATE', many: 'STATES' }
    : { one: 'REGION', many: 'REGIONS' };
}

/**
 * The tokens an INSERT row offers, in order: every count inserts with its
 * noun ("7 STOPS", "1,190 KM"); the stop label leads with the stop's number
 * and the stop count. The first four show as chips, the rest under "More…".
 */
export function insertTokens(p: WaycineProject, stopLabel: boolean): InsertToken[] {
  const region = regionNoun(p);
  const counts: InsertToken[] = [
    { token: '{stops|STOP|STOPS}', key: 'stops' },
    { token: `{regions|${region.one}|${region.many}}`, key: 'regions' },
    { token: '{months|MONTH|MONTHS}', key: 'months' },
    { token: '{km|KM|KM}', key: 'km' },
    { token: '{countries|COUNTRY|COUNTRIES}', key: 'countries' },
    { token: '{days|DAY|DAYS}', key: 'days' },
    { token: '{mi|MILE|MILES}', key: 'mi' },
    { token: '{year}', key: 'year' },
  ];
  if (!stopLabel) return counts;
  const [stops, regions, ...rest] = counts;
  return [
    { token: '{n:02}', key: 'n' },
    { token: '{total:02}', key: 'total' },
    ...(stops === undefined ? [] : [stops]),
    ...(regions === undefined ? [] : [regions]),
    ...rest,
  ];
}

/** Chips an INSERT row shows before "More…" (one line in the narrowest editor). */
export const INSERT_VISIBLE = 4;

/** Token values of the visible stops (what the overview text and the finale count). */
export function tokenValues(p: WaycineProject) {
  return statTokenValues(computeStats(p.stops.filter((s) => s.hidden !== true)));
}
