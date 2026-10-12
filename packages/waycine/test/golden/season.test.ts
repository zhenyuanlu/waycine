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
 * Golden frames of the reference season: 16:9 at 960 x 540 and 9:16 at 540 x 960,
 * timeline frames 0, 55, 79 (overview), 95, 118 (stop 1 hold and zoom-through),
 * 128 (stop 2), 220 (stop 4 card), 404, 439 (finale); and the season with a
 * description in the intro and the finale (16:9, frames 0 and 404). Regenerate with
 * `npm run golden:update` after an intended visual change, and look at every
 * changed PNG before committing it.
 */

const cases = GOLDEN_CASES.filter((gc) => gc.name.startsWith('season-'));

describe.each(cases)('$name at $width x $height', (gc: GoldenCase) => {
  const c = compileCase(gc);

  it(`uses the ${gc.profile} profile and the 440-frame season timeline`, () => {
    expect(c.profile).toBe(gc.profile);
    expect(c.timeline.totalFrames).toBe(440);
  });

  it.each(gc.frames(c))('frame %i matches its golden', async (frame) => {
    const { canvas, pixels } = renderGolden(c, frame);
    const result = await checkGolden(goldenFile(gc, frame), canvas, pixels);
    expect(result.comparison.pass, result.message).toBe(true);
  });
});
