import { describe, expect, it } from 'vitest';
import { compile, pickPlace, sceneAt } from '../../src/core/index.js';
import { screenX, screenY } from '../../src/core/math/mercator.js';
import { createMeasureBackend } from '../helpers/measure-backend.js';
import { loadFixtureProject, loadSeason } from '../helpers/projects.js';

const backend = createMeasureBackend();

describe('pickPlace', () => {
  it('inverts the camera: the pixel under a pin gives back the stop', () => {
    const c = compile(loadSeason(), backend, { width: 960, height: 540 });
    for (const frame of [40, 100, 250, 430]) {
      const { cam } = sceneAt(c, frame);
      for (const stop of c.stops) {
        const x = screenX(stop.lon, cam, c.width);
        const y = screenY(stop.y, cam, c.height);
        const picked = pickPlace(c, frame, x, y);
        expect(picked.lat).toBeCloseTo(stop.lat, 9);
        expect(picked.lon).toBeCloseTo(stop.lon, 9);
      }
    }
  });

  it('moves east and south with the cursor', () => {
    const c = compile(loadSeason(), backend, { width: 960, height: 540 });
    const centre = pickPlace(c, 60, 480, 270);
    const right = pickPlace(c, 60, 580, 270);
    const below = pickPlace(c, 60, 480, 370);
    expect(right.lon).toBeGreaterThan(centre.lon);
    expect(right.lat).toBeCloseTo(centre.lat, 12);
    expect(below.lat).toBeLessThan(centre.lat);
  });

  it('wraps longitudes across the antimeridian and clamps latitudes', () => {
    const c = compile(loadFixtureProject('pacific'), backend, { width: 720, height: 720 });
    for (let frame = 0; frame < c.timeline.totalFrames; frame += 17) {
      for (const [x, y] of [
        [0, 0],
        [720, 720],
        [360, 360],
      ] as const) {
        const { lat, lon } = pickPlace(c, frame, x, y);
        expect(lon).toBeGreaterThan(-180);
        expect(lon).toBeLessThanOrEqual(180);
        expect(Math.abs(lat)).toBeLessThanOrEqual(85.05);
      }
    }
    const far = pickPlace(c, 0, 360, -1e7);
    expect(far.lat).toBe(85.05);
  });

  it('clamps the frame index to the timeline', () => {
    const c = compile(loadSeason(), backend, { width: 960, height: 540 });
    const last = c.timeline.totalFrames - 1;
    expect(pickPlace(c, 1e6, 10, 10)).toEqual(pickPlace(c, last, 10, 10));
    expect(pickPlace(c, -5, 10, 10)).toEqual(pickPlace(c, 0, 10, 10));
  });
});
