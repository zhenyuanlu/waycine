/**
 * Pure helpers for the export dialog: the size choices, bitrates, the file
 * size estimate and the pieces of the summary line. No DOM, no engine
 * rendering, so they are unit-tested in Node.
 */
import {
  evenOutputSide,
  type FpsRational,
  type FrameSize,
  MAX_OUTPUT_SIDE,
  type OutputSettings,
  outputSize,
  type ProfileId,
  pickProfile,
  type Quality,
  SHORT_SIDES,
  targetBitrate,
} from 'waycine';

/** One resolution the dialog offers. */
export interface SizeOption extends FrameSize {
  /** The shorter side in px (the "1080" of 1080p). */
  shortSide: number;
}

/**
 * The export sizes for `output`: 720p, 1080p, 1440p and 2160p at the
 * project's aspect. A custom size is scaled to each short side (both sides
 * even; sizes whose long side would pass 4096 px are left out) and is offered
 * itself when its short side is not one of those. Sorted by short side.
 */
export function sizeOptions(output: OutputSettings): SizeOption[] {
  const own = outputSize(output);
  const ownShort = Math.min(own.width, own.height);
  const options: SizeOption[] = [];
  for (const short of SHORT_SIDES) {
    if (output.aspect !== 'custom') {
      const size = outputSize({ ...output, shortSide: short });
      options.push({ ...size, shortSide: short });
      continue;
    }
    const scale = short / ownShort;
    const width = own.width * scale;
    const height = own.height * scale;
    if (Math.max(width, height) > MAX_OUTPUT_SIDE) {
      continue;
    }
    options.push({
      width: evenOutputSide(width),
      height: evenOutputSide(height),
      shortSide: short,
    });
  }
  if (!options.some((o) => o.width === own.width && o.height === own.height)) {
    options.push({ ...own, shortSide: ownShort });
    options.sort((a, b) => a.shortSide - b.shortSide);
  }
  return options;
}

/** Index of the option matching the project's own output size (0 if none does). */
export function projectSizeIndex(options: readonly SizeOption[], output: OutputSettings): number {
  const own = outputSize(output);
  const index = options.findIndex((o) => o.width === own.width && o.height === own.height);
  return Math.max(0, index);
}

/** Index of the 720p option, or -1. */
export function index720(options: readonly SizeOption[]): number {
  return options.findIndex((o) => o.shortSide === 720);
}

/** The project's explicit bitrate in Mbps when it overrides the quality presets, else null. */
export function fixedBitrateMbps(output: OutputSettings): number | null {
  return output.bitrateMbps > 0 ? output.bitrateMbps : null;
}

/** Target bitrate in bits per second for `size` at `quality` (the project's explicit bitrate wins). */
export function bitrateFor(
  output: OutputSettings,
  size: FrameSize,
  fps: FpsRational,
  quality: Quality,
): number {
  return Math.max(1, targetBitrate({ ...output, quality }, size, fps));
}

/** Video length in seconds for `frames` at `fps`. */
export function durationSec(frames: number, fps: FpsRational): number {
  return (frames * fps.den) / fps.num;
}

/** Estimated file size in bytes: bitrate x duration / 8 (container overhead is negligible). */
export function estimateBytes(bitrate: number, frames: number, fps: FpsRational): number {
  return Math.round((bitrate * durationSec(frames, fps)) / 8);
}

/** A size estimate for the summary: `850 KB`, `4.2 MB`, `23 MB`, `1.4 GB` (decimal units). */
export function formatEstimate(bytes: number): string {
  if (bytes >= 1e9) {
    return `${(bytes / 1e9).toFixed(1)} GB`;
  }
  if (bytes >= 10e6) {
    return `${Math.round(bytes / 1e6)} MB`;
  }
  if (bytes >= 1e6) {
    return `${(bytes / 1e6).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

/** A frame rate as people write it: `29.97`, `30`, `23.976`. */
export function formatFps(fps: number): string {
  return String(Math.round(fps * 1000) / 1000);
}

/** Named aspects a size may reduce to. */
const NAMED_ASPECTS: readonly [number, number][] = [
  [16, 9],
  [9, 16],
  [1, 1],
  [4, 5],
];

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

/**
 * The named aspect a size has exactly, as `[16, 9]`, else null (a custom
 * 540 x 960 is `[9, 16]`). The summary line and the file name both use it,
 * so they cannot disagree about the aspect.
 */
export function namedAspect(width: number, height: number): readonly [number, number] | null {
  const g = gcd(width, height);
  return NAMED_ASPECTS.find(([w, h]) => w === width / g && h === height / g) ?? null;
}

/** `16:9`, `9:16`, `1:1` or `4:5` when the size has that aspect exactly, else null. */
export function aspectLabel(width: number, height: number): string | null {
  const named = namedAspect(width, height);
  return named === null ? null : `${named[0]}:${named[1]}`;
}

/** The layout profile the engine uses for this size. */
export function profileOf(output: OutputSettings, size: FrameSize): ProfileId {
  return pickProfile(size.width, size.height, output.layout);
}

/** How many times faster than real time an export ran (`1.5` = 1.5x). */
export function realtimeFactor(frames: number, fps: FpsRational, elapsedMs: number): number {
  return elapsedMs > 0 ? (durationSec(frames, fps) * 1000) / elapsedMs : 0;
}

/** Progress in whole tens of percent (0, 10, ... 100), for the screen-reader announcements. */
export function percentStep(frame: number, total: number): number {
  return total > 0 ? Math.min(100, Math.floor((frame / total) * 10) * 10) : 0;
}
