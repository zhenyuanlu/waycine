import { DEFAULTS, FIELDS, type FieldDef, PROFILE_IDS, SECTIONS } from 'waycine/node';
import { boolFlag, parseCommand, stringFlag, usageError } from '../args.js';
import type { Io } from '../io.js';

export const PARAMS_HELP = `Usage: waycine params [--search <text>]

Prints the settings catalog: every project setting with its type, range or
choices, default and help, grouped by editor section.

Paths: "layouts.*." is one value per layout profile (landscape, portrait,
square), "fonts.*." one per font role (display, body), "stops[]." one per stop.

Options:
  --search <text>         Only settings whose path, label, help or keywords
                          contain every word of <text>
`;

const OPTIONS = { search: { type: 'string' } } as const;

/** The value at a dotted path of `root` (undefined when missing). */
function valueAt(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function show(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** The default of a field as text ('' for per-stop fields and fields without one). */
export function fieldDefault(field: FieldDef): string {
  if (field.path.startsWith('stops[].')) return '';
  if (field.path.startsWith('layouts.*.')) {
    const rest = field.path.slice('layouts.*.'.length);
    const byProfile = PROFILE_IDS.map(
      (p) => [p, valueAt(DEFAULTS, `layouts.${p}.${rest}`)] as const,
    );
    const first = byProfile[0]?.[1];
    if (byProfile.every(([, v]) => JSON.stringify(v) === JSON.stringify(first))) {
      return first === undefined ? '' : show(first);
    }
    return byProfile.map(([p, v]) => `${show(v)} (${p})`).join(', ');
  }
  if (field.path.startsWith('fonts.*.')) {
    const rest = field.path.slice('fonts.*.'.length);
    const d = valueAt(DEFAULTS, `fonts.display.${rest}`);
    const b = valueAt(DEFAULTS, `fonts.body.${rest}`);
    return JSON.stringify(d) === JSON.stringify(b)
      ? show(d)
      : `${show(d)} (display), ${show(b)} (body)`;
  }
  const v = valueAt(DEFAULTS, field.path);
  return v === undefined ? '' : show(v);
}

/** Kind, range or choices, and unit of a field: `number 0..1 step 0.01 alpha`. */
function fieldType(field: FieldDef): string {
  const parts: string[] = [field.kind];
  if (field.length !== undefined) parts[0] = `${field.kind}[${field.length}]`;
  if (field.options !== undefined) parts.push(field.options.map(String).join(' | '));
  if (field.min !== undefined || field.max !== undefined) {
    parts.push(`${field.min ?? ''}..${field.max ?? ''}`);
  }
  if (field.unit !== undefined) parts.push(field.unit);
  return parts.join(' ');
}

/** True when every word of `query` occurs in the field's path, label, help, keywords or section. */
export function fieldMatches(field: FieldDef, query: string): boolean {
  const section = SECTIONS.find((s) => s.id === field.section)?.label ?? '';
  const hay = [field.path, field.label, field.help, section, ...field.keywords]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== '')
    .every((w) => hay.includes(w));
}

/** `waycine params`. */
export async function paramsCommand(io: Io, args: readonly string[]): Promise<number> {
  const { values, positionals } = parseCommand(args, OPTIONS);
  if (boolFlag(values, 'help')) {
    io.stdout(PARAMS_HELP);
    return 0;
  }
  if (positionals.length > 0) {
    throw usageError(`takes no positional arguments; use --search "${positionals.join(' ')}".`);
  }
  const query = stringFlag(values, 'search') ?? '';
  const fields = FIELDS.filter((f) => fieldMatches(f, query));
  if (fields.length === 0) {
    io.stdout(`No settings match "${query}".\n`);
    return 0;
  }
  const out: string[] = [];
  for (const section of SECTIONS) {
    const inSection = fields.filter((f) => f.section === section.id);
    if (inSection.length === 0) continue;
    const level = section.level === 'basic' ? '' : ' (all settings)';
    out.push(`${section.label}${level}`);
    for (const f of inSection) {
      const def = fieldDefault(f);
      out.push(`  ${f.path}  ${fieldType(f)}${def === '' ? '' : `  default ${def}`}`);
      out.push(`      ${f.label}. ${f.help}`);
    }
    out.push('');
  }
  out.push(`${fields.length} of ${FIELDS.length} settings.`);
  io.stdout(`${out.join('\n')}\n`);
  return 0;
}
