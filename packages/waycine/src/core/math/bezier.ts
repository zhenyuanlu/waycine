import type { BulgeSide, Vec2 } from '../schema/types.js';

/**
 * Route legs: screen-space quadratic Beziers whose control point sits
 * `bulge * (-dy, dx)` from the leg midpoint (right of travel on a y-down
 * screen), sampled `samples` times per leg. Ported from the original route
 * builder operation by operation.
 */

/** Point at `t` on the quadratic Bezier a -> b with control point c. */
export function quadPoint(a: Vec2, c: Vec2, b: Vec2, t: number): Vec2 {
  const s = 1 - t;
  return [
    s ** 2 * a[0] + 2 * s * t * c[0] + t * t * b[0],
    s ** 2 * a[1] + 2 * s * t * c[1] + t * t * b[1],
  ];
}

/** Control point of the leg a -> b: `mid + k * (-dy, dx)`, with k = bulge (right) or -bulge (left). */
export function legControl(a: Vec2, b: Vec2, k: number): Vec2 {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return [mx - dy * k, my + dx * k];
}

/** Bulge sign of leg `leg` (1-based: leg 1 runs from stop 0 to stop 1). */
export function bulgeSign(side: BulgeSide, leg: number): number {
  if (side === 'left') {
    return -1;
  }
  if (side === 'alternate') {
    return leg % 2 === 1 ? 1 : -1;
  }
  return 1;
}

/**
 * The route polyline through screen points `pts` up to `upto` pins reached
 * (fractional = partial leg): starts at `pts[0]`; leg i (1-based) is drawn to
 * fraction `clamp(upto - (i - 1), 0, 1)` with `samples` points at
 * `t = f * j / samples`, and the walk stops at the first leg with fraction <= 0.
 * Zero-length legs (duplicate locations) add no points.
 */
export function routePolyline(
  pts: readonly Vec2[],
  upto: number,
  bulge: number,
  side: BulgeSide,
  samples: number,
): Vec2[] {
  const first = pts[0];
  if (first === undefined) {
    return [];
  }
  const path: Vec2[] = [[first[0], first[1]]];
  const n = Math.max(1, Math.round(samples));
  for (let i = 1; i < pts.length; i++) {
    const f = Math.min(Math.max(upto - (i - 1), 0), 1);
    if (f <= 0) {
      break;
    }
    const a = pts[i - 1];
    const b = pts[i];
    if (a === undefined || b === undefined || (a[0] === b[0] && a[1] === b[1])) {
      continue;
    }
    const c = legControl(a, b, bulge * bulgeSign(side, i));
    for (let j = 1; j <= n; j++) {
      path.push(quadPoint(a, c, b, (f * j) / n));
    }
  }
  return path;
}
