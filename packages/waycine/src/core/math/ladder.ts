/**
 * Graticule step selection. The base step is picked once from the overview
 * zoom; the step halves at each split zoom; major (labelled) lines use a
 * coarser step that is a multiple of the base step, so the majors stay put
 * when the step halves. For the season this gives 0.25 deg (0.125 deg from
 * 1.8 x z_ov) with majors on whole degrees, as the original.
 */

/** Candidate base steps in degrees, ascending. */
export const GRID_STEP_LADDER: readonly number[] = Object.freeze([
  0.01, 0.02, 0.025, 0.05, 0.1, 0.125, 0.25, 0.5, 1, 2, 5, 10,
]);

/** Hard cap on graticule halvings (`graticule.maxSubdiv`; validation clamps to 0..4). */
export const MAX_GRID_SUBDIV = 8;

/** Candidate major steps in degrees, ascending. */
export const GRID_MAJOR_LADDER: readonly number[] = Object.freeze([
  0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 90,
]);

/**
 * The ladder step whose on-screen spacing `step * z` (px) is closest to
 * `targetPx`, compared by ratio (|log(spacing / target)|); ties keep the
 * smaller step.
 */
export function pickBaseStep(z: number, targetPx: number): number {
  let best = GRID_STEP_LADDER[0] ?? 1;
  let bestErr = Number.POSITIVE_INFINITY;
  if (!(z > 0) || !(targetPx > 0)) {
    return GRID_STEP_LADDER[6] ?? 0.25;
  }
  for (const step of GRID_STEP_LADDER) {
    const err = Math.abs(Math.log((step * z) / targetPx));
    if (err < bestErr) {
      best = step;
      bestErr = err;
    }
  }
  return best;
}

/** True when `value` is a whole multiple of `step` (relative tolerance 1e-9). */
export function isMultipleOf(value: number, step: number): boolean {
  const q = value / step;
  return Math.abs(q - Math.round(q)) < 1e-9 * Math.max(1, Math.abs(q));
}

/**
 * Major step for a base step: the smallest major-ladder value that is at least
 * 3 x base and a whole multiple of it (0.25 -> 1, 0.1 -> 0.5, 0.02 -> 0.1,
 * 0.01 -> 0.05 for city-scale trips, 2 -> 10, 5 -> 30, 10 -> 30 for
 * continent- and ocean-scale maps); falls back to 3 x base when no ladder
 * value fits.
 */
export function pickMajorStep(base: number): number {
  for (const major of GRID_MAJOR_LADDER) {
    if (major >= 3 * base - 1e-12 && isMultipleOf(major, base)) {
      return major;
    }
  }
  return 3 * base;
}

/**
 * Absolute zoom thresholds (px per degree, ascending) at which the step
 * halves: `zOv * zoomSplit^j` for j = 1..maxSubdiv (the original's single
 * split is `ov_zoom * 1.8`). `maxSubdiv` is capped at `MAX_GRID_SUBDIV` here
 * as well as by validation, so a hand-made project cannot allocate a huge list.
 */
export function gridSplits(zOv: number, zoomSplit: number, maxSubdiv: number): number[] {
  const whole = Number.isFinite(maxSubdiv) ? Math.floor(maxSubdiv) : 0;
  const count = Math.min(MAX_GRID_SUBDIV, Math.max(0, whole));
  const splits: number[] = [];
  for (let j = 1; j <= count; j++) {
    splits.push(zOv * zoomSplit ** j);
  }
  return splits.sort((a, b) => a - b);
}

/** Grid step at zoom `z`: `baseStep / 2^(number of splits <= z)`. */
export function gridStepAt(z: number, baseStep: number, splits: readonly number[]): number {
  let halvings = 0;
  for (const split of splits) {
    if (z >= split) {
      halvings++;
    }
  }
  return baseStep / 2 ** halvings;
}
