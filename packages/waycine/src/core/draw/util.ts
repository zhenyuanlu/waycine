import type { Ctx2D, SmoothingQualityValue } from '../ctx.js';
import { ease } from '../math/easing.js';
import { screenX, screenY } from '../math/mercator.js';
import type { Cam, Compiled } from '../scene-types.js';

/**
 * Interpolation quality of the engine's upscales: the glow layer (1 mask px =
 * 4 Du) and the half-resolution zoom-through blur. `'medium'` instead of
 * `'high'` (cubic in Skia) saves about 10 ms of raster per 1080p frame with
 * `@napi-rs/canvas`; the glow stays within 4 levels of the original (mean
 * 0.40 against 0.34 on the parity cross-sections).
 */
export const UPSCALE_SMOOTHING: SmoothingQualityValue = 'medium';

/** A screen point in output px. */
export interface Pt {
  x: number;
  y: number;
}

/** Clamps `v` to [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The project's fade easing (fades, card slide, ring growth, stats items); input clamped to [0, 1]. */
export function fade(c: Compiled, u: number): number {
  return ease(c.project.camera.fadeEasing, u);
}

/** The original's `to_screen`, without its supersampling factor: `(W/2 + (lon - cx) z, H/2 - (y - cy) z)` in output px. */
export function toScreen(c: Compiled, lon: number, y: number, cam: Cam): Pt {
  return { x: screenX(lon, cam, c.width), y: screenY(y, cam, c.height) };
}

/** Screen position of stop `i`'s pin (merged duplicates use the owner's location). */
export function pinPoint(c: Compiled, i: number, cam: Cam): Pt {
  const own = c.stops[i];
  const stop = own === undefined ? undefined : (c.stops[own.pinOf] ?? own);
  return stop === undefined ? { x: 0, y: 0 } : toScreen(c, stop.lon, stop.y, cam);
}

/** `[r, g, b]` of a `#RRGGBB` colour (0..255); unparsable input gives black. */
export function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (m === null) return [0, 0, 0];
  return [
    Number.parseInt(m[1] as string, 16),
    Number.parseInt(m[2] as string, 16),
    Number.parseInt(m[3] as string, 16),
  ];
}

/** Adds a full circle sub-path (clockwise from angle 0). */
export function circlePath(ctx: Ctx2D, x: number, y: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Fills a disc of radius `r` px with the current fill style. */
export function fillCircle(ctx: Ctx2D, x: number, y: number, r: number): void {
  if (!(r > 0)) return;
  ctx.beginPath();
  circlePath(ctx, x, y, r);
  ctx.fill();
}

/**
 * Strokes a PIL-style ellipse outline: PIL grows the outline inward from the
 * bounding radius `r`, so the stroke of width `w` is centred on `r - w/2`.
 */
export function strokeRingInward(ctx: Ctx2D, x: number, y: number, r: number, w: number): void {
  const w2 = Math.min(w, r);
  const rc = r - w2 / 2;
  if (!(rc > 0) || !(w2 > 0)) return;
  ctx.lineWidth = w2;
  ctx.beginPath();
  circlePath(ctx, x, y, rc);
  ctx.stroke();
}

/** Strokes one straight segment with the current stroke style and width. */
export function strokeLine(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/**
 * Fills the box (x0, y0)-(x1, y1) with the current fill style at `alpha`, with
 * a soft edge `feather` px wide around it: `steps` nested rectangles whose
 * alphas compound to `alpha` over the box (n layers of alpha a leave
 * `(1 - a)^n` of what is under them). Leaves `globalAlpha` at the layer alpha.
 */
export function fillSoftRect(
  ctx: Ctx2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  feather: number,
  steps: number,
  alpha: number,
): void {
  const n = Math.max(1, Math.round(steps));
  const a = clamp(alpha, 0, 1);
  if (!(a > 0) || !(x1 > x0) || !(y1 > y0)) return;
  ctx.globalAlpha = 1 - (1 - a) ** (1 / n);
  for (let k = 1; k <= n; k++) {
    const out = feather * (1 - k / n);
    ctx.fillRect(x0 - out, y0 - out, x1 - x0 + 2 * out, y1 - y0 + 2 * out);
  }
}

/** Typed `c.cache` access: returns the entry for `key`, creating it with `make` when absent. */
export function cached<T>(c: Compiled, key: string, make: () => T): T {
  if (c.cache.has(key)) return c.cache.get(key) as T;
  const v = make();
  c.cache.set(key, v);
  return v;
}
