import type { Ctx2D } from '../ctx.js';
import type { Compiled } from '../scene-types.js';
import { strokeLine } from './util.js';

/**
 * HUD corner brackets (as the original): arm length `cornerLen`, inset
 * `cornerMargin`, width `cornerWidth`, alpha `cornerAlpha`, in `theme.grid`.
 * Each arm is its own butt-capped stroke, so the corner square composites
 * twice like the two PIL lines.
 */
export function drawHud(ctx: Ctx2D, c: Compiled): void {
  const h = c.project.hud;
  if (!h.corners) return;
  const { width: W, height: H, S } = c;
  const len = h.cornerLen * S;
  const m = h.cornerMargin * S;
  ctx.strokeStyle = c.project.theme.grid;
  ctx.globalAlpha = h.cornerAlpha;
  ctx.lineWidth = h.cornerWidth * S;
  ctx.lineCap = 'butt';
  const corners: [number, number, number, number][] = [
    [m, m, 1, 1],
    [W - m, m, -1, 1],
    [m, H - m, 1, -1],
    [W - m, H - m, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    strokeLine(ctx, x, y, x + len * dx, y);
    strokeLine(ctx, x, y, x, y + len * dy);
  }
  ctx.globalAlpha = 1;
}
