import { describe, expect, it } from 'vitest';
import { compile } from '../../src/core/compile.js';
import { cardLayout } from '../../src/core/draw/card.js';
import { pinLabelLayout } from '../../src/core/draw/pin-labels.js';
import { statsLayout } from '../../src/core/draw/stats.js';
import { pinPoint } from '../../src/core/draw/util.js';
import { sceneAt } from '../../src/core/scene.js';
import type { Compiled } from '../../src/core/scene-types.js';
import type { WaycineProject } from '../../src/core/schema/types.js';
import { createMeasureBackend } from '../helpers/measure-backend.js';
import { loadSeasonForTestMetric } from '../helpers/projects.js';
import {
  at,
  cameraMismatches,
  loadFixture,
  Mismatches,
  type RefStates,
  stateMismatches,
} from './reference.js';

/**
 * Portrait parity against the original 9:16 map scene, in segments mode:
 * 1. every scene state at 1e-9 (as the landscape test);
 * 2. drawing geometry the original computed with a fake font of 0.5 em
 *    advance per character (the measure-only test backend uses the same
 *    metric): card origin, leader, bar, text anchors, stacked results, pin
 *    label positions and flips, title and stats anchors, and the card city /
 *    event auto-fit sizes. Positions at 1e-9; alphas as the original's 8-bit
 *    integers (`int(255 * ease)`, then `int(a * factor)`).
 */

/** A text call: [x, y, size Du, tracking Du, alpha8]. */
type T = [number, number, number, number, number];

interface CardRef {
  stop: number;
  k: number;
  pin: [number, number];
  leader: [number, number, number, number, number, number];
  bar: [number, number, number, number, number];
  kicker: T;
  city: T;
  event: T;
  date: T;
  partner: T[];
  /** [medal x, medal y, medal r, medal alpha8, ...text] */
  results: [number, number, number, number, number, number, number, number, number][];
}

interface PortraitRef extends RefStates {
  geometry: {
    title: T[];
    cards: CardRef[];
    pinLabels: { kind: 'overview' | 'finale'; k: number; labels: number[][] }[];
    stats: { k: number; items: number[][] }[];
    fit: [number, number][];
  };
}

/** City / event strings whose auto-fit sizes the reference states record (in this order). */
const FIT_CASES: [string, string][] = [
  ['SAN FRANCISCO BAY AREA', 'INTERNATIONAL DRAGON BOAT FESTIVAL AND CULTURAL FAIR'],
  [
    'LLANFAIRPWLLGWYNGYLLGOGERYCHWYRNDROBWLL',
    'THE VERY LONG ANNUAL CHAMPIONSHIP OF PADDLING CLUBS REGATTA',
  ],
  ['SPRINGFIELD', 'SPRINGFIELD DRAGON BOAT FESTIVAL'],
  ['M'.repeat(60), 'W'.repeat(90)],
];

const ref = loadFixture<PortraitRef>('reference-states-portrait.json');
const backend = createMeasureBackend();
const measure = backend.createSurface(1, 1).getContext2d();

function portrait(project: WaycineProject): Compiled {
  return compile(project, backend, { width: ref.width, height: ref.height, mode: 'segments' });
}

/** Start frame of a segment in the compiled timeline. */
function segStart(c: Compiled, kind: string, index = 0): number {
  const seg = c.timeline.segments.find((s) => s.kind === kind && s.index === index);
  if (seg === undefined) throw new Error(`no ${kind}[${index}]`);
  return seg.start;
}

const a8 = (alpha: number): number => Math.floor(255 * alpha);

describe('state parity with the original (portrait 1080x1920, segments mode)', () => {
  const c = portrait(loadSeasonForTestMetric());

  it('uses the same size, frame rate, profile and segment layout', () => {
    expect([c.width, c.height]).toEqual([ref.width, ref.height]);
    expect(c.profile).toBe('portrait');
    expect([c.fps.num, c.fps.den]).toEqual(ref.fps);
    expect(c.timeline.segments.map((s) => [s.kind, s.index, s.n])).toEqual(
      ref.segments.map((s) => [s.kind, s.index, s.n]),
    );
  });

  it('matches the fit (z_ov 244.457078) and stamp cameras', () => {
    expect(Math.abs(ref.ovCam[2] - 244.457078)).toBeLessThan(1e-6);
    expect(cameraMismatches(c, ref)).toEqual([]);
  });

  it('matches every frame at 1e-9', () => {
    expect(stateMismatches(c, ref).slice(0, 20)).toEqual([]);
  });
});

describe('drawing geometry parity (portrait)', () => {
  const project = loadSeasonForTestMetric();
  // Fading text model, so layout alphas can be compared with the original's integers.
  project.text.solid = false;
  const c = portrait(project);
  const K = c.project.card;

  it('places the title and subtitle at (80, 260) 64 Du and (80, 340) 34 Du', () => {
    const t = c.layout.title;
    const s = sceneAt(c, 0);
    expect(ref.geometry.title).toEqual([
      [t.x, t.y, t.size, t.tracking, a8(s.title?.alpha ?? -1)],
      [t.x, t.subY, t.subSize, t.subTracking, Math.floor(a8(s.title?.alpha ?? -1) * t.subAlpha)],
    ]);
  });

  it('lays out the card below the pin exactly (origin, leader, bar, texts, stacked results)', () => {
    expect(ref.geometry.cards.length).toBeGreaterThan(40);
    const m = new Mismatches();
    for (const r of ref.geometry.cards) {
      const tag = `stop ${r.stop} k=${r.k}`;
      const s = sceneAt(c, segStart(c, 'stop', r.stop) + r.k);
      const L = cardLayout(measure, c, s.card);
      if (L === null || L.leader === null) {
        m.push(`${tag}: no card`);
        continue;
      }
      const alpha = a8(L.alpha);
      m.near(`${tag} pin.x`, L.pin.x, r.pin[0]);
      m.near(`${tag} pin.y`, L.pin.y, r.pin[1]);
      L.leader.forEach((v, j) => {
        m.near(`${tag} leader[${j}]`, v, at(r.leader, j));
      });
      m.near(`${tag} leader alpha`, Math.floor(alpha * K.leaderAlpha), r.leader[4]);
      m.near(`${tag} leader width`, K.leaderWidth * c.S, r.leader[5]);
      const [bx, by, bw, bh] = L.bar;
      m.near(`${tag} bar.x0`, bx, r.bar[0]);
      m.near(`${tag} bar.y0`, by, r.bar[1]);
      m.near(`${tag} bar.x1`, bx + bw, r.bar[2]);
      m.near(`${tag} bar.y1`, by + bh, r.bar[3]);
      m.near(`${tag} bar alpha`, alpha, r.bar[4]);
      const expected: [string, T, number][] = [
        ['kicker', r.kicker, K.kicker.alpha],
        ['city', r.city, K.city.alpha],
        ['event', r.event, K.event.alpha],
        ['date', r.date, K.date.alpha],
        ...r.partner.map((p, j): [string, T, number] => [`partner[${j}]`, p, K.line.alpha]),
      ];
      if (L.texts.length !== expected.length) {
        m.push(`${tag}: ${L.texts.length} texts vs ${expected.length}`);
      }
      expected.forEach(([name, e, slotAlpha], j) => {
        const t = L.texts[j];
        if (t === undefined) return;
        m.near(`${tag} ${name}.x`, t.x, e[0]);
        m.near(`${tag} ${name}.y`, t.y, e[1]);
        m.near(`${tag} ${name}.size`, t.size, e[2]);
        m.near(`${tag} ${name}.tracking`, t.tracking, e[3]);
        m.near(`${tag} ${name}.alpha`, Math.floor(alpha * slotAlpha), e[4]);
      });
      if (L.results.length !== r.results.length) {
        m.push(`${tag}: ${L.results.length} results vs ${r.results.length}`);
      }
      r.results.forEach((e, j) => {
        const res = L.results[j];
        if (res === undefined) return;
        m.near(`${tag} result[${j}].medalX`, res.medalX, e[0]);
        m.near(`${tag} result[${j}].medalY`, res.medalY, e[1]);
        m.near(`${tag} result[${j}].medalR`, res.medalR * c.S, e[2]);
        m.near(`${tag} result[${j}].medalAlpha`, alpha, e[3]);
        m.near(`${tag} result[${j}].x`, res.text.x, e[4]);
        m.near(`${tag} result[${j}].y`, res.text.y, e[5]);
        m.near(`${tag} result[${j}].size`, res.text.size, e[6]);
        m.near(`${tag} result[${j}].tracking`, res.text.tracking, e[7]);
        m.near(`${tag} result[${j}].alpha`, Math.floor(alpha * K.line.alpha), e[8]);
      });
    }
    expect(m.list.slice(0, 20)).toEqual([]);
  });

  it('wraps the long partner line in two by words and grows the bar by 70 + 36 per result', () => {
    const r = ref.geometry.cards.find((card) => card.stop === 3);
    expect(r?.partner).toHaveLength(2);
    expect(c.stops[3]?.partnerLines).toEqual(['JOINT CREW LED BY', 'FICTIONAL DRAGON BOAT TEAM']);
    expect(r?.results).toHaveLength(2);
    expect(((r?.bar[3] ?? 0) - (r?.bar[1] ?? 0)) / c.S).toBe(236 + 70 + 2 * 36);
  });

  it('draws pin labels after the pins and flips them left of x > 0.55 W', () => {
    expect(c.layout.pinLabels.order).toBe('afterPins');
    const m = new Mismatches();
    let flips = 0;
    for (const r of ref.geometry.pinLabels) {
      const s = sceneAt(c, segStart(c, r.kind) + r.k);
      const tag = `${r.kind} k=${r.k}`;
      if (!s.pinLabels) m.push(`${tag}: labels off`);
      const lit = c.stops.filter((stop) => stop.index <= s.lit + 1e-6);
      if (lit.length !== r.labels.length)
        m.push(`${tag}: ${lit.length} labels vs ${r.labels.length}`);
      r.labels.forEach((e, i) => {
        const p = pinPoint(c, i, s.cam);
        const G = pinLabelLayout(measure, c, i, p.x, p.y);
        if (G === null) return;
        if (G.flip) flips++;
        if (G.dots.length !== 0) m.push(`${tag} pin ${i}: medal dots on a portrait label`);
        const L = c.project.pins.label;
        m.near(`${tag} pin ${i} city.x`, G.cityX, at(e, 0));
        m.near(`${tag} pin ${i} city.y`, G.cityY, at(e, 1));
        m.near(`${tag} pin ${i} city.size`, L.citySize, at(e, 2));
        m.near(`${tag} pin ${i} city.tracking`, L.cityTracking, at(e, 3));
        m.near(`${tag} pin ${i} alpha`, Math.round(255 * L.alpha), at(e, 4));
        m.near(`${tag} pin ${i} date.x`, G.dateX, at(e, 5));
        m.near(`${tag} pin ${i} date.y`, G.dateY, at(e, 6));
        m.near(`${tag} pin ${i} date.size`, L.dateSize, at(e, 7));
      });
    }
    expect(m.list.slice(0, 20)).toEqual([]);
    expect(flips).toBeGreaterThan(5);
  });

  it('stacks the stats: number (80, 250 + 150 j) 140 Du, label (175, +50) 52 Du', () => {
    const m = new Mismatches();
    const start = segStart(c, 'finale');
    for (const r of ref.geometry.stats) {
      const s = sceneAt(c, start + r.k);
      const items =
        s.stats === null ? [] : statsLayout(measure, c, s.stats.u).filter((it) => a8(it.eased) > 0);
      if (items.length !== r.items.length) {
        m.push(`k=${r.k}: ${items.length} items vs ${r.items.length}`);
        continue;
      }
      r.items.forEach((e, j) => {
        const it = at(items, j);
        const tag = `k=${r.k} item ${j}`;
        m.near(`${tag} x`, it.x, at(e, 0));
        m.near(`${tag} y`, it.y, at(e, 1));
        m.near(`${tag} size`, c.layout.stats.numberSize, at(e, 2));
        m.near(`${tag} alpha`, a8(it.eased), at(e, 4));
        m.near(`${tag} label.x`, it.labelX, at(e, 5));
        m.near(`${tag} label.y`, it.labelY, at(e, 6));
        m.near(`${tag} label.size`, c.project.stats.labelSize, at(e, 7));
        m.near(`${tag} label.tracking`, c.project.stats.labelTracking, at(e, 8));
      });
    }
    expect(m.list.slice(0, 20)).toEqual([]);
  });

  it('auto-fits the card city (118 by 6, min 60, no tracking) and event (30 by 2, min 20, tracked)', () => {
    const got = FIT_CASES.map(([city, event]) => {
      const p = loadSeasonForTestMetric();
      const first = p.stops[0];
      if (first === undefined) throw new Error('missing stop');
      first.city = city;
      first.event = event;
      const fitted = portrait(p).stops[0];
      return [fitted?.citySize, fitted?.eventSize];
    });
    expect(got).toEqual(ref.geometry.fit);
  });
});
