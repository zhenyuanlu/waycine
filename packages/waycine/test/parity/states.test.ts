import { describe, expect, it } from 'vitest';
import { compile } from '../../src/core/compile.js';
import { createMeasureBackend } from '../helpers/measure-backend.js';
import { loadSeasonForTestMetric } from '../helpers/projects.js';
import { cameraMismatches, loadFixture, type RefStates, stateMismatches } from './reference.js';

/**
 * State parity: `sceneAt` in segments mode against reference states recorded
 * from the original landscape renderer (numbers only; columnar per segment).
 * Tolerance 1e-9 absolute on every number.
 */
describe('state parity with the original (landscape, segments mode)', () => {
  const ref = loadFixture<RefStates>('reference-states.json');
  const c = compile(loadSeasonForTestMetric(), createMeasureBackend(), {
    width: ref.width,
    height: ref.height,
    mode: 'segments',
  });

  it('uses the same size, frame rate, profile and segment layout', () => {
    expect([c.width, c.height]).toEqual([ref.width, ref.height]);
    expect(c.profile).toBe('landscape');
    expect([c.fps.num, c.fps.den]).toEqual(ref.fps);
    expect(c.timeline.segments.map((s) => [s.kind, s.index, s.n])).toEqual(
      ref.segments.map((s) => [s.kind, s.index, s.n]),
    );
    expect(c.timeline.totalFrames).toBe(ref.segments.reduce((sum, s) => sum + s.n, 0));
  });

  it('matches the fit and stamp cameras', () => {
    expect(cameraMismatches(c, ref)).toEqual([]);
  });

  it('matches every frame at 1e-9', () => {
    expect(stateMismatches(c, ref).slice(0, 20)).toEqual([]);
  });
});
