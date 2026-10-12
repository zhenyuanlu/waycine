import type { Ctx2D } from '../ctx.js';
import type { Compiled } from '../scene-types.js';
import type { Medal } from '../schema/types.js';
import { drawText, fontPx, textWidth, trackedWidth } from './text.js';
import { fillCircle, strokeRingInward } from './util.js';

/**
 * One medal (the original's medal helper) centred at (x, y) px with radius `rDu` Du and
 * alpha 0..1. `ring` is an outline of width `max(2, int(ringMedalWidth * r_px2)) / 2`
 * Du, i.e. the original's quantization on its 2x canvas (2 Du for r 7, 3.5 Du
 * for r 10), drawn inward. Other kinds are a filled disc plus a white shine
 * disc on `[x - .45r, y - .75r, x + .1r, y - .2r]` at `medalShine * alpha`.
 * `none` draws nothing.
 */
export function drawMedal(
  ctx: Ctx2D,
  c: Compiled,
  x: number,
  y: number,
  kind: Medal,
  rDu: number,
  alpha: number,
): void {
  if (kind === 'none' || !(alpha > 0) || !(rDu > 0)) return;
  const pins = c.project.pins;
  const r = rDu * c.S;
  const color = c.project.theme.medals[kind];
  if (kind === 'ring') {
    const wDu = Math.max(2, Math.floor(pins.ringMedalWidth * (rDu * 2))) / 2;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    strokeRingInward(ctx, x, y, r, wDu * c.S);
    return;
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  fillCircle(ctx, x, y, r);
  const shine = pins.medalShine * alpha;
  if (shine > 0) {
    ctx.globalAlpha = shine;
    ctx.fillStyle = '#FFFFFF';
    fillCircle(ctx, x - 0.175 * r, y - 0.475 * r, 0.275 * r);
  }
}

/** Medal dots of pin `i`: the results of every stop sharing that pin, `count` dots each. */
function pinMedals(c: Compiled, i: number): Medal[] {
  const dots: Medal[] = [];
  for (const stop of c.stops) {
    if (stop.pinOf !== i) continue;
    for (const res of stop.results) {
      if (res.medal === 'none') continue;
      const n = Math.max(1, Math.min(5, Math.round(res.count)));
      for (let k = 0; k < n; k++) dots.push(res.medal);
    }
  }
  return dots;
}

/**
 * A place for a pin label around its pin: beside it (`e`, `w`: the two places
 * of the original), diagonally above or below (`ne`, `se`, `nw`, `sw`), or
 * centred above or below (`n`, `s`). In preference order when nothing is in
 * the way.
 */
export const LABEL_SPOTS = ['e', 'w', 'ne', 'se', 'nw', 'sw', 'n', 's'] as const;
/** One label place (see `LABEL_SPOTS`). */
export type LabelSpot = (typeof LABEL_SPOTS)[number];

/** Gap between a pin (with its halo) and a label placed above or below it, in Du. */
const SPOT_GAP_DU = 4;

/** Geometry of one pin label, in output px (text anchors are PIL "la": left, top of the ascent line). */
export interface PinLabelLayout {
  /** True when the label sits left of the pin. */
  flip: boolean;
  /** City anchor x. */
  cityX: number;
  /** City anchor y. */
  cityY: number;
  /** Date anchor x. */
  dateX: number;
  /** Date anchor y. */
  dateY: number;
  /** City width in px (`getlength + tracking * len`, times `widthAdjust`). */
  cityW: number;
  /** Date width in px (0 without a date). */
  dateW: number;
  /** Medal dots (centres) in draw order. */
  dots: { x: number; y: number; medal: Medal }[];
}

/**
 * Pin label geometry of pin `i` at pin position (x, y) px (the original's
 * landscape and portrait pin labels): city (display font, tracking) at
 * `(x + dx, y + cityDy)`, pin date (body font, no tracking) at
 * `(x + dx, y + dateDy)`, then medal dots from `x + dx + dateWidth + medalGap`,
 * one every `medalStep`. Labels flip to the left of the pin when
 * `x > flipAboveX * W`, or, with `flipAboveX` null, when the label would run
 * past the right edge; flipped texts end at `x - dx` using the original's
 * widths (`getlength + tracking * len` for the city, `getlength` for the date)
 * and the dots run leftwards. `ctx` measures the texts (sets `ctx.font`).
 *
 * With `spot` the label sits at that place instead (see `LABEL_SPOTS`): `e`
 * and `w` are the two layouts above; the diagonal places keep the side but
 * start half as far from the pin and move the whole block above or below the
 * pin and its halo; `n` and `s` centre both lines on the pin.
 */
export function pinLabelLayout(
  ctx: Ctx2D,
  c: Compiled,
  i: number,
  x: number,
  y: number,
  spot?: LabelSpot,
): PinLabelLayout | null {
  const stop = c.stops[i];
  if (stop === undefined) return null;
  const L = c.project.pins.label;
  const S = c.S;
  const cityW = trackedWidth(ctx, c, stop.city, 'display', L.citySize, L.cityTracking);
  const dateW = textWidth(ctx, c, stop.pinDate, 'body', L.dateSize);
  const kinds = c.layout.pinLabels.medals ? pinMedals(c, i) : [];
  const dotsW =
    kinds.length > 0 ? (L.medalGap + (kinds.length - 1) * L.medalStep + L.medalR) * S : 0;
  if (spot !== undefined && spot !== 'e' && spot !== 'w') {
    return spotLayout(c, x, y, spot, cityW, dateW, dotsW, kinds, stop.pinDate !== '');
  }
  const flipAt = c.layout.pinLabels.flipAboveX;
  const flip =
    spot !== undefined
      ? spot === 'w'
      : flipAt === null
        ? x + L.dx * S + Math.max(cityW, dateW + dotsW) > c.width
        : x > flipAt * c.width;
  const dir = flip ? -1 : 1;
  const dots: PinLabelLayout['dots'] = [];
  let mx = x + dir * ((L.dx + L.medalGap) * S + dateW);
  const my = y + L.medalDy * S;
  for (const medal of kinds) {
    dots.push({ x: mx, y: my, medal });
    mx += dir * L.medalStep * S;
  }
  return {
    flip,
    cityX: flip ? x - L.dx * S - cityW : x + L.dx * S,
    cityY: y + L.cityDy * S,
    dateX: flip ? x - L.dx * S - dateW : x + L.dx * S,
    dateY: y + L.dateDy * S,
    cityW,
    dateW,
    dots,
  };
}

/** Height in px of a text of `sizeDu` from its anchor (top of the ascent line) to its baseline. */
export function labelLineHeight(c: Compiled, role: 'display' | 'body', sizeDu: number): number {
  return c.fonts.anchorEm[role] * fontPx(c, role, sizeDu);
}

/** The label at a diagonal or centred place (see `pinLabelLayout`). */
function spotLayout(
  c: Compiled,
  x: number,
  y: number,
  spot: Exclude<LabelSpot, 'e' | 'w'>,
  cityW: number,
  dateW: number,
  dotsW: number,
  kinds: readonly Medal[],
  hasDate: boolean,
): PinLabelLayout {
  const pins = c.project.pins;
  const L = pins.label;
  const S = c.S;
  // The block as the layout's own offsets give it, relative to the pin.
  const top = L.cityDy * S;
  const cityBottom = top + labelLineHeight(c, 'display', L.citySize);
  const dateBottom = L.dateDy * S + labelLineHeight(c, 'body', L.dateSize);
  const dotsBottom = (L.medalDy + L.medalR) * S;
  const bottom = Math.max(
    cityBottom,
    hasDate ? dateBottom : cityBottom,
    kinds.length > 0 ? dotsBottom : cityBottom,
  );
  const clear = (pins.radius + pins.haloPad + SPOT_GAP_DU) * S;
  const above = spot === 'ne' || spot === 'nw' || spot === 'n';
  const vy = above ? -(bottom + clear) : clear - top;
  const centred = spot === 'n' || spot === 's';
  const flip = spot === 'nw' || spot === 'sw';
  const ox = (L.dx * S) / 2;
  const rowW = dateW + dotsW;
  const cityX = centred ? x - cityW / 2 : flip ? x - ox - cityW : x + ox;
  const dateX = centred ? x - rowW / 2 : flip ? x - ox - dateW : x + ox;
  const dir = flip ? -1 : 1;
  const dots: PinLabelLayout['dots'] = [];
  let mx = flip ? dateX - L.medalGap * S : dateX + dateW + L.medalGap * S;
  const my = y + L.medalDy * S + vy;
  for (const medal of kinds) {
    dots.push({ x: mx, y: my, medal });
    mx += dir * L.medalStep * S;
  }
  return {
    flip,
    cityX,
    cityY: y + top + vy,
    dateX,
    dateY: y + L.dateDy * S + vy,
    cityW,
    dateW,
    dots,
  };
}

/**
 * Draws the pin label of pin `i` at pin position (x, y) px (see
 * `pinLabelLayout`; `spot` is the place chosen for it, if any). Text alpha is
 * `label.alpha * alpha`, or just `alpha` (the overlay) with `text.solid`;
 * medal dots keep `medalAlpha * alpha`.
 */
export function drawPinLabel(
  ctx: Ctx2D,
  c: Compiled,
  i: number,
  x: number,
  y: number,
  alpha: number,
  spot?: LabelSpot,
): void {
  const stop = c.stops[i];
  if (stop === undefined || !(alpha > 0)) return;
  const G = pinLabelLayout(ctx, c, i, x, y, spot);
  if (G === null) return;
  const L = c.project.pins.label;
  const theme = c.project.theme;
  const a = c.project.text.solid ? alpha : L.alpha * alpha;
  ctx.globalAlpha = a;
  ctx.fillStyle = theme.text;
  drawText(ctx, c, stop.city, G.cityX, G.cityY, 'display', L.citySize, L.cityTracking);
  if (stop.pinDate !== '') {
    ctx.globalAlpha = a;
    ctx.fillStyle = theme.accent;
    drawText(ctx, c, stop.pinDate, G.dateX, G.dateY, 'body', L.dateSize, 0);
  }
  for (const dot of G.dots) {
    drawMedal(ctx, c, dot.x, dot.y, dot.medal, L.medalR, L.medalAlpha * alpha);
  }
}
