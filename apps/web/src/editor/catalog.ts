import { FIELDS, type FieldDef, type ProfileId, type SectionId } from 'waycine';
import { copy } from '../copy/en';
import { concretePaths } from '../state/paths';

/**
 * How the FIELDS catalog reaches the editor. All settings lists every entry
 * except the per-stop and per-stat ones, grouped 02-12 like Basics; the
 * Basics sections show a chosen few of them again (the "Also in Basics"
 * rows), and the stop editor and the stats table own the per-stop and
 * per-stat entries. A test proves every entry has a control.
 */

/** Section numbers shared by Basics, All settings and the rail. */
export const SECTION_NUMBER: Readonly<Record<SectionId, string>> = {
  stops: '01',
  text: '02',
  look: '03',
  timing: '04',
  stats: '05',
  video: '06',
  camera: '07',
  route: '08',
  pins: '09',
  card: '10',
  grid: '11',
  layout: '12',
};

/** The Basics sections, in order. */
export const BASIC_SECTIONS: readonly SectionId[] = [
  'stops',
  'text',
  'look',
  'timing',
  'stats',
  'video',
];

/** The All settings groups, in order (02-12; stops live in Basics only). */
export const GROUPS: readonly SectionId[] = [
  'text',
  'look',
  'timing',
  'stats',
  'video',
  'camera',
  'route',
  'pins',
  'card',
  'grid',
  'layout',
];

/**
 * Catalog paths the hand-laid Basics sections (the files in sections/) also
 * show. Kept by hand: update it when a control is added to or removed from
 * Basics. It is not derived from FieldDef.level.
 */
const BASICS_PATHS: ReadonlySet<string> = new Set([
  'text.title',
  'text.subtitle',
  'text.description',
  'text.descriptionAt',
  'text.kicker',
  'text.uppercase',
  'theme.id',
  'theme.background',
  'theme.route',
  'theme.glow',
  'theme.accent',
  'theme.flash',
  'timing.overviewSec',
  'timing.stopSec',
  'timing.finaleSec',
  'timing.overview.enabled',
  'timing.finale.enabled',
  'timing.transition.mode',
  'timing.transition.flashTo',
  'timing.transition.whiteStart',
  'timing.transition.recoverSec',
  'stats.show',
  'output.aspect',
  'output.shortSide',
  'output.fps',
  'output.quality',
]);

/** Template fields: edited as chips, never as raw `{…}` syntax. */
export const TEMPLATE_PATHS: ReadonlySet<string> = new Set([
  'text.title',
  'text.subtitle',
  'text.kicker',
  'text.description',
]);

function perItem(field: FieldDef): boolean {
  return field.path.startsWith('stops[].') || field.path.startsWith('stats.items[].');
}

/** Catalog entries of an All settings group, in catalog order. */
export function groupFields(section: SectionId): FieldDef[] {
  return FIELDS.filter((f) => f.section === section && !perItem(f));
}

/** One All settings row: a catalog entry at a concrete project path. */
export interface SettingRow {
  field: FieldDef;
  path: string;
  /** Shown in Basics too. */
  basic: boolean;
  /** Sub-heading key for long groups ("pins.label"), or null. */
  sub: string | null;
}

/** Sub-heading of a row in a long group (Pin labels, City, Title and subtitle…), or null. */
function subgroupOf(path: string): string | null {
  const p = path.split('.');
  if (p[0] === 'layouts') {
    const key = `layouts.${p[2] ?? ''}`;
    return key in copy.all.subgroups ? key : null;
  }
  if (p[0] === 'fonts') return `fonts.${p[1] ?? ''}`;
  if (p[0] === 'hud') return 'hud';
  if (p[0] === 'graticule') return (p[1] ?? '').startsWith('label') ? 'graticule.labels' : null;
  const two = `${p[0]}.${p[1] ?? ''}`;
  return p.length > 2 && two in copy.all.subgroups ? two : null;
}

/** Rows per section and profile; FIELDS never change at runtime. */
const rowCache = new Map<string, SettingRow[]>();

/**
 * The rows of a group for the active layout profile: "Also in Basics" rows
 * first, then the others, keeping sub-headings together.
 */
export function groupRows(section: SectionId, profile: ProfileId): SettingRow[] {
  const key = `${section}:${profile}`;
  const cached = rowCache.get(key);
  if (cached !== undefined) return cached;
  const rows: SettingRow[] = [];
  for (const field of groupFields(section)) {
    for (const path of concretePaths(field, profile)) {
      rows.push({ field, path, basic: BASICS_PATHS.has(field.path), sub: subgroupOf(path) });
    }
  }
  const basics = rows.filter((r) => r.basic);
  const more = rows.filter((r) => !r.basic);
  const order: (string | null)[] = [];
  for (const r of more) if (!order.includes(r.sub)) order.push(r.sub);
  // Rows without a sub-heading lead; the sub-headed ones follow in first-seen order.
  const rank = (sub: string | null): number => (sub === null ? -1 : order.indexOf(sub));
  more.sort((a, b) => rank(a.sub) - rank(b.sub));
  const out = [...basics, ...more];
  rowCache.set(key, out);
  return out;
}

/** Every All settings row for the active profile, by group. */
export function allRows(profile: ProfileId): Map<SectionId, SettingRow[]> {
  return new Map(GROUPS.map((g) => [g, groupRows(g, profile)]));
}

/** Number of All settings rows (computed from FIELDS: never hard-coded). */
export function settingsCount(profile: ProfileId): number {
  return GROUPS.reduce((n, g) => n + groupRows(g, profile).length, 0);
}

/**
 * Catalog paths with their own editor UI (per stop and per stat), and the
 * component that renders each. A new `stops[].` or `stats.items[].` entry
 * must be added here and to that component.
 */
export const CUSTOM_UI_PATHS: Readonly<Record<string, string>> = {
  'stops[].id': 'stops/StopEditor "Stop id" (read-only; set by the app)',
  'stops[].city': 'stops/StopEditor City label',
  'stops[].lat': 'stops/StopEditor Coordinates (and PlaceSearch, Pick on map)',
  'stops[].lon': 'stops/StopEditor Coordinates (and PlaceSearch, Pick on map)',
  'stops[].event': 'stops/StopEditor Event',
  'stops[].date': 'stops/StopEditor Date',
  'stops[].endDate': 'stops/StopEditor End date',
  'stops[].dateText': 'stops/StopEditor Date text',
  'stops[].partner': 'stops/StopEditor Extra line',
  'stops[].region': 'stops/StopEditor Region',
  'stops[].regionCode': 'stops/StopEditor Region code',
  'stops[].country': 'stops/StopEditor Country',
  'stops[].results[].medal': 'stops/StopEditor Results medal',
  'stops[].results[].text': 'stops/StopEditor Results text',
  'stops[].results[].count': 'stops/StopEditor Results count',
  'stops[].durationSec': 'stops/StopEditor Own length',
  'stops[].hidden': 'stops/StopEditor Hide in video (and the action row)',
  'stats.items[].source': 'StatsTable Counts',
  'stats.items[].label': 'StatsTable Label',
  'stats.items[].labelOne': 'StatsTable Label for 1',
  'stats.items[].value': 'StatsTable Own value',
};

/** True when every word of `query` occurs in the field's label, help, keywords, path or group. */
export function matchesQuery(field: FieldDef, path: string, query: string): boolean {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== '');
  if (words.length === 0) return true;
  const hay = [
    field.label,
    field.help,
    ...field.keywords,
    path,
    field.path,
    copy.sections[field.section] ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}
