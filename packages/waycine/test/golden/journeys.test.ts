import { describe, expect, it } from 'vitest';
import {
  checkGolden,
  compileCase,
  GOLDEN_CASES,
  type GoldenCase,
  goldenFile,
  renderGolden,
} from './golden.js';

/**
 * Golden frames of the other journeys: the Europe preset (9:16, fly mode) at
 * 540 x 960 (first frame, frame 40 with the title fully in, a stop-4 hold
 * frame, last frame), the long-names project as 16:9 at 960 x 540 (card
 * holds of a name that cannot fit and of
 * one that shrinks to fit), the round-the-world project as 16:9 at 960 x 540
 * (the last stop on its own pin and card, and the finale), the equator route
 * as 1:1 at 720 x 720 (the finale, with the stats wrapped into two rows), the
 * Pacific crossing (antimeridian) as 1:1 at 720 x 720, and a single stop
 * (N = 1, no route) as 1:1 at 720 x 720. Regenerate with `npm run golden:update`.
 */

const cases = GOLDEN_CASES.filter((gc) => !gc.name.startsWith('season-'));

describe.each(cases)('$name at $width x $height', (gc: GoldenCase) => {
  const c = compileCase(gc);

  it(`uses the ${gc.profile} profile`, () => {
    expect(c.profile).toBe(gc.profile);
  });

  it.each(gc.frames(c))('frame %i matches its golden', async (frame) => {
    const { canvas, pixels } = renderGolden(c, frame);
    const result = await checkGolden(goldenFile(gc, frame), canvas, pixels);
    expect(result.comparison.pass, result.message).toBe(true);
  });
});
