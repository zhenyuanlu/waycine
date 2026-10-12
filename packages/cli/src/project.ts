/**
 * Project loading for the CLI: read and parse the JSON file, validate it,
 * apply the output flags and font overrides, and pick the timeline mode.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type ValidationIssue, validateProject, type WaycineProject } from 'waycine/node';
import { CliError, type OutputOverrides, usageError } from './args.js';
import { applyFontFiles } from './fonts.js';
import type { Io } from './io.js';

/** A parsed, validated project file. */
export interface LoadedProject {
  /** Absolute path of the file. */
  path: string;
  /** The repaired project (defaults filled, values clamped). */
  project: WaycineProject;
  /** Everything validation fixed or found wrong. */
  issues: ValidationIssue[];
}

/** Reads and parses a JSON file; missing files and bad JSON become `CliError`s. */
export function readJsonFile(io: Io, file: string): { path: string; data: unknown } {
  const path = resolve(io.cwd, file);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new CliError(
      code === 'ENOENT'
        ? `Project file not found: ${file}`
        : `Cannot read ${file}: ${String(error)}`,
    );
  }
  try {
    // A UTF-8 byte order mark is not valid JSON; editors on Windows add one.
    return {
      path,
      data: JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as unknown,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CliError(`${file} is not valid JSON: ${detail}`);
  }
}

/** Reads and validates a project file (never throws on validation issues). */
export function loadProjectFile(io: Io, file: string): LoadedProject {
  const { path, data } = readJsonFile(io, file);
  const { project, issues } = validateProject(data);
  return { path, project, issues };
}

/** One issue as a line: `warning stops[2].lat  [clamped] message`. */
export function formatIssue(issue: ValidationIssue): string {
  const where = issue.path === '' ? '(root)' : issue.path;
  return `${issue.level.padEnd(7)} ${where}  [${issue.code}] ${issue.message}`;
}

/**
 * Loads a project for rendering: validation errors abort with exit code 1;
 * warnings are printed to standard error unless `quiet`.
 */
export function loadProjectForRender(io: Io, file: string, quiet: boolean): LoadedProject {
  const loaded = loadProjectFile(io, file);
  const errors = loaded.issues.filter((issue) => issue.level === 'error');
  if (errors.length > 0) {
    throw new CliError(
      `${file} has ${errors.length} error(s):\n${errors.map((e) => `  ${formatIssue(e)}`).join('\n')}`,
    );
  }
  if (!quiet) {
    for (const issue of loaded.issues) io.stderr(`${formatIssue(issue)}\n`);
  }
  return loaded;
}

/**
 * Applies the output flags and `--font` files to `project` (in place).
 * `--segments` / `--single` set `output.exportMode`, which then picks the
 * timeline mode; without either flag the project's own mode applies.
 * `--short` needs a preset aspect (the project's or `--aspect`): a custom size
 * has no short side to change, so it is a usage error. Notes (such as a font
 * width calibration reset by `--font`) are printed unless `quiet`.
 */
export function applyOverrides(
  io: Io,
  project: WaycineProject,
  o: OutputOverrides,
  quiet = false,
): void {
  const output = project.output;
  if (o.size !== undefined) {
    output.aspect = 'custom';
    output.width = o.size.width;
    output.height = o.size.height;
  }
  if (o.aspect !== undefined) output.aspect = o.aspect;
  if (o.shortSide !== undefined && output.aspect === 'custom') {
    throw usageError(
      '--short needs a preset aspect; this project uses a custom size. Add --aspect 16:9|9:16|1:1|4:5 or use --size WxH.',
    );
  }
  if (o.shortSide !== undefined) output.shortSide = o.shortSide;
  if (o.fps !== undefined) output.fps = o.fps;
  if (o.supersample !== undefined) output.supersample = o.supersample;
  if (o.segments !== undefined) output.exportMode = o.segments ? 'segments' : 'single';
  applyFontFiles(io, project, o.fonts, quiet);
}
