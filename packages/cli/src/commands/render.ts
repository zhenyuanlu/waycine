import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import type { TimelineSegment } from 'waycine/node';
import {
  boolFlag,
  CliError,
  OUTPUT_OPTIONS,
  parseCommand,
  parseIntFlag,
  projectArg,
  readOutputOverrides,
  stringFlag,
  usageError,
} from '../args.js';
import { findFfmpeg } from '../ffmpeg.js';
import { createProgress, type Io } from '../io.js';
import { applyOverrides, loadProjectForRender } from '../project.js';
import { encodeRange, FrameRenderer, interruptedError, releaseFrameMemory } from '../render.js';

export const RENDER_HELP = `Usage: waycine render <project.json> -o <out.mp4> [options]
       waycine render <project.json> --segments -o <folder> [options]
       waycine render <project.json> --frames-dir <dir> [options]

Renders the project to an MP4 (H.264 through an external ffmpeg), to one MP4
per segment (--segments, or a project whose output.exportMode is "segments"),
or to a PNG sequence (--frames-dir, no ffmpeg needed). A failed or interrupted
encode never leaves a partial file and never touches an existing one.

Output:
  -o, --out <file>        MP4 to write; in segments mode, a folder for the clips
  --frames-dir <dir>      Also (or only) write every frame as frame-NNNNN.png
  --from <n>              First frame to render (default 0)
  --to <n>                Last frame to render, inclusive (default the last frame)

Format (override the project's output settings):
  --aspect <ratio>        16:9, 9:16, 1:1 or 4:5
  --short <px>            Short side: 720, 1080, 1440 or 2160 (needs a preset aspect)
  --size <WxH>            Exact size, even sides 320..4096 (not with --aspect/--short)
  --fps <rate>            23.976, 24, 25, 29.97, 30, 50, 59.94 or 60
  --ss <1|2>              Supersampling: render at 2x, then average 2x2 pixels
  --segments              One clip per segment, each starting and ending on its own
  --single                One seamless video (default unless the project says segments)
  --font <role=path>      Use a font file for a role: display=... or body=... (repeatable)

Encoding:
  --ffmpeg <path>         ffmpeg to use (default: WAYCINE_FFMPEG, then PATH)
  --crf <n>               x264 quality, 0..51, lower is better (default 16)
  -q, --quiet             Print nothing but errors
`;

const OPTIONS = {
  ...OUTPUT_OPTIONS,
  out: { type: 'string', short: 'o' },
  'frames-dir': { type: 'string' },
  from: { type: 'string' },
  to: { type: 'string' },
  ffmpeg: { type: 'string' },
  crf: { type: 'string' },
  quiet: { type: 'boolean', short: 'q' },
} as const;

/** File name of a segment clip: `01-overview.mp4`, `02-stop-01-boston.mp4`, `09-finale.mp4`. */
export function segmentFileName(
  seg: TimelineSegment,
  position: number,
  count: number,
  city: string,
): string {
  const pad = String(count).length < 2 ? 2 : String(count).length;
  const num = String(position + 1).padStart(pad, '0');
  if (seg.kind !== 'stop') return `${num}-${seg.kind}.mp4`;
  const slug = city
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const stop = String(seg.index + 1).padStart(2, '0');
  return `${num}-stop-${stop}${slug === '' ? '' : `-${slug}`}.mp4`;
}

/** File name of a PNG frame: `frame-00042.png`. */
export function frameFileName(frame: number, total: number): string {
  return `frame-${String(frame).padStart(Math.max(5, String(total - 1).length), '0')}.png`;
}

/**
 * The temporary sibling an MP4 is encoded to before it is renamed over
 * `target`: `.<name>.partial-<pid><ext>` in the same folder (so the rename
 * never crosses devices). The extension is kept (ffmpeg picks the container
 * from it); a name without one gets `.mp4`.
 */
export function partialPath(target: string, pid: number): string {
  const ext = extname(target);
  return join(
    dirname(target),
    `.${basename(target, ext)}.partial-${pid}${ext === '' ? '.mp4' : ext}`,
  );
}

/** Deletes a temporary file after a failure (best effort: the error that caused it matters more). */
function removeQuietly(file: string): void {
  try {
    rmSync(file, { force: true });
  } catch {
    // Still locked or not removable; the original error is reported instead.
  }
}

/** True when `path` exists and is not a folder. */
function isNonFolder(path: string): boolean {
  return existsSync(path) && !statSync(path).isDirectory();
}

/**
 * Checks the output paths before anything is compiled or written: in segments
 * mode `-o` is a folder (a `.mp4` name is a usage error, an existing file a
 * failure); in single mode `-o` must not be a folder; `--frames-dir` must not
 * be a file.
 */
function checkOutputs(
  io: Io,
  out: string | undefined,
  framesDir: string | undefined,
  segments: boolean,
): void {
  if (out !== undefined) {
    const target = resolve(io.cwd, out);
    if (segments) {
      if (/\.mp4$/i.test(out)) {
        throw usageError(
          'In segments mode -o names a folder for the clips (got a .mp4 file name); use --single for one video.',
        );
      }
      if (isNonFolder(target)) throw new CliError(`${out} exists and is not a folder.`);
    } else if (existsSync(target) && statSync(target).isDirectory()) {
      throw new CliError(
        `${out} is a folder; -o needs an MP4 file name (clips in a folder need --segments).`,
      );
    }
  }
  if (framesDir !== undefined && isNonFolder(resolve(io.cwd, framesDir))) {
    throw new CliError(`${framesDir} exists and is not a folder.`);
  }
}

/** `waycine render`. */
export async function renderCommand(io: Io, args: readonly string[]): Promise<number> {
  const { values, positionals } = parseCommand(args, OPTIONS);
  if (boolFlag(values, 'help')) {
    io.stdout(RENDER_HELP);
    return 0;
  }
  const file = projectArg('render', positionals);
  const out = stringFlag(values, 'out');
  const framesDir = stringFlag(values, 'frames-dir');
  if (out === undefined && framesDir === undefined) {
    throw usageError('needs -o <out.mp4> or --frames-dir <dir>.');
  }
  const quiet = boolFlag(values, 'quiet');
  const overrides = readOutputOverrides(values);
  const crfText = stringFlag(values, 'crf');
  const crf = crfText === undefined ? 16 : parseIntFlag('crf', crfText, 0, 51);
  const fromText = stringFlag(values, 'from');
  const toText = stringFlag(values, 'to');

  // Look ffmpeg up before the (slow) compile so a missing ffmpeg fails fast.
  const ffmpeg =
    out === undefined
      ? undefined
      : findFfmpeg({ flag: stringFlag(values, 'ffmpeg'), env: io.env, cwd: io.cwd });

  const { project } = loadProjectForRender(io, file, quiet);
  applyOverrides(io, project, overrides, quiet);
  const segmentsMode = project.output.exportMode === 'segments';
  checkOutputs(io, out, framesDir, segmentsMode);

  const renderer = new FrameRenderer(project);
  const total = renderer.totalFrames;
  const from = fromText === undefined ? 0 : parseIntFlag('from', fromText, 0, total - 1);
  const to = toText === undefined ? total - 1 : parseIntFlag('to', toText, from, total - 1);
  const count = to - from + 1;
  const { width, height } = renderer;
  const fps = renderer.compiled.fps;

  const framesPath = framesDir === undefined ? undefined : resolve(io.cwd, framesDir);
  if (framesPath !== undefined) mkdirSync(framesPath, { recursive: true });
  const writePng = async (frame: number, pixels?: Uint8ClampedArray): Promise<void> => {
    if (framesPath === undefined) return;
    const png = pixels === undefined ? await renderer.png(frame) : await renderer.encodePng(pixels);
    writeFileSync(join(framesPath, frameFileName(frame, total)), png);
  };

  if (!quiet) {
    const ss = renderer.supersample === 2 ? ', supersampled 2x' : '';
    const req = project.output.supersample === 2 && renderer.supersample === 1;
    io.stderr(
      `Rendering ${file}: frames ${from}..${to} of ${total}, ${width}x${height}, ` +
        `${fps.num}/${fps.den} fps, ${renderer.compiled.profile} profile, ` +
        `${project.output.exportMode} mode${ss}\n`,
    );
    if (req) io.stderr('Supersampling skipped: 2x would exceed 4096 x 4096 pixels.\n');
    for (const w of renderer.compiled.warnings)
      io.stderr(`warning (layout) ${w.path}  ${w.message}\n`);
  }

  // Ctrl+C / SIGTERM stop ffmpeg, remove the temporary file and exit with 130.
  const controller = new AbortController();
  const signal = controller.signal;
  const offInterrupt = io.onInterrupt?.(() => controller.abort());
  const t0 = performance.now();
  const progress = createProgress(io, 'render', count, quiet);
  const written: string[] = [];

  /** Encodes `a..b` to a temporary sibling of `target`, then renames it over `target`. */
  const encodeTo = async (
    target: string,
    a: number,
    b: number,
    onFrame: (done: number) => void,
  ): Promise<void> => {
    if (ffmpeg === undefined) return;
    const tmp = partialPath(target, process.pid);
    try {
      await encodeRange(
        renderer,
        { ffmpeg, out: tmp, from: a, to: b, crf, onFrame, signal },
        framesPath === undefined ? undefined : writePng,
      );
      renameSync(tmp, target);
    } catch (error) {
      removeQuietly(tmp);
      throw error;
    }
    written.push(target);
  };

  try {
    if (ffmpeg === undefined || out === undefined) {
      for (let f = from; f <= to; f++) {
        if (signal.aborted) throw interruptedError();
        await writePng(f);
        progress.tick(f - from + 1);
        await releaseFrameMemory();
      }
    } else if (!segmentsMode) {
      await encodeTo(resolve(io.cwd, out), from, to, (done) => progress.tick(done));
    } else {
      const dir = resolve(io.cwd, out);
      mkdirSync(dir, { recursive: true });
      const segs = renderer.segments;
      let done = 0;
      for (const [i, seg] of segs.entries()) {
        const a = Math.max(from, seg.start);
        const b = Math.min(to, seg.start + seg.n - 1);
        if (a > b) continue;
        const city = seg.kind === 'stop' ? (renderer.compiled.stops[seg.index]?.city ?? '') : '';
        const name = segmentFileName(seg, i, segs.length, city);
        await encodeTo(join(dir, name), a, b, (d) => progress.tick(done + d));
        done += b - a + 1;
      }
    }
  } finally {
    offInterrupt?.();
    progress.done();
  }

  if (!quiet) {
    const secs = (performance.now() - t0) / 1000;
    const speed = secs > 0 ? count / secs : 0;
    const duration = (count * fps.den) / fps.num;
    const shown = (p: string): string => relative(io.cwd, p) || '.';
    for (const w of written) io.stderr(`Wrote ${shown(w)}\n`);
    if (framesPath !== undefined) io.stderr(`Wrote ${count} PNG frames to ${shown(framesPath)}\n`);
    io.stderr(
      `${count} frames (${duration.toFixed(3)} s of video) in ${secs.toFixed(1)} s, ${speed.toFixed(1)} fps\n`,
    );
  }
  return 0;
}
