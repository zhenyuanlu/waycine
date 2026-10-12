import { describe, expect, it } from 'vitest';
import { compile } from '../../src/core/compile.js';
import { cardLayout } from '../../src/core/draw/card.js';
import { pinLabelLayout } from '../../src/core/draw/pin-labels.js';
import { statsLayout } from '../../src/core/draw/stats.js';
import { pinPoint } from '../../src/core/draw/util.js';
import { mercY, toScreen } from '../../src/core/math/mercator.js';
import { sceneAt } from '../../src/core/scene.js';
import type { Compiled } from '../../src/core/scene-types.js';
import { pickProfile } from '../../src/core/schema/output.js';
import type { WaycineProject } from '../../src/core/schema/types.js';
import { createMeasureBackend } from '../helpers/measure-backend.js';
import { loadSeasonForTestMetric } from '../helpers/projects.js';

/**
 * Layout profiles: auto pick by aspect, the portrait numbers of the original
 * 9:16 scene at any size, and the new square geometry (fit box .10/.10/.30/.12,
 * stop pin at (0.28 W, 0.27 H), card below the pin at x 80 / +110, stats row
 * at (80, 90) with pitch 320).
 */

const backend = createMeasureBackend();
const measure = backend.createSurface(1, 1).getContext2d();

function season(width: number, height: number, edit?: (p: WaycineProject) => void): Compiled {
  const p = loadSeasonForTestMetric();
  edit?.(p);
  return compile(p, backend, { width, height, mode: 'segments' });
}

function stopHold(c: Compiled, i: number): number {
  const seg = c.timeline.segments.find((s) => s.kind === 'stop' && s.index === i);
  if (seg === undefined) throw new Error(`no stop ${i}`);
  return seg.start + seg.nFly;
}

describe('profile auto-pick (> 1.2 landscape, < 0.83 portrait, else square)', () => {
  it('picks by the width / height ratio', () => {
    expect(pickProfile(1920, 1080, 'auto')).toBe('landscape');
    expect(pickProfile(1210, 1000, 'auto')).toBe('landscape');
    expect(pickProfile(1200, 1000, 'auto')).toBe('square');
    expect(pickProfile(830, 1000, 'auto')).toBe('square');
    expect(pickProfile(820, 1000, 'auto')).toBe('portrait');
    expect(pickProfile(1080, 1350, 'auto')).toBe('portrait');
    expect(pickProfile(1080, 1920, 'auto')).toBe('portrait');
  });

  it('compiles each aspect with its profile', () => {
    expect(season(1920, 1080).profile).toBe('landscape');
    expect(season(1080, 1920).profile).toBe('portrait');
    expect(season(1080, 1080).profile).toBe('square');
    expect(season(1080, 1080, (p) => (p.output.layout = 'portrait')).profile).toBe('portrait');
  });
});

describe('portrait profile (the original 9:16 scene)', () => {
  it('z_ov 244.457078 and the stop pin at (302.4, 576) in 1080 x 1920', () => {
    const c = season(1080, 1920);
    expect(Math.abs(c.ovCam.z - 244.457078)).toBeLessThan(1e-6);
    for (let i = 0; i < c.stops.length; i++) {
      const p = pinPoint(c, i, sceneAt(c, stopHold(c, i)).cam);
      expect(p.x).toBeCloseTo(302.4, 9);
      expect(p.y).toBeCloseTo(576, 9);
    }
  });

  it('is resolution independent: 720 x 1280 is the same frame scaled by 2/3', () => {
    const big = season(1080, 1920);
    const small = season(720, 1280);
    expect(small.S).toBeCloseTo(2 / 3, 15);
    expect(small.ovCam.z).toBeCloseTo(big.ovCam.z * (2 / 3), 9);
    const p = pinPoint(small, 3, sceneAt(small, stopHold(small, 3)).cam);
    expect(p.x).toBeCloseTo(201.6, 9);
    expect(p.y).toBeCloseTo(384, 9);
    const card = cardLayout(measure, small, sceneAt(small, stopHold(small, 3) + 10).card);
    expect(card?.lx).toBeCloseTo(60, 9);
    expect(card?.ly).toBeCloseTo(384 + 80, 9);
  });

  it('card below the pin: x 90 + slide, y + 120, vertical leader, bar 236 + 70 + 36 per result', () => {
    const c = season(1080, 1920);
    const k0 = c.timeline.segments[4]?.start ?? 0; // stop 4 (FLUSHING, partner + 2 results)
    const first = cardLayout(measure, c, sceneAt(c, k0 + 3).card);
    const settled = cardLayout(measure, c, sceneAt(c, k0 + 20).card);
    expect(first?.lx).toBeCloseTo(90 + 40, 9); // u = 0: full 40 Du slide
    expect(settled?.lx).toBe(90);
    expect(settled?.ly).toBeCloseTo(576 + 120, 9);
    expect(settled?.leader).toEqual(
      [302.4, 576 + 16, 302.4, 576 + 120 - 14].map((v) => expect.closeTo(v, 9)),
    );
    expect(settled?.bar[3]).toBe(236 + 70 + 2 * 36);
    expect(settled?.texts.map((t) => t.text)).toEqual([
      'RACE 04 / 07',
      'FLUSHING',
      'FLUSHING MEADOWS DRAGON BOAT FESTIVAL',
      '2026.08.09',
      'JOINT CREW LED BY',
      'FICTIONAL DRAGON BOAT TEAM',
    ]);
    const rows = settled?.results ?? [];
    expect(rows.map((r) => [r.medalX, r.text.x])).toEqual([
      [90 + 22, 90 + 38],
      [90 + 22, 90 + 38],
    ]);
    expect((rows[1]?.text.y ?? 0) - (rows[0]?.text.y ?? 0)).toBeCloseTo(36, 9);
    expect(rows[0]?.text.y).toBeCloseTo(696 + 244 + 2 * 34, 9);
  });

  it('title (80, 260) 64 Du, subtitle (80, 340) 34 Du; stats stacked at y 250 + 150 j', () => {
    const c = season(1080, 1920);
    expect(c.layout.title).toMatchObject({ x: 80, y: 260, size: 64, subY: 340, subSize: 34 });
    const items = statsLayout(measure, c, 1);
    expect(items.map((it) => [it.x, it.y, it.labelX, it.labelY])).toEqual([
      [80, 250, 175, 300],
      [80, 400, 175, 450],
      [80, 550, 175, 600],
    ]);
  });
});

describe('square profile (new geometry)', () => {
  const c = season(1080, 1080);
  const lons = c.stops.map((s) => s.lon);
  const ys = c.stops.map((s) => mercY(s.lat));
  const dlon = Math.max(...lons) - Math.min(...lons);
  const dy = Math.max(...ys) - Math.min(...ys);

  it('fits the route into the box .10 / .10 / .30 / .12 of the frame', () => {
    const z = Math.min((1080 - 216) / dlon, (1080 - 453.6) / dy);
    expect(c.ovCam.z).toBeCloseTo(z, 9);
    const s = sceneAt(c, 0);
    const pts = c.stops.map((st) => toScreen(st.lon, st.y, s.cam, 1080, 1080));
    const xs = pts.map(([x]) => x);
    const sy = pts.map(([, y]) => y);
    // The binding axis touches its box edges; the other stays inside.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(108 - 1e-9);
    expect(Math.max(...xs)).toBeLessThanOrEqual(972 + 1e-9);
    expect(Math.min(...sy)).toBeCloseTo(324, 6);
    expect(Math.max(...sy)).toBeCloseTo(1080 - 129.6, 6);
  });

  it('puts the stop pin at (0.28 W, 0.27 H) and the card below it at x 80 / +110', () => {
    for (let i = 0; i < c.stops.length; i++) {
      const s = sceneAt(c, stopHold(c, i) + 10);
      const p = pinPoint(c, i, s.cam);
      expect(p.x).toBeCloseTo(302.4, 9);
      expect(p.y).toBeCloseTo(291.6, 9);
      const card = cardLayout(measure, c, s.card);
      expect(card?.lx).toBe(80);
      expect(card?.ly).toBeCloseTo(291.6 + 110, 9);
      // The whole card, bar included, stays inside the frame.
      const bar = card?.bar ?? [0, 0, 0, 0];
      expect(bar[1] + bar[3]).toBeLessThan(1080);
    }
  });

  it('title (72, 100) 52 Du and a stats row at (80, 90), pitch 320, number 150, label +100 / +55', () => {
    expect(c.layout.title).toMatchObject({ x: 72, y: 100, size: 52, subY: 164, subSize: 30 });
    const items = statsLayout(measure, c, 1);
    // With the 0.5 em test metric "STATES" is 100 + 168 = 268 Du wide, so the
    // pitch after it widens to 268 + 60 = 328 (the overflow rule).
    expect(items.map((it) => [it.x, it.y, it.labelX, it.labelY])).toEqual([
      [80, 90, 180, 145],
      [400, 90, 500, 145],
      [728, 90, 828, 145],
    ]);
  });

  it('flips pin labels left of 0.55 W and draws no medal dots', () => {
    const s = sceneAt(c, c.timeline.totalFrames - 1);
    let flipped = 0;
    for (let i = 0; i < c.stops.length; i++) {
      const p = pinPoint(c, i, s.cam);
      const g = pinLabelLayout(measure, c, i, p.x, p.y);
      expect(g?.flip).toBe(p.x > 0.55 * 1080);
      expect(g?.dots).toEqual([]);
      if (g?.flip) flipped++;
    }
    expect(flipped).toBeGreaterThan(0);
  });
});
