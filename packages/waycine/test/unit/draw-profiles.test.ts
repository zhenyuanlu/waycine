import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Canvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { cardLayout } from '../../src/core/draw/card.js';
import { hexRgb, pinPoint } from '../../src/core/draw/util.js';
import type { Compiled, WaycineProject } from '../../src/core/index.js';
import { compile, drawScene, sceneAt } from '../../src/core/index.js';
import { createNodeBackend } from '../../src/node/index.js';
import { loadFixtureProject, loadPreset, loadSeason } from '../helpers/projects.js';
import { segment } from '../helpers/timeline.js';

/**
 * Rendering sanity for the generalized layouts with real fonts (napi backend, small
 * sizes): 9:16 and 1:1 season, the Europe preset (9:16, fly), the Pacific
 * crossing and a single stop. Checks pixels where the layout puts things;
 * set WAYCINE_DRAW_OUT to dump the frames as PNG for review.
 */

const backend = createNodeBackend();
const OUT_DIR = process.env.WAYCINE_DRAW_OUT;

interface Frame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

function render(c: Compiled, frame: number, name: string): Frame {
  const surface = backend.createSurface(c.width, c.height);
  const ctx = surface.getContext2d();
  drawScene(ctx, c, sceneAt(c, frame), backend);
  if (OUT_DIR !== undefined) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, `${name}.png`), (surface.source as Canvas).toBuffer('image/png'));
  }
  return { data: ctx.getImageData(0, 0, c.width, c.height).data, width: c.width, height: c.height };
}

type Box = { x0: number; y0: number; x1: number; y1: number };

function count(f: Frame, test: (r: number, g: number, b: number) => boolean, box?: Box): number {
  const b = box ?? { x0: 0, y0: 0, x1: f.width, y1: f.height };
  let n = 0;
  for (let y = Math.max(0, Math.floor(b.y0)); y < Math.min(f.height, b.y1); y++) {
    for (let x = Math.max(0, Math.floor(b.x0)); x < Math.min(f.width, b.x1); x++) {
      const i = (y * f.width + x) * 4;
      if (test(f.data[i] as number, f.data[i + 1] as number, f.data[i + 2] as number)) n++;
    }
  }
  return n;
}

function px(f: Frame, x: number, y: number): [number, number, number] {
  const i = (Math.round(y) * f.width + Math.round(x)) * 4;
  return [f.data[i] as number, f.data[i + 1] as number, f.data[i + 2] as number];
}

const white = (r: number, g: number, b: number): boolean => Math.min(r, g, b) > 200;

interface Case {
  name: string;
  project: () => WaycineProject;
  width: number;
  height: number;
  profile: string;
}

const CASES: Case[] = [
  {
    name: 'season-9x16',
    project: () => loadSeason(),
    width: 540,
    height: 960,
    profile: 'portrait',
  },
  {
    name: 'season-1x1',
    project: () => loadSeason(),
    width: 540,
    height: 540,
    profile: 'square',
  },
  {
    name: 'europe-9x16',
    project: () => loadPreset('europe-trip'),
    width: 540,
    height: 960,
    profile: 'portrait',
  },
  {
    name: 'pacific-16x9',
    project: () => loadFixtureProject('pacific'),
    width: 640,
    height: 360,
    profile: 'landscape',
  },
  {
    name: 'single-stop-1x1',
    project: () => loadFixtureProject('single-stop'),
    width: 360,
    height: 360,
    profile: 'square',
  },
];

describe.each(CASES)('$name at $width x $height', ({ name, project, width, height, profile }) => {
  const c = compile(project(), backend, { width, height });
  const bg = hexRgb(c.project.theme.background);
  const isBg = (r: number, g: number, b: number): boolean =>
    r === bg[0] && g === bg[1] && b === bg[2];
  const stop = segment(c, 'stop', c.stops.length - 1);
  // Past the card fade-in (fly mode shows the card once the camera arrives).
  const holdFrame = stop.start + stop.nFly + c.frames.cardFade + 2;
  // After the title fade-in (the season draws solid text; the others fade it in).
  const overview = render(c, c.frames.titleFade + 1, `${name}-overview`);
  const hold = render(c, holdFrame, `${name}-hold`);
  const finale = render(c, c.timeline.totalFrames - 1, `${name}-finale`);

  it(`uses the ${profile} profile and fills the theme background`, () => {
    expect(c.profile).toBe(profile);
    for (const f of [overview, hold, finale]) {
      expect(count(f, isBg)).toBeGreaterThan(width * height * 0.5);
    }
  });

  it('draws the stop pin core on its hold frame', () => {
    const p = pinPoint(c, c.stops.length - 1, sceneAt(c, holdFrame).cam);
    expect(Math.min(...px(hold, p.x, p.y))).toBeGreaterThan(235);
  });

  it('draws the card text inside the frame', () => {
    const L = cardLayout(backend.createSurface(1, 1).getContext2d(), c, sceneAt(c, holdFrame).card);
    expect(L).not.toBeNull();
    if (L === null) return;
    const box = {
      x0: L.lx,
      y0: L.ly - 10 * c.S,
      x1: width,
      y1: L.ly + L.bar[3],
    };
    expect(box.y1).toBeLessThanOrEqual(height);
    expect(count(hold, white, box)).toBeGreaterThan(400 * c.S * c.S);
  });

  it('draws the title in the overview and the stats in the finale', () => {
    const t = c.layout.title;
    const titleBox = {
      x0: t.x * c.S,
      y0: t.y * c.S,
      x1: width,
      y1: (t.y + t.size) * c.S,
    };
    expect(count(overview, white, titleBox)).toBeGreaterThan(300 * c.S * c.S);
    const st = c.layout.stats;
    const statsBox = {
      x0: st.x * c.S,
      y0: st.y * c.S,
      x1: width,
      y1: (st.y + st.numberSize * 3 + st.pitch * 2) * c.S,
    };
    expect(count(finale, white, statsBox)).toBeGreaterThan(800 * c.S * c.S);
  });

  it('is deterministic', () => {
    const again = render(
      compile(project(), backend, { width, height }),
      holdFrame,
      `${name}-again`,
    );
    const hash = (f: Frame): string => createHash('sha256').update(f.data).digest('hex');
    expect(hash(again)).toBe(hash(hold));
  });
});
