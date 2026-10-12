import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import {
  boolFlag,
  OUTPUT_OPTIONS,
  parseCommand,
  parseIntFlag,
  projectArg,
  readOutputOverrides,
  stringFlag,
  usageError,
} from '../args.js';
import type { Io } from '../io.js';
import { applyOverrides, loadProjectForRender } from '../project.js';
import { FrameRenderer } from '../render.js';

export const STILL_HELP = `Usage: waycine still <project.json> --frame <n> -o <frame.png> [options]

Renders one frame to a PNG file. No ffmpeg needed.

Options:
  --frame <n>             Frame index (see "waycine info" for the timeline)
  -o, --out <file>        PNG file to write
  --aspect, --short, --size, --fps, --ss, --segments, --single, --font
                          As for "waycine render"
  -q, --quiet             Print nothing but errors
`;

const OPTIONS = {
  ...OUTPUT_OPTIONS,
  frame: { type: 'string' },
  out: { type: 'string', short: 'o' },
  quiet: { type: 'boolean', short: 'q' },
} as const;

/** `waycine still`. */
export async function stillCommand(io: Io, args: readonly string[]): Promise<number> {
  const { values, positionals } = parseCommand(args, OPTIONS);
  if (boolFlag(values, 'help')) {
    io.stdout(STILL_HELP);
    return 0;
  }
  const file = projectArg('still', positionals);
  const frameText = stringFlag(values, 'frame');
  const out = stringFlag(values, 'out');
  if (frameText === undefined) throw usageError('needs --frame <n>.');
  if (out === undefined) throw usageError('needs -o <frame.png>.');
  const quiet = boolFlag(values, 'quiet');
  const overrides = readOutputOverrides(values);
  const frameNumber = parseIntFlag('frame', frameText, 0);

  const { project } = loadProjectForRender(io, file, quiet);
  applyOverrides(io, project, overrides, quiet);
  const renderer = new FrameRenderer(project);
  if (!quiet) {
    for (const w of renderer.compiled.warnings)
      io.stderr(`warning (layout) ${w.path}  ${w.message}\n`);
  }
  const total = renderer.totalFrames;
  if (frameNumber >= total) {
    throw usageError(`--frame must be between 0 and ${total - 1} (got ${frameNumber}).`);
  }
  const png = await renderer.png(frameNumber);
  const target = resolve(io.cwd, out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, png);
  if (!quiet) {
    io.stderr(
      `Wrote ${relative(io.cwd, target)}: frame ${frameNumber} of ${total}, ${renderer.width}x${renderer.height}\n`,
    );
  }
  return 0;
}
