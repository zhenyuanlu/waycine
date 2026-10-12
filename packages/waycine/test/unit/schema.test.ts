import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createDefaultProject,
  DEFAULTS,
  FIELDS,
  fpsRational,
  LANDSCAPE_LAYOUT,
  type Layout,
  outputSize,
  PORTRAIT_LAYOUT,
  pickProfile,
  THEMES,
  validateProject,
} from '../../src/core/index.js';
import { gridSplits, MAX_GRID_SUBDIV } from '../../src/core/math/ladder.js';

const STOP = { city: 'Boston', lat: 42.369, lon: -71.121 };

function merc(lat: number): number {
  return (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 180 / 2)) * 180) / Math.PI;
}

/** The season's seven coordinates (lat, lon). */
const SEASON: readonly (readonly [number, number])[] = [
  [42.369, -71.121],
  [41.147, -73.917],
  [42.1, -72.59],
  [40.736, -73.842],
  [41.766, -72.668],
  [41.878, -71.382],
  [40.276, -74.639],
];

/** The fit formula as documented on `LayoutFit` (nudge cap inactive for this data). */
function fit(layout: Layout, width: number, height: number) {
  const S = Math.min(width, height) / 1080;
  const xs = SEASON.map(([, lon]) => lon);
  const ys = SEASON.map(([lat]) => merc(lat));
  const dlon = Math.max(...xs) - Math.min(...xs);
  const dy = Math.max(...ys) - Math.min(...ys);
  const z = Math.min(
    (width - layout.fit.marginX * S) / dlon,
    (height - layout.fit.marginY * S) / dy,
  );
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2 + layout.fit.nudgeDeg[0];
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2 + layout.fit.nudgeDeg[1];
  return { z, cx, cy, S };
}

describe('layout fit representation', () => {
  it('reproduces the original landscape and portrait overview cameras', () => {
    const land = fit(LANDSCAPE_LAYOUT, 1920, 1080);
    expect(land.z).toBeCloseTo(251.136644, 5);
    expect(land.cx).toBeCloseTo(-72.63, 9);
    expect(land.cy).toBeCloseTo(45.416191, 5);
    const port = fit(PORTRAIT_LAYOUT, 1080, 1920);
    expect(port.z).toBeCloseTo(244.457078, 5);
    expect(port.cx).toBeCloseTo(-72.88, 9);
    expect(port.cy).toBeCloseTo(45.716191, 5);
  });

  it('places the stop pin where the originals do', () => {
    const [lx, ly] = LANDSCAPE_LAYOUT.stopPin;
    expect([1920 / 2 + lx, 1080 / 2 + ly]).toEqual([780, 480]);
    const [px, py] = PORTRAIT_LAYOUT.stopPin;
    expect(1080 / 2 + px).toBeCloseTo(0.28 * 1080, 12);
    expect(1920 / 2 + py).toBeCloseTo(0.3 * 1920, 12);
    // The original's portrait scene: cx = lon + (CW * 0.22) / z, cy = y - (CH * 0.20) / z
    expect(-px).toBe(1080 * 0.22);
    expect(-py).toBe(1920 * 0.2);
  });
});

describe('DEFAULTS', () => {
  it('is deep-frozen, and createDefaultProject returns a mutable copy', () => {
    expect(Object.isFrozen(DEFAULTS)).toBe(true);
    expect(Object.isFrozen(DEFAULTS.layouts.landscape.fit.nudgeDeg)).toBe(true);
    const copy = createDefaultProject();
    copy.theme.route = '#000000';
    expect(DEFAULTS.theme.route).toBe('#C77DDB');
  });

  it('keeps the original 8-bit alphas as exact fractions', () => {
    expect(DEFAULTS.pins.haloAlpha).toBe(120 / 255);
    expect(DEFAULTS.graticule.majorAlpha).toBe(34 / 255);
  });

  it('gives exactly 80/40/80 frames at 30000/1001', () => {
    const fps = 30000 / 1001;
    expect(Math.round(DEFAULTS.timing.overviewSec * fps)).toBe(80);
    expect(Math.round(DEFAULTS.timing.stopSec * fps)).toBe(40);
    expect(Math.round(DEFAULTS.timing.finaleSec * fps)).toBe(80);
    expect(Math.round(DEFAULTS.timing.stop.labelDelaySec * fps)).toBe(3);
    expect(Math.round(DEFAULTS.timing.stop.labelFadeSec * fps)).toBe(6);
  });

  it('matches the Orchid theme', () => {
    expect(DEFAULTS.theme).toEqual(THEMES[0]?.theme);
    expect(THEMES).toHaveLength(4);
  });

  it('has a default for every FIELDS path', () => {
    for (const field of FIELDS) {
      // Record lists and the optional custom size have no DEFAULTS value (see fields.test.ts).
      if (
        field.path.startsWith('stops[]') ||
        field.path.startsWith('stats.items[]') ||
        field.path === 'output.width' ||
        field.path === 'output.height'
      ) {
        continue;
      }
      const parts = field.path
        .replace('layouts.*', 'layouts.landscape')
        .replace('fonts.*', 'fonts.display')
        .split('.');
      let node: unknown = DEFAULTS;
      for (const part of parts) {
        node = (node as Record<string, unknown>)[part];
      }
      expect(node, field.path).not.toBeUndefined();
    }
  });
});

describe('validateProject', () => {
  it('never throws and reports non-objects', () => {
    for (const input of [undefined, null, 42, 'x', [], [1, 2], { stops: 'x' }, { stops: [null] }]) {
      const result = validateProject(input);
      expect(result.project.version).toBe(1);
      expect(result.issues.some((issue) => issue.level === 'error')).toBe(true);
    }
  });

  it('survives cyclic input', () => {
    const cyclic: Record<string, unknown> = { stops: [STOP] };
    cyclic.extra = cyclic;
    expect(() => validateProject(cyclic)).not.toThrow();
  });

  it('deep-merges onto DEFAULTS', () => {
    const { project, issues } = validateProject({
      version: 1,
      stops: [STOP],
      theme: { route: '#abc' },
      timing: { stop: { flyFrac: 0.5 } },
    });
    expect(issues.filter((issue) => issue.level === 'error')).toEqual([]);
    expect(project.theme.route).toBe('#AABBCC');
    expect(project.theme.glow).toBe(DEFAULTS.theme.glow);
    expect(project.timing.stop.flyFrac).toBe(0.5);
    expect(project.timing.stop.zoomFrac).toBe(0.22);
    expect(project.layouts.portrait.stopPin).toEqual([-237.6, -384]);
    expect(project.stops[0]?.id).toBe('stop-1');
  });

  it('keeps unknown keys with a warning', () => {
    const { project, issues } = validateProject({
      version: 1,
      stops: [{ ...STOP, note: 'keep me' }],
      future: { a: 1 },
      route: { sparkle: true },
    });
    const kept = project as unknown as Record<string, unknown>;
    expect(kept.future).toEqual({ a: 1 });
    expect((project.route as unknown as Record<string, unknown>).sparkle).toBe(true);
    expect((project.stops[0] as unknown as Record<string, unknown>).note).toBe('keep me');
    const unknown = issues.filter((issue) => issue.code === 'unknown-key').map((i) => i.path);
    expect(unknown.sort()).toEqual(['future', 'route.sparkle', 'stops[0].note']);
  });

  it('clamps latitude, wraps longitude and coerces dates', () => {
    const { project, issues } = validateProject({
      version: 1,
      stops: [
        { city: 'A', lat: 89, lon: 190, date: '2026.06.13' },
        { city: 'B', lat: -10, lon: -180, date: '2026-02-30' },
      ],
    });
    expect(project.stops[0]).toMatchObject({ lat: 85.05, lon: -170, date: '2026-06-13' });
    expect(project.stops[1]?.lon).toBe(180);
    expect(project.stops[1]?.date).toBeUndefined();
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['clamped', 'coerced', 'invalid-date']),
    );
  });

  it('skips stops without coordinates and requires one visible stop', () => {
    const noCoords = validateProject({ version: 1, stops: [{ city: 'X' }] });
    expect(noCoords.project.stops).toEqual([]);
    expect(noCoords.issues.filter((i) => i.level === 'error').map((i) => i.code)).toEqual([
      'invalid-stop',
      'no-stops',
    ]);
    const hidden = validateProject({ version: 1, stops: [{ ...STOP, hidden: true }] });
    expect(hidden.issues.some((i) => i.code === 'no-stops')).toBe(true);
  });

  it('makes custom output sizes even and within 320..4096', () => {
    const { project } = validateProject({
      version: 1,
      stops: [STOP],
      output: { aspect: 'custom', width: 1001, height: 9000 },
    });
    expect([project.output.width, project.output.height]).toEqual([1002, 4096]);
  });

  it('snaps enums and warns about newer versions', () => {
    const { project, issues } = validateProject({
      version: 2,
      stops: [STOP],
      output: { fps: 29.97002997, shortSide: 1000, aspect: 'wide' },
    });
    expect(project.version).toBe(1);
    expect(project.output.fps).toBe(29.97);
    expect(project.output.shortSide).toBe(1080);
    expect(project.output.aspect).toBe('16:9');
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['newer-version', 'invalid-enum']),
    );
  });

  it('keeps any text as the theme id (the one open enum)', () => {
    const { project, issues } = validateProject({
      version: 1,
      stops: [STOP],
      theme: { id: 'my-theme' },
    });
    expect(project.theme.id).toBe('my-theme');
    expect(issues.filter((issue) => issue.path === 'theme.id')).toEqual([]);
  });

  it('accepts null for nullable leaves', () => {
    const { project, issues } = validateProject({
      version: 1,
      stops: [STOP],
      layouts: {
        portrait: { pinLabels: { flipAboveX: null } },
        landscape: { pinLabels: { flipAboveX: 0.6 } },
      },
    });
    expect(issues).toEqual([]);
    expect(project.layouts.portrait.pinLabels.flipAboveX).toBeNull();
    expect(project.layouts.landscape.pinLabels.flipAboveX).toBe(0.6);
  });

  it('clamps graticule loop counts so compile cannot run away', () => {
    const { project, issues } = validateProject({
      version: 1,
      stops: [STOP],
      graticule: { maxSubdiv: 1e9, fixedStep: 1e-9 },
    });
    expect(project.graticule.maxSubdiv).toBe(4);
    expect(project.graticule.fixedStep).toBe(0.01);
    expect(issues.filter((i) => i.code === 'clamped').map((i) => i.path)).toEqual([
      'graticule.fixedStep',
      'graticule.maxSubdiv',
    ]);
    expect(gridSplits(250, 1.8, 1e9)).toHaveLength(MAX_GRID_SUBDIV);
    expect(gridSplits(250, 1.8, Number.NaN)).toEqual([]);
  });

  it('defaults the font scales to 1 and clamps them per role to 0.5..2', () => {
    for (const role of ['display', 'body'] as const) {
      expect(DEFAULTS.fonts[role].sizeAdjust).toBe(1);
      expect(DEFAULTS.fonts[role].widthAdjust).toBe(1);
    }
    const { project, issues } = validateProject({
      version: 1,
      stops: [STOP],
      fonts: { display: { widthAdjust: 5 }, body: { sizeAdjust: 0.1, widthAdjust: 1.15 } },
    });
    expect(project.fonts.display.widthAdjust).toBe(2);
    expect(project.fonts.body.sizeAdjust).toBe(0.5);
    expect(project.fonts.body.widthAdjust).toBe(1.15);
    expect(project.fonts.display.family).toBe(DEFAULTS.fonts.display.family);
    expect(issues.filter((i) => i.code === 'clamped').map((i) => i.path)).toEqual([
      'fonts.display.widthAdjust',
      'fonts.body.sizeAdjust',
    ]);
  });

  it('keeps supersample 2 without a warning (every render path supports it)', () => {
    const { project, issues } = validateProject({
      version: 1,
      stops: [STOP],
      output: { supersample: 2 },
    });
    expect(project.output.supersample).toBe(2);
    expect(issues).toEqual([]);
  });

  it('defaults to fading text; solid text is opt-in', () => {
    expect(DEFAULTS.text.solid).toBe(false);
    const { project } = validateProject({ version: 1, stops: [STOP], text: { solid: true } });
    expect(project.text.solid).toBe(true);
  });

  it('warns about stat tokens that have no data in the visible stops', () => {
    const raw = JSON.parse(
      readFileSync(new URL('../../presets/europe-trip.waycine.json', import.meta.url), 'utf8'),
    ) as { stops: Record<string, unknown>[] };
    expect(validateProject(raw).issues).toEqual([]);
    for (const stop of raw.stops) delete stop.country;
    const { issues } = validateProject(raw);
    expect(issues.map((i) => [i.path, i.code, i.level])).toEqual([
      ['text.subtitle', 'token-no-data', 'warning'],
    ]);
    expect(issues[0]?.message).toContain('{countries}');
    // Dates, regions and years too; {n} and {total} always have values.
    const bare = validateProject({
      version: 1,
      stops: [STOP],
      text: { title: '{year} {days} DAYS', kicker: 'STOP {n} / {total} {regions}' },
    });
    expect(bare.issues.map((i) => [i.path, i.message.slice(0, 7)])).toEqual([
      ['text.title', '{year} '],
      ['text.title', '{days} '],
      ['text.kicker', '{region'],
    ]);
  });
});

describe('output helpers', () => {
  it('computes frame sizes per aspect', () => {
    const out = { ...DEFAULTS.output };
    expect(outputSize(out)).toEqual({ width: 1920, height: 1080 });
    expect(outputSize({ ...out, aspect: '9:16' })).toEqual({ width: 1080, height: 1920 });
    expect(outputSize({ ...out, aspect: '4:5' })).toEqual({ width: 1080, height: 1350 });
    expect(outputSize({ ...out, aspect: '16:9', shortSide: 2160 })).toEqual({
      width: 3840,
      height: 2160,
    });
  });

  it('turns NTSC rates into exact rationals', () => {
    expect(fpsRational(29.97)).toEqual({ num: 30000, den: 1001 });
    expect(fpsRational(23.976)).toEqual({ num: 24000, den: 1001 });
    expect(fpsRational(59.94)).toEqual({ num: 60000, den: 1001 });
    expect(fpsRational(25)).toEqual({ num: 25, den: 1 });
  });

  it('picks the layout profile by aspect', () => {
    expect(pickProfile(1920, 1080, 'auto')).toBe('landscape');
    expect(pickProfile(1080, 1920, 'auto')).toBe('portrait');
    expect(pickProfile(1080, 1350, 'auto')).toBe('portrait');
    expect(pickProfile(1080, 1080, 'auto')).toBe('square');
    expect(pickProfile(1200, 1080, 'auto')).toBe('square');
    expect(pickProfile(1080, 1080, 'portrait')).toBe('portrait');
  });
});
