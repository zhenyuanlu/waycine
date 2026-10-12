import { describe, expect, it } from 'vitest';
import { compile } from '../../src/core/compile.js';
import { cardLayout, drawCard } from '../../src/core/draw/card.js';
import { drawGraticule } from '../../src/core/draw/graticule.js';
import { pinLabelLayout } from '../../src/core/draw/pin-labels.js';
import { drawPins } from '../../src/core/draw/pins.js';
import { routePath } from '../../src/core/draw/route.js';
import { statsLayout } from '../../src/core/draw/stats.js';
import { pinPoint } from '../../src/core/draw/util.js';
import { sceneAt } from '../../src/core/scene.js';
import type { Compiled, SceneState, TimelineSegment } from '../../src/core/scene-types.js';
import type { ProfileId, WaycineProject } from '../../src/core/schema/types.js';
import { validateProject } from '../../src/core/schema/validate.js';
import { createMeasureBackend } from '../helpers/measure-backend.js';
import {
  FIXTURE_PROJECTS,
  loadFixtureProject,
  loadPresetForTestMetric,
  loadSeasonForTestMetric,
  readFixtureProject,
} from '../helpers/projects.js';
import { recordingCtx, texts } from '../helpers/record-ctx.js';
import { allStates, finiteDeep, segment } from '../helpers/timeline.js';

/**
 * Generalized journeys: the test projects in `fixtures/projects/` and
 * the Europe preset, in every profile, plus the fly transition.
 */

const backend = createMeasureBackend();
const measure = backend.createSurface(1, 1).getContext2d();
const FIXTURES = FIXTURE_PROJECTS;
const SIZES: Record<ProfileId, [number, number]> = {
  landscape: [1280, 720],
  portrait: [720, 1280],
  square: [720, 720],
};

function at(profile: ProfileId, project: WaycineProject): Compiled {
  const [width, height] = SIZES[profile];
  return compile(project, backend, { width, height });
}

/** The scene without its frame and segment numbers (what the pixels depend on). */
function look(s: SceneState): Omit<SceneState, 'frame' | 'segment'> {
  const { frame: _frame, segment: _segment, ...rest } = s;
  return rest;
}

/**
 * Fly continuity between two consecutive parts: the next part's flight starts
 * from the camera of this part's last frame, one step in, so its first frame
 * moves on (never a frozen duplicate) by no more than a mid-flight step.
 */
function expectSeamless(c: Compiled, prev: TimelineSegment, next: TimelineSegment): void {
  const last = sceneAt(c, prev.start + prev.n - 1);
  const first = sceneAt(c, next.start);
  expect(next.startCam).toEqual(last.cam);
  expect(look(first)).not.toEqual(look(last));
  const move = (a: SceneState, b: SceneState): number =>
    Math.hypot(a.cam.cx - b.cam.cx, a.cam.cy - b.cam.cy) + Math.abs(Math.log(a.cam.z / b.cam.z));
  let maxStep = 0;
  for (let k = 1; k < Math.max(2, next.nFly); k++) {
    maxStep = Math.max(maxStep, move(sceneAt(c, next.start + k), sceneAt(c, next.start + k - 1)));
  }
  if (next.kind === 'stop' && next.nFly > 1) {
    expect(move(first, last)).toBeLessThanOrEqual(maxStep + 1e-12);
  }
}

describe('test projects', () => {
  it.each(FIXTURES)('%s validates cleanly and renders finite states in every profile', (name) => {
    const { issues } = validateProject(readFixtureProject(name));
    expect(issues).toEqual([]);
    const project = loadFixtureProject(name);
    for (const profile of ['landscape', 'portrait', 'square'] as const) {
      for (const mode of ['single', 'segments'] as const) {
        const [width, height] = SIZES[profile];
        const c = compile(project, backend, { width, height, mode });
        expect(c.profile).toBe(profile);
        expect(allStates(c).every(finiteDeep)).toBe(true);
      }
    }
  });
});

describe('antimeridian (Tokyo -> Honolulu -> San Francisco)', () => {
  const c = compile(loadFixtureProject('pacific'), backend);

  it('unwraps longitudes eastward so no leg jumps 360 degrees', () => {
    expect(c.stops.map((s) => s.lon)).toEqual(
      [139.6503, 202.1419, 237.5806].map((v) => expect.closeTo(v, 9)),
    );
    expect(c.ovCam.cx).toBeGreaterThan(180);
    const path = routePath(c, c.ovCam, 2);
    for (let j = 1; j < path.length; j++) {
      const [x0] = path[j - 1] as [number, number];
      const [x1] = path[j] as [number, number];
      expect(x1).toBeGreaterThan(x0 - 1e-9); // always eastward
      expect(x1 - x0).toBeLessThan(c.width / 10);
    }
  });

  it('labels the grid with E, W and a bare 180', () => {
    const { ctx, calls } = recordingCtx();
    drawGraticule(ctx, c, c.ovCam);
    const labels = texts(calls);
    expect(labels).toContain('150E');
    expect(labels).toContain('180');
    expect(labels).toContain('150W');
    expect(labels).toContain('30N');
    expect(labels.some((l) => /^\d+(\.\d+)?[EW]$|^180$|^0$/.test(l))).toBe(true);
    expect(labels.every((l) => !l.startsWith('-') && !/^(2\d\d|3\d\d)/.test(l))).toBe(true);
  });

  it('measures the great-circle distance across the date line', () => {
    expect(c.text.subtitle).toBe('3 STOPS  /  10,063 KM  /  6,253 MI');
    expect(c.stats).toEqual([
      { value: '3', label: 'STOPS' },
      { value: '2', label: 'COUNTRIES' },
      { value: '10,063', label: 'KM' },
    ]);
  });
});

describe('N = 99 (the maximum)', () => {
  it('keeps 99 stops, pads the kicker and draws 98 legs', () => {
    const stops = Array.from({ length: 101 }, (_, i) => ({
      id: `s${i}`,
      city: `Stop ${i + 1}`,
      lat: 40 + 5 * Math.sin(i / 7),
      lon: -10 + 0.25 * i,
    }));
    const { project, issues } = validateProject({ version: 1, stops });
    expect(issues.map((issue) => issue.code)).toEqual(['too-many-stops']);
    const c = compile(project, backend);
    expect(c.stops).toHaveLength(99);
    expect(c.timeline.totalFrames).toBe(80 + 99 * 40 + 80);
    expect(c.stops[98]?.kicker).toBe('STOP 99 / 99');
    expect(c.text.subtitle.startsWith('99 STOPS  /  ')).toBe(true);
    expect(routePath(c, c.ovCam, 98)).toHaveLength(1 + 98 * 24);
    const ov = sceneAt(c, 79);
    expect(ov.routeUpto).toBe(98);
    expect(ov.lit).toBe(98);
    for (const f of [0, 40, 80 + 50 * 40 + 20, c.timeline.totalFrames - 1]) {
      expect(finiteDeep(sceneAt(c, f))).toBe(true);
    }
  });

  it('stops reading after 99 stops, so 20,000 stops with one id stay fast', () => {
    // A 2 KB share link can carry this many; renaming duplicates is linear per stop.
    const stops = Array.from({ length: 20_000 }, () => ({
      id: 'a',
      city: 'X',
      lat: 10,
      lon: 20,
    }));
    const started = performance.now();
    const { project, issues } = validateProject({ version: 1, stops });
    const elapsed = performance.now() - started;
    expect(project.stops).toHaveLength(99);
    expect(project.stops[98]?.id).toBe('a-99');
    const tooMany = issues.filter((issue) => issue.code === 'too-many-stops');
    expect(tooMany).toHaveLength(1);
    expect(tooMany[0]?.message).toBe('Only the first 99 of 20000 stops are kept.');
    expect(issues.filter((issue) => issue.code === 'duplicate-id')).toHaveLength(98);
    expect(elapsed).toBeLessThan(200);
  });

  it('scans at most 990 entries when most of them are not stops', () => {
    const raw = [...Array.from({ length: 5000 }, () => 7), { id: 'x', city: 'X', lat: 1, lon: 2 }];
    const { project, issues } = validateProject({ version: 1, stops: raw });
    expect(project.stops).toHaveLength(0);
    expect(issues.filter((issue) => issue.code === 'invalid-stop')).toHaveLength(990);
    expect(issues.some((issue) => issue.code === 'too-many-stops')).toBe(true);
  });
});

describe('N = 1 (single stop)', () => {
  const project = loadFixtureProject('single-stop');

  it.each(['landscape', 'portrait', 'square'] as const)(
    '%s: no route, overview title, pin, card and finale stats all work',
    (profile) => {
      const c = at(profile, project);
      const states = allStates(c);
      expect(states.every((s) => s.routeUpto === 0)).toBe(true);
      expect(routePath(c, c.ovCam, 0)).toHaveLength(1);
      expect(sceneAt(c, 0).title).not.toBeNull();
      expect(states.some((s) => s.card?.stop === 0)).toBe(true);
      const last = states[states.length - 1];
      expect(last?.stats).not.toBeNull();
      expect(last?.pinLabels).toBe(true);
      expect(c.text.subtitle).toBe('1 STOP  /  3 DAYS');
      expect(c.stats).toEqual([
        { value: '1', label: 'STOP' },
        { value: '3', label: 'DAYS' },
      ]);
      // City-scale span: the fit uses minSpanDeg 0.02 and the grid the fine ladder.
      expect(c.grid.baseStep).toBeLessThanOrEqual(0.05);
      expect(c.grid.majorStep).toBeLessThanOrEqual(0.25);
    },
  );

  it('overview pulses the only pin and the finale ends on the overview camera', () => {
    const c = compile(project, backend);
    const ov = segment(c, 'overview');
    expect(
      Array.from({ length: ov.n }, (_, k) => sceneAt(c, k).pulses.length).some((n) => n === 1),
    ).toBe(true);
    const fin = segment(c, 'finale');
    expect(sceneAt(c, fin.start + fin.n - 1).cam).toEqual(c.finaleEndCam);
  });
});

describe('long names (card auto-fit)', () => {
  // 0.5 em per glyph (test metric); 720 x 1280, S = 2/3.
  const c = compile(loadFixtureProject('long-names'), backend);

  it('shrinks the city by 6 from 118 (untracked) and the event by 2 from 30 (tracked)', () => {
    expect(c.profile).toBe('portrait');
    expect(c.stops.map((s) => [s.citySize, s.eventSize])).toEqual([
      [58, 20], // 58-glyph city: down past 60 to 58; 72-glyph event to the minimum
      [58, 30], // 29 glyphs: 0.5 * 64 * S * 29 = 618.7 > 720 - 170 S = 606.7, so 58
      [118, 30], // short names keep their size
    ]);
    const limitCity = 720 - 170 * c.S;
    const long = c.stops[1];
    expect(0.5 * (long?.citySize ?? 0) * c.S * 29).toBeLessThanOrEqual(limitCity);
  });

  it('keeps every card text left edge inside the frame', () => {
    for (let i = 0; i < c.stops.length; i++) {
      const s = sceneAt(c, segment(c, 'stop', i).start + 20);
      const card = cardLayout(measure, c, s.card);
      expect(card?.texts.every((t) => t.x >= 0 && t.y >= 0 && t.y < c.height)).toBe(true);
    }
  });
});

describe('duplicate locations', () => {
  const c = compile(loadFixtureProject('duplicate-location'), backend);

  it('merges pins within 1e-4 deg and joins their pin dates with " / "', () => {
    expect(c.stops.map((s) => s.pinOf)).toEqual([0, 1, 0]);
    expect(c.stops.map((s) => s.pinDate)).toEqual(['06.13 / 09.05', '07.11', '06.13 / 09.05']);
    // Each stop keeps its own card date.
    expect(c.stops.map((s) => s.cardDate)).toEqual(['2026.06.13', '2026.07.11', '2026.09.05']);
  });

  it('draws the shared pin once, with one label, and pulses stop 3 on it', () => {
    const { ctx, calls } = recordingCtx();
    const last = sceneAt(c, c.timeline.totalFrames - 1);
    drawPins(ctx, c, last);
    const cores = calls.filter(
      (call) => call.name === 'arc' && call.args[2] === c.project.pins.radius * c.S,
    );
    expect(cores).toHaveLength(2);
    // "06.13 / 09.05" is drawn whole (no tracking) once.
    expect(texts(calls).filter((t) => t === '06.13 / 09.05')).toHaveLength(1);
    const stop3 = segment(c, 'stop', 2);
    const s = sceneAt(c, stop3.start + 30);
    expect(s.pulses.map((p) => p.index)).toEqual([2]);
    expect(pinPoint(c, 2, s.cam)).toEqual(pinPoint(c, 0, s.cam));
  });
});

describe('partner line and several results', () => {
  const project = loadFixtureProject('partner-results');

  it('landscape: one partner line, inline results, bar 236 + 34 + 36, seven medal dots', () => {
    const c = compile(project, backend);
    const s = sceneAt(c, segment(c, 'stop', 0).start + 20);
    const card = cardLayout(measure, c, s.card);
    expect(card?.texts.map((t) => t.text).slice(4)).toEqual([
      'JOINT CREW WITH THE HARBOR ROWING CLUB AND FRIENDS',
    ]);
    expect((card?.bar[3] ?? 0) / c.S).toBeCloseTo(236 + 34 + 36, 9);
    const rows = card?.results ?? [];
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.text.y)).size).toBe(1);
    for (let j = 1; j < rows.length; j++) {
      expect(rows[j]?.text.x ?? 0).toBeGreaterThan(rows[j - 1]?.text.x ?? 0);
    }
    const p = pinPoint(c, 0, c.ovCam);
    const g = pinLabelLayout(measure, c, 0, p.x, p.y);
    expect(g?.dots.map((d) => d.medal)).toEqual([
      'gold',
      'gold',
      'silver',
      'bronze',
      'bronze',
      'bronze',
      'ring',
    ]);
  });

  it('portrait: partner split in two by words, stacked results, bar 236 + 70 + 36 per result', () => {
    const c = compile(project, backend, { width: 1080, height: 1920 });
    expect(c.stops[0]?.partnerLines).toEqual([
      'JOINT CREW WITH THE',
      'HARBOR ROWING CLUB AND FRIENDS',
    ]);
    expect(c.stops[1]?.partnerLines).toEqual(['GUEST PADDLERS']);
    const s = sceneAt(c, segment(c, 'stop', 0).start + 20);
    const card = cardLayout(measure, c, s.card);
    expect(card?.bar[3]).toBe(236 + 70 + 4 * 36);
    const rows = card?.results ?? [];
    expect(rows.map((r) => r.text.y - (card?.ly ?? 0))).toEqual(
      [312, 348, 384, 420].map((v) => expect.closeTo(v, 9)),
    );
    expect(rows.every((r) => r.medalX === 90 + 22 && r.text.x === 90 + 38)).toBe(true);
    // A `none` medal draws no disc: the second stop's single row has text only.
    const s2 = sceneAt(c, segment(c, 'stop', 1).start + 20);
    expect(cardLayout(measure, c, s2.card)?.results.map((r) => r.medal)).toEqual(['none']);
    const { ctx, calls } = recordingCtx();
    drawCard(ctx, c, s2.card);
    expect(calls.filter((call) => call.name === 'arc')).toHaveLength(0);
    expect(texts(calls)).toContain('F');
    const { ctx: ctx1, calls: calls1 } = recordingCtx();
    drawCard(ctx1, c, s.card);
    // Gold, silver and bronze are a disc plus a shine; the ring medal one outline.
    expect(calls1.filter((call) => call.name === 'arc')).toHaveLength(3 * 2 + 1);
  });

  it('wraps a stats row that would overflow the frame', () => {
    const p = loadFixtureProject('partner-results');
    p.stats.items = [
      { source: 'custom', label: 'KILOMETRES PADDLED THIS SEASON', value: '12,345' },
      { source: 'custom', label: 'MEDALS WON', value: '7' },
      { source: 'custom', label: 'CREW MEMBERS', value: '22' },
    ];
    const c = compile(p, backend, { width: 1080, height: 1080 });
    const items = statsLayout(measure, c, 1);
    // Test metric (0.5 em): item 1 fills the first row; item 2 starts the next
    // row one number size (150) down; item 3 (80 + 440 + 498 > 1080 - 80) wraps again.
    expect(items.map((it) => it.y)).toEqual([90, 240, 390]);
    expect(items.map((it) => it.x)).toEqual([80, 80, 80]);
    for (const it of items) {
      // The label starts after the number (numberWidth + 12 at least).
      expect(it.labelX - it.x).toBeGreaterThanOrEqual(0.5 * 150 * it.value.length + 12 - 1e-9);
    }
  });
});

describe('Europe trip preset (9:16, fly)', () => {
  const c = compile(loadPresetForTestMetric('europe-trip'), backend);

  it('compiles portrait at 1080 x 1920, 30 fps, 80 + 8 x 60 + 80 frames', () => {
    expect([c.profile, c.width, c.height]).toEqual(['portrait', 1080, 1920]);
    expect(c.fps).toEqual({ num: 30, den: 1 });
    expect(c.timeline.totalFrames).toBe(640);
    expect(c.stops.map((s) => s.city)).toEqual([
      'LISBON',
      'MADRID',
      'BARCELONA',
      'PARIS',
      'AMSTERDAM',
      'BERLIN',
      'PRAGUE',
      'VIENNA',
    ]);
  });

  it('resolves plural tokens, grouped km and date ranges', () => {
    expect(c.text.title).toBe('EUROPE SUMMER 2026');
    expect(c.text.subtitle).toBe('8 CITIES  /  7 COUNTRIES  /  3,376 KM');
    expect(c.stats).toEqual([
      { value: '8', label: 'CITIES' },
      { value: '7', label: 'COUNTRIES' },
      { value: '3,376', label: 'KM' },
    ]);
    expect(c.stops[0]?.kicker).toBe('CITY 01 / 08');
    expect(c.stops[0]?.cardDate).toBe('2026.06.20 - 2026.06.23');
    expect(c.stops[0]?.pinDate).toBe('06.20 - 06.23');
  });

  it('flies continuously: each part starts one step on from the last frame of the one before', () => {
    const segs = c.timeline.segments;
    for (let j = 1; j < segs.length; j++) {
      const prev = segs[j - 1];
      const next = segs[j];
      if (prev === undefined || next === undefined) continue;
      expectSeamless(c, prev, next);
    }
    // No two consecutive frames anywhere look the same (no frozen frames).
    for (let f = 1; f < c.timeline.totalFrames; f++) {
      expect(look(sceneAt(c, f)), `frame ${f}`).not.toEqual(look(sceneAt(c, f - 1)));
    }
    const states = allStates(c);
    expect(states.every((s) => s.post.blurDu === 0 && s.post.flash === 0)).toBe(true);
    for (const seg of segs.filter((s) => s.kind === 'stop')) {
      expect(seg.nZoom).toBe(0);
      expect(seg.cardOutFrames).toBe(6);
      // The card fades out over the last 6 frames and is gone on the last one.
      expect(sceneAt(c, seg.start + seg.n - 7).card?.alpha).toBe(1);
      expect(sceneAt(c, seg.start + seg.n - 1).card?.alpha).toBe(0);
    }
  });
});

describe('fly transition edge cases', () => {
  it('keeps one hold frame per stop even when flyFrac is 1', () => {
    const p = loadSeasonForTestMetric();
    p.timing.transition.mode = 'fly';
    p.timing.stop.flyFrac = 1;
    const c = compile(p, backend, { mode: 'single' });
    for (const seg of c.timeline.segments.filter((s) => s.kind === 'stop')) {
      expect([seg.nFly, seg.nHold, seg.nZoom]).toEqual([seg.n - 1, 1, 0]);
      // The flight arrives on the last fly frame; the one hold frame sits on the stop camera.
      expect(sceneAt(c, seg.start + seg.n - 2).cam).toEqual(seg.endCam);
      expect(sceneAt(c, seg.start + seg.n - 1).cam).toEqual(seg.endCam);
      const next = c.timeline.segments[c.timeline.segments.indexOf(seg) + 1];
      if (next !== undefined) expectSeamless(c, seg, next);
    }
  });

  it('segments mode and portrait keep the continuity', () => {
    const p = loadSeasonForTestMetric();
    p.timing.transition.mode = 'fly';
    const c = compile(p, backend, { width: 1080, height: 1920, mode: 'segments' });
    const stops = c.timeline.segments.filter((s) => s.kind === 'stop');
    for (let i = 0; i + 1 < stops.length; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (a === undefined || b === undefined) continue;
      expectSeamless(c, a, b);
    }
  });

  it('without a finale the last stop holds on its pin instead of zooming through', () => {
    for (const mode of ['zoomThrough', 'fly'] as const) {
      const p = loadSeasonForTestMetric();
      p.timing.transition.mode = mode;
      p.timing.finale.enabled = false;
      const c = compile(p, backend, { mode: 'single' });
      const last = c.timeline.segments[c.timeline.segments.length - 1];
      expect(last?.kind).toBe('stop');
      expect(last?.nZoom).toBe(0);
      const end = sceneAt(c, c.timeline.totalFrames - 1);
      expect(end.post).toEqual({ blurDu: 0, flash: 0 });
      expect(end.cam).toEqual(c.stampCams[6]);
      // The video ends on the last stop's card, in both modes.
      expect(last?.cardOutFrames).toBe(0);
      expect(end.card?.alpha).toBe(1);
    }
  });
});

describe('round the world (ends where it started)', () => {
  // London -> New York -> San Francisco -> Tokyo -> Singapore -> Dubai -> London,
  // flown west: the last London unwraps to about -360.13, a full turn from the first.
  const c = compile(loadFixtureProject('round-the-world'), backend);

  it('keeps the last stop on its own pin (duplicates compare unwrapped longitudes)', () => {
    expect(c.stops.map((s) => s.pinOf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(c.stops[6]?.lon).toBeCloseTo(-360.1278, 9);
    expect(c.stops[6]?.pinDate).toBe('04.28');
  });

  it("draws the last stop's pin and card where its stop camera looks", () => {
    const seg = segment(c, 'stop', 6);
    const s = sceneAt(c, seg.start + seg.nFly + 10);
    const card = cardLayout(measure, c, s.card);
    const want = {
      x: c.width / 2 + c.layout.stopPin[0] * c.S,
      y: c.height / 2 + c.layout.stopPin[1] * c.S,
    };
    expect(card?.pin.x).toBeCloseTo(want.x, 6);
    expect(card?.pin.y).toBeCloseTo(want.y, 6);
    expect(pinPoint(c, 6, s.cam).x).toBeCloseTo(want.x, 6);
    const { ctx, calls } = recordingCtx();
    drawPins(ctx, c, s);
    const cores = calls.filter(
      (call) => call.name === 'arc' && call.args[2] === c.project.pins.radius * c.S,
    );
    expect(cores.some((call) => Math.abs((call.args[0] as number) - want.x) < 1e-6)).toBe(true);
  });

  it('draws the last leg (Dubai -> London) short, not across the whole map', () => {
    for (const cam of [c.ovCam, c.finaleEndCam]) {
      const a = pinPoint(c, 5, cam);
      const b = pinPoint(c, 6, cam);
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(c.width / 2);
    }
  });
});

describe('fly mode shows the card once the camera has arrived', () => {
  const c = compile(loadPresetForTestMetric('europe-trip'), backend);

  it('no card while the camera flies; the card starts at nFly', () => {
    for (const seg of c.timeline.segments.filter((x) => x.kind === 'stop')) {
      expect(sceneAt(c, seg.start + seg.nFly - 1).card).toBeNull();
      const first = sceneAt(c, seg.start + seg.nFly).card;
      expect(first?.u).toBe(0);
      // The camera has arrived on the frame before the card.
      expect(sceneAt(c, seg.start + seg.nFly - 1).cam).toEqual(seg.endCam);
    }
  });
});

describe('overview title fit', () => {
  it('shrinks a long title so it ends 72 Du before the right edge (9:16)', () => {
    const p = loadPresetForTestMetric('europe-trip');
    p.text.title = 'Our family road trip across America';
    const c = compile(p, backend, { width: 1080, height: 1920 });
    const t = c.layout.title;
    // 0.5 em per glyph + 3 Du tracking x 35: 64 -> 46 Du (910 <= 1080 - 72 - 80 = 928).
    expect(c.text.titleSize).toBe(46);
    expect(0.5 * c.text.titleSize * 35 + t.tracking * 35).toBeLessThanOrEqual(1080 - 72 - t.x);
    expect(c.text.subSize).toBe(t.subSize);
    expect(c.warnings).toEqual([]);
  });

  it('reports a title that cannot fit even at its minimum size', () => {
    const p = loadPresetForTestMetric('europe-trip');
    p.text.title = 'X'.repeat(80);
    const c = compile(p, backend, { width: 1080, height: 1920 });
    expect(c.text.titleSize).toBeLessThanOrEqual(c.layout.title.minSize);
    expect(c.warnings.map((w) => [w.code, w.path])).toEqual([['text-overflow', 'text.title']]);
  });
});

describe('stats column wrap (portrait)', () => {
  it('starts a second column instead of running into the route area', () => {
    const p = loadPresetForTestMetric('europe-trip');
    p.stats.items = [
      { source: 'stops', label: 'CITIES' },
      { source: 'countries', label: 'COUNTRIES' },
      { source: 'km', label: 'KM' },
      { source: 'days', label: 'DAYS' },
      { source: 'mi', label: 'MI' },
    ];
    const c = compile(p, backend, { width: 1080, height: 1920 });
    const items = statsLayout(measure, c, 1);
    const L = c.layout.stats;
    // Column end: safe-area top 0.12 x 1920 + 480 = 710.4 Du; item 4 would end at 700 + 140.
    expect(items.map((it) => it.y)).toEqual([250, 400, 550, 250, 400]);
    expect(items.slice(0, 3).every((it) => it.x === L.x)).toBe(true);
    const widest = Math.max(
      ...items
        .slice(0, 3)
        .map((it) => it.labelX - it.x + 0.5 * 52 * it.label.length + 2 * it.label.length),
    );
    expect(items[3]?.x).toBeCloseTo(L.x + widest + 60, 9);
    expect(items[4]?.x).toBe(items[3]?.x);
    // The season's three items stay in one column.
    const season = compile(loadSeasonForTestMetric(), backend, {
      width: 1080,
      height: 1920,
    });
    expect(statsLayout(measure, season, 1).map((it) => [it.x, it.y])).toEqual([
      [80, 250],
      [80, 400],
      [80, 550],
    ]);
  });
});

describe('stat tokens without data', () => {
  it('leaves the token out with its separator and the stat item is omitted', () => {
    const p = loadPresetForTestMetric('europe-trip');
    for (const stop of p.stops) delete stop.country;
    const c = compile(p, backend);
    expect(c.text.subtitle).toBe('8 CITIES  /  3,376 KM');
    expect(c.stats.map((s) => s.label)).toEqual(['CITIES', 'KM']);
  });
});
