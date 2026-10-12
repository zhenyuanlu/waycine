import type { Ctx2D } from '../ctx.js';
import type { Compiled, DescriptionState, TitleState } from '../scene-types.js';
import { drawText } from './text.js';

/**
 * Overview title and subtitle (the original's overview title block, landscape
 * and portrait): title in the display font and `theme.text`, subtitle in the
 * body font and `theme.accent`. By default the title fades in with
 * `title.alpha` and the subtitle is `subAlpha` times that; with `text.solid`
 * both are opaque from the first frame, as the original drew them. Either way
 * both are multiplied by `overlayAlpha` (the single-mode outro). Sizes are
 * `c.text.titleSize` / `subSize`: the layout sizes, shrunk by `compile` when
 * the text would pass the right margin.
 */
export function drawTitle(
  ctx: Ctx2D,
  c: Compiled,
  title: TitleState | null,
  overlayAlpha: number,
): void {
  if (title === null) return;
  const solid = c.project.text.solid;
  const a = solid ? overlayAlpha : title.alpha * overlayAlpha;
  if (!(a > 0)) return;
  const t = c.layout.title;
  const S = c.S;
  const theme = c.project.theme;
  ctx.globalAlpha = a;
  ctx.fillStyle = theme.text;
  drawText(ctx, c, c.text.title, t.x * S, t.y * S, 'display', c.text.titleSize, t.tracking);
  const sub = solid ? a : a * t.subAlpha;
  if (sub > 0) {
    ctx.globalAlpha = sub;
    ctx.fillStyle = theme.accent;
    drawText(ctx, c, c.text.subtitle, t.x * S, t.subY * S, 'body', c.text.subSize, t.subTracking);
  }
  ctx.globalAlpha = 1;
}

/**
 * The description line (`text.description`) in the body font and
 * `theme.text`, with `layout.title.descTracking`. In the overview it sits at
 * (`title.x`, `descY`) with `c.text.descSize` and fades with the title:
 * alpha `state.alpha * descAlpha * overlayAlpha`, or `overlayAlpha` with
 * `text.solid` (like the subtitle). In the finale it sits at
 * `c.text.descFinale` with alpha `state.alpha * descAlpha`, or, with
 * `text.solid`, pops in opaque once `floor(255 * alpha) >= 1` (like the stats).
 */
export function drawDescription(
  ctx: Ctx2D,
  c: Compiled,
  state: DescriptionState | null,
  overlayAlpha: number,
): void {
  if (state === null || c.text.description === '') return;
  const solid = c.project.text.solid;
  const t = c.layout.title;
  const S = c.S;
  let a: number;
  let x: number;
  let y: number;
  let size: number;
  if (state.place === 'overview') {
    a = solid ? overlayAlpha : state.alpha * t.descAlpha * overlayAlpha;
    x = t.x * S;
    y = t.descY * S;
    size = c.text.descSize;
  } else {
    const at = c.text.descFinale;
    if (at === null) return;
    a = solid ? (Math.floor(255 * state.alpha) > 0 ? 1 : 0) : state.alpha * t.descAlpha;
    x = at.x * S;
    y = at.y * S;
    size = at.size;
  }
  if (!(a > 0)) return;
  ctx.globalAlpha = Math.min(1, a);
  ctx.fillStyle = c.project.theme.text;
  drawText(ctx, c, c.text.description, x, y, 'body', size, t.descTracking);
  ctx.globalAlpha = 1;
}
