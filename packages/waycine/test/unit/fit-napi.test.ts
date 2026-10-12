import { describe, expect, it } from 'vitest';
import { contentBoxes, statsBoxes, titleBoxes } from '../../src/core/clearance.js';
import { compile } from '../../src/core/compile.js';
import { cardLayout, type PlacedText } from '../../src/core/draw/card.js';
import { trackedWidth } from '../../src/core/draw/text.js';
import { sceneAt } from '../../src/core/scene.js';
import type { Compiled } from '../../src/core/scene-types.js';
import type { WaycineProject } from '../../src/core/schema/types.js';
import { validateProject } from '../../src/core/schema/validate.js';
import { createNodeBackend } from '../../src/node/index.js';
import { loadFixtureProject, loadPreset, loadSeason } from '../helpers/projects.js';

/**
 * Layout fits with real text widths (`@napi-rs/canvas` and the bundled
 * Barlow faces): card texts end inside the frame in every profile (or are
 * reported), and the pins keep clear of the finale stats and the title.
 */

const backend = createNodeBackend();
const measure = backend.createSurface(1, 1).getContext2d();
measure.fontKerning = 'none';

const SIZES = {
  landscape: [1920, 1080],
  portrait: [1080, 1920],
  square: [1080, 1080],
} as const;
const PROFILES = ['landscape', 'portrait', 'square'] as const;

function at(project: WaycineProject, profile: keyof typeof SIZES): Compiled {
  const [width, height] = SIZES[profile];
  return compile(project, backend, { width, height });
}

/** A hold frame of stop `i` (card fully in, before any fade-out or zoom). */
function holdFrame(c: Compiled, i: number): number {
  const seg = c.timeline.segments.find((s) => s.kind === 'stop' && s.index === i);
  if (seg === undefined) throw new Error(`no stop ${i}`);
  return seg.start + seg.nFly + c.frames.cardDelay + c.frames.cardFade + 1;
}

/**
 * Season stops renamed to long real place names, on the engine defaults
 * (plain Barlow) or the reference season.
 */
function longPlaces(base: 'defaults' | 'season'): WaycineProject {
  const season = loadSeason();
  const stops = season.stops.map((s, i) => ({
    ...s,
    city: i === 0 ? 'San Francisco Bay Area' : i === 1 ? 'Thiruvananthapuram' : s.city,
  }));
  if (base === 'season') {
    season.stops = stops;
    return season;
  }
  return validateProject({ version: 1, stops }).project;
}

const PROJECTS: [string, () => WaycineProject][] = [
  ['long-names fixture', () => loadFixtureProject('long-names')],
  ['long places, engine defaults', () => longPlaces('defaults')],
  ['long places, reference season', () => longPlaces('season')],
];

describe.each(PROJECTS)('card texts of %s', (_name, make) => {
  it.each(PROFILES)('end inside the frame at 1080p %s, or are reported', (profile) => {
    const c = at(make(), profile);
    const reported = new Set(c.warnings.map((w) => w.path));
    for (const stop of c.stops) {
      const L = cardLayout(measure, c, sceneAt(c, holdFrame(c, stop.index)).card);
      expect(L).not.toBeNull();
      if (L === null) continue;
      const placed: PlacedText[] = [...L.texts, ...L.results.map((r) => r.text)];
      for (const t of placed) {
        const end = t.x + trackedWidth(measure, c, t.text, t.role, t.size, t.tracking);
        const path =
          t.text === stop.city
            ? `stops[${stop.sourceIndex}].city`
            : t.text === stop.event
              ? `stops[${stop.sourceIndex}].event`
              : '';
        if (end > c.width + 0.5) {
          expect(reported.has(path), `${profile} "${t.text}" ends at ${end}`).toBe(true);
        }
      }
    }
  });
});

describe('real place names fit without a warning', () => {
  it.each(PROFILES)(
    '%s: San Francisco Bay Area and Thiruvananthapuram shrink as needed',
    (profile) => {
      for (const base of ['defaults', 'season'] as const) {
        const c = at(longPlaces(base), profile);
        expect(c.warnings).toEqual([]);
        const limit = c.width - 72 * c.S;
        for (const i of [0, 1]) {
          const L = cardLayout(measure, c, sceneAt(c, holdFrame(c, i)).card);
          const city = L?.texts.find((t) => t.text === c.stops[i]?.city);
          if (city === undefined) throw new Error('no city text');
          // Measured the way the slot measures (the city without tracking).
          const w = trackedWidth(measure, c, city.text, 'display', city.size, 0);
          expect(city.x + w).toBeLessThanOrEqual(limit + 0.5);
        }
      }
      // Landscape: the long name shrinks below its 118 Du layout size (unshrunk it would
      // run to about 2000 Du).
      const land = at(longPlaces('defaults'), 'landscape');
      if (profile === 'landscape') expect(land.stops[0]?.citySize).toBeLessThan(118);
    },
  );

  it('reports the 58-letter Welsh name, which cannot fit even at its minimum size', () => {
    for (const profile of PROFILES) {
      const c = at(loadFixtureProject('long-names'), profile);
      const w = c.warnings.find((x) => x.path === 'stops[0].city');
      expect(w?.code, profile).toBe('text-overflow');
      expect(w?.widthDu ?? 0).toBeGreaterThan(w?.limitDu ?? 0);
    }
  });
});

function overlapping(
  c: Compiled,
  cam: Compiled['ovCam'],
  obstacles: ReturnType<typeof statsBoxes>,
) {
  const gap = 0;
  return contentBoxes(measure, c, cam).filter((b) =>
    obstacles.some(
      (o) => b.x0 < o.x1 + gap && b.x1 > o.x0 - gap && b.y0 < o.y1 + gap && b.y1 > o.y0 - gap,
    ),
  );
}

describe('pins keep clear of the finale stats and the title', () => {
  it.each(PROFILES)('the season never needs it (%s): cameras stay the fit', (profile) => {
    const c = at(loadSeason(), profile);
    const push = 1 + c.project.timing.overview.pushIn;
    expect(c.finaleEndCam).toEqual({
      cx: c.ovCam.cx,
      cy: c.ovCam.cy,
      z: c.ovCam.z * c.project.camera.finaleZoom,
    });
    expect(c.stampCams[0]?.z).toBe(c.ovCam.z * c.project.camera.stampZoom);
    expect(overlapping(c, c.finaleEndCam, statsBoxes(measure, c))).toEqual([]);
    const pushed = { ...c.ovCam, z: c.ovCam.z * push };
    expect(overlapping(c, pushed, titleBoxes(measure, c))).toEqual([]);
  });

  const TALL: [string, () => WaycineProject, keyof typeof SIZES][] = [
    ['Europe at 16:9', () => loadPreset('europe-trip'), 'landscape'],
    ['the equator route at 1:1', () => loadFixtureProject('equator'), 'square'],
  ];

  it.each(TALL)(
    '%s moves the finale camera down until the stats are clear',
    (_n, make, profile) => {
      const c = at(make(), profile);
      const plain = { cx: c.ovCam.cx, cy: c.ovCam.cy, z: c.ovCam.z * c.project.camera.finaleZoom };
      // Without the rule a pin label sits under the stats ("3,376" over AMSTERDAM, "2,330" over ACCRA).
      expect(overlapping(c, plain, statsBoxes(measure, c)).length).toBeGreaterThan(0);
      expect(c.finaleEndCam.cy).toBeGreaterThan(plain.cy);
      expect(overlapping(c, c.finaleEndCam, statsBoxes(measure, c))).toEqual([]);
      const bottom = Math.max(...contentBoxes(measure, c, c.finaleEndCam).map((b) => b.y1));
      expect(bottom).toBeLessThanOrEqual(c.height * (1 - c.layout.safeArea.bottom));
      // The finale ends on that camera.
      const end = sceneAt(c, c.timeline.totalFrames - 1).cam;
      expect([end.cx, end.cy, end.z]).toEqual(
        [c.finaleEndCam.cx, c.finaleEndCam.cy, c.finaleEndCam.z].map((v) => expect.closeTo(v, 9)),
      );
    },
  );
});
