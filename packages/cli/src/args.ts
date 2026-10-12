/**
 * Argument parsing helpers on top of `node:util` `parseArgs`: typed flag
 * values, the output flags shared by `render`, `still` and `info`, and the
 * error type that carries an exit code.
 */
import { parseArgs } from 'node:util';
import {
  ASPECTS,
  type Aspect,
  FPS_VALUES,
  type Fps,
  MAX_OUTPUT_SIDE,
  MIN_OUTPUT_SIDE,
  SHORT_SIDES,
  type ShortSide,
  SUPERSAMPLES,
  type Supersample,
} from 'waycine/node';

/** Exit code for a failed command (bad project, render or encode failure). */
export const EXIT_FAILURE = 1;
/** Exit code for a usage error (unknown flag, bad flag value, missing argument). */
export const EXIT_USAGE = 2;
/** Exit code after Ctrl+C (128 + SIGINT), as shells report it. */
export const EXIT_INTERRUPTED = 130;

/** An error the CLI reports as a one-line message and an exit code, without a stack trace. */
export class CliError extends Error {
  /** Process exit code. */
  readonly exitCode: number;

  constructor(message: string, exitCode: number = EXIT_FAILURE) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

/** A usage error (exit code 2). */
export function usageError(message: string): CliError {
  return new CliError(message, EXIT_USAGE);
}

/** Option definitions in the shape `parseArgs` takes. */
export type OptionSpec = Record<
  string,
  { type: 'string' | 'boolean'; short?: string; multiple?: boolean }
>;

/** Parsed flag values: strings, booleans, or string lists for `multiple` flags. */
export type FlagValues = Record<string, string | boolean | string[] | undefined>;

/** Result of `parseCommand`. */
export interface ParsedCommand {
  /** Flag values by long name. */
  values: FlagValues;
  /** Positional arguments. */
  positionals: string[];
}

/** `parseArgs` in strict mode; its errors become usage errors. `--help` / `-h` is always accepted. */
export function parseCommand(args: readonly string[], options: OptionSpec): ParsedCommand {
  try {
    const parsed = parseArgs({
      args: [...args],
      options: { help: { type: 'boolean', short: 'h' }, ...options },
      allowPositionals: true,
      strict: true,
    });
    return { values: parsed.values as FlagValues, positionals: parsed.positionals };
  } catch (error) {
    throw usageError(error instanceof Error ? error.message : String(error));
  }
}

/** A string flag, or undefined. */
export function stringFlag(values: FlagValues, name: string): string | undefined {
  const v = values[name];
  return typeof v === 'string' ? v : undefined;
}

/** A boolean flag (false when absent). */
export function boolFlag(values: FlagValues, name: string): boolean {
  return values[name] === true;
}

/** A repeatable string flag (empty when absent). */
export function listFlag(values: FlagValues, name: string): string[] {
  const v = values[name];
  if (Array.isArray(v)) return v;
  return typeof v === 'string' ? [v] : [];
}

/** Parses a whole number in `[min, max]` for `--name`. */
export function parseIntFlag(
  name: string,
  value: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (!/^[+-]?\d+$/.test(value.trim())) {
    throw usageError(`--${name} must be a whole number (got "${value}").`);
  }
  const n = Number.parseInt(value, 10);
  if (n < min || n > max) {
    const range = max === Number.MAX_SAFE_INTEGER ? `at least ${min}` : `between ${min} and ${max}`;
    throw usageError(`--${name} must be ${range} (got ${n}).`);
  }
  return n;
}

/** Preset aspect ratios accepted by `--aspect`. */
export const ASPECT_FLAGS = ASPECTS.filter((a): a is Exclude<Aspect, 'custom'> => a !== 'custom');

/** Parses `--aspect 16:9|9:16|1:1|4:5`. */
export function parseAspectFlag(value: string): Exclude<Aspect, 'custom'> {
  const hit = ASPECT_FLAGS.find((a) => a === value.trim());
  if (hit === undefined) {
    throw usageError(`--aspect must be one of ${ASPECT_FLAGS.join(', ')} (got "${value}").`);
  }
  return hit;
}

/** Parses `--short 720|1080|1440|2160`. */
export function parseShortFlag(value: string): ShortSide {
  const n = Number(value.trim());
  const hit = SHORT_SIDES.find((s) => s === n);
  if (hit === undefined) {
    throw usageError(`--short must be one of ${SHORT_SIDES.join(', ')} (got "${value}").`);
  }
  return hit;
}

/** A frame size in px. */
export interface Size {
  /** Width in px. */
  width: number;
  /** Height in px. */
  height: number;
}

/** Parses `--size WxH`: even whole numbers in [320, 4096]. */
export function parseSizeFlag(value: string): Size {
  const m = /^\s*(\d+)\s*[xX]\s*(\d+)\s*$/.exec(value);
  if (m === null) {
    throw usageError(`--size must look like 1920x1080 (got "${value}").`);
  }
  const width = Number(m[1]);
  const height = Number(m[2]);
  for (const side of [width, height]) {
    if (side < MIN_OUTPUT_SIDE || side > MAX_OUTPUT_SIDE || side % 2 !== 0) {
      throw usageError(
        `--size sides must be even and between ${MIN_OUTPUT_SIDE} and ${MAX_OUTPUT_SIDE} (got ${width}x${height}).`,
      );
    }
  }
  return { width, height };
}

/** Parses `--fps`: one of the supported rates (29.97 is encoded as exactly 30000/1001). */
export function parseFpsFlag(value: string): Fps {
  const n = Number(value.trim());
  const hit = FPS_VALUES.find((f) => f === n);
  if (hit === undefined) {
    throw usageError(`--fps must be one of ${FPS_VALUES.join(', ')} (got "${value}").`);
  }
  return hit;
}

/** Parses `--ss 1|2` (supersampling factor). */
export function parseSsFlag(value: string): Supersample {
  const n = Number(value.trim());
  const hit = SUPERSAMPLES.find((s) => s === n);
  if (hit === undefined) {
    throw usageError(`--ss must be one of ${SUPERSAMPLES.join(', ')} (got "${value}").`);
  }
  return hit;
}

/** Font files given with `--font role=path`. */
export interface FontFiles {
  /** Display face (titles, city, stats). */
  display?: string;
  /** Body face (subtitle, kicker, event, dates, lines, grid labels). */
  body?: string;
}

/** Parses repeated `--font display=path` / `--font body=path`. */
export function parseFontFlags(values: readonly string[]): FontFiles {
  const out: FontFiles = {};
  for (const value of values) {
    const eq = value.indexOf('=');
    const role = eq > 0 ? value.slice(0, eq).trim() : '';
    const file = eq > 0 ? value.slice(eq + 1).trim() : '';
    if ((role !== 'display' && role !== 'body') || file === '') {
      throw usageError(
        `--font must look like display=path/to/font.ttf or body=... (got "${value}").`,
      );
    }
    if (out[role] !== undefined) {
      throw usageError(`--font ${role}= was given twice.`);
    }
    out[role] = file;
  }
  return out;
}

/** Flags shared by `render`, `still` and `info`: output size, rate, mode and fonts. */
export const OUTPUT_OPTIONS: OptionSpec = {
  aspect: { type: 'string' },
  short: { type: 'string' },
  size: { type: 'string' },
  fps: { type: 'string' },
  ss: { type: 'string' },
  segments: { type: 'boolean' },
  single: { type: 'boolean' },
  font: { type: 'string', multiple: true },
};

/** Output overrides read from the shared flags (absent flags keep the project's values). */
export interface OutputOverrides {
  /** `--aspect`. */
  aspect?: Exclude<Aspect, 'custom'>;
  /** `--short`. */
  shortSide?: ShortSide;
  /** `--size`. */
  size?: Size;
  /** `--fps`. */
  fps?: Fps;
  /** `--ss`. */
  supersample?: Supersample;
  /** `--segments` (true) or `--single` (false). */
  segments?: boolean;
  /** `--font` files. */
  fonts: FontFiles;
}

/** Reads and checks the shared output flags. */
export function readOutputOverrides(values: FlagValues): OutputOverrides {
  const out: OutputOverrides = { fonts: parseFontFlags(listFlag(values, 'font')) };
  const aspect = stringFlag(values, 'aspect');
  const short = stringFlag(values, 'short');
  const size = stringFlag(values, 'size');
  const fps = stringFlag(values, 'fps');
  const ss = stringFlag(values, 'ss');
  if (size !== undefined && (aspect !== undefined || short !== undefined)) {
    throw usageError('--size cannot be combined with --aspect or --short.');
  }
  if (boolFlag(values, 'segments') && boolFlag(values, 'single')) {
    throw usageError('--segments and --single cannot be combined.');
  }
  if (aspect !== undefined) out.aspect = parseAspectFlag(aspect);
  if (short !== undefined) out.shortSide = parseShortFlag(short);
  if (size !== undefined) out.size = parseSizeFlag(size);
  if (fps !== undefined) out.fps = parseFpsFlag(fps);
  if (ss !== undefined) out.supersample = parseSsFlag(ss);
  if (boolFlag(values, 'segments')) out.segments = true;
  if (boolFlag(values, 'single')) out.segments = false;
  return out;
}

/** The single positional `<project.json>` of a command. */
export function projectArg(command: string, positionals: readonly string[]): string {
  const [first, ...rest] = positionals;
  if (first === undefined) {
    throw usageError(`needs a project file: waycine ${command} <project.json>`);
  }
  if (rest.length > 0) {
    throw usageError(`takes one project file (extra: ${rest.join(' ')}).`);
  }
  return first;
}
