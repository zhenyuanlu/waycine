import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { type Canvas, createCanvas, loadImage } from '@napi-rs/canvas';
import type { Compiled, WaycineProject } from '../../src/core/index.js';
import { compile, drawScene, sceneAt } from '../../src/core/index.js';
import { createNodeBackend } from '../../src/node/index.js';
import { loadFixtureProject, loadPreset, loadSeason } from '../helpers/projects.js';

/**
 * Golden-frame helpers: the cases, a renderer (`@napi-rs/canvas`, bundled
 * fonts) and the comparator. Goldens live in `test/golden/png/` and are
 * regenerated with `npm run golden:update`, which runs the golden tests with
 * `WAYCINE_GOLDEN_UPDATE=1`: a PNG is (re)written only when its decoded
 * pixels changed, and `png/manifest.json` records the platform, architecture
 * and `@napi-rs/canvas` version that made them.
 *
 * Two comparison modes. On a machine that matches the manifest, renders are
 * byte-identical in practice, so the check is strict (`STRICT_MAX_ABS`: no
 * channel more than 2 levels off), which catches layout regressions of a
 * single Du. Elsewhere text rasterization differs between Skia builds and
 * platforms, so the comparison is tolerant (see `GOLDEN_TOLERANCE`); state
 * parity stays the primary fidelity gate there.
 */

/** Pass thresholds, in 8-bit levels. */
export const GOLDEN_TOLERANCE = {
  /** Mean absolute difference over all RGB channel values must stay below this. */
  meanAbs: 1.5,
  /** A pixel differs when any channel differs by more than this. */
  pixelLevel: 16,
  /** Share of differing pixels (0..1) must stay below this. */
  pixelShare: 0.005,
} as const;

/** Largest channel difference a strict comparison allows, in 8-bit levels. */
export const STRICT_MAX_ABS = 2;

/** True when the run regenerates the goldens instead of checking them. */
export const UPDATE = process.env.WAYCINE_GOLDEN_UPDATE === '1';

/** Committed goldens. */
export const PNG_DIR = fileURLToPath(new URL('./png/', import.meta.url));

/** Where the goldens were made. */
export interface GoldenManifest {
  /** `process.platform`. */
  platform: string;
  /** `process.arch`. */
  arch: string;
  /** `@napi-rs/canvas` version. */
  napiCanvas: string;
}

/** The manifest file next to the goldens. */
export const MANIFEST_FILE = `${PNG_DIR}manifest.json`;

/** This machine, in manifest form. */
export function currentMachine(): GoldenManifest {
  const require = createRequire(import.meta.url);
  const napi = require('@napi-rs/canvas/package.json') as { version: string };
  return { platform: process.platform, arch: process.arch, napiCanvas: napi.version };
}

/** The committed manifest, or null when there is none (or it cannot be read). */
export function readManifest(): GoldenManifest | null {
  try {
    return JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) as GoldenManifest;
  } catch {
    return null;
  }
}

/** Writes the manifest for this machine (update mode). */
export function writeManifest(): void {
  mkdirSync(PNG_DIR, { recursive: true });
  writeFileSync(MANIFEST_FILE, `${JSON.stringify(currentMachine(), null, 2)}\n`);
}

/** Comparison mode of this run: strict on the machine the manifest names, tolerant elsewhere. */
export function goldenMode(): 'strict' | 'tolerant' {
  const made = readManifest();
  const here = currentMachine();
  return made !== null &&
    made.platform === here.platform &&
    made.arch === here.arch &&
    made.napiCanvas === here.napiCanvas
    ? 'strict'
    : 'tolerant';
}

/** Actual and diff images of failing comparisons (ignored by git). */
export const OUT_DIR = fileURLToPath(new URL('../../node_modules/.tmp/golden/', import.meta.url));

/** One golden case: a project rendered at one size, at several timeline frames. */
export interface GoldenCase {
  /** File-name prefix: `<name>-f<frame>.png`. */
  name: string;
  /** Project to render. */
  project: () => WaycineProject;
  /** Output width in px. */
  width: number;
  /** Output height in px. */
  height: number;
  /** Layout profile the size must pick. */
  profile: 'landscape' | 'portrait' | 'square';
  /** Timeline frames to check (in the project's own export mode). */
  frames: (c: Compiled) => number[];
}

/** First frame of the segment `kind` / `index`, plus `offset`. */
function at(c: Compiled, kind: string, index: number, offset: number): number {
  const seg = c.timeline.segments.find((s) => s.kind === kind && s.index === index);
  if (seg === undefined) throw new Error(`no segment ${kind}[${index}]`);
  return seg.start + offset;
}

/** The middle hold frame of stop `index` (between its fly phase and its end). */
function midHold(c: Compiled, index: number): number {
  const seg = c.timeline.segments.find((s) => s.kind === 'stop' && s.index === index);
  if (seg === undefined) throw new Error(`no stop ${index}`);
  return seg.start + seg.nFly + Math.floor((seg.n - seg.nFly) / 2);
}

/** The reference season's checked frames (both 16:9 and 9:16), timeline indices of the single export. */
export const SEASON_FRAMES = [0, 55, 79, 95, 118, 128, 220, 404, 439] as const;

/** Every golden case. */
export const GOLDEN_CASES: readonly GoldenCase[] = [
  {
    name: 'season-16x9',
    project: () => loadSeason(),
    width: 960,
    height: 540,
    profile: 'landscape',
    frames: () => [...SEASON_FRAMES],
  },
  {
    name: 'season-9x16',
    project: () => loadSeason(),
    width: 540,
    height: 960,
    profile: 'portrait',
    frames: () => [...SEASON_FRAMES],
  },
  {
    // The description line (opt-in): under the subtitle at frame 0, under the stats at 404.
    name: 'season-description-16x9',
    project: () => {
      const p = loadSeason();
      p.text.description = 'Demo Harbor Dragon Boat Team - summer racing tour';
      p.text.descriptionAt = 'introAndFinale';
      return p;
    },
    width: 960,
    height: 540,
    profile: 'landscape',
    frames: () => [0, 404],
  },
  {
    name: 'europe-9x16',
    project: () => loadPreset('europe-trip'),
    width: 540,
    height: 960,
    profile: 'portrait',
    // 0 (title not in yet), 40 (title fully in), a stop-4 hold, the last frame.
    frames: (c) => [0, at(c, 'overview', 0, 40), midHold(c, 3), c.timeline.totalFrames - 1],
  },
  {
    name: 'long-names-16x9',
    project: () => loadFixtureProject('long-names'),
    width: 960,
    height: 540,
    profile: 'landscape',
    // Card holds: a name that cannot fit (reported) and one that shrinks to fit the right margin.
    frames: (c) => [midHold(c, 0), midHold(c, 1)],
  },
  {
    name: 'round-the-world-16x9',
    project: () => loadFixtureProject('round-the-world'),
    width: 960,
    height: 540,
    profile: 'landscape',
    // The last stop (London again, a full turn west) on its own pin and card; the finale.
    frames: (c) => [midHold(c, 6), c.timeline.totalFrames - 1],
  },
  {
    name: 'equator-1x1',
    project: () => loadFixtureProject('equator'),
    width: 720,
    height: 720,
    profile: 'square',
    // Finale: the stats wrap into two rows and the camera moves the pins clear of them.
    frames: (c) => [c.timeline.totalFrames - 1],
  },
  {
    name: 'pacific-1x1',
    project: () => {
      const p = loadFixtureProject('pacific');
      p.output.aspect = '1:1';
      return p;
    },
    width: 720,
    height: 720,
    profile: 'square',
    frames: (c) => [at(c, 'overview', 0, 60), midHold(c, 1), c.timeline.totalFrames - 1],
  },
  {
    name: 'single-stop-1x1',
    project: () => loadFixtureProject('single-stop'),
    width: 720,
    height: 720,
    profile: 'square',
    frames: (c) => [at(c, 'overview', 0, 40), midHold(c, 0), c.timeline.totalFrames - 1],
  },
];

const backend = createNodeBackend();

/**
 * Compiles a case at its size (the project's own export mode), optionally
 * after editing the project (sensitivity checks).
 */
export function compileCase(gc: GoldenCase, edit?: (project: WaycineProject) => void): Compiled {
  const project = gc.project();
  edit?.(project);
  return compile(project, backend, { width: gc.width, height: gc.height });
}

/** RGBA pixels of one frame. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Renders one timeline frame; returns the pixels and the canvas (for PNG encoding). */
export function renderGolden(c: Compiled, frame: number): { pixels: Pixels; canvas: Canvas } {
  const surface = backend.createSurface(c.width, c.height);
  const ctx = surface.getContext2d();
  drawScene(ctx, c, sceneAt(c, frame), backend);
  const pixels = {
    width: c.width,
    height: c.height,
    data: ctx.getImageData(0, 0, c.width, c.height).data,
  };
  return { pixels, canvas: surface.source as Canvas };
}

/** Decodes a PNG into RGBA pixels. */
export async function decodePng(bytes: Uint8Array): Promise<Pixels> {
  const img = await loadImage(Buffer.from(bytes));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return {
    width: img.width,
    height: img.height,
    data: ctx.getImageData(0, 0, img.width, img.height).data,
  };
}

/** Result of comparing two frames. */
export interface Comparison {
  /** Mean absolute difference over all RGB channel values, in levels. */
  meanAbs: number;
  /** Pixels whose largest channel difference exceeds `GOLDEN_TOLERANCE.pixelLevel`. */
  differing: number;
  /** `differing` / pixel count. */
  share: number;
  /** Largest channel difference seen. */
  maxAbs: number;
  /** True when both thresholds hold (and the sizes match). */
  pass: boolean;
}

/**
 * Compares two RGBA frames of the same size (alpha ignored): passes when the
 * mean absolute RGB difference is below 1.5 levels and fewer than 0.5% of the
 * pixels differ by more than 16 levels in some channel.
 */
export function comparePixels(a: Pixels, b: Pixels): Comparison {
  if (a.width !== b.width || a.height !== b.height) {
    return { meanAbs: 255, differing: a.width * a.height, share: 1, maxAbs: 255, pass: false };
  }
  const n = a.width * a.height;
  let sum = 0;
  let differing = 0;
  let maxAbs = 0;
  for (let i = 0; i < n * 4; i += 4) {
    const dr = Math.abs((a.data[i] as number) - (b.data[i] as number));
    const dg = Math.abs((a.data[i + 1] as number) - (b.data[i + 1] as number));
    const db = Math.abs((a.data[i + 2] as number) - (b.data[i + 2] as number));
    sum += dr + dg + db;
    const m = Math.max(dr, dg, db);
    if (m > GOLDEN_TOLERANCE.pixelLevel) differing++;
    if (m > maxAbs) maxAbs = m;
  }
  const meanAbs = sum / (3 * n);
  const share = differing / n;
  return {
    meanAbs,
    differing,
    share,
    maxAbs,
    pass: meanAbs < GOLDEN_TOLERANCE.meanAbs && share < GOLDEN_TOLERANCE.pixelShare,
  };
}

/** A diff image: red where the golden is brighter, cyan where the render is, x4 gain. */
function diffPng(golden: Pixels, actual: Pixels): Buffer {
  const canvas = createCanvas(golden.width, golden.height);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(golden.width, golden.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const la =
      ((golden.data[i] as number) +
        (golden.data[i + 1] as number) +
        (golden.data[i + 2] as number)) /
      3;
    const lb =
      ((actual.data[i] as number) +
        (actual.data[i + 1] as number) +
        (actual.data[i + 2] as number)) /
      3;
    const v = Math.min(255, Math.abs(la - lb) * 4);
    img.data[i] = la >= lb ? v : 0;
    img.data[i + 1] = la >= lb ? 0 : v;
    img.data[i + 2] = la >= lb ? 0 : v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toBuffer('image/png');
}

/** Outcome of `checkGolden`. */
export interface GoldenResult {
  /** Golden file name. */
  file: string;
  /** Comparison against the committed golden (after an update: against the new file). */
  comparison: Comparison;
  /** In update mode: whether the file was written. */
  written: boolean;
  /** Human-readable summary for assertion messages. */
  message: string;
}

/**
 * Checks one rendered frame against `png/<file>`. Update mode writes the PNG
 * when it is missing or its decoded pixels differ (a new zlib or PNG encoder
 * alone rewrites nothing). Check mode fails on a missing file and, on a failed
 * comparison, writes `<file>` (actual) and `<name>.diff.png` to `OUT_DIR`.
 * The pass rule follows `goldenMode()`: strict (max channel difference <=
 * `STRICT_MAX_ABS`) on the machine that made the goldens, tolerant elsewhere.
 */
export async function checkGolden(
  file: string,
  canvas: Canvas,
  pixels: Pixels,
): Promise<GoldenResult> {
  const path = `${PNG_DIR}${file}`;
  const bytes = canvas.toBuffer('image/png');
  let written = false;
  if (UPDATE) {
    const same =
      existsSync(path) && comparePixels(await decodePng(readFileSync(path)), pixels).maxAbs === 0;
    if (!same) {
      mkdirSync(PNG_DIR, { recursive: true });
      writeFileSync(path, bytes);
      written = true;
    }
  } else if (!existsSync(path)) {
    const none: Comparison = { meanAbs: 255, differing: 0, share: 1, maxAbs: 255, pass: false };
    return {
      file,
      comparison: none,
      written,
      message: `${file}: no golden; run npm run golden:update`,
    };
  }
  const golden = await decodePng(readFileSync(path));
  const mode = goldenMode();
  const compared = comparePixels(golden, pixels);
  const comparison =
    mode === 'strict' ? { ...compared, pass: compared.maxAbs <= STRICT_MAX_ABS } : compared;
  let message =
    mode === 'strict'
      ? `${file} (strict): max channel difference ${comparison.maxAbs} (<= ${STRICT_MAX_ABS}), mean abs ${comparison.meanAbs.toFixed(3)}`
      : `${file} (tolerant): mean abs ${comparison.meanAbs.toFixed(3)} (< ${GOLDEN_TOLERANCE.meanAbs}), ${(comparison.share * 100).toFixed(3)}% of pixels > ${GOLDEN_TOLERANCE.pixelLevel} (< ${GOLDEN_TOLERANCE.pixelShare * 100}%), max ${comparison.maxAbs}`;
  if (!comparison.pass) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(`${OUT_DIR}${file}`, bytes);
    writeFileSync(`${OUT_DIR}${file.replace(/\.png$/, '.diff.png')}`, diffPng(golden, pixels));
    message += `; actual and diff written to ${OUT_DIR}`;
  }
  return { file, comparison, written, message };
}

/** `<case>-f<frame, 3 digits>.png`. */
export function goldenFile(gc: GoldenCase, frame: number): string {
  return `${gc.name}-f${String(frame).padStart(3, '0')}.png`;
}
