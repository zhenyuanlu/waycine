import type { Ctx2D } from '../ctx.js';
import { routePolyline } from '../math/bezier.js';
import type { Cam, Compiled } from '../scene-types.js';
import type { Vec2 } from '../schema/types.js';
import { pinPoint } from './util.js';

/**
 * The route polyline in output px (the original's route builder): from pin 0, leg i
 * (pin i-1 -> pin i) drawn to fraction `clamp(upto - (i - 1), 0, 1)`, walk
 * stopped at the first `f <= 0`; each leg a screen-space quadratic Bezier
 * with control point `mid + bulge * (-dy, dx)` (right of travel on a y-down
 * screen; `left` / `alternate` per `route.bulgeSide`), sampled `samples` times
 * at `t = f * j / samples`. Merged duplicate pins give zero-length legs, which
 * add nothing.
 */
export function routePath(c: Compiled, cam: Cam, upto: number): Vec2[] {
  const pts: Vec2[] = c.stops.map((_, i) => {
    const p = pinPoint(c, i, cam);
    return [p.x, p.y];
  });
  const r = c.project.route;
  return routePolyline(pts, upto, r.bulge, r.bulgeSide, r.samples);
}

/** Adds the polyline `path` as one open sub-path. */
export function tracePath(ctx: Ctx2D, path: readonly Vec2[]): void {
  ctx.beginPath();
  const first = path[0];
  if (first === undefined) return;
  ctx.moveTo(first[0], first[1]);
  for (let i = 1; i < path.length; i++) {
    const p = path[i] as Vec2;
    ctx.lineTo(p[0], p[1]);
  }
}

/**
 * Route core stroke (the original's core line): `route.coreWidth` Du in `theme.route`,
 * round joins (PIL `joint="curve"`), butt ends, times `alpha`.
 */
export function drawRouteCore(ctx: Ctx2D, c: Compiled, path: readonly Vec2[], alpha: number): void {
  if (path.length < 2 || !(alpha > 0)) return;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = c.project.theme.route;
  ctx.lineWidth = c.project.route.coreWidth * c.S;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  tracePath(ctx, path);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
