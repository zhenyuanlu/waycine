import { describe, expect, it } from 'vitest';
import { compile } from '../../src/core/compile.js';
import { outCubic } from '../../src/core/math/easing.js';
import { toScreen } from '../../src/core/math/mercator.js';
import { sceneAt } from '../../src/core/scene.js';
import { createDefaultProject } from '../../src/core/schema/defaults.js';
import type { Stop, WaycineProject } from '../../src/core/schema/types.js';
import { validateProject } from '../../src/core/schema/validate.js';
import { secondsToCount, secondsToFrames } from '../../src/core/timeline.js';
import { createMeasureBackend } from '../helpers/measure-backend.js';
import { loadSeasonForTestMetric } from '../helpers/projects.js';
import { allStates, finiteDeep } from '../helpers/timeline.js';

const backend = createMeasureBackend();

function projectWith(stops: Stop[], edit?: (p: WaycineProject) => void): WaycineProject {
  const p = createDefaultProject();
  p.stops = stops;
  edit?.(p);
  const { project, issues } = validateProject(p);
  expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  return project;
}

describe('frame conversion', () => {
  const fps = { num: 30000, den: 1001 };

  it('turns seconds into frames: segments >= 1, delays >= 0', () => {
    expect(secondsToFrames((80 * 1001) / 30000, fps)).toBe(80);
    expect(secondsToFrames((40 * 1001) / 30000, fps)).toBe(40);
    expect(secondsToFrames(0, fps)).toBe(1);
    expect(secondsToCount(0, fps)).toBe(0);
    expect(secondsToCount((3 * 1001) / 30000, fps)).toBe(3);
    expect(secondsToFrames(2, { num: 30, den: 1 })).toBe(60);
  });
});

describe('single export mode', () => {
  const season = loadSeasonForTestMetric();
  const c = compile(season, backend, { width: 1920, height: 1080, mode: 'single' });
  const seg = compile(season, backend, { width: 1920, height: 1080, mode: 'segments' });

  it('keeps the same 440-frame timeline', () => {
    expect(c.mode).toBe('single');
    expect(c.timeline.totalFrames).toBe(440);
  });

  it('fades the overview overlays out over the last 8 frames', () => {
    const ov = c.timeline.segments[0];
    expect(ov?.outroFrames).toBe(8);
    for (let k = 0; k < 72; k++) {
      expect(sceneAt(c, k).overlayAlpha).toBe(1);
    }
    for (let k = 72; k < 80; k++) {
      const j = k - 72 + 1;
      expect(sceneAt(c, k).overlayAlpha).toBeCloseTo(1 - outCubic(j / 8), 12);
    }
    expect(sceneAt(c, 79).overlayAlpha).toBe(0);
    // Everything else about the overview is unchanged.
    const a = sceneAt(c, 75);
    const b = sceneAt(seg, 75);
    expect({ ...a, overlayAlpha: 1 }).toEqual(b);
  });

  it('flies stop 0 from the overview end camera', () => {
    const stop0 = c.timeline.segments[1];
    expect(stop0?.startCam).toEqual(sceneAt(c, 79).cam);
    expect(sceneAt(c, 80).cam).toEqual(sceneAt(c, 79).cam);
    expect(seg.timeline.segments[1]?.startCam).toEqual(seg.ovCam);
  });

  it('recovers from the flash over 6 frames after each zoom-through', () => {
    for (const s of c.timeline.segments) {
      const expected = s.kind === 'stop' ? (s.index > 0 ? 6 : 0) : s.kind === 'finale' ? 6 : 0;
      expect(s.recoverFrames).toBe(expected);
    }
    const start = 80 + 40;
    for (let k = 0; k < 6; k++) {
      // One step in: the zoom-through already ended on the pure flash frame.
      expect(sceneAt(c, start + k).post.flash).toBeCloseTo(1 - outCubic((k + 1) / 7), 12);
      expect(sceneAt(c, start + k).post.blurDu).toBe(0);
    }
    // Exactly one pure flash frame at each boundary: the last zoom-through frame.
    expect(sceneAt(c, start - 1).post.flash).toBe(1);
    expect(sceneAt(c, start).post.flash).toBeLessThan(1);
    expect(sceneAt(c, start + 6).post.flash).toBe(0);
    expect(sceneAt(c, 359).post.flash).toBe(1);
    expect(sceneAt(c, 360).post.flash).toBeLessThan(1);
    expect(sceneAt(c, 366).post.flash).toBe(0);
    // Zoom-through frames are the same as in segments mode.
    for (let k = 32; k < 40; k++) {
      expect(sceneAt(c, 200 + k).post).toEqual(sceneAt(seg, 200 + k).post);
    }
  });

  it('skips the last zoom-through when the finale is disabled', () => {
    const p = loadSeasonForTestMetric();
    p.timing.finale.enabled = false;
    const nf = compile(p, backend, { mode: 'single' });
    expect(nf.timeline.totalFrames).toBe(360);
    const last = nf.timeline.segments[nf.timeline.segments.length - 1];
    expect(last?.kind).toBe('stop');
    expect([last?.nFly, last?.nHold, last?.nZoom]).toEqual([16, 24, 0]);
    expect(sceneAt(nf, 359).post).toEqual({ blurDu: 0, flash: 0 });
    expect(sceneAt(nf, 359).cam).toEqual(nf.stampCams[6]);
  });
});

describe('fly transition and end hold', () => {
  it('fly mode has no zoom phase and fades the card out', () => {
    const p = loadSeasonForTestMetric();
    p.timing.transition.mode = 'fly';
    const c = compile(p, backend, { mode: 'single' });
    const stops = c.timeline.segments.filter((s) => s.kind === 'stop');
    for (const s of stops) {
      expect([s.nFly, s.nHold, s.nZoom, s.cardOutFrames, s.recoverFrames]).toEqual([
        16, 24, 0, 6, 0,
      ]);
    }
    const start = 80 + 40;
    expect(sceneAt(c, start + 33).card?.alpha).toBe(1);
    expect(sceneAt(c, start + 34).card?.alpha).toBeCloseTo(1 - outCubic(1 / 6), 12);
    expect(sceneAt(c, start + 39).card?.alpha).toBe(0);
    expect(allStates(c).every((s) => s.post.blurDu === 0 && s.post.flash === 0)).toBe(true);
    // The next stop's flight starts where this one ended, one step in: its first
    // frame never repeats this stop's last frame.
    const next = c.timeline.segments.find((s) => s.kind === 'stop' && s.index === 2);
    expect(next?.startCam).toEqual(sceneAt(c, start + 39).cam);
    expect(sceneAt(c, start + 40).cam).not.toEqual(sceneAt(c, start + 39).cam);
  });

  it('an end hold repeats the last frame', () => {
    const p = loadSeasonForTestMetric();
    p.timing.endHoldSec = 1;
    const c = compile(p, backend, { mode: 'single' });
    const hold = c.timeline.segments[c.timeline.segments.length - 1];
    expect(hold?.kind).toBe('hold');
    expect(hold?.n).toBe(30);
    expect(c.timeline.totalFrames).toBe(470);
    const last = sceneAt(c, 439);
    const held = sceneAt(c, 469);
    expect(held.segment).toEqual({ kind: 'hold', index: 0, k: 29, n: 30 });
    expect({ ...held, frame: last.frame, segment: last.segment }).toEqual(last);
  });
});

describe('determinism', () => {
  it('sceneAt is a pure function of (compiled, frame)', () => {
    const p = loadSeasonForTestMetric();
    const a = compile(p, backend);
    const b = compile(loadSeasonForTestMetric(), backend);
    const first = allStates(a);
    expect(allStates(a)).toEqual(first);
    expect(allStates(b)).toEqual(first);
    // Reverse order gives the same states (no hidden state between calls).
    const reversed = Array.from({ length: a.timeline.totalFrames }, (_, i) =>
      sceneAt(a, a.timeline.totalFrames - 1 - i),
    ).reverse();
    expect(reversed).toEqual(first);
    expect(first.every(finiteDeep)).toBe(true);
  });
});

describe('small and unusual journeys', () => {
  it('N = 1: no route, a finite single-stop camera and a working timeline', () => {
    const p = projectWith([{ id: 'a', city: 'Lisbon', lat: 38.7223, lon: -9.1393 }]);
    const c = compile(p, backend);
    expect(c.stops).toHaveLength(1);
    expect(c.timeline.totalFrames).toBe(200);
    const states = allStates(c);
    expect(states.every(finiteDeep)).toBe(true);
    expect(states.every((s) => s.routeUpto === 0)).toBe(true);
    expect(c.ovCam.z).toBeGreaterThan(0);
    const overviewPulses = states.slice(0, 80).map((s) => s.pulses[0]?.u ?? -1);
    expect(overviewPulses[0]).toBe(0);
    expect(Math.max(...overviewPulses)).toBeGreaterThan(0.5);
    expect(c.text.subtitle).toBe('1 STOP  /  0 KM');
    expect(c.stats).toEqual([
      { value: '1', label: 'STOP' },
      { value: '0', label: 'KM' },
    ]);
    const hold = sceneAt(c, 80 + 20);
    const [x, y] = toScreen(c.stops[0]?.lon ?? 0, c.stops[0]?.y ?? 0, hold.cam, 1920, 1080);
    expect(x).toBeCloseTo(780, 6);
    expect(y).toBeCloseTo(480, 6);
  });

  it('N = 2: one leg, pulses and cards for both stops', () => {
    const p = projectWith([
      { id: 'a', city: 'Lisbon', lat: 38.7223, lon: -9.1393, date: '2026-05-01' },
      { id: 'b', city: 'Madrid', lat: 40.4168, lon: -3.7038, date: '2026-05-04' },
    ]);
    const c = compile(p, backend, { mode: 'single' });
    expect(c.timeline.totalFrames).toBe(240);
    const states = allStates(c);
    expect(states.every(finiteDeep)).toBe(true);
    expect(sceneAt(c, 79).routeUpto).toBe(1);
    expect(sceneAt(c, 120 + 16).routeUpto).toBe(1);
    expect(states.filter((s) => s.card !== null).map((s) => s.card?.stop)).toContain(1);
    expect(c.stops.map((s) => s.kicker)).toEqual(['STOP 01 / 02', 'STOP 02 / 02']);
    expect(c.stats[0]).toEqual({ value: '2', label: 'STOPS' });
  });

  it('crosses the antimeridian without a 360 degree jump', () => {
    const p = projectWith([
      { id: 'a', city: 'Tokyo', lat: 35.68, lon: 139.69 },
      { id: 'b', city: 'Honolulu', lat: 21.31, lon: -157.86 },
      { id: 'c', city: 'San Francisco', lat: 37.77, lon: -122.42 },
    ]);
    const c = compile(p, backend);
    [139.69, 202.14, 237.58].forEach((lon, i) => {
      expect(c.stops[i]?.lon).toBeCloseTo(lon, 9);
    });
    expect(c.ovCam.cx).toBeGreaterThan(139.69);
    expect(c.ovCam.cx).toBeLessThan(237.58);
    expect(allStates(c).every(finiteDeep)).toBe(true);
  });

  it('merges duplicate locations into one pin with a combined date', () => {
    const p = projectWith([
      { id: 'a', city: 'Boston', lat: 42.369, lon: -71.121, date: '2026-06-13' },
      { id: 'b', city: 'Worcester', lat: 42.26, lon: -71.8, date: '2026-07-01' },
      { id: 'c', city: 'Boston', lat: 42.369, lon: -71.121, date: '2026-09-05' },
    ]);
    const c = compile(p, backend);
    expect(c.stops.map((s) => s.pinOf)).toEqual([0, 1, 0]);
    expect(c.stops[0]?.pinDate).toBe('06.13 / 09.05');
    expect(c.stops[2]?.pinDate).toBe('06.13 / 09.05');
    expect(c.stops[1]?.pinDate).toBe('07.01');
  });

  it('skips hidden stops and refuses a project with none visible', () => {
    const p = projectWith([
      { id: 'a', city: 'Lisbon', lat: 38.7223, lon: -9.1393 },
      { id: 'b', city: 'Porto', lat: 41.15, lon: -8.61, hidden: true },
      { id: 'c', city: 'Madrid', lat: 40.4168, lon: -3.7038 },
    ]);
    const c = compile(p, backend);
    expect(c.stops.map((s) => [s.index, s.sourceIndex, s.city])).toEqual([
      [0, 0, 'LISBON'],
      [1, 2, 'MADRID'],
    ]);
    const hidden = createDefaultProject();
    hidden.stops = [{ id: 'a', city: 'X', lat: 1, lon: 1, hidden: true }];
    expect(() => compile(hidden, backend)).toThrow(/no visible stop/);
  });

  it('without an overview, stop 0 flies from the fit camera', () => {
    const p = loadSeasonForTestMetric();
    p.timing.overview.enabled = false;
    const c = compile(p, backend, { mode: 'single' });
    expect(c.timeline.segments[0]?.kind).toBe('stop');
    expect(c.timeline.segments[0]?.startCam).toEqual(c.ovCam);
    expect(c.timeline.totalFrames).toBe(360);
  });

  it('auto-fits a long card city and event only when they overflow', () => {
    const p = loadSeasonForTestMetric();
    const first = p.stops[0];
    if (first === undefined) {
      throw new Error('missing stop');
    }
    first.city = 'A'.repeat(40);
    first.event = 'B'.repeat(200);
    const c = compile(p, backend);
    // Measure-only backend: 0.5 em per glyph. The landscape card city starts at
    // x = 960 - 180 + 70 + 8 = 858 px, so its limit is 1920 - 72 - 858 = 990 px
    // (the right margin), not W - 170.
    const city = c.stops[0]?.citySize ?? 0;
    expect(city).toBeLessThan(118);
    expect(0.5 * city * 40 <= 990 || city <= 60).toBe(true);
    expect(c.stops[0]?.eventSize).toBeLessThanOrEqual(20);
    expect(c.stops[1]?.citySize).toBe(118);
  });

  it('auto-fits with the measured width times fonts.*.widthAdjust', () => {
    const p = loadSeasonForTestMetric();
    const first = p.stops[0];
    if (first === undefined) {
      throw new Error('missing stop');
    }
    // 0.5 em per glyph: 16 glyphs at 118 px are 944 px, inside the 990 px limit.
    first.city = 'C'.repeat(16);
    expect(compile(p, backend).stops[0]?.citySize).toBe(118);
    p.fonts.display.widthAdjust = 1.1;
    // 944 * 1.1 = 1038 px overflows; 112 px gives 896 * 1.1 = 985.6 px.
    expect(compile(p, backend).stops[0]?.citySize).toBe(112);
    p.fonts.display.widthAdjust = 1;
    p.fonts.display.sizeAdjust = 1.1;
    expect(compile(p, backend).stops[0]?.citySize).toBe(112);
  });
});
