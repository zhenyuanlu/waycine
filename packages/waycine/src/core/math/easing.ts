import type { Easing } from '../schema/types.js';

/**
 * Easing curves. Every curve clamps its input to [0, 1] first, like the
 * original `ease_in_out` / `ease_out` helpers, so callers may pass raw
 * progress values (negative before a fade starts, above 1 after it ends).
 */

/** Clamps `u` to [0, 1]. */
export function clamp01(u: number): number {
  return Math.min(Math.max(u, 0), 1);
}

/** The original `ease_in_out`: `0.5 - 0.5 * cos(pi * u)`. */
export function inOutSine(u: number): number {
  const t = clamp01(u);
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

/** The original `ease_out`: `1 - (1 - u)^3`. */
export function outCubic(u: number): number {
  const t = clamp01(u);
  return 1 - (1 - t) ** 3;
}

/** Cubic ease-in-out: `4u^3` below 0.5, `1 - (2 - 2u)^3 / 2` above. */
export function inOutCubic(u: number): number {
  const t = clamp01(u);
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Identity on [0, 1]. */
export function linear(u: number): number {
  return clamp01(u);
}

/** Easing functions by name. */
export const EASING_FUNCTIONS: Readonly<Record<Easing, (u: number) => number>> = Object.freeze({
  inOutSine,
  outCubic,
  inOutCubic,
  linear,
});

/** Applies the named easing to `u` (clamped to [0, 1]). */
export function ease(name: Easing, u: number): number {
  return EASING_FUNCTIONS[name](u);
}
