/**
 * The external ffmpeg: lookup (`--ffmpeg` > `WAYCINE_FFMPEG` > PATH) and an
 * H.264 encoder fed raw RGBA frames on standard input. ffmpeg is never
 * bundled; it is spawned with an argument array (no shell).
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, statSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import type { FpsRational } from 'waycine/node';
import { CliError } from './args.js';

/** Where to look for ffmpeg. */
export interface FfmpegLookup {
  /** `--ffmpeg` value, if given. */
  flag?: string;
  /** Environment (`WAYCINE_FFMPEG`, `PATH`). */
  env: Readonly<Record<string, string | undefined>>;
  /** Directory relative paths resolve against. */
  cwd: string;
  /** Host platform (default `process.platform`). */
  platform?: NodeJS.Platform;
}

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Suffixes to try, in order: on Windows `.exe`, then `.com`, then the name as
 * given (last, so a POSIX shim called `ffmpeg` next to `ffmpeg.exe`, as in
 * node_modules/.bin or MSYS, never wins). `.cmd` and `.bat` are left out:
 * `spawn` cannot run them without a shell, which the CLI never uses.
 * Elsewhere only the name as given.
 */
function exeSuffixes(platform: NodeJS.Platform): readonly string[] {
  return platform === 'win32' ? ['.exe', '.com', ''] : [''];
}

/** The first of `path` + each suffix that is a file. */
function executableAt(path: string, platform: NodeJS.Platform): string | undefined {
  return exeSuffixes(platform)
    .map((ext) => path + ext)
    .find(isFile);
}

/** First executable called `name` on PATH (`.exe` / `.com` first on Windows), or undefined. */
export function searchPath(
  name: string,
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  // Windows environments spell PATH in any case.
  const pathVar =
    env.PATH ?? Object.entries(env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? '';
  const sep = platform === 'win32' ? ';' : delimiter;
  for (const dir of pathVar.split(sep)) {
    const clean = dir.trim().replace(/^"(.*)"$/, '$1');
    if (clean === '') continue;
    const found = executableAt(join(clean, name), platform);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Help text shown when ffmpeg cannot be found. */
export const FFMPEG_MISSING_HELP =
  'Waycine does not bundle ffmpeg. Install it (https://ffmpeg.org/download.html) and put it on PATH, ' +
  'set WAYCINE_FFMPEG to its path, or pass --ffmpeg <path>. ' +
  'To render without ffmpeg, write PNG frames with --frames-dir <dir>.';

/**
 * Path of the ffmpeg to use: `--ffmpeg` > `WAYCINE_FFMPEG` > PATH. A value
 * with a slash or backslash is a path (relative to `cwd`); a bare name such as
 * `ffmpeg` is only looked up on PATH, never in the working directory. Throws a
 * `CliError` when none is found.
 */
export function findFfmpeg(lookup: FfmpegLookup): string {
  const platform = lookup.platform ?? process.platform;
  const explicit: [string, string | undefined][] = [
    ['--ffmpeg', lookup.flag],
    ['WAYCINE_FFMPEG', lookup.env.WAYCINE_FFMPEG],
  ];
  for (const [source, value] of explicit) {
    if (value === undefined || value.trim() === '') continue;
    const name = value.trim();
    const found = /[\\/]/.test(name)
      ? executableAt(resolve(lookup.cwd, name), platform)
      : searchPath(name, lookup.env, platform);
    if (found !== undefined) return found;
    throw new CliError(`ffmpeg not found at ${value} (from ${source}). ${FFMPEG_MISSING_HELP}`);
  }
  const found = searchPath('ffmpeg', lookup.env, platform);
  if (found === undefined) {
    throw new CliError(`ffmpeg was not found on PATH. ${FFMPEG_MISSING_HELP}`);
  }
  return found;
}

/** Encoder settings. */
export interface EncodeSettings {
  /** Frame width in px (even). */
  width: number;
  /** Frame height in px (even). */
  height: number;
  /** Exact frame rate. */
  fps: FpsRational;
  /** x264 constant rate factor, 0..51 (default 16). */
  crf: number;
  /** Output file path. */
  out: string;
}

/**
 * RGB -> BT.709 limited-range yuv420p. `setparams` stamps the colour
 * primaries and transfer on the frames too: recent ffmpeg builds take the
 * stream's tags from the filtered frames, so the `-color_*` output options
 * alone left primaries and transfer "unknown" (the matrix came from `scale`).
 */
export const VIDEO_FILTER =
  'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,' +
  'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv';

/**
 * ffmpeg arguments: raw RGBA on stdin -> H.264 High, yuv420p, BT.709 limited
 * range with explicit colour tags, keyframe every 2 s, 3 B-frames, fast start,
 * no audio. Mirrors the original renderer's final mux.
 */
export function encoderArgs(s: EncodeSettings): string[] {
  const gop = Math.max(1, Math.round((2 * s.fps.num) / s.fps.den));
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-s',
    `${s.width}x${s.height}`,
    '-r',
    `${s.fps.num}/${s.fps.den}`,
    '-i',
    '-',
    '-vf',
    VIDEO_FILTER,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    String(s.crf),
    '-profile:v',
    'high',
    '-g',
    String(gop),
    '-bf',
    '3',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-colorspace',
    'bt709',
    '-color_range',
    'tv',
    '-movflags',
    '+faststart',
    '-an',
    s.out,
  ];
}

/** A running ffmpeg encode. */
export interface Encoder {
  /** Writes one RGBA frame (width x height x 4 bytes); resolves once ffmpeg has taken it. */
  write(frame: Uint8Array | Uint8ClampedArray): Promise<void>;
  /** Closes stdin and waits for ffmpeg; rejects when it fails. */
  finish(): Promise<void>;
  /** Kills ffmpeg (after an error or a cancel) and waits for it to exit. */
  abort(): Promise<void>;
}

/** Keeps the last `max` characters of ffmpeg's standard error for error messages. */
function stderrTail(child: ChildProcess, max = 2000): () => string {
  let tail = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    tail = (tail + chunk).slice(-max);
  });
  return () => tail.trim();
}

/** Starts ffmpeg with `encoderArgs(settings)`. */
export function startEncoder(ffmpegPath: string, settings: EncodeSettings): Encoder {
  const frameBytes = settings.width * settings.height * 4;
  const child = spawn(ffmpegPath, encoderArgs(settings), {
    stdio: ['pipe', 'ignore', 'pipe'],
    windowsHide: true,
  });
  const tail = stderrTail(child);
  let failure: Error | undefined;
  const exited = new Promise<number | null>((resolveExit) => {
    child.on('error', (error) => {
      failure ??= new CliError(`Could not start ffmpeg (${ffmpegPath}): ${error.message}`);
      resolveExit(null);
    });
    child.on('close', (code) => resolveExit(code));
  });
  const stdin = child.stdin;
  if (stdin === null) throw new CliError('ffmpeg has no standard input.');
  // EPIPE when ffmpeg dies early; reported through `failure` and the exit code instead.
  stdin.on('error', (error) => {
    failure ??= error;
  });

  const failed = async (): Promise<never> => {
    const code = await exited;
    const detail = tail();
    throw failure instanceof CliError
      ? failure
      : new CliError(
          `ffmpeg stopped unexpectedly (exit code ${code ?? 'none'})${detail ? `:\n${detail}` : '.'}`,
        );
  };

  return {
    async write(frame: Uint8Array | Uint8ClampedArray): Promise<void> {
      if (frame.byteLength !== frameBytes) {
        throw new Error(`frame has ${frame.byteLength} bytes, expected ${frameBytes}`);
      }
      if (failure !== undefined || child.exitCode !== null) return failed();
      const buf = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
      if (!stdin.write(buf)) {
        const ok = await Promise.race([
          once(stdin, 'drain').then(
            () => true,
            () => false,
          ),
          exited.then(() => false),
        ]);
        if (!ok) return failed();
      }
    },
    async finish(): Promise<void> {
      stdin.end();
      const code = await exited;
      if (code !== 0 || failure !== undefined) return failed();
    },
    async abort(): Promise<void> {
      if (child.exitCode === null && !child.killed) child.kill();
      await exited;
    },
  };
}
