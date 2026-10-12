import { describe, expect, it } from 'vitest';
import {
  type Box,
  contentBoxes,
  finaleBoxes,
  finaleDescriptionBoxes,
  statsBoxes,
  titleBoxes,
} from '../../src/core/clearance.js';
import { FINALE_DESC_GAP_DU } from '../../src/core/compile.js';
import { fontPx } from '../../src/core/draw/text.js';
import { drawDescription } from '../../src/core/draw/title.js';
import {
  type Compiled,
  compile,
  DEFAULTS,
  drawScene,
  type ProfileId,
  sceneAt,
  validateProject,
  type WaycineProject,
} from '../../src/core/index.js';
import { createNodeBackend } from '../../src/node/index.js';
import { loadPreset, loadSeason } from '../helpers/projects.js';
import { type Call, recordingCtx, texts } from '../helpers/record-ctx.js';

/**
 * The description line (`text.description`, `text.descriptionAt`): resolved
 * like the subtitle, drawn under it in the overview, and with
 * `introAndFinale` also under the finale stats, where it never meets them and
 * the pins keep clear of it. Without a description nothing changes.
 */

const backend = createNodeBackend();
const measure = backend.createSurface(1, 1).getContext2d();
measure.fontKerning = 'none';

const DESC = 'Demo Harbor Dragon Boat Team - summer racing tour';
const DESC_DRAWN = 'DEMO HARBOR DRAGON BOAT TEAM - SUMMER RACING TOUR';
const SIZES: Record<ProfileId, [number, number]> = {
  landscape: [960, 540],
  portrait: [540, 960],
  square: [720, 720],
};
const PROFILES = ['landscape', 'portrait', 'square'] as const;

function at(project: WaycineProject, profile: ProfileId = 'landscape'): Compiled {
  const [width, height] = SIZES[profile];
  return compile(project, backend, { width, height });
}

function season(edit?: (p: WaycineProject) => void): WaycineProject {
  const p = loadSeason();
  edit?.(p);
  return p;
}

function withDescription(
  where: 'intro' | 'introAndFinale',
  edit?: (p: WaycineProject) => void,
): WaycineProject {
  return season((p) => {
    p.text.description = DESC;
    p.text.descriptionAt = where;
    edit?.(p);
  });
}

function finaleSegment(c: Compiled) {
  const seg = c.timeline.segments.find((s) => s.kind === 'finale');
  if (seg === undefined) throw new Error('no finale');
  return seg;
}

/**
 * Pen position of the first drawn glyph: `fillText(g, x, baseline)`, or with a
 * role `widthAdjust` other than 1, `setTransform(k, 0, 0, 1, x, 0)` then
 * `fillText(g, 0, baseline)`.
 */
function firstGlyphAt(calls: readonly Call[]): [number, number] {
  const i = calls.findIndex((call) => call.name === 'fillText');
  const fill = calls[i];
  const before = calls[i - 1];
  if (fill === undefined) throw new Error('nothing drawn');
  const baseline = fill.args[2] as number;
  if (before?.name === 'setTransform') return [before.args[4] as number, baseline];
  return [fill.args[1] as number, baseline];
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

describe('description defaults', () => {
  it('is empty and intro-only by default, so nothing is drawn', () => {
    expect(DEFAULTS.text.description).toBe('');
    expect(DEFAULTS.text.descriptionAt).toBe('intro');
    for (const profile of PROFILES) {
      expect(DEFAULTS.layouts[profile].title.descSize).toBeGreaterThan(0);
    }
    const c = at(season());
    expect(c.text.description).toBe('');
    expect(c.text.descFinale).toBeNull();
    for (let f = 0; f < c.timeline.totalFrames; f++) {
      expect(sceneAt(c, f).description, `frame ${f}`).toBeNull();
    }
  });

  it('leaves the cameras and timeline of the season and the Europe preset unchanged', () => {
    for (const load of [loadSeason, () => loadPreset('europe-trip')]) {
      for (const profile of PROFILES) {
        const plain = at(load(), profile);
        // An explicit empty description and introAndFinale still draw nothing.
        const empty = at(
          (() => {
            const p = load();
            p.text.description = '';
            p.text.descriptionAt = 'introAndFinale';
            return p;
          })(),
          profile,
        );
        expect(empty.ovCam).toEqual(plain.ovCam);
        expect(empty.finaleEndCam).toEqual(plain.finaleEndCam);
        expect(empty.timeline).toEqual(plain.timeline);
        expect(empty.text.descFinale).toBeNull();
      }
    }
  });
});

describe('description in the overview', () => {
  it('fills tokens and capitals like the subtitle', () => {
    const c = at(
      season((p) => (p.text.description = '{stops|race|races} in {regions|state|states}')),
    );
    expect(c.text.description).toBe('7 RACES IN 5 STATES');
    expect(c.text.descSize).toBe(22);
    expect(c.warnings).toEqual([]);
  });

  it('is drawn under the subtitle in the body font and theme.text (record ctx)', () => {
    for (const solid of [true, false]) {
      const c = at(withDescription('intro', (p) => (p.text.solid = solid)));
      const t = c.layout.title;
      const s = sceneAt(c, 3);
      expect(s.description).toEqual({ place: 'overview', alpha: s.title?.alpha });
      const { ctx, calls } = recordingCtx();
      drawDescription(ctx, c, s.description, s.overlayAlpha);
      const fills = calls.filter((call) => call.name === 'fillText');
      // Tracked text: one grapheme per call, spaces skipped.
      expect(texts(calls).join('')).toBe(DESC_DRAWN.replace(/ /g, ''));
      const px = fontPx(c, 'body', 22);
      const baseline = t.descY * c.S + c.fonts.anchorEm.body * px;
      expect(firstGlyphAt(calls)).toEqual([t.x * c.S, baseline]);
      // Below the subtitle's baseline, which sits below the title's.
      const subBaseline = t.subY * c.S + c.fonts.anchorEm.body * fontPx(c, 'body', t.subSize);
      expect(baseline).toBeGreaterThan(subBaseline + 0.5 * px);
      for (const call of fills) {
        expect(call.font).toBe(`${px}px WaycineBody`);
        expect(call.fill).toBe(c.project.theme.text);
        // Solid ignores the fade and descAlpha (like the subtitle); otherwise title alpha x descAlpha.
        expect(call.alpha).toBeCloseTo(solid ? 1 : (s.title?.alpha ?? 0) * t.descAlpha, 12);
      }
    }
  });

  it('adds pixels only in its own band of the overview frame', () => {
    const plain = at(season());
    const c = at(withDescription('intro'));
    expect(c.ovCam).toEqual(plain.ovCam);
    const render = (k: Compiled): Uint8ClampedArray => {
      const surface = backend.createSurface(k.width, k.height);
      const ctx = surface.getContext2d();
      drawScene(ctx, k, sceneAt(k, 40), backend);
      return ctx.getImageData(0, 0, k.width, k.height).data;
    };
    const a = render(plain);
    const b = render(c);
    const t = c.layout.title;
    const top = t.descY * c.S;
    const bottom = top + c.fonts.anchorEm.body * fontPx(c, 'body', 22) * 1.3;
    let inside = 0;
    let outside = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const diff =
          Math.abs((a[i] as number) - (b[i] as number)) +
          Math.abs((a[i + 1] as number) - (b[i + 1] as number)) +
          Math.abs((a[i + 2] as number) - (b[i + 2] as number));
        if (diff === 0) continue;
        if (y >= top - 1 && y <= bottom + 1 && x >= t.x * c.S - 1) inside++;
        else outside++;
      }
    }
    expect(inside).toBeGreaterThan(500);
    expect(outside).toBe(0);
  });

  it('shrinks a long description to fit and reports it once when it still overflows', () => {
    const long = `${DESC} - ${DESC} - ${DESC}`;
    const fits = at(
      season((p) => (p.text.description = `${DESC} and friends`)),
      'portrait',
    );
    expect(fits.text.descSize).toBeLessThan(fits.layout.title.descSize);
    expect(fits.warnings).toEqual([]);
    const c = at(
      season((p) => {
        p.text.description = long.repeat(3);
        p.text.descriptionAt = 'introAndFinale';
      }),
      'portrait',
    );
    expect(c.text.descSize).toBeLessThanOrEqual(c.layout.title.descMinSize);
    const warnings = c.warnings.filter((w) => w.path === 'text.description');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('text-overflow');
    // Without the intro, the finale copy reports it.
    const finaleOnly = at(
      season((p) => {
        p.text.description = long.repeat(3);
        p.text.descriptionAt = 'introAndFinale';
        p.timing.overview.enabled = false;
      }),
      'portrait',
    );
    const w = finaleOnly.warnings.filter((x) => x.path === 'text.description');
    expect(w).toHaveLength(1);
    expect(w[0]?.message).toContain('in the finale');
  });

  it('keeps the overview pins clear of it', () => {
    for (const profile of PROFILES) {
      const c = at(withDescription('introAndFinale'), profile);
      const pushed = { ...c.ovCam, z: c.ovCam.z * (1 + c.project.timing.overview.pushIn) };
      const obstacles = titleBoxes(measure, c);
      expect(obstacles).toHaveLength(3);
      for (const cam of [c.ovCam, pushed]) {
        const hits = contentBoxes(measure, c, cam).filter((b) =>
          obstacles.some((o) => overlaps(b, o)),
        );
        expect(hits, profile).toEqual([]);
      }
    }
  });
});

describe('description in the finale (introAndFinale)', () => {
  const STATS_VARIANTS: [string, (p: WaycineProject) => void][] = [
    ['three stats', () => {}],
    [
      'six stats that wrap',
      (p) => {
        p.stats.items = [
          ...p.stats.items,
          { source: 'km', label: 'KILOMETRES' },
          { source: 'days', label: 'DAYS ON THE ROAD' },
          { source: 'custom', label: 'BOATS', value: '2' },
        ];
      },
    ],
    [
      'stats in a column',
      (p) => {
        for (const layout of Object.values(p.layouts)) layout.stats.direction = 'column';
      },
    ],
  ];

  it.each(STATS_VARIANTS)('sits under the stats and never meets them: %s', (_name, edit) => {
    for (const profile of PROFILES) {
      const c = at(withDescription('introAndFinale', edit), profile);
      const d = c.text.descFinale;
      expect(d, profile).not.toBeNull();
      if (d === null) continue;
      expect(d.x).toBe(c.layout.stats.x);
      const stats = statsBoxes(measure, c);
      const desc = finaleDescriptionBoxes(measure, c);
      expect(stats.length).toBeGreaterThan(0);
      expect(desc).toHaveLength(1);
      const lowest = Math.max(...stats.map((b) => b.y1));
      expect(d.y * c.S).toBeCloseTo(lowest + FINALE_DESC_GAP_DU * c.S, 9);
      for (const box of desc) {
        for (const s of stats) expect(overlaps(box, s), profile).toBe(false);
        // It ends inside the frame.
        expect(box.x1).toBeLessThanOrEqual(c.width);
      }
      // The pins and their labels keep clear of the stats and the description.
      const hits = contentBoxes(measure, c, c.finaleEndCam).filter((b) =>
        finaleBoxes(measure, c).some((o) => overlaps(b, o)),
      );
      expect(hits, profile).toEqual([]);
    }
  });

  it('takes the stats place when the stats are off, and is absent for intro only', () => {
    const off = at(withDescription('introAndFinale', (p) => (p.stats.show = false)));
    expect(off.text.descFinale).toEqual({
      x: off.layout.stats.x,
      y: off.layout.stats.y,
      size: off.layout.title.descSize,
    });
    const intro = at(withDescription('intro'));
    expect(intro.text.descFinale).toBeNull();
    const fin = finaleSegment(intro);
    for (let k = 0; k < fin.n; k++) expect(sceneAt(intro, fin.start + k).description).toBeNull();
    const noFinale = at(
      withDescription('introAndFinale', (p) => (p.timing.finale.enabled = false)),
    );
    expect(noFinale.text.descFinale).toBeNull();
  });

  it('fades in as one more stats item after the last stat', () => {
    const c = at(withDescription('introAndFinale', (p) => (p.text.solid = false)));
    const fin = finaleSegment(c);
    const F = c.project.timing.finale;
    const n = fin.n;
    let first = -1;
    for (let k = 0; k < n; k++) {
      const s = sceneAt(c, fin.start + k);
      const u = (k - n * F.statsStart) / (n * F.statsDur);
      const v = u * F.statsRate - c.stats.length * F.statsStagger;
      const expected = v <= 0 ? 0 : 1 - (1 - Math.min(1, v)) ** 3;
      if (expected > 0) {
        if (first < 0) first = k;
        expect(s.description).toEqual({ place: 'finale', alpha: expect.closeTo(expected, 12) });
      } else {
        expect(s.description, `k ${k}`).toBeNull();
      }
    }
    // After the stats have started, and fully in by the last frame.
    expect(first).toBeGreaterThan(n * F.statsStart);
    expect(sceneAt(c, fin.start + n - 1).description?.alpha).toBe(1);
  });

  it('is drawn at descFinale: faded by descAlpha, or opaque once visible with solid text', () => {
    for (const solid of [true, false]) {
      const c = at(withDescription('introAndFinale', (p) => (p.text.solid = solid)));
      const d = c.text.descFinale;
      if (d === null) throw new Error('no finale description');
      const fin = finaleSegment(c);
      // The first frame it shows on.
      let k = 0;
      while (sceneAt(c, fin.start + k).description === null) k++;
      const s = sceneAt(c, fin.start + k);
      const { ctx, calls } = recordingCtx();
      drawDescription(ctx, c, s.description, s.overlayAlpha);
      const fills = calls.filter((call) => call.name === 'fillText');
      expect(texts(calls).join('')).toBe(DESC_DRAWN.replace(/ /g, ''));
      const px = fontPx(c, 'body', d.size);
      expect(firstGlyphAt(calls)).toEqual([d.x * c.S, d.y * c.S + c.fonts.anchorEm.body * px]);
      const alpha = s.description?.alpha ?? 0;
      const expected = solid ? 1 : alpha * c.layout.title.descAlpha;
      for (const call of fills) expect(call.alpha).toBeCloseTo(expected, 12);
    }
  });

  it('shows in the finale even without the intro', () => {
    const c = at(withDescription('introAndFinale', (p) => (p.timing.overview.enabled = false)));
    expect(c.timeline.segments.some((s) => s.kind === 'overview')).toBe(false);
    expect(sceneAt(c, c.timeline.totalFrames - 1).description?.place).toBe('finale');
  });
});

describe('description validation', () => {
  it('repairs an unknown placement and warns about tokens without data', () => {
    const { project, issues } = validateProject({
      version: 1,
      stops: [{ id: 'a', city: 'Alpha', lat: 40, lon: -74 }],
      text: { description: 'Across {countries} countries', descriptionAt: 'sometimes' },
      timing: { transition: { flashTo: 'nowhere' } },
    });
    expect(project.text.descriptionAt).toBe('intro');
    expect(project.timing.transition.flashTo).toBe('color');
    expect(issues.find((i) => i.path === 'text.descriptionAt')?.code).toBe('invalid-enum');
    expect(issues.find((i) => i.path === 'timing.transition.flashTo')?.code).toBe('invalid-enum');
    expect(issues.find((i) => i.path === 'text.description')?.code).toBe('token-no-data');
  });
});
