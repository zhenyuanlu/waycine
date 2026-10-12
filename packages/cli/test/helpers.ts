import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.js';
import type { Io } from '../src/io.js';

/** The engine's reference season (a test project, not a shipped preset). */
export const SEASON = fileURLToPath(
  new URL('../../waycine/test/fixtures/projects/season-2026.waycine.json', import.meta.url),
);

/** The bundled display font file (a real TTF for --font tests). */
export const BUNDLED_DISPLAY = fileURLToPath(
  new URL('../../waycine/fonts/BarlowCondensed-Bold.ttf', import.meta.url),
);

/** Test projects of the engine. */
export const LONG_NAMES = fileURLToPath(
  new URL('../../waycine/test/fixtures/projects/long-names.waycine.json', import.meta.url),
);
export const SINGLE_STOP = fileURLToPath(
  new URL('../../waycine/test/fixtures/projects/single-stop.waycine.json', import.meta.url),
);

/** Result of one in-process CLI run. */
export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs `waycine <args>` in-process with captured output. */
export async function run(
  args: readonly string[],
  opts: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    /** Stands in for Ctrl+C: receives the command's interrupt listener. */
    onInterrupt?: (listener: () => void) => () => void;
  } = {},
): Promise<RunResult> {
  let stdout = '';
  let stderr = '';
  const io: Io = {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    stderrIsTTY: false,
    cwd: opts.cwd ?? process.cwd(),
    env: opts.env ?? process.env,
    ...(opts.onInterrupt === undefined ? {} : { onInterrupt: opts.onInterrupt }),
  };
  const code = await main(args, io);
  return { code, stdout, stderr };
}

/**
 * A fresh scratch directory for one test file, under the package's ignored
 * `node_modules/.tmp` (never the repository tree, never the OS temp folder).
 */
export function scratchDir(name: string): { dir: string; cleanup: () => void } {
  const root = fileURLToPath(new URL('../node_modules/.tmp/', import.meta.url));
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, `${name}-`));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Width and height from a PNG file's IHDR chunk. */
export function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((b, i) => buf[i] === b) || buf.toString('latin1', 12, 16) !== 'IHDR') {
    throw new Error(`${file} is not a PNG file`);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
