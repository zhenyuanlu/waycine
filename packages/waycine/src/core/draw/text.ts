import type { Ctx2D } from '../ctx.js';
import type { Compiled } from '../scene-types.js';
import { cached } from './util.js';

/** Font role: display (titles, city, stats) or body (subtitle, kicker, event, dates, lines, grid labels). */
export type FontRole = 'display' | 'body';

const SEGMENTER = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** Font size in output px for a Du size (`size * S * sizeAdjust`). */
export function fontPx(c: Compiled, role: FontRole, sizeDu: number): number {
  return sizeDu * c.S * c.fonts.sizeAdjust[role];
}

/** CSS font shorthand `${px}px ${family}`; `compile` already quoted the family when needed. */
export function fontString(c: Compiled, role: FontRole, px: number): string {
  return `${px}px ${c.fonts[role]}`;
}

/** Grapheme clusters of `text` (the unit the original's tracked text steps by), memoized per compile. */
export function graphemes(c: Compiled, text: string): readonly string[] {
  const memo = cached(c, 'draw.text.graphemes', () => new Map<string, string[]>());
  let g = memo.get(text);
  if (g === undefined) {
    g = Array.from(SEGMENTER.segment(text), (s) => s.segment);
    memo.set(text, g);
  }
  return g;
}

/**
 * Advance width of `text` in px with `font` (already set on `ctx`), times the
 * role's `widthAdjust`. The host measurement is memoized per compile under the
 * role's font identity, the font string and the text.
 */
function widthWith(ctx: Ctx2D, c: Compiled, role: FontRole, font: string, text: string): number {
  const memo = cached(c, 'draw.text.widths', () => new Map<string, number>());
  const key = `${c.fonts.identity[role]}\n${font}\n${text}`;
  let w = memo.get(key);
  if (w === undefined) {
    w = ctx.measureText(text).width;
    memo.set(key, w);
  }
  return w * c.fonts.widthAdjust[role];
}

/**
 * `fillText` at (x, baseline), scaled horizontally by `k` about x. Needs the
 * identity transform `drawScene` sets, and restores it.
 */
function fillScaled(ctx: Ctx2D, text: string, x: number, baseline: number, k: number): void {
  if (k === 1) {
    ctx.fillText(text, x, baseline);
    return;
  }
  ctx.setTransform(k, 0, 0, 1, x, 0);
  ctx.fillText(text, 0, baseline);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Sets `ctx.font` for a role and Du size; returns the font string. */
export function setFont(ctx: Ctx2D, c: Compiled, role: FontRole, sizeDu: number): string {
  const font = fontString(c, role, fontPx(c, role, sizeDu));
  ctx.font = font;
  return font;
}

/**
 * Whole-string advance width in px, like PIL `font.getlength(text)`: unkerned
 * as long as the context has `fontKerning = 'none'` (`drawScene` and `compile`
 * set it), times the role's `widthAdjust`. Sets `ctx.font`.
 */
export function textWidth(
  ctx: Ctx2D,
  c: Compiled,
  text: string,
  role: FontRole,
  sizeDu: number,
): number {
  if (text === '') return 0;
  return widthWith(ctx, c, role, setFont(ctx, c, role, sizeDu), text);
}

/**
 * `getlength(text) + tracking * len(text)` in px: the width formula the
 * original uses for flipped labels and inline results (tracking times the
 * grapheme count, not count - 1). Sets `ctx.font`.
 */
export function trackedWidth(
  ctx: Ctx2D,
  c: Compiled,
  text: string,
  role: FontRole,
  sizeDu: number,
  trackingDu: number,
): number {
  if (text === '') return 0;
  return textWidth(ctx, c, text, role, sizeDu) + trackingDu * c.S * graphemes(c, text).length;
}

/**
 * Draws `text` the way the original's text helper does with anchor "la": `y`
 * is the top of the ascent line, so the alphabetic baseline sits at
 * `y + anchorEm * px`. With tracking 0 the string is drawn whole; otherwise one
 * grapheme at a time with advance `measureText(g) * widthAdjust + tracking`.
 * A role `widthAdjust` other than 1 scales the glyphs horizontally about their
 * left edge (heights unchanged). Kerning stays off either way (the original
 * laid text out unkerned; `drawScene` sets `fontKerning = 'none'`). `x`, `y`
 * in output px; the caller sets the fill style and alpha. The context must
 * have the identity transform, `textBaseline = 'alphabetic'` and
 * `textAlign = 'left'`.
 */
export function drawText(
  ctx: Ctx2D,
  c: Compiled,
  text: string,
  x: number,
  y: number,
  role: FontRole,
  sizeDu: number,
  trackingDu: number,
): void {
  if (text === '') return;
  const px = fontPx(c, role, sizeDu);
  const font = fontString(c, role, px);
  ctx.font = font;
  const baseline = y + c.fonts.anchorEm[role] * px;
  const k = c.fonts.widthAdjust[role];
  if (trackingDu === 0) {
    fillScaled(ctx, text, x, baseline, k);
    return;
  }
  const tracking = trackingDu * c.S;
  let xx = x;
  for (const g of graphemes(c, text)) {
    if (g.trim() !== '') fillScaled(ctx, g, xx, baseline, k);
    xx += widthWith(ctx, c, role, font, g) + tracking;
  }
}
