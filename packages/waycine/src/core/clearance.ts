import type { Ctx2D } from './ctx.js';
import { pinLabelLayout } from './draw/pin-labels.js';
import { statsLayout } from './draw/stats.js';
import { type FontRole, fontPx, textWidth, trackedWidth } from './draw/text.js';
import { toScreen } from './draw/util.js';
import type { Cam, Compiled } from './scene-types.js';

/**
 * Overlay clearance (new; the original has no such rule, and it stays inactive
 * for the season in every profile): the overview title block (title, subtitle,
 * description) and the finale stats (plus the finale description) sit at
 * fixed places on the frame, while the fitted map content (pins and pin
 * labels) goes wherever the route is. A tall route (Europe at 16:9, an
 * equatorial route at 1:1) can put a pin or its label under them. At compile
 * time the camera is moved down until the content clears the overlay, and
 * zoomed out in small steps when that pushes the content past the bottom of
 * the safe area.
 */

/** An axis-aligned box in output px. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Gap kept between an overlay and the map content, in Du. */
export const CLEAR_GAP_DU = 16;
/** Zoom-out step (fraction of the camera zoom) and the number of steps tried (down to 60%). */
const ZOOM_STEP = 0.04;
const ZOOM_STEPS = 10;
/** Downward moves tried per zoom level before giving up on it. */
const MAX_SHIFTS = 16;

/** A text's box: from its anchor y (top of the ascent line) down to its baseline. */
function textBox(
  c: Compiled,
  role: FontRole,
  x: number,
  y: number,
  width: number,
  sizeDu: number,
): Box {
  return { x0: x, y0: y, x1: x + width, y1: y + c.fonts.anchorEm[role] * fontPx(c, role, sizeDu) };
}

/** Pins (core plus halo), pin labels and medal dots of every pin, seen from `cam`. */
export function contentBoxes(ctx: Ctx2D, c: Compiled, cam: Cam): Box[] {
  const pins = c.project.pins;
  const L = pins.label;
  const S = c.S;
  const r = (pins.radius + pins.haloPad) * S;
  const mr = L.medalR * S;
  const out: Box[] = [];
  for (const stop of c.stops) {
    if (stop.pinOf !== stop.index) continue;
    const p = toScreen(c, stop.lon, stop.y, cam);
    out.push({ x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r });
    if (!L.show) continue;
    const g = pinLabelLayout(ctx, c, stop.index, p.x, p.y);
    if (g === null) continue;
    out.push(textBox(c, 'display', g.cityX, g.cityY, g.cityW, L.citySize));
    if (stop.pinDate !== '') {
      out.push(textBox(c, 'body', g.dateX, g.dateY, g.dateW, L.dateSize));
    }
    for (const d of g.dots) out.push({ x0: d.x - mr, y0: d.y - mr, x1: d.x + mr, y1: d.y + mr });
  }
  return out;
}

/** The finale stats (numbers and labels, fully shown); none when the finale or the stats are off. */
export function statsBoxes(ctx: Ctx2D, c: Compiled): Box[] {
  const P = c.project.stats;
  const L = c.layout.stats;
  if (!P.show || !c.project.timing.finale.enabled) return [];
  return statsLayout(ctx, c, 1).flatMap((it) => [
    textBox(
      c,
      'display',
      it.x,
      it.y,
      textWidth(ctx, c, it.value, 'display', L.numberSize),
      L.numberSize,
    ),
    textBox(
      c,
      'display',
      it.labelX,
      it.labelY,
      trackedWidth(ctx, c, it.label, 'display', P.labelSize, P.labelTracking),
      P.labelSize,
    ),
  ]);
}

/** The finale description below the stats; none without one (see `Compiled.text.descFinale`). */
export function finaleDescriptionBoxes(ctx: Ctx2D, c: Compiled): Box[] {
  const d = c.text.descFinale;
  if (d === null || c.text.description === '' || !c.project.timing.finale.enabled) return [];
  const t = c.layout.title;
  const w = trackedWidth(ctx, c, c.text.description, 'body', d.size, t.descTracking);
  return [textBox(c, 'body', d.x * c.S, d.y * c.S, w, d.size)];
}

/** Everything the finale end camera keeps clear of: the stats and the finale description. */
export function finaleBoxes(ctx: Ctx2D, c: Compiled): Box[] {
  return [...statsBoxes(ctx, c), ...finaleDescriptionBoxes(ctx, c)];
}

/** The overview title, subtitle and description; none when the overview is off. */
export function titleBoxes(ctx: Ctx2D, c: Compiled): Box[] {
  if (!c.project.timing.overview.enabled) return [];
  const t = c.layout.title;
  const S = c.S;
  const out: Box[] = [];
  if (c.text.title !== '') {
    const w = trackedWidth(ctx, c, c.text.title, 'display', c.text.titleSize, t.tracking);
    out.push(textBox(c, 'display', t.x * S, t.y * S, w, c.text.titleSize));
  }
  if (c.text.subtitle !== '') {
    const w = trackedWidth(ctx, c, c.text.subtitle, 'body', c.text.subSize, t.subTracking);
    out.push(textBox(c, 'body', t.x * S, t.subY * S, w, c.text.subSize));
  }
  if (c.text.description !== '') {
    const w = trackedWidth(ctx, c, c.text.description, 'body', c.text.descSize, t.descTracking);
    out.push(textBox(c, 'body', t.x * S, t.descY * S, w, c.text.descSize));
  }
  return out;
}

function overlaps(a: Box, b: Box, gap: number): boolean {
  return a.x0 < b.x1 + gap && a.x1 > b.x0 - gap && a.y0 < b.y1 + gap && a.y1 > b.y0 - gap;
}

/** Downward move in px that takes every content box now touching an obstacle (with the gap) below it. */
function neededShift(content: readonly Box[], obstacles: readonly Box[], gap: number): number {
  let d = 0;
  for (const b of content) {
    for (const o of obstacles) {
      if (overlaps(b, o, gap)) d = Math.max(d, o.y1 + gap - b.y0);
    }
  }
  return d;
}

/**
 * A camera like `cam` whose content, seen at each zoom factor in `zooms`
 * (`cam.z * factor`), clears every obstacle by `CLEAR_GAP_DU`: the content is
 * moved down (`cy += shift / z`) as often as needed; when that pushes its
 * bottom past `bottomPx`, the same is tried with the zoom reduced in 4% steps
 * (down to 60%, about the camera centre), keeping the first zoom that fits, or
 * else the clear candidate with the lowest bottom. Returns `cam` itself when
 * nothing overlaps, so projects without a collision (the season) are unchanged.
 * Deterministic: plain arithmetic and text measurement only.
 */
export function clearCamera(
  ctx: Ctx2D,
  c: Compiled,
  cam: Cam,
  obstacles: readonly Box[],
  bottomPx: number,
  zooms: readonly number[] = [1],
): Cam {
  if (obstacles.length === 0) return cam;
  const gap = CLEAR_GAP_DU * c.S;
  const content = (k: Cam): Box[] =>
    zooms.flatMap((f) => contentBoxes(ctx, c, { cx: k.cx, cy: k.cy, z: k.z * f }));
  if (neededShift(content(cam), obstacles, gap) <= 0) return cam;

  let best: { cam: Cam; bottom: number } | undefined;
  for (let step = 0; step <= ZOOM_STEPS; step++) {
    let cand: Cam = { cx: cam.cx, cy: cam.cy, z: cam.z * (1 - ZOOM_STEP * step) };
    let boxes = content(cand);
    let d = neededShift(boxes, obstacles, gap);
    for (let j = 0; j < MAX_SHIFTS && d > 0; j++) {
      cand = { cx: cand.cx, cy: cand.cy + d / cand.z, z: cand.z };
      boxes = content(cand);
      d = neededShift(boxes, obstacles, gap);
    }
    if (d > 0 || boxes.length === 0) continue;
    const bottom = Math.max(...boxes.map((b) => b.y1));
    if (bottom <= bottomPx) return cand;
    if (best === undefined || bottom < best.bottom) best = { cam: cand, bottom };
  }
  return best?.cam ?? cam;
}
