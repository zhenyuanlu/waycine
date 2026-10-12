import type { Aspect, LayoutChoice, OutputSettings, ProfileId, Quality } from './types.js';

/** Output frame size in px. */
export interface FrameSize {
  /** Width in px (even). */
  width: number;
  /** Height in px (even). */
  height: number;
}

/** An exact frame rate `num / den` frames per second (29.97 is 30000/1001). */
export interface FpsRational {
  /** Numerator. */
  num: number;
  /** Denominator (1 or 1001 for the supported rates). */
  den: number;
}

/** Smallest output side in px. */
export const MIN_OUTPUT_SIDE = 320;
/** Largest output side in px. */
export const MAX_OUTPUT_SIDE = 4096;

const RATIOS: Record<Exclude<Aspect, 'custom'>, readonly [number, number]> = {
  '16:9': [16, 9],
  '9:16': [9, 16],
  '1:1': [1, 1],
  '4:5': [4, 5],
};

/** Bits per pixel per frame for each quality preset. */
export const QUALITY_BPP: Readonly<Record<Quality, number>> = {
  standard: 0.13,
  high: 0.2,
  max: 0.32,
};

/** Rounds to the nearest even integer and clamps to [320, 4096]. */
export function evenOutputSide(px: number): number {
  const even = 2 * Math.round(px / 2);
  return Math.min(MAX_OUTPUT_SIDE, Math.max(MIN_OUTPUT_SIDE, even));
}

/** The export frame size for `output` (custom sizes default to 1920x1080 when unset). */
export function outputSize(output: OutputSettings): FrameSize {
  if (output.aspect === 'custom') {
    return {
      width: evenOutputSide(output.width ?? 1920),
      height: evenOutputSide(output.height ?? 1080),
    };
  }
  const [a, b] = RATIOS[output.aspect];
  const short = output.shortSide;
  return a >= b
    ? { width: evenOutputSide((short * a) / b), height: evenOutputSide(short) }
    : { width: evenOutputSide(short), height: evenOutputSide((short * b) / a) };
}

/**
 * Exact rational for a frame rate: NTSC rates (23.976, 29.97, 47.952, 59.94,
 * 119.88) become `n * 1000 / 1001`; integers become `n / 1`; anything else
 * `round(fps * 1000) / 1000`.
 */
export function fpsRational(fps: number): FpsRational {
  if (Number.isInteger(fps)) {
    return { num: fps, den: 1 };
  }
  const ntsc = Math.round((fps * 1001) / 1000);
  if (Math.abs((ntsc * 1000) / 1001 - fps) < 0.0005) {
    return { num: ntsc * 1000, den: 1001 };
  }
  return { num: Math.round(fps * 1000), den: 1000 };
}

/** Design-unit scale `S = min(W, H) / 1080` (output px per Du). */
export function duScale(width: number, height: number): number {
  return Math.min(width, height) / 1080;
}

/** Layout profile for a frame size: explicit choice, or by aspect (> 1.2 landscape, < 0.83 portrait, else square). */
export function pickProfile(width: number, height: number, choice: LayoutChoice): ProfileId {
  if (choice !== 'auto') {
    return choice;
  }
  const ratio = width / height;
  if (ratio > 1.2) {
    return 'landscape';
  }
  return ratio < 0.83 ? 'portrait' : 'square';
}

/** Target video bitrate in bits per second: `bitrateMbps` when > 0, else quality bpp x W x H x fps. */
export function targetBitrate(output: OutputSettings, size: FrameSize, fps: FpsRational): number {
  if (output.bitrateMbps > 0) {
    return Math.round(output.bitrateMbps * 1e6);
  }
  return Math.round(QUALITY_BPP[output.quality] * size.width * size.height * (fps.num / fps.den));
}
