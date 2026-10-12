import { describe, expect, it } from 'vitest';
import { compile } from '../../src/core/compile.js';
import { gaussianBlur } from '../../src/core/draw/blur.js';
import { drawGlow } from '../../src/core/draw/glow.js';
import type { Vec2 } from '../../src/core/schema/types.js';
import { createNodeBackend } from '../../src/node/index.js';
import { loadSeason } from '../helpers/projects.js';
import { loadFixture } from './reference.js';

/**
 * Blur parity against numbers recorded from Pillow and from the original
 * renderer (`fixtures/pillow-blur.json`, numbers only):
 *
 * - the box-blur port (`gaussianBlur`) against Pillow `GaussianBlur` for
 *   sigma 20 (the glow at the original's 2x scale), 6 (zoom-through maximum)
 *   and 1.5 (zoom-through at v = 0.5) on single white pixels and small shapes,
 *   max error <= 1 level;
 * - the route glow (`drawGlow`: low-resolution mask, blur, upscale, composite)
 *   against the original's route glow at the last overview frame, on
 *   cross-sections through every leg, max error <= 4 levels.
 */

/** Pixel value per channel: [v] for "L", [r, g, b] for "RGB". */
type Value = number[];

interface CaseInput {
  background: Value;
  /** [x0, y0, x1, y1, value], inclusive corners. */
  rects?: [number, number, number, number, Value][];
  /** [y, x0, x1, value], inclusive. */
  spans?: [number, number, number, Value][];
}

interface BlurCase {
  name: string;
  sigma: number;
  mode: 'L' | 'RGB';
  width: number;
  height: number;
  input: CaseInput;
  output: {
    /** Bounding box of every pixel that differs from the background (null: none). */
    bbox?: [number, number, number, number] | null;
    /** Rows of the bbox, channels interleaved. */
    rows?: number[][];
    /** Selected rows, each cropped to its non-background extent. */
    sampledRows?: { y: number; x: number; v: number[] }[];
  };
}

interface GlowSection {
  axis: 'col' | 'row';
  x?: number;
  y?: number;
  from: number;
  to: number;
  rgb: number[];
}

interface Fixture {
  pillow: string;
  cases: BlurCase[];
  glow: {
    width: number;
    height: number;
    background: Value;
    glow: Value;
    glowWidthDu: number;
    glowSigmaDu: number;
    path: [number, number][];
    sections: GlowSection[];
  };
}

const fixture = loadFixture<Fixture>('pillow-blur.json');

/** Channels the port runs with: a plane for "L", RGBA (alpha kept) for "RGB". */
function stride(c: BlurCase): 1 | 4 {
  return c.mode === 'L' ? 1 : 4;
}

/** The case's input image in the port's layout. */
function buildInput(c: BlurCase): Uint8Array {
  const C = stride(c);
  const data = new Uint8Array(c.width * c.height * C);
  const put = (x: number, y: number, v: Value): void => {
    const o = (y * c.width + x) * C;
    for (let ch = 0; ch < v.length; ch++) data[o + ch] = v[ch] as number;
    if (C === 4) data[o + 3] = 255;
  };
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) put(x, y, c.input.background);
  }
  for (const [x0, y0, x1, y1, v] of c.input.rects ?? []) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, v);
  }
  for (const [y, x0, x1, v] of c.input.spans ?? []) {
    for (let x = x0; x <= x1; x++) put(x, y, v);
  }
  return data;
}

/** Blurs the case's input with the port. */
function blurCase(c: BlurCase): Uint8Array {
  const data = buildInput(c);
  gaussianBlur(data, c.width, c.height, stride(c), c.sigma, 3, stride(c) === 4);
  return data;
}

/** Largest |port - Pillow| over every value the case records. */
function maxError(c: BlurCase, ours: Uint8Array): { max: number; values: number } {
  const C = stride(c);
  const n = c.input.background.length;
  let max = 0;
  let values = 0;
  const check = (x: number, y: number, ch: number, expected: number): void => {
    const got = ours[(y * c.width + x) * C + ch] as number;
    max = Math.max(max, Math.abs(got - expected));
    values++;
  };
  const { bbox, rows, sampledRows } = c.output;
  if (sampledRows !== undefined) {
    for (const row of sampledRows) {
      const len = row.v.length / n;
      for (let x = 0; x < c.width; x++) {
        const i = x - row.x;
        for (let ch = 0; ch < n; ch++) {
          const expected =
            i >= 0 && i < len ? (row.v[i * n + ch] as number) : (c.input.background[ch] as number);
          check(x, row.y, ch, expected);
        }
      }
    }
    return { max, values };
  }
  // Full image: the recorded bbox, and the background everywhere else.
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const inside =
        bbox !== undefined &&
        bbox !== null &&
        x >= bbox[0] &&
        x <= bbox[2] &&
        y >= bbox[1] &&
        y <= bbox[3];
      for (let ch = 0; ch < n; ch++) {
        const expected =
          inside && bbox && rows
            ? (rows[y - bbox[1]]?.[(x - bbox[0]) * n + ch] as number)
            : (c.input.background[ch] as number);
        check(x, y, ch, expected);
      }
    }
  }
  return { max, values };
}

describe(`blur parity with Pillow ${fixture.pillow} GaussianBlur`, () => {
  it('covers sigma 20, 6 and 1.5', () => {
    expect(new Set(fixture.cases.map((c) => c.sigma))).toEqual(new Set([20, 6, 1.5]));
  });

  for (const c of fixture.cases) {
    it(`${c.name}: max error <= 1 level`, () => {
      const { max, values } = maxError(c, blurCase(c));
      expect(values).toBeGreaterThan(0);
      expect(max).toBeLessThanOrEqual(1);
    });
  }
});

describe('route glow parity with the original (overview end frame, 1920x1080)', () => {
  const g = fixture.glow;
  const backend = createNodeBackend();
  const project = loadSeason();

  it('uses the same glow settings as the reference', () => {
    expect(project.route.glowWidth).toBe(g.glowWidthDu);
    expect(project.route.glowBlur).toBe(g.glowSigmaDu);
    expect(project.theme.glow.toUpperCase()).toBe(
      `#${g.glow.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase(),
    );
    expect(project.theme.background.toUpperCase()).toBe(
      `#${g.background.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase(),
    );
  });

  it('matches every cross-section within 4 levels', () => {
    const c = compile(project, backend, { width: g.width, height: g.height });
    const surface = backend.createSurface(g.width, g.height);
    const ctx = surface.getContext2d();
    ctx.fillStyle = project.theme.background;
    ctx.fillRect(0, 0, g.width, g.height);
    drawGlow(ctx, c, g.path as Vec2[], 1, backend);
    const data = ctx.getImageData(0, 0, g.width, g.height).data;

    expect(g.sections.length).toBeGreaterThanOrEqual(6);
    let max = 0;
    let sum = 0;
    let values = 0;
    for (const s of g.sections) {
      for (let t = s.from; t <= s.to; t++) {
        const x = s.axis === 'col' ? (s.x as number) : t;
        const y = s.axis === 'col' ? t : (s.y as number);
        const o = (y * g.width + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const expected = s.rgb[(t - s.from) * 3 + ch] as number;
          const diff = Math.abs((data[o + ch] as number) - expected);
          max = Math.max(max, diff);
          sum += diff;
          values++;
        }
      }
    }
    expect(values).toBeGreaterThan(1000);
    expect(max).toBeLessThanOrEqual(4);
    expect(sum / values).toBeLessThan(1);
  });
});
