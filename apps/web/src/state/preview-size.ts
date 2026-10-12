import type { FrameSize } from 'waycine';

/**
 * Longest preview edge in device pixels while the preview may be sharper
 * than the video: twice the video's long edge, never more than 2560 (larger
 * bitmaps stutter at the zoom-throughs on a 4K screen).
 */
const SHARP_MAX_EDGE = 2560;
/** Otherwise: the video's own size, at most 1920 on the long side and 1080 on the short. */
const PLAIN_MAX_LONG = 1920;
const PLAIN_MAX_SHORT = 1080;

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

/**
 * Preview frame size: as many device pixels as the picture's box shows
 * (rounded to the box, so it is pixel-exact on screen), in the output's
 * aspect. With `sharp` it may exceed the video up to twice its long edge or
 * 2560 px; without, it stays within the video's size and 1920 x 1080.
 */
export function fitPreview(out: FrameSize, cssWidth: number, dpr: number, sharp = true): FrameSize {
  const g = gcd(out.width, out.height);
  const unitW = out.width / g;
  const unitH = out.height / g;
  const long = Math.max(out.width, out.height);
  const short = Math.min(out.width, out.height);
  const scale = sharp
    ? Math.min(2 * long, SHARP_MAX_EDGE) / long
    : Math.min(1, PLAIN_MAX_LONG / long, PLAIN_MAX_SHORT / short);
  const width = Math.max(unitW, Math.round(Math.min(cssWidth * dpr, out.width * scale)));
  const height = Math.max(unitH, Math.round((width * unitH) / unitW));
  return { width, height };
}
