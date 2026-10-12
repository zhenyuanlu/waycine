import { describe, expect, it } from 'vitest';
import { compile } from '../../src/core/compile.js';
import { toScreen } from '../../src/core/math/mercator.js';
import { sceneAt } from '../../src/core/scene.js';
import { createMeasureBackend } from '../helpers/measure-backend.js';
import { loadSeasonForTestMetric } from '../helpers/projects.js';

/** Season numbers at 1920x1080 (reference values from the original renderer). */
describe('season cameras at 1920x1080', () => {
  const project = loadSeasonForTestMetric();
  const c = compile(project, createMeasureBackend(), {
    width: 1920,
    height: 1080,
    mode: 'segments',
  });

  it('fits the overview: z_ov 251.1366, centre (-72.63, 45.4162)', () => {
    expect(c.profile).toBe('landscape');
    expect(c.S).toBe(1);
    expect(Math.abs(c.ovCam.z - 251.1366)).toBeLessThan(1e-3);
    expect(Math.abs(c.ovCam.cx - -72.63)).toBeLessThan(1e-3);
    expect(Math.abs(c.ovCam.cy - 45.4162)).toBeLessThan(1e-3);
  });

  it('stamp z 577.614, grid split 452.046, finale end z 231.046', () => {
    for (const cam of c.stampCams) {
      expect(Math.abs(cam.z - 577.614)).toBeLessThan(1e-3);
    }
    expect(c.grid.splits).toHaveLength(1);
    expect(Math.abs((c.grid.splits[0] ?? 0) - 452.046)).toBeLessThan(1e-3);
    expect(c.grid.baseStep).toBe(0.25);
    expect(c.grid.majorStep).toBe(1);
    expect(Math.abs(c.finaleEndCam.z - 231.046)).toBeLessThan(1e-3);
    const last = sceneAt(c, c.timeline.totalFrames - 1);
    expect(last.segment.kind).toBe('finale');
    expect(Math.abs(last.cam.z - 231.046)).toBeLessThan(1e-3);
  });

  it('puts every stop pin at (780, 480) on its hold frames', () => {
    for (const seg of c.timeline.segments.filter((s) => s.kind === 'stop')) {
      const stop = c.stops[seg.index];
      if (stop === undefined) {
        throw new Error('missing stop');
      }
      for (let k = seg.nFly; k < seg.nFly + seg.nHold; k++) {
        const s = sceneAt(c, seg.start + k);
        const [x, y] = toScreen(stop.lon, stop.y, s.cam, c.width, c.height);
        expect(Math.abs(x - 780)).toBeLessThan(1e-6);
        expect(Math.abs(y - 480)).toBeLessThan(1e-6);
      }
    }
    // Stop 3 (the fourth race) on its first hold frame, as the reference values state it.
    const s = sceneAt(c, 80 + 3 * 40 + 16);
    const stop3 = c.stops[3];
    expect(s.segment).toEqual({ kind: 'stop', index: 3, k: 16, n: 40 });
    const [x, y] = toScreen(stop3?.lon ?? 0, stop3?.y ?? 0, s.cam, c.width, c.height);
    expect(Math.abs(x - 780)).toBeLessThan(1e-6);
    expect(Math.abs(y - 480)).toBeLessThan(1e-6);
  });

  it('scales with the output size (the fit and pin are resolution independent)', () => {
    const half = compile(project, createMeasureBackend(), {
      width: 960,
      height: 540,
      mode: 'segments',
    });
    expect(half.S).toBe(0.5);
    expect(half.ovCam.z).toBeCloseTo(c.ovCam.z / 2, 9);
    expect(half.ovCam.cx).toBeCloseTo(c.ovCam.cx, 12);
    expect(half.ovCam.cy).toBeCloseTo(c.ovCam.cy, 12);
    expect(half.grid.baseStep).toBe(0.25);
    const s = sceneAt(half, 80 + 16);
    const stop0 = half.stops[0];
    const [x, y] = toScreen(stop0?.lon ?? 0, stop0?.y ?? 0, s.cam, 960, 540);
    expect(x).toBeCloseTo(390, 6);
    expect(y).toBeCloseTo(240, 6);
  });
});

describe('season cameras at 1080x1920 read from the portrait layout', () => {
  const c = compile(loadSeasonForTestMetric(), createMeasureBackend(), {
    width: 1080,
    height: 1920,
    mode: 'segments',
  });

  it('fits z_ov 244.457078 around (-72.88, 45.716191) and pins stops at (302.4, 576)', () => {
    expect(c.profile).toBe('portrait');
    expect(Math.abs(c.ovCam.z - 244.457078)).toBeLessThan(1e-6);
    expect(Math.abs(c.ovCam.cx - -72.88)).toBeLessThan(1e-6);
    expect(Math.abs(c.ovCam.cy - 45.716191)).toBeLessThan(1e-6);
    expect(Math.abs((c.stampCams[0]?.z ?? 0) - 562.251279)).toBeLessThan(1e-6);
    expect(Math.abs((c.grid.splits[0] ?? 0) - 440.02274)).toBeLessThan(1e-6);
    expect(Math.abs(c.finaleEndCam.z - 224.900512)).toBeLessThan(1e-6);
    expect(c.grid.baseStep).toBe(0.25);
    const s = sceneAt(c, 80 + 5 * 40 + 20);
    const stop = c.stops[5];
    const [x, y] = toScreen(stop?.lon ?? 0, stop?.y ?? 0, s.cam, c.width, c.height);
    expect(Math.abs(x - 302.4)).toBeLessThan(1e-6);
    expect(Math.abs(y - 576)).toBeLessThan(1e-6);
  });
});

describe('season timeline at 30000/1001', () => {
  const project = loadSeasonForTestMetric();
  const c = compile(project, createMeasureBackend(), { mode: 'segments' });

  it('defaults to the project output size and has 80 + 7 x 40 + 80 = 440 frames', () => {
    expect([c.width, c.height]).toEqual([1920, 1080]);
    expect(c.fps).toEqual({ num: 30000, den: 1001 });
    expect(c.timeline.totalFrames).toBe(440);
    expect(c.timeline.segments.map((s) => [s.kind, s.start, s.n])).toEqual([
      ['overview', 0, 80],
      ['stop', 80, 40],
      ['stop', 120, 40],
      ['stop', 160, 40],
      ['stop', 200, 40],
      ['stop', 240, 40],
      ['stop', 280, 40],
      ['stop', 320, 40],
      ['finale', 360, 80],
    ]);
    expect(c.frames).toEqual({ titleFade: 8, cardDelay: 3, cardFade: 6 });
  });

  it('splits each stop 16 / 16 / 8 (fly / hold / zoom)', () => {
    for (const seg of c.timeline.segments.filter((s) => s.kind === 'stop')) {
      expect([seg.nFly, seg.nHold, seg.nZoom]).toEqual([16, 16, 8]);
      expect([seg.recoverFrames, seg.outroFrames, seg.cardOutFrames]).toEqual([0, 0, 0]);
    }
  });

  it('zoom-through table for k = 32..39', () => {
    const zf = [1.07, 1.33, 1.81, 2.52, 3.49, 4.72, 6.22, 8.0];
    const blur = [0.09, 0.38, 0.84, 1.5, 2.34, 3.38, 4.59, 6.0];
    const flash = [0, 0, 0, 0, 0.068, 0.296, 0.614, 1.0];
    for (const stop of [0, 3, 6]) {
      const start = 80 + stop * 40;
      const zs = c.stampCams[stop]?.z ?? 0;
      for (let j = 0; j < 8; j++) {
        const s = sceneAt(c, start + 32 + j);
        expect(s.segment.k).toBe(32 + j);
        expect((s.cam.z / zs).toFixed(2)).toBe((zf[j] ?? 0).toFixed(2));
        expect(s.post.blurDu.toFixed(2)).toBe((blur[j] ?? 0).toFixed(2));
        expect(s.post.flash.toFixed(3)).toBe((flash[j] ?? 0).toFixed(3));
      }
      // Hold frames have no post-processing.
      expect(sceneAt(c, start + 31).post).toEqual({ blurDu: 0, flash: 0 });
    }
  });

  it('zoom-through centres on the pin by the last frame', () => {
    const s = sceneAt(c, 80 + 2 * 40 + 39);
    expect(s.cam.cx).toBeCloseTo(c.stops[2]?.lon ?? 0, 12);
    expect(s.cam.cy).toBeCloseTo(c.stops[2]?.y ?? 0, 12);
  });

  it('stop timing: card from k = 3, pin lights at k = 13', () => {
    const start = 80 + 40;
    expect(sceneAt(c, start + 2).card).toBeNull();
    const card = sceneAt(c, start + 3).card;
    expect(card?.u).toBe(0);
    expect(card?.anchorCam).toEqual(c.stampCams[1]);
    expect(sceneAt(c, start + 9).card?.u).toBe(1);
    expect(sceneAt(c, start + 12).lit).toBe(0);
    expect(sceneAt(c, start + 12).pulses).toEqual([]);
    const lit = sceneAt(c, start + 13);
    expect(lit.lit).toBe(1);
    expect(lit.pulses[0]?.index).toBe(1);
    expect(lit.pulses[0]?.u).toBeCloseTo((13 - 12.8) / 18, 12);
    expect(sceneAt(c, start + 8).routeUpto).toBe(0.5);
    expect(sceneAt(c, start + 16).routeUpto).toBe(1);
  });

  it('overview and finale timing', () => {
    const first = sceneAt(c, 0);
    expect(first.title?.alpha).toBe(0);
    expect(first.routeUpto).toBe(0);
    expect(first.pulses).toEqual([{ index: 0, u: 0 }]);
    expect(first.pinLabels).toBe(true);
    expect(sceneAt(c, 8).title?.alpha).toBe(1);
    expect(sceneAt(c, 56).routeUpto).toBe(6);
    expect(sceneAt(c, 79).cam.z).toBeCloseTo(c.ovCam.z * 1.05, 9);
    expect(sceneAt(c, 79).overlayAlpha).toBe(1);

    const fin = 360;
    expect(sceneAt(c, fin + 24).pulses).toEqual([]);
    expect(sceneAt(c, fin + 25).pulses).toHaveLength(7);
    expect(sceneAt(c, fin + 28).stats).toBeNull();
    expect(sceneAt(c, fin + 29).stats?.u).toBeCloseTo(1 / 24, 12);
    expect(sceneAt(c, fin + 44).cam.z).toBeCloseTo(c.finaleEndCam.z, 9);
    expect(sceneAt(c, fin).pinLabels).toBe(false);
    expect(sceneAt(c, fin + 79).pinLabels).toBe(true);
  });

  it('clamps frames outside the timeline', () => {
    expect(sceneAt(c, -5)).toEqual(sceneAt(c, 0));
    expect(sceneAt(c, 10_000)).toEqual(sceneAt(c, 439));
    expect(sceneAt(c, Number.NaN)).toEqual(sceneAt(c, 0));
    expect(sceneAt(c, 12.7)).toEqual(sceneAt(c, 12));
  });
});

describe('resolved text and stats for the season', () => {
  const c = compile(loadSeasonForTestMetric(), createMeasureBackend());

  it('resolves the title, subtitle and kickers', () => {
    // The title and subtitle fit, so they keep the layout sizes (44 / 28 Du); no description.
    expect(c.text).toEqual({
      title: '2026 SEASON ROUTE',
      subtitle: '7 RACES  /  5 STATES',
      titleSize: 44,
      subSize: 28,
      description: '',
      descSize: 22,
      descFinale: null,
    });
    expect(c.warnings).toEqual([]);
    expect(c.stops.map((s) => s.kicker)).toEqual([
      'RACE 01 / 07',
      'RACE 02 / 07',
      'RACE 03 / 07',
      'RACE 04 / 07',
      'RACE 05 / 07',
      'RACE 06 / 07',
      'RACE 07 / 07',
    ]);
  });

  it('stats 7 / 5 / 4', () => {
    expect(c.stats).toEqual([
      { value: '7', label: 'RACES' },
      { value: '5', label: 'STATES' },
      { value: '4', label: 'MONTHS' },
    ]);
  });

  it('formats card and pin dates, results and partner lines', () => {
    expect(c.stops[0]?.cardDate).toBe('2026.06.13');
    expect(c.stops[0]?.pinDate).toBe('06.13');
    expect(c.stops[0]?.results[0]).toEqual({
      medal: 'gold',
      text: '500M  6TH  (1ST ALUMNI)',
      count: 1,
    });
    expect(c.stops[3]?.results.map((r) => r.count)).toEqual([2, 3]);
    // Result lines are verbatim even with text.uppercase.
    expect(c.project.text.uppercase).toBe(true);
    expect(c.stops[3]?.results.map((r) => r.text)).toEqual(['1ST x2', '3RD x3']);
    expect(c.stops[3]?.partnerLines).toEqual(['JOINT CREW LED BY FICTIONAL DRAGON BOAT TEAM']);
    expect(c.stops.map((s) => s.pinOf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(c.stops.every((s) => s.citySize === 118 && s.eventSize === 30)).toBe(true);
    expect(c.fonts.display).toBe('WaycineDisplay');
    expect(c.fonts.body).toBe('WaycineBody');
    expect(c.fonts.anchorEm).toEqual({ display: 1626 / 2048, body: 1626 / 2048 });
    expect(c.fonts.identity).toEqual({
      display: 'bundled:BarlowCondensed-Bold.ttf',
      body: 'bundled:BarlowSemiCondensed-SemiBold.ttf',
    });
  });

  it('anchors other fonts at their cap height plus the original cap-top gap', () => {
    const project = loadSeasonForTestMetric();
    project.fonts.display = { ...project.fonts.display, family: 'Some Font', source: 'bundled' };
    const backend = createMeasureBackend({ capHeightEm: 0.72 });
    const other = compile(project, backend);
    expect(other.fonts.display).toBe('"Some Font"');
    expect(other.fonts.anchorEm.display).toBeCloseTo(0.72 + (1626 - 1454) / 2048, 12);
    expect(other.fonts.anchorEm.body).toBe(1626 / 2048);
    expect(other.fonts.identity.display).toBe('family:Some Font');
  });

  it('measures fit widths with kerning off', () => {
    const kerning: unknown[] = [];
    const backend = createMeasureBackend({ onKerning: (value) => kerning.push(value) });
    compile(loadSeasonForTestMetric(), backend);
    expect(kerning).toEqual(['none']);
  });
});
