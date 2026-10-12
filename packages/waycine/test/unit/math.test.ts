import { describe, expect, it } from 'vitest';
import { legControl, quadPoint, routePolyline } from '../../src/core/math/bezier.js';
import { ease, inOutCubic, inOutSine, linear, outCubic } from '../../src/core/math/easing.js';
import { haversineKm, unwrapLongitudes, wrap180 } from '../../src/core/math/geo.js';
import { gridSplits, gridStepAt, pickBaseStep, pickMajorStep } from '../../src/core/math/ladder.js';
import { fromScreen, latFromMercY, mercY, toScreen } from '../../src/core/math/mercator.js';
import type { Vec2 } from '../../src/core/schema/types.js';

describe('easing', () => {
  it('inOutSine is the original ease_in_out and clamps', () => {
    expect(inOutSine(0)).toBe(0);
    expect(inOutSine(0.5)).toBeCloseTo(0.5, 15);
    expect(inOutSine(1)).toBe(1);
    expect(inOutSine(-3)).toBe(0);
    expect(inOutSine(7)).toBe(1);
    expect(inOutSine(0.25)).toBeCloseTo(0.5 - 0.5 * Math.cos(Math.PI / 4), 15);
  });

  it('outCubic is the original ease_out and clamps', () => {
    expect(outCubic(0)).toBe(0);
    expect(outCubic(1)).toBe(1);
    expect(outCubic(0.5)).toBe(0.875);
    expect(outCubic(-1)).toBe(0);
    expect(outCubic(2)).toBe(1);
  });

  it('inOutCubic and linear are monotone on [0, 1] with fixed ends', () => {
    for (const f of [inOutCubic, linear]) {
      expect(f(0)).toBe(0);
      expect(f(1)).toBe(1);
      expect(f(0.5)).toBeCloseTo(0.5, 15);
      expect(f(0.3)).toBeLessThan(f(0.6));
    }
  });

  it('ease() dispatches by name', () => {
    expect(ease('outCubic', 0.5)).toBe(outCubic(0.5));
    expect(ease('inOutSine', 0.3)).toBe(inOutSine(0.3));
    expect(ease('linear', 1.5)).toBe(1);
  });
});

describe('Mercator and the screen mapping', () => {
  it('round-trips latitude through Mercator y', () => {
    for (const lat of [-85, -45.5, -1e-6, 0, 12.34, 42.369, 60, 85.05]) {
      expect(latFromMercY(mercY(lat))).toBeCloseTo(lat, 10);
    }
    expect(mercY(0)).toBeCloseTo(0, 12);
  });

  it('maps a camera centre to the frame centre and inverts', () => {
    const cam = { cx: -72.63, cy: 45.4, z: 251.1 };
    expect(toScreen(cam.cx, cam.cy, cam, 1920, 1080)).toEqual([960, 540]);
    const [sx, sy] = toScreen(-71.121, mercY(42.369), cam, 1920, 1080);
    const [lon, y] = fromScreen(sx, sy, cam, 1920, 1080);
    expect(lon).toBeCloseTo(-71.121, 10);
    expect(y).toBeCloseTo(mercY(42.369), 10);
    // Screen y grows downward: a point north of the centre is above it.
    expect(toScreen(cam.cx, cam.cy + 1, cam, 1920, 1080)[1]).toBeLessThan(540);
  });
});

describe('geo helpers', () => {
  it('wraps differences into (-180, 180]', () => {
    expect(wrap180(0)).toBe(0);
    expect(wrap180(180)).toBe(180);
    expect(wrap180(-180)).toBe(180);
    expect(wrap180(190)).toBe(-170);
    expect(wrap180(-190)).toBe(170);
    expect(wrap180(540)).toBe(180);
  });

  it('unwraps across the antimeridian and leaves normal routes bit-exact', () => {
    // Tokyo -> Honolulu -> San Francisco
    const unwrapped = unwrapLongitudes([139.69, -157.86, -122.42]);
    [139.69, 202.14, 237.58].forEach((lon, i) => {
      expect(unwrapped[i]).toBeCloseTo(lon, 9);
    });
    const season = [-71.121, -73.917, -72.59, -73.842];
    expect(unwrapLongitudes(season)).toEqual(season);
  });

  it('computes great-circle distances', () => {
    // One degree of latitude is about 111.2 km.
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.195, 2);
    expect(haversineKm(10, 179.5, 10, -179.5)).toBeCloseTo(haversineKm(10, -0.5, 10, 0.5), 9);
  });
});

describe('route legs', () => {
  const a: Vec2 = [0, 0];
  const b: Vec2 = [100, 0];

  it('bulges right of travel on a y-down screen', () => {
    // Travelling +x on screen, "right" is +y (down).
    expect(legControl(a, b, 0.22)).toEqual([50, 22]);
    expect(quadPoint(a, [50, 22], b, 0.5)).toEqual([50, 11]);
    expect(quadPoint(a, [50, 22], b, 0)).toEqual(a);
    expect(quadPoint(a, [50, 22], b, 1)).toEqual(b);
  });

  it('samples each leg and truncates partial legs', () => {
    const pts: Vec2[] = [a, b, [100, 100]];
    expect(routePolyline(pts, 0, 0.22, 'right', 24)).toEqual([a]);
    const full = routePolyline(pts, 2, 0.22, 'right', 24);
    expect(full).toHaveLength(1 + 24 + 24);
    expect(full[24]).toEqual(b);
    const half = routePolyline(pts, 1.5, 0.22, 'right', 24);
    expect(half).toHaveLength(49);
    // Heading down the screen, "right" of travel is -x: control (78, 50), t = 0.5 -> (89, 50).
    expect(half[48]).toEqual([89, 50]);
  });

  it('skips zero-length legs and flips alternate legs', () => {
    expect(routePolyline([a, a, b], 2, 0.22, 'right', 4)).toHaveLength(1 + 4);
    const alt = routePolyline([a, b, [200, 0]], 2, 0.22, 'alternate', 2);
    expect(alt[1]?.[1]).toBeGreaterThan(0);
    expect(alt[3]?.[1]).toBeLessThan(0);
  });
});

describe('graticule steps', () => {
  it('picks 0.25 deg at the season overview zoom in both layouts', () => {
    expect(pickBaseStep(251.1366441059843, 63)).toBe(0.25);
    expect(pickBaseStep(244.457078, 63)).toBe(0.25);
    // Resolution independent: half the size, half the zoom and half the target.
    expect(pickBaseStep(251.1366441059843 / 2, 63 / 2)).toBe(0.25);
  });

  it('majors are whole degrees for a 0.25 base (the original integer rule)', () => {
    expect(pickMajorStep(0.25)).toBe(1);
    expect(pickMajorStep(0.125)).toBe(0.5);
    expect(pickMajorStep(0.1)).toBe(0.5);
    expect(pickMajorStep(0.02)).toBe(0.1);
    expect(pickMajorStep(0.01)).toBe(0.05);
    expect(pickMajorStep(0.025)).toBe(0.1);
    expect(pickMajorStep(0.05)).toBe(0.25);
    expect(pickMajorStep(2)).toBe(10);
    expect(pickMajorStep(5)).toBe(30);
    // Continent and ocean scale: 30 deg majors (150E / 180 / 150W), not 90.
    expect(pickMajorStep(10)).toBe(30);
  });

  it('halves once at zoomSplit x z_ov', () => {
    const splits = gridSplits(251.1366441059843, 1.8, 1);
    expect(splits).toEqual([251.1366441059843 * 1.8]);
    expect(gridStepAt(452.04, 0.25, splits)).toBe(0.25);
    expect(gridStepAt(452.046, 0.25, splits)).toBe(0.125);
    expect(gridStepAt(4620, 0.25, splits)).toBe(0.125);
    expect(gridSplits(100, 2, 2)).toEqual([200, 400]);
    expect(gridStepAt(450, 1, [200, 400])).toBe(0.25);
    expect(gridSplits(100, 2, 0)).toEqual([]);
  });
});
