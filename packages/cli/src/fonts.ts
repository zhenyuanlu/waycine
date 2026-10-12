/**
 * `--font display=path` / `--font body=path`: register a font file with
 * `@napi-rs/canvas` under a private alias family and point the project's font
 * role at it. The bundled fonts are registered by `createNodeBackend()`.
 * A role's `widthAdjust` is calibrated for the font it was set with (a
 * project may squeeze Barlow to another face's widths), so an override
 * resets it to 1.
 */
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { GlobalFonts } from '@napi-rs/canvas';
import type { WaycineProject } from 'waycine/node';
import { CliError, type FontFiles } from './args.js';
import type { Io } from './io.js';

/** Alias family per registered file (absolute path), so a file is registered once per process. */
const aliases = new Map<string, string>();

/** Registers `path` (once) and returns its alias family. */
function registerFile(path: string, role: 'display' | 'body'): string {
  const known = aliases.get(path);
  if (known !== undefined) return known;
  const alias = `WaycineCli${role === 'display' ? 'Display' : 'Body'}${aliases.size + 1}`;
  const key = GlobalFonts.registerFromPath(path, alias);
  if (key === null) {
    throw new CliError(`Could not load the font file ${path} (is it a TTF or OTF font?).`);
  }
  aliases.set(path, alias);
  return alias;
}

/**
 * Points each role given in `files` at its registered font file (in place)
 * and resets that role's `widthAdjust` to 1, with a note on standard error
 * (unless `quiet`) when it was calibrated to another value.
 */
export function applyFontFiles(
  io: Io,
  project: WaycineProject,
  files: FontFiles,
  quiet = false,
): void {
  for (const role of ['display', 'body'] as const) {
    const file = files[role];
    if (file === undefined) continue;
    const path = resolve(io.cwd, file);
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new CliError(`Font file not found: ${file}`);
    }
    const family = registerFile(path, role);
    const calibrated = project.fonts[role].widthAdjust;
    if (calibrated !== 1 && !quiet) {
      io.stderr(
        `note: fonts.${role}.widthAdjust ${calibrated} is calibrated for the bundled font; reset to 1 for ${file}\n`,
      );
    }
    project.fonts[role] = {
      ...project.fonts[role],
      family,
      source: 'local',
      localId: `cli:${path}`,
      widthAdjust: 1,
    };
  }
}
