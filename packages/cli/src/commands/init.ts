import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { validateProject } from 'waycine/node';
import { boolFlag, CliError, parseCommand, stringFlag, usageError } from '../args.js';
import type { Io } from '../io.js';

export const INIT_HELP = `Usage: waycine init [--preset <name>] [-o <file>] [--force]

Writes a new project file from one of the presets that ship with Waycine.

Options:
  --preset <name>         Preset to copy (default europe-trip; see the list below)
  -o, --out <file>        File to write (default <preset>.waycine.json; "-" prints it)
  --force                 Overwrite an existing file
`;

const OPTIONS = {
  preset: { type: 'string' },
  out: { type: 'string', short: 'o' },
  force: { type: 'boolean' },
} as const;

const SUFFIX = '.waycine.json';
const DEFAULT_PRESET = 'europe-trip';

/** Directory of the presets shipped in the `waycine` package. */
export function presetDir(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve('waycine/package.json')), 'presets');
}

/** Names of the shipped presets (`europe-trip`, ...), sorted. */
export function presetNames(): string[] {
  return readdirSync(presetDir())
    .filter((f) => f.endsWith(SUFFIX))
    .map((f) => f.slice(0, -SUFFIX.length))
    .sort();
}

/** `waycine init`. */
export async function initCommand(io: Io, args: readonly string[]): Promise<number> {
  const { values, positionals } = parseCommand(args, OPTIONS);
  const names = presetNames();
  if (boolFlag(values, 'help')) {
    io.stdout(`${INIT_HELP}\nPresets: ${names.join(', ')}\n`);
    return 0;
  }
  if (positionals.length > 0) {
    throw usageError(`takes no positional arguments (got ${positionals.join(' ')}).`);
  }
  const preset = stringFlag(values, 'preset') ?? DEFAULT_PRESET;
  if (!names.includes(preset)) {
    throw usageError(`Unknown preset "${preset}". Presets: ${names.join(', ')}.`);
  }
  const text = readFileSync(join(presetDir(), `${preset}${SUFFIX}`), 'utf8');
  const { issues } = validateProject(JSON.parse(text) as unknown);
  const errors = issues.filter((issue) => issue.level === 'error');
  if (errors.length > 0) {
    throw new CliError(`The ${preset} preset does not validate (${errors.length} error(s)).`);
  }

  const out = stringFlag(values, 'out') ?? `${preset}${SUFFIX}`;
  if (out === '-') {
    io.stdout(text.endsWith('\n') ? text : `${text}\n`);
    return 0;
  }
  const target = resolve(io.cwd, out);
  if (existsSync(target) && !boolFlag(values, 'force')) {
    throw new CliError(`${out} already exists; pass --force to overwrite it.`);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text.endsWith('\n') ? text : `${text}\n`);
  io.stderr(`Wrote ${out} (from the ${preset} preset). Next: waycine render ${out} -o video.mp4\n`);
  return 0;
}
