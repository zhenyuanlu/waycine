import { describe, expect, it } from 'vitest';
import type { Box } from '../../src/core/clearance.js';
import { compile } from '../../src/core/compile.js';
import { cardLayout } from '../../src/core/draw/card.js';
import { drawScene } from '../../src/core/draw/index.js';
import {
  type LabelScene,
  labelBoxes,
  labelPlaces,
  labelSceneCam,
  routeInside,
} from '../../src/core/draw/label-placement.js';
import { pinLabelLayout } from '../../src/core/draw/pin-labels.js';
import { routePath } from '../../src/core/draw/route.js';
import { trackedWidth } from '../../src/core/draw/text.js';
import { pinPoint } from '../../src/core/draw/util.js';
import { sceneAt } from '../../src/core/scene.js';
import type { Compiled } from '../../src/core/scene-types.js';
import type { WaycineProject } from '../../src/core/schema/types.js';
import { createNodeBackend } from '../../src/node/index.js';
import { loadPreset, loadSeason } from '../helpers/projects.js';
import { recordingCtx } from '../helpers/record-ctx.js';
import { segment } from '../helpers/timeline.js';

/**
 * Text keeps clear of what would run through it: pin labels move off the
 * route and off each other (`pins.label.placement`), the card dims the route
 * under it (`card.backdrop`), and grid labels that would touch a corner mark
 * or another label are left out (`graticule.clearLabels`). Real text widths
 * (`@napi-rs/canvas` and the bundled fonts) throughout.
 */

const backend = createNodeBackend();
const measure = backend.createSurface(1, 1).getContext2d();
measure.fontKerning = 'none';

const DEMOS = ['europe-trip', 'race-season', 'road-trip', 'world-tour', 'day-trip'] as const;
const SCENES: readonly LabelScene[] = ['overview', 'finale'];

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

interface Placed {
  city: string;
  spot: string;
  crossed: boolean;
  boxes: Box[];
  /** Route length under the label's own boxes, in Du. */
  routeDu: number;
}

/** Every pin label of `scene` as it is drawn, with the route length under it. */
function placed(c: Compiled, scene: LabelScene): Placed[] {
  const cam = labelSceneCam(c, scene);
  const route = routePath(c, cam, c.stops.length - 1);
  const places = labelPlaces(measure, c, scene);
  const out: Placed[] = [];
  for (const stop of c.stops) {
    if (stop.pinOf !== stop.index) continue;
    const p = pinPoint(c, stop.index, cam);
    const place = places[stop.index];
    const g = pinLabelLayout(measure, c, stop.index, p.x, p.y, place?.spot);
    if (g === null) throw new Error(`no label for ${stop.city}`);
    const boxes = labelBoxes(c, stop.index, g);
    out.push({
      city: stop.city,
      spot: place?.spot ?? 'rule',
      crossed: place?.crossed ?? false,
      boxes,
      routeDu: routeInside(route, boxes) / c.S,
    });
  }
  return out;
}

function withPlacement(name: string, placement: 'auto' | 'fixed'): WaycineProject {
  const p = loadPreset(name);
  p.pins.label.placement = placement;
  return p;
}

describe('pin label placement', () => {
  it('is automatic by default, and fixed in the reference season', () => {
    expect(loadPreset('europe-trip').pins.label.placement).toBe('auto');
    expect(loadSeason().pins.label.placement).toBe('fixed');
  });

  it.each(DEMOS)('%s: no label overlaps another or leaves the frame', (name) => {
    const c = compile(withPlacement(name, 'auto'), backend);
    for (const scene of SCENES) {
      const labels = placed(c, scene);
      for (let i = 0; i < labels.length; i++) {
        const a = labels[i] as Placed;
        for (const box of a.boxes) {
          expect(box.x0, `${scene} ${a.city} left`).toBeGreaterThanOrEqual(0);
          expect(box.y0, `${scene} ${a.city} top`).toBeGreaterThanOrEqual(0);
          expect(box.x1, `${scene} ${a.city} right`).toBeLessThanOrEqual(c.width);
          expect(box.y1, `${scene} ${a.city} bottom`).toBeLessThanOrEqual(c.height);
        }
        for (let j = i + 1; j < labels.length; j++) {
          const b = labels[j] as Placed;
          let area = 0;
          for (const x of a.boxes) for (const y of b.boxes) area += overlap(x, y);
          expect(area, `${scene}: ${a.city} over ${b.city}`).toBe(0);
        }
      }
    }
  });

  it.each(DEMOS)('%s: the route no longer runs through the labels', (name) => {
    const fixed = compile(withPlacement(name, 'fixed'), backend);
    const auto = compile(withPlacement(name, 'auto'), backend);
    for (const scene of SCENES) {
      const before = placed(fixed, scene).reduce((sum, l) => sum + l.routeDu, 0);
      const labels = placed(auto, scene);
      const after = labels.reduce((sum, l) => sum + l.routeDu, 0);
      // Beside their pins, every demo has at least one label with the route through it.
      expect(before, `${scene} fixed`).toBeGreaterThan(60);
      // The road trip's first stop sits at the frame edge between two legs: one short crossing stays.
      expect(after, `${scene} auto`).toBeLessThanOrEqual(name === 'road-trip' ? 15 : 0);
      // A label that is still crossed is marked, so it gets its backdrop.
      for (const l of labels) {
        if (l.routeDu > 4) expect(l.crossed, `${scene} ${l.city}`).toBe(true);
      }
    }
  });

  it('leaves every label to the layout rule when fixed', () => {
    const c = compile(withPlacement('europe-trip', 'fixed'), backend);
    for (const scene of SCENES) {
      expect(labelPlaces(measure, c, scene).every((p) => p === undefined)).toBe(true);
    }
  });

  it.each(DEMOS)('%s: the places do not depend on the output size', (name) => {
    const project = withPlacement(name, 'auto');
    const full = compile(project, backend);
    const spots = (c: Compiled): string[] =>
      SCENES.flatMap((scene) => labelPlaces(measure, c, scene).map((p) => p?.spot ?? '-'));
    for (const k of [0.5, 0.25, 2]) {
      const width = Math.round((full.width * k) / 2) * 2;
      const height = Math.round((full.height * k) / 2) * 2;
      expect(spots(compile(project, backend, { width, height })), `scale ${k}`).toEqual(
        spots(full),
      );
    }
  });

  it('beside the pin, a chosen place is the layout of the rule', () => {
    const season = loadSeason();
    season.output.aspect = '9:16';
    const c = compile(season, backend);
    const cam = labelSceneCam(c, 'finale');
    let flipped = 0;
    for (const stop of c.stops) {
      const p = pinPoint(c, stop.index, cam);
      const rule = pinLabelLayout(measure, c, stop.index, p.x, p.y);
      if (rule === null) throw new Error('no label');
      if (rule.flip) flipped += 1;
      expect(pinLabelLayout(measure, c, stop.index, p.x, p.y, rule.flip ? 'w' : 'e')).toEqual(rule);
    }
    // The portrait rule puts some labels on each side, so both places are checked.
    expect(flipped).toBeGreaterThan(0);
    expect(flipped).toBeLessThan(c.stops.length);
  });
});

/** Luminance 0..255 of the pixel at (x, y) of a frame drawn with the Node backend. */
function pixelAt(c: Compiled, frame: number, x: number, y: number): number {
  const surface = backend.createSurface(c.width, c.height);
  const ctx = surface.getContext2d();
  drawScene(ctx, c, sceneAt(c, frame), backend);
  const [r, g, b] = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

describe('card backdrop', () => {
  /** The day trip's fifth stop: two earlier legs of the route run through its card. */
  function dayTrip(backdrop: number): { c: Compiled; frame: number } {
    const p = loadPreset('day-trip');
    p.card.backdrop = backdrop;
    const c = compile(p, backend, { width: 720, height: 900 });
    const seg = segment(c, 'stop', 4);
    return { c, frame: seg.start + seg.nFly + Math.floor(seg.nHold / 2) };
  }

  /** A point of the drawn route inside the card's city text. */
  function routePointUnderCity(c: Compiled, frame: number): [number, number] {
    const s = sceneAt(c, frame);
    const card = cardLayout(measure, c, s.card);
    const city = card?.texts.find((t) => t.role === 'display');
    if (card === null || city === undefined) throw new Error('no card');
    const w = trackedWidth(measure, c, city.text, 'display', city.size, city.tracking);
    const h = city.size * c.S * 0.7;
    const hit = routePath(c, s.cam, s.routeUpto).find(
      ([x, y]) => x > city.x + 8 && x < city.x + w - 8 && y > city.y + 4 && y < city.y + h,
    );
    if (hit === undefined) throw new Error('the route no longer runs under this card');
    return hit;
  }

  it('dims the route under the card', () => {
    const plain = dayTrip(0);
    const [x, y] = routePointUnderCity(plain.c, plain.frame);
    const dimmed = dayTrip(0.85);
    const before = pixelAt(plain.c, plain.frame, x, y);
    const after = pixelAt(dimmed.c, dimmed.frame, x, y);
    // The route is light on a dark background; under the backdrop most of it is gone.
    expect(before).toBeGreaterThan(120);
    expect(after).toBeLessThan(before * 0.45);
  });

  it('draws nothing at 0, and one soft plate otherwise', () => {
    const count = (backdrop: number): number => {
      const { c, frame } = dayTrip(backdrop);
      const { ctx, calls } = recordingCtx();
      drawScene(ctx, c, sceneAt(c, frame), backend);
      const background = c.project.theme.background;
      return calls.filter((call) => call.name === 'fillRect' && call.fill === background).length;
    };
    // One full-frame fill of the background in every frame; the plate adds its layers.
    expect(count(0)).toBe(1);
    expect(count(0.85)).toBeGreaterThan(count(0) + 3);
  });
});

describe('grid labels', () => {
  /** Grid labels drawn in `frame`: text and left edge. */
  function gridLabels(clearLabels: boolean): { text: string; x: number; y: number }[] {
    const p = loadPreset('race-season');
    p.graticule.clearLabels = clearLabels;
    const c = compile(p, backend, { width: 1280, height: 720 });
    const seg = segment(c, 'stop', 2);
    const { ctx, calls } = recordingCtx();
    drawScene(ctx, c, sceneAt(c, seg.start + seg.nFly + Math.floor(seg.nHold / 2)), backend);
    const grid = c.project.theme.grid;
    return calls
      .filter((call) => call.name === 'fillText' && call.fill === grid)
      .map((call) => ({
        text: String(call.args[0]),
        x: Number(call.args[1]),
        y: Number(call.args[2]),
      }));
  }

  it('leaves out a label that would touch a corner mark or another label', () => {
    const all = gridLabels(false);
    const clear = gridLabels(true);
    expect(clear.length).toBeLessThan(all.length);
    // In this frame a longitude label and a latitude label meet at the top-left corner mark.
    const corner = (l: { x: number; y: number }): boolean => l.x < 60 && l.y < 60;
    expect(all.filter(corner).length).toBeGreaterThanOrEqual(2);
    expect(clear.filter(corner)).toEqual([]);
    // Every label that is kept was drawn before too.
    for (const l of clear) expect(all).toContainEqual(l);
  });
});
