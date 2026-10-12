#!/usr/bin/env node
// Generates the reference files that follow the engine's settings catalog
// (`npm run docs:gen`):
//
//   docs/parameters.md                       every setting, grouped by editor section
//   apps/web/public/schema/v1.json           JSON Schema (draft 2020-12) of a version 1 project file
//   apps/web/public/third-party-notices.txt  plain-text copy of THIRD_PARTY_NOTICES.md for the site
//
// The catalog (`FIELDS`), `DEFAULTS` and `validateProject` are read from the
// built engine in packages/waycine/dist/core. The script first runs
// `tsc -b packages/waycine/tsconfig.core.json`, which is a no-op when that
// build is current, so a fresh clone or an edited catalog needs no separate
// build step.
//
//   node scripts/gen-docs.mjs           write the files that changed
//   node scripts/gen-docs.mjs --check   write nothing; exit 1 when a file differs
//                                       from a fresh generation (check-hygiene rule 5)
//
// Before returning, the script checks its own output: every leaf of DEFAULTS
// has a catalog entry, the schema accepts DEFAULTS and every preset, and the
// schema's special cases (list lengths, optional keys) agree with
// validateProject.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const SCHEMA_ID = 'https://zhenyuanlu.github.io/waycine/schema/v1.json';
const OUT_PARAMETERS = 'docs/parameters.md';
const OUT_SCHEMA = 'apps/web/public/schema/v1.json';
const OUT_NOTICES = 'apps/web/public/third-party-notices.txt';
const NOTICES_SOURCE = 'THIRD_PARTY_NOTICES.md';
const PRESET_DIR = 'packages/waycine/presets';
/** Every shipped preset, plus the reference season of the engine's tests. */
const PRESETS = [
  ...readdirSync(path.join(ROOT, PRESET_DIR))
    .filter((name) => name.endsWith('.waycine.json'))
    .sort()
    .map((name) => `${PRESET_DIR}/${name}`),
  'packages/waycine/test/fixtures/projects/season-2026.waycine.json',
];

/** Runs `tsc -b` on the engine core project (extra arguments appended). */
function buildCore(...extra) {
  const require = createRequire(import.meta.url);
  const tsc = require.resolve('typescript/bin/tsc');
  try {
    execFileSync(process.execPath, [tsc, '-b', 'packages/waycine/tsconfig.core.json', ...extra], {
      cwd: ROOT,
      stdio: 'pipe',
    });
  } catch (error) {
    const out = `${error?.stdout ?? ''}${error?.stderr ?? ''}`.trim();
    throw new Error(`could not build the engine core (tsc -b):\n${out || String(error)}`);
  }
}

/** Builds the engine core into dist (incremental) and imports it. */
async function loadEngine() {
  buildCore();
  const entry = path.join(ROOT, 'packages', 'waycine', 'dist', 'core', 'index.js');
  // tsc -b trusts its build info, so a deleted dist with the build info left
  // behind looks current: rebuild in full then.
  if (!existsSync(entry)) buildCore('--force');
  return import(pathToFileURL(entry).href);
}

// ---------------------------------------------------------------------------
// Catalog helpers

/** True for plain objects (not arrays, not null). */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `layouts.portrait.x` -> `layouts.*.x`, `fonts.body.x` -> `fonts.*.x`. */
function patternOf(leafPath) {
  const parts = leafPath.split('.');
  if ((parts[0] === 'layouts' || parts[0] === 'fonts') && parts.length > 2) {
    parts[1] = '*';
  }
  return parts.join('.');
}

/** The value at a dotted path, or undefined. */
function valueAt(root, dotted) {
  let cur = root;
  for (const key of dotted.split('.')) {
    if (!isObject(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** Every leaf path of a DEFAULTS-shaped tree (arrays are leaves). */
function leafPaths(node, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(node)) {
    const p = prefix === '' ? key : `${prefix}.${key}`;
    if (isObject(value)) {
      out.push(...leafPaths(value, p));
    } else {
      out.push(p);
    }
  }
  return out;
}

/** Leaves of DEFAULTS that are validated by dedicated code (not by the DEFAULTS shape). */
const SPECIAL_LEAVES = new Set(['version', 'stops', 'stats.items']);

// ---------------------------------------------------------------------------
// docs/parameters.md

const UNIT_ROWS = [
  ['Du', "Design unit: 1/1080 of the frame's shorter side, so 1 Du is 1 px at 1080p."],
  ['s', 'Seconds. Each duration becomes `max(1, round(seconds x fps))` frames.'],
  ['frac', 'A fraction from 0 to 1 (of a segment, a phase or the frame, as the help says).'],
  ['alpha', 'Opacity from 0 (invisible) to 1 (opaque).'],
  ['deg', 'Degrees of longitude or latitude (or of Mercator y for vertical nudges).'],
  ['x', 'A multiplier.'],
  ['px', 'Output pixels.'],
  ['fps', 'Frames per second.'],
  ['Mbps', 'Megabits per second.'],
  ['chars', 'Characters.'],
];

/** A number for display: at most four decimals. */
function showNumber(n) {
  return String(Number(n.toFixed(4)));
}

/** A JSON value for display inside code. */
function showValue(value) {
  if (typeof value === 'number') return showNumber(value);
  if (Array.isArray(value)) return `[${value.map(showValue).join(', ')}]`;
  return JSON.stringify(value);
}

/** Inline code, safe in a table cell. */
function code(text) {
  return `\`${text.replaceAll('|', '\\|')}\``;
}

/** Plain table-cell text. */
function cell(text) {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

/** GitHub's heading anchor. */
function slug(heading) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, '')
    .replace(/ /g, '-');
}

/** The default of a field as Markdown ('-' when it has none). */
function defaultCell(field, engine) {
  const { DEFAULTS, PROFILE_IDS } = engine;
  if (field.path.startsWith('stops[].') || field.path.startsWith('stats.items[].')) return '-';
  if (field.path.startsWith('layouts.*.')) {
    const rest = field.path.slice('layouts.*.'.length);
    const values = PROFILE_IDS.map((p) => [p, valueAt(DEFAULTS, `layouts.${p}.${rest}`)]);
    const first = JSON.stringify(values[0][1]);
    if (values.every(([, v]) => JSON.stringify(v) === first)) return code(showValue(values[0][1]));
    return values.map(([p, v]) => `${p} ${code(showValue(v))}`).join(', ');
  }
  if (field.path.startsWith('fonts.*.')) {
    const rest = field.path.slice('fonts.*.'.length);
    const d = valueAt(DEFAULTS, `fonts.display.${rest}`);
    const b = valueAt(DEFAULTS, `fonts.body.${rest}`);
    if (JSON.stringify(d) === JSON.stringify(b)) return code(showValue(d));
    return `display ${code(showValue(d))}, body ${code(showValue(b))}`;
  }
  const v = valueAt(DEFAULTS, field.path);
  return v === undefined ? '-' : code(showValue(v));
}

/** Range or options of a field as Markdown. */
function rangeCell(field, listLengths) {
  const unit = field.unit === undefined ? '' : ` (${field.unit})`;
  switch (field.kind) {
    case 'number': {
      const span = `${showNumber(field.min)} to ${showNumber(field.max)}${unit}`;
      return field.nullable ? `${span}, or ${code('null')}` : span;
    }
    case 'tuple': {
      const [lo, hi] = listLengths.get(field.path) ?? [field.length, field.length];
      const count = lo === hi ? `${lo} numbers` : `${lo} to ${hi} numbers`;
      return `${count}, each ${showNumber(field.min)} to ${showNumber(field.max)}${unit}`;
    }
    case 'enum':
      return field.options.map((o) => code(String(o))).join(', ');
    case 'color':
      return `colour ${code('#RRGGBB')}`;
    case 'date':
      return `date ${code('YYYY-MM-DD')}`;
    case 'bool':
      return `${code('true')} or ${code('false')}`;
    default:
      return 'text';
  }
}

function renderParameters(engine, listLengths) {
  const { FIELDS, SECTIONS, DEFAULTS, VERSION, SCHEMA_VERSION } = engine;
  const lines = [
    '<!-- Generated by scripts/gen-docs.mjs from the settings catalog. Do not edit by hand: run `npm run docs:gen`. -->',
    '',
    '# Project settings',
    '',
    `Every setting of a Waycine project file (\`.waycine.json\`, schema version ${SCHEMA_VERSION}), as of`,
    `Waycine ${VERSION}. This page is generated from the engine's settings catalog (\`FIELDS\`),`,
    'which also drives the web editor, validation, the',
    `[JSON Schema](${SCHEMA_ID}) and \`waycine params\`.`,
    '',
    'A project file only needs the settings that differ from the defaults. The file layout,',
    'text tokens and versioning are described in [the project format](project-format.md).',
    '',
    '## How to read this page',
    '',
    '- **Setting** is the path in the JSON file. `layouts.*.` is one value per layout profile',
    '  (`landscape`, `portrait`, `square`), `fonts.*.` one per font role (`display`, `body`),',
    '  `stops[].` one per stop, `stops[].results[].` one per result line of a stop, and',
    '  `stats.items[].` one per finale stat.',
    '- **Default** is the engine default, rounded to four decimals (the JSON Schema has the exact',
    '  values). Settings that differ per layout profile list each profile. `-` means there is no',
    '  default: the value is optional or belongs to one stop or stat.',
    '- **Range or options**: numbers outside the range are clamped when a project is loaded, and',
    '  unknown options fall back to the default; either way the app and `waycine validate` say so.',
    '- The first six sections are always visible in the web editor; the others open with',
    '  "All settings".',
    '',
    '| Unit | Meaning |',
    '| --- | --- |',
    ...UNIT_ROWS.map(([unit, meaning]) => `| ${unit} | ${meaning} |`),
    '',
    '## Sections',
    '',
  ];
  for (const section of SECTIONS) {
    const n = FIELDS.filter((f) => f.section === section.id).length;
    const where = section.level === 'basic' ? '' : ' (All settings)';
    lines.push(`- [${section.label}](#${slug(section.label)})${where}: ${n} settings`);
  }
  lines.push('');

  for (const section of SECTIONS) {
    const fields = FIELDS.filter((f) => f.section === section.id);
    lines.push(`## ${section.label}`, '');
    lines.push(
      section.level === 'basic'
        ? 'Shown in the editor without "All settings" (some settings below only with it).'
        : 'Shown in the editor under "All settings".',
      '',
    );
    if (section.id === 'stats') {
      const items = DEFAULTS.stats.items
        .map((item) => `${code(item.label)} (${code(item.source)})`)
        .join(', ');
      lines.push(`The default \`stats.items\` list is ${items}.`, '');
    }
    lines.push('| Setting | Label | Default | Range or options | Help |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const field of fields) {
      lines.push(
        `| ${code(field.path)} | ${cell(field.label)} | ${defaultCell(field, engine)} | ${rangeCell(field, listLengths)} | ${cell(field.help)} |`,
      );
    }
    lines.push('');
  }
  lines.push(`${FIELDS.length} settings in ${SECTIONS.length} sections.`, '');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// apps/web/public/schema/v1.json

const COLOR_PATTERN = '^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$';
const DATE_PATTERN = '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';

/** Short descriptions of the objects that have no catalog entry of their own. */
const GROUP_DESCRIPTIONS = {
  meta: 'Project metadata.',
  text: 'Text templates and date formats. Templates may contain tokens such as {stops|STOP|STOPS}.',
  theme: 'Colours.',
  'theme.medals': 'Medal colours.',
  fonts: 'Fonts per role: display (titles, cities, numbers) and body (the other texts).',
  timing: 'Lengths and animation timing.',
  camera: 'Camera zoom and easing.',
  route: 'The route line and its glow.',
  pins: 'Pins, pulse rings and pin labels.',
  'pins.label': 'Pin labels.',
  card: 'The stop card.',
  stats: 'Finale statistics.',
  graticule: 'Map grid and its labels.',
  hud: 'Corner marks.',
  output: 'Video format and export.',
  layouts:
    'Geometry per layout profile. The active profile follows output.layout (auto picks by aspect).',
};

/** Optional keys that are part of the format but absent from DEFAULTS. */
const OPTIONAL_STRING_KEYS = [
  ['fonts.*.localId', 'Id of a font uploaded in the web app (kept in that browser only).'],
];

/** Theme ids are suggestions: validation keeps any text. */
const OPEN_ENUMS = new Set(['theme.id']);

/** Integer settings (validation rounds them). */
const INTEGER_PATHS = new Set(['stops[].results[].count']);

/** title / description / unit annotations of a catalog entry. */
function annotate(field) {
  const out = { title: field.label, description: field.help };
  if (field.unit !== undefined) out.description = `${field.help} Unit: ${field.unit}.`;
  return out;
}

/** The schema of one catalog leaf, with `def` as its default (undefined: none). */
function leafSchema(field, def, listLengths) {
  const out = annotate(field);
  switch (field.kind) {
    case 'number':
      out.type = INTEGER_PATHS.has(field.path)
        ? 'integer'
        : field.nullable
          ? ['number', 'null']
          : 'number';
      out.minimum = field.min;
      out.maximum = field.max;
      break;
    case 'tuple': {
      const [lo, hi] = listLengths.get(field.path) ?? [field.length, field.length];
      out.type = 'array';
      out.items = { type: 'number', minimum: field.min, maximum: field.max };
      out.minItems = lo;
      out.maxItems = hi;
      break;
    }
    case 'enum':
      if (OPEN_ENUMS.has(field.path)) {
        out.type = 'string';
        out.examples = [...field.options];
      } else {
        out.enum = [...field.options];
      }
      break;
    case 'color':
      out.type = 'string';
      out.pattern = COLOR_PATTERN;
      break;
    case 'date':
      out.type = 'string';
      out.format = 'date';
      out.pattern = DATE_PATTERN;
      break;
    case 'bool':
      out.type = 'boolean';
      break;
    default:
      out.type = 'string';
  }
  if (def !== undefined) out.default = def;
  return out;
}

/** The object schema of a DEFAULTS subtree. */
function objectSchema(node, prefix, engine, listLengths) {
  const properties = {};
  for (const [key, value] of Object.entries(node)) {
    const p = prefix === '' ? key : `${prefix}.${key}`;
    if (SPECIAL_LEAVES.has(p)) continue;
    if (isObject(value)) {
      properties[key] = objectSchema(value, p, engine, listLengths);
      continue;
    }
    const field = engine.FIELD_BY_PATH.get(patternOf(p));
    if (field === undefined) throw new Error(`DEFAULTS leaf "${p}" has no FIELDS entry`);
    properties[key] = leafSchema(field, value, listLengths);
  }
  const pattern = patternOf(prefix);
  for (const [optional, description] of OPTIONAL_STRING_KEYS) {
    const at = optional.lastIndexOf('.');
    if (optional.slice(0, at) === pattern) {
      properties[optional.slice(at + 1)] = { type: 'string', description };
    }
  }
  if (prefix === 'output') {
    for (const key of ['width', 'height']) {
      const field = engine.FIELD_BY_PATH.get(`output.${key}`);
      properties[key] = {
        ...annotate(field),
        description: `${field.help} Used when output.aspect is "custom". Unit: px.`,
        type: 'integer',
        minimum: field.min,
        maximum: field.max,
        multipleOf: 2,
      };
    }
  }
  const out = { type: 'object' };
  const group = GROUP_DESCRIPTIONS[pattern];
  if (group !== undefined) out.description = group;
  out.properties = properties;
  out.additionalProperties = false;
  return out;
}

/**
 * The item schema of a list whose entries are the catalog paths
 * `<prefix>[].<key>` (one level; nested lists are added by the caller).
 */
function listItemSchema(prefix, description, required, engine, listLengths) {
  const properties = {};
  for (const field of engine.FIELDS) {
    if (!field.path.startsWith(`${prefix}[].`)) continue;
    const key = field.path.slice(prefix.length + 3);
    if (key.includes('.') || key.includes('[')) continue;
    properties[key] = leafSchema(field, undefined, listLengths);
  }
  const out = { type: 'object', description, properties, additionalProperties: false };
  if (required.length > 0) out.required = required;
  return out;
}

function buildSchema(engine, listLengths) {
  const { DEFAULTS, MAX_STOPS, SCHEMA_VERSION, VERSION } = engine;
  const root = objectSchema(DEFAULTS, '', engine, listLengths);

  const result = listItemSchema(
    'stops[].results',
    'One result line of the stop card (and medal dots on the pin label).',
    [],
    engine,
    listLengths,
  );
  const stop = listItemSchema(
    'stops',
    'One stop. Only city, lat and lon are needed.',
    ['city', 'lat', 'lon'],
    engine,
    listLengths,
  );
  stop.properties.results = {
    title: 'Results',
    description: 'Result lines on the stop card.',
    type: 'array',
    items: result,
  };
  const stopsSchema = {
    title: 'Stops',
    description: `Stops in video order, at most ${MAX_STOPS}; at least one must be visible.`,
    type: 'array',
    minItems: 1,
    maxItems: MAX_STOPS,
    items: stop,
  };

  const statItem = listItemSchema(
    'stats.items',
    'One finale stat: a computed number (or your own value) and a label.',
    ['source'],
    engine,
    listLengths,
  );
  root.properties.stats.properties.items = {
    title: 'Stats',
    description: 'Finale stats in order. Items without a value are left out.',
    type: 'array',
    items: statItem,
    default: DEFAULTS.stats.items,
  };

  const properties = {
    $schema: {
      description: 'URL of this schema, for editors.',
      type: 'string',
    },
    version: {
      description: `Schema version of the file. This schema describes version ${SCHEMA_VERSION}.`,
      const: SCHEMA_VERSION,
    },
    meta: root.properties.meta,
    stops: stopsSchema,
  };
  for (const [key, value] of Object.entries(root.properties)) {
    if (!(key in properties)) properties[key] = value;
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: SCHEMA_ID,
    title: 'Waycine project',
    description: `A Waycine project file (.waycine.json), schema version ${SCHEMA_VERSION}, as of Waycine ${VERSION}. Every setting except version and stops is optional and defaults to the value given here. Generated from the settings catalog by scripts/gen-docs.mjs.`,
    type: 'object',
    required: ['version', 'stops'],
    properties,
    additionalProperties: false,
  };
}

/** Line width of the repository's formatter (biome.json). */
const LINE_WIDTH = 100;

/**
 * JSON text in the layout the repository's formatter (Biome) keeps: objects
 * always expanded, arrays of plain values on one line when that line
 * (including a following comma) fits the line width, otherwise one item per
 * line. `lead` is the column where the value starts.
 */
function formatJson(value, indent = 0, lead = indent) {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const flat = value.every((v) => v === null || typeof v !== 'object');
    if (flat) {
      const line = `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
      if (lead + line.length + 1 <= LINE_WIDTH) return line;
    }
    const items = value.map((v) => `${inner}${formatJson(v, indent + 2)}`);
    return `[\n${items.join(',\n')}\n${pad}]`;
  }
  if (isObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const body = entries.map(([k, v]) => {
      const key = `${inner}${JSON.stringify(k)}: `;
      return `${key}${formatJson(v, indent + 2, key.length)}`;
    });
    return `{\n${body.join(',\n')}\n${pad}}`;
  }
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Self-checks

/**
 * The list lengths `validateProject` accepts without an issue, per tuple
 * field (probed: lengths 0 to 8). A tuple whose accepted lengths are not one
 * run is an error.
 */
function probeListLengths(engine) {
  const { FIELDS, validateProject } = engine;
  const lengths = new Map();
  for (const field of FIELDS.filter((f) => f.kind === 'tuple')) {
    const concrete = field.path.replace('layouts.*.', 'layouts.landscape.');
    const ok = [];
    for (let n = 0; n <= 8; n++) {
      const value = Array.from({ length: n }, () => field.min);
      const project = { version: 1, stops: [{ city: 'A', lat: 0, lon: 0 }] };
      setAt(project, concrete, value);
      const { issues } = validateProject(project);
      if (!issues.some((i) => i.path.startsWith(concrete))) ok.push(n);
    }
    const lo = Math.min(...ok);
    const hi = Math.max(...ok);
    if (ok.length === 0 || ok.length !== hi - lo + 1) {
      throw new Error(`${field.path}: validateProject accepts lengths [${ok}], not one run`);
    }
    lengths.set(field.path, [lo, hi]);
  }
  return lengths;
}

function setAt(root, dotted, value) {
  const keys = dotted.split('.');
  let cur = root;
  for (const key of keys.slice(0, -1)) {
    cur[key] ??= {};
    cur = cur[key];
  }
  cur[keys.at(-1)] = value;
}

/** Fails when validateProject warns about a key the schema lists as optional. */
function checkOptionalKeys(engine) {
  const project = {
    $schema: SCHEMA_ID,
    version: 1,
    stops: [{ city: 'A', lat: 0, lon: 0 }],
    fonts: { display: { localId: 'x' } },
    output: { aspect: 'custom', width: 640, height: 480 },
  };
  const { issues } = engine.validateProject(project);
  if (issues.length > 0) {
    throw new Error(
      `validateProject no longer accepts an optional key the schema lists: ${JSON.stringify(issues)}`,
    );
  }
}

/** Every DEFAULTS leaf has a catalog entry, and every catalog entry is in the schema or a list. */
function checkCoverage(engine) {
  const { DEFAULTS, FIELDS } = engine;
  const patterns = new Set();
  for (const leaf of leafPaths(DEFAULTS)) {
    if (SPECIAL_LEAVES.has(leaf)) continue;
    const pattern = patternOf(leaf);
    if (!engine.FIELD_BY_PATH.has(pattern))
      throw new Error(`DEFAULTS leaf "${leaf}" has no FIELDS entry`);
    patterns.add(pattern);
  }
  for (const field of FIELDS) {
    const listed =
      field.path.startsWith('stops[].') ||
      field.path.startsWith('stats.items[].') ||
      field.path === 'output.width' ||
      field.path === 'output.height';
    if (!listed && !patterns.has(field.path)) {
      throw new Error(`FIELDS entry "${field.path}" has no DEFAULTS leaf`);
    }
  }
}

/** A validator for the JSON Schema subset this script writes. Returns error messages. */
function schemaErrors(schema, value, where = '$') {
  const errors = [];
  const types = schema.type === undefined ? [] : [schema.type].flat();
  if (types.length > 0 && !types.some((t) => hasType(value, t))) {
    return [`${where}: expected ${types.join(' or ')}, got ${JSON.stringify(value)}`];
  }
  if (schema.const !== undefined && value !== schema.const)
    errors.push(`${where}: not ${schema.const}`);
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${where}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push(`${where}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push(`${where}: above maximum`);
    if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) {
      errors.push(`${where}: not a multiple of ${schema.multipleOf}`);
    }
  }
  if (typeof value === 'string' && schema.pattern !== undefined) {
    if (!new RegExp(schema.pattern, 'u').test(value))
      errors.push(`${where}: does not match pattern`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      errors.push(`${where}: too short`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      errors.push(`${where}: too long`);
    if (schema.items !== undefined) {
      value.forEach((item, i) => {
        errors.push(...schemaErrors(schema.items, item, `${where}[${i}]`));
      });
    }
  }
  if (isObject(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${where}: missing ${key}`);
    }
    for (const [key, item] of Object.entries(value)) {
      const sub = schema.properties?.[key];
      if (sub !== undefined) {
        errors.push(...schemaErrors(sub, item, `${where}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${where}: unknown key ${key}`);
      }
    }
  }
  return errors;
}

function hasType(value, type) {
  switch (type) {
    case 'null':
      return value === null;
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isObject(value);
    default:
      return typeof value === type;
  }
}

/** The schema must accept DEFAULTS (with one stop) and every preset, raw and validated. */
function checkSchema(schema, engine) {
  const samples = [
    ['DEFAULTS', { ...engine.DEFAULTS, stops: [{ id: 'a', city: 'A', lat: 0, lon: 0 }] }],
  ];
  for (const file of PRESETS) {
    const raw = JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));
    samples.push([file, raw], [`${file} (validated)`, engine.validateProject(raw).project]);
  }
  for (const [name, sample] of samples) {
    const errors = schemaErrors(schema, sample);
    if (errors.length > 0) {
      throw new Error(
        `the generated schema rejects ${name}:\n  ${errors.slice(0, 10).join('\n  ')}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// apps/web/public/third-party-notices.txt

/** Markdown inline syntax to plain text: links show their URL, emphasis and code marks go. */
function plainInline(line) {
  return line
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) =>
      text === url || text === `\`${url}\`` ? url : `${text} (${url})`,
    )
    .replace(/<(https?:\/\/[^>]+)>/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/**
 * THIRD_PARTY_NOTICES.md as plain text. Supports what that file uses:
 * headings, paragraphs, lists, links, emphasis, inline code and fenced
 * blocks (copied verbatim). Relative links point into the repository.
 */
function renderNotices() {
  const source = readFileSync(path.join(ROOT, NOTICES_SOURCE), 'utf8').replace(/\r\n/g, '\n');
  const out = [
    'Waycine third-party notices',
    '',
    'Plain-text copy of THIRD_PARTY_NOTICES.md in the Waycine repository',
    '(https://github.com/zhenyuanlu/waycine). Links to repository files are relative to its root.',
    '',
  ];
  let fenced = false;
  let first = true;
  for (const line of source.split('\n')) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      out.push(line); // license texts stay verbatim, blank lines included
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      if (first) {
        first = false;
        continue; // the title is replaced by the header above
      }
      const text = plainInline(heading[2] ?? '');
      out.push(text, (heading[1] === '##' ? '=' : '-').repeat(text.length));
      continue;
    }
    if (line.trim() === '' && out.at(-1) === '') continue;
    out.push(plainInline(line));
  }
  return `${out.join('\n').trimEnd()}\n`;
}

// ---------------------------------------------------------------------------

async function main() {
  const engine = await loadEngine();
  checkCoverage(engine);
  checkOptionalKeys(engine);
  const listLengths = probeListLengths(engine);
  const schema = buildSchema(engine, listLengths);
  checkSchema(schema, engine);

  const outputs = [
    [OUT_PARAMETERS, renderParameters(engine, listLengths)],
    [OUT_SCHEMA, `${formatJson(schema)}\n`],
    [OUT_NOTICES, renderNotices()],
  ];

  const stale = [];
  for (const [rel, text] of outputs) {
    const abs = path.join(ROOT, rel);
    const current = existsSync(abs) ? readFileSync(abs, 'utf8').replace(/\r\n/g, '\n') : undefined;
    if (current === text) continue;
    stale.push(rel);
    if (!CHECK) {
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, text);
    }
  }
  if (CHECK) {
    if (stale.length > 0) {
      console.error(`gen-docs: out of date: ${stale.join(', ')} (run "npm run docs:gen")`);
      process.exitCode = 1;
    }
    return;
  }
  console.log(
    stale.length === 0
      ? `gen-docs: ${outputs.length} files already up to date`
      : `gen-docs: wrote ${stale.join(', ')}`,
  );
}

main().catch((error) => {
  console.error(`gen-docs: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
