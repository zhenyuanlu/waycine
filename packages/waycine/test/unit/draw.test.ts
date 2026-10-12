import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Canvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { gridLabel } from '../../src/core/draw/graticule.js';
import { MIN_BLUR_SIGMA_PX } from '../../src/core/draw/post.js';
import { routePath } from '../../src/core/draw/route.js';
import { drawText, textWidth } from '../../src/core/draw/text.js';
import type { Backend, Compiled, Ctx2D, PostState, SceneState } from '../../src/core/index.js';
import { BUNDLED_FONTS, drawScene } from '../../src/core/index.js';
import { createNodeBackend } from '../../src/node/index.js';
import { finaleState, overviewState, seasonCompiled, stampState } from '../helpers/draw-fixture.js';

const W = 960;
const H = 540;
const backend = createNodeBackend();

/** Optional PNG dump directory for visual review (set WAYCINE_DRAW_OUT). */
const OUT_DIR = process.env.WAYCINE_DRAW_OUT;

interface Frame {
  ctx: Ctx2D;
  data: Uint8ClampedArray;
  canvas: Canvas;
}

function render(c: Compiled, s: SceneState, name?: string): Frame {
  const surface = backend.createSurface(c.width, c.height);
  const ctx = surface.getContext2d();
  drawScene(ctx, c, s, backend);
  const canvas = surface.source as Canvas;
  if (OUT_DIR !== undefined && name !== undefined) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, `${name}.png`), canvas.toBuffer('image/png'));
  }
  return { ctx, data: ctx.getImageData(0, 0, c.width, c.height).data, canvas };
}

function px(f: Frame, x: number, y: number): [number, number, number] {
  const i = (Math.round(y) * W + Math.round(x)) * 4;
  return [f.data[i] as number, f.data[i + 1] as number, f.data[i + 2] as number];
}

function count(
  f: Frame,
  test: (r: number, g: number, b: number) => boolean,
  box = { x0: 0, y0: 0, x1: W, y1: H },
): number {
  let n = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const i = (y * W + x) * 4;
      if (test(f.data[i] as number, f.data[i + 1] as number, f.data[i + 2] as number)) n++;
    }
  }
  return n;
}

function meanLuma(f: Frame): number {
  let s = 0;
  for (let i = 0; i < f.data.length; i += 4) s += f.data[i + 1] as number;
  return s / (W * H);
}

function hash(f: Frame): string {
  return createHash('sha256').update(f.data).digest('hex');
}

describe('drawScene (napi backend, season fixture, 960x540)', () => {
  const c = seasonCompiled(W, H);
  const overview = render(c, overviewState(c, 40), 'overview-k40');
  const hold = render(c, stampState(c, 3, 20), 'stop4-k20');
  const zoom = render(c, stampState(c, 3, 37), 'stop4-k37-zoom');
  const finale = render(c, finaleState(c, 60), 'finale-k60');

  it('fills the background with theme.background', () => {
    const bg = (r: number, g: number, b: number): boolean => r === 7 && g === 7 && b === 11;
    for (const f of [overview, hold, finale]) expect(count(f, bg)).toBeGreaterThan(W * H * 0.5);
  });

  it('draws the lit pin core in pinCore at the stop camera pin position', () => {
    // Landscape stop pin: 180 Du left of and 60 Du above centre -> (390, 240) at S = 0.5.
    const [r, g, b] = px(hold, 390, 240);
    expect(Math.min(r, g, b)).toBeGreaterThan(235);
  });

  it('draws a purple glowing route', () => {
    const purple = (r: number, g: number, b: number): boolean => b > g + 20 && r > g + 10;
    for (const f of [overview, hold, finale]) expect(count(f, purple)).toBeGreaterThan(2000);
  });

  it('draws the card text to the right of the pin', () => {
    const white = (r: number, g: number, b: number): boolean => Math.min(r, g, b) > 200;
    const card = { x0: 425, y0: 160, x1: 800, y1: 330 };
    expect(count(hold, white, card)).toBeGreaterThan(1500);
    expect(count(overview, white, card)).toBeLessThan(count(hold, white, card) / 4);
  });

  it('draws the title in the overview and the stats in the finale', () => {
    const white = (r: number, g: number, b: number): boolean => Math.min(r, g, b) > 200;
    expect(count(overview, white, { x0: 45, y0: 38, x1: 240, y1: 66 })).toBeGreaterThan(300);
    expect(count(finale, white, { x0: 45, y0: 35, x1: 90, y1: 125 })).toBeGreaterThan(600);
  });

  it('blurs and flashes zoom-through frames', () => {
    expect(meanLuma(zoom)).toBeGreaterThan(meanLuma(hold) + 40);
  });

  it('is deterministic and restores the context state', () => {
    const again = render(seasonCompiled(W, H), stampState(c, 3, 20));
    expect(hash(again)).toBe(hash(hold));
    const reuse = render(c, stampState(c, 3, 20));
    expect(hash(reuse)).toBe(hash(hold));
    const surface = backend.createSurface(W, H);
    const ctx = surface.getContext2d();
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 7;
    drawScene(ctx, c, finaleState(c, 60), backend);
    // napi stores globalAlpha as an 8-bit value.
    expect(ctx.globalAlpha).toBeCloseTo(0.5, 2);
    expect(ctx.lineWidth).toBe(7);
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });
});

describe('zoom-through post (napi backend, 960x540)', () => {
  const c = seasonCompiled(W, H);
  const hold = stampState(c, 3, 20);
  const withPost = (post: PostState): string => hash(render(c, { ...hold, post }));

  it('skips a blur below MIN_BLUR_SIGMA_PX output px and keeps the flash', () => {
    const below = (0.99 * MIN_BLUR_SIGMA_PX) / c.S;
    const plain = withPost({ blurDu: 0, flash: 0 });
    expect(withPost({ blurDu: below, flash: 0 })).toBe(plain);
    const flash = withPost({ blurDu: 0, flash: 0.4 });
    expect(flash).not.toBe(plain);
    expect(withPost({ blurDu: below, flash: 0.4 })).toBe(flash);
  });

  it('blurs from MIN_BLUR_SIGMA_PX output px on', () => {
    const plain = withPost({ blurDu: 0, flash: 0 });
    expect(withPost({ blurDu: MIN_BLUR_SIGMA_PX / c.S, flash: 0 })).not.toBe(plain);
  });

  it("blurs the same through the browsers' copy readback as through the direct one", () => {
    // napi can run the copy path too (drawImage of the frame canvas, bilinear half size).
    const copy: Backend = { ...backend, name: 'napi-copy', frameReadback: 'copy' };
    const zoom = stampState(c, 3, 37);
    const surface = copy.createSurface(W, H);
    const ctx = surface.getContext2d();
    drawScene(ctx, seasonCompiled(W, H), zoom, copy);
    const viaCopy = createHash('sha256')
      .update(ctx.getImageData(0, 0, W, H).data)
      .digest('hex');
    expect(viaCopy).toBe(hash(render(seasonCompiled(W, H), zoom)));
  });
});

describe('surface recordings (napi backend)', () => {
  /** Wraps `target` so every call is logged; a full clearRect is logged as `clear@<save depth>`. */
  function traced(target: Ctx2D, w: number, h: number, log: string[]): Ctx2D {
    let depth = 0;
    return new Proxy(target, {
      get(t, key) {
        const v: unknown = Reflect.get(t, key, t);
        if (typeof v !== 'function' || typeof key !== 'string') return v;
        return (...args: unknown[]): unknown => {
          if (key === 'save') depth++;
          if (key === 'restore') depth--;
          const full =
            key === 'clearRect' && args[0] === 0 && args[1] === 0 && args[2] === w && args[3] === h;
          log.push(full ? `clear@${depth}` : key);
          return (v as (...a: unknown[]) => unknown).apply(t, args);
        };
      },
      set(t, key, value) {
        return Reflect.set(t, key, value, t);
      },
    });
  }

  it('clears every surface in full, outside save(), before it draws a frame', () => {
    // @napi-rs/canvas keeps every draw call and putImageData of a canvas in a
    // recording that only a full clearRect with no saved state releases.
    const base = createNodeBackend();
    const logs: string[][] = [];
    const backend: Backend = {
      name: 'napi-traced',
      frameReadback: 'direct',
      createSurface(width, height, opts) {
        const s = base.createSurface(width, height, opts);
        const log: string[] = [];
        logs.push(log);
        const ctx = traced(s.getContext2d(), s.width, s.height, log);
        return { width: s.width, height: s.height, source: s.source, getContext2d: () => ctx };
      },
    };
    const c = seasonCompiled(W, H);
    const zoom = stampState(c, 3, 37);
    expect(zoom.post.blurDu * c.S).toBeGreaterThanOrEqual(MIN_BLUR_SIGMA_PX);
    const ctx = backend.createSurface(W, H).getContext2d();
    for (let i = 0; i < 2; i++) {
      for (const log of logs) log.push('|');
      drawScene(ctx, c, zoom, backend);
    }
    const draws = new Set(['fill', 'stroke', 'fillRect', 'fillText', 'drawImage', 'putImageData']);
    let drawing = 0;
    for (const log of logs) {
      let cleared = false;
      let drew = false;
      for (const call of log) {
        if (call === '|') cleared = false;
        else if (call === 'clear@0') cleared = true;
        else if (draws.has(call)) {
          expect(cleared, `${call} before a full clear at depth 0`).toBe(true);
          drew = true;
        }
      }
      if (drew) drawing++;
    }
    // The frame, the glow mask and the zoom-blur scratch.
    expect(drawing).toBe(3);
  });
});

describe('route geometry', () => {
  const c = seasonCompiled(W, H);

  it('samples 24 points per full leg and truncates the partial leg', () => {
    expect(routePath(c, c.ovCam, 0)).toHaveLength(1);
    expect(routePath(c, c.ovCam, 6)).toHaveLength(1 + 6 * 24);
    const partial = routePath(c, c.ovCam, 1.5);
    expect(partial).toHaveLength(1 + 2 * 24);
  });

  it('bulges to the right of travel (control = mid + bulge * (-dy, dx))', () => {
    const path = routePath(c, c.ovCam, 1);
    const [ax, ay] = path[0] as [number, number];
    const [bx, by] = path[24] as [number, number];
    const [mx, my] = path[12] as [number, number]; // sample j = 12 is t = 0.5
    const dx = bx - ax;
    const dy = by - ay;
    // Bezier at t = 0.5: (a + 2c + b) / 4 = mid + bulge/2 * (-dy, dx).
    expect(mx).toBeCloseTo((ax + bx) / 2 - 0.11 * dy, 9);
    expect(my).toBeCloseTo((ay + by) / 2 + 0.11 * dx, 9);
  });
});

describe('graticule labels', () => {
  it('uses hemisphere suffixes like the original ("72W", "41N")', () => {
    expect(gridLabel(-72, 'lon', 1, 'plain')).toBe('72W');
    expect(gridLabel(41, 'lat', 1, 'plain')).toBe('41N');
    expect(gridLabel(13, 'lon', 1, 'plain')).toBe('13E');
    expect(gridLabel(-33.5, 'lat', 0.5, 'plain')).toBe('33.5S');
    expect(gridLabel(0, 'lon', 1, 'plain')).toBe('0');
    expect(gridLabel(180, 'lon', 1, 'plain')).toBe('180');
    expect(gridLabel(-180, 'lon', 1, 'plain')).toBe('180');
    expect(gridLabel(190, 'lon', 1, 'plain')).toBe('170W');
    expect(gridLabel(-72, 'lon', 1, 'degree')).toBe(`72${String.fromCharCode(0xb0)}W`);
  });
});

describe('solid text (text.solid, the original drew all text opaque)', () => {
  const white = (r: number, g: number, b: number): boolean => Math.min(r, g, b) > 200;
  const titleBox = { x0: 45, y0: 38, x1: 240, y1: 66 };
  const cardBox = { x0: 425, y0: 160, x1: 800, y1: 330 };

  function variant(solid: boolean): Compiled {
    const c = seasonCompiled(W, H);
    c.project.text.solid = solid;
    return c;
  }

  it('shows the title from overview frame 0 only when solid', () => {
    const solid = variant(true);
    const faded = variant(false);
    expect(count(render(solid, overviewState(solid, 0)), white, titleBox)).toBeGreaterThan(300);
    expect(count(render(faded, overviewState(faded, 0)), white, titleBox)).toBe(0);
  });

  it('draws card text on the first card frame only when solid', () => {
    const solid = variant(true);
    const faded = variant(false);
    // Earlier pins may sit in the box; the card text alone adds well over 1000 white pixels.
    const inSolid = count(render(solid, stampState(solid, 3, 3)), white, cardBox);
    const inFaded = count(render(faded, stampState(faded, 3, 3)), white, cardBox);
    expect(inSolid).toBeGreaterThan(inFaded + 1000);
    expect(inFaded).toBeLessThan(100);
  });

  it('draws grid labels opaque when solid and at labelAlpha otherwise', () => {
    const peak = (c: Compiled): number => {
      const f = render(c, stampState(c, 3, 20));
      let max = 0;
      // Longitude labels sit 18 Du below the top edge (9 px at S = 0.5); x skips the HUD
      // corners, and the darkest channel ignores the purple route.
      for (let y = 9; y < 20; y++) {
        for (let x = 40; x < W - 40; x++) {
          const i = (y * W + x) * 4;
          const v = Math.min(f.data[i] as number, f.data[i + 1] as number, f.data[i + 2] as number);
          max = Math.max(max, v);
        }
      }
      return max;
    };
    expect(peak(variant(true))).toBeGreaterThan(230);
    expect(peak(variant(false))).toBeLessThan(140);
  });
});

describe('text layout', () => {
  it('anchors cap tops where the original did', () => {
    const c = seasonCompiled(1920, 1080);
    expect(c.S).toBe(1);
    const surface = backend.createSurface(300, 200);
    const ctx = surface.getContext2d();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF';
    drawText(ctx, c, 'H', 20, 50, 'display', 100, 0);
    const { data } = ctx.getImageData(0, 0, 300, 200);
    let firstRow = -1;
    for (let y = 0; y < 200 && firstRow < 0; y++) {
      for (let x = 0; x < 300; x++) {
        if ((data[(y * 300 + x) * 4 + 3] as number) > 0) {
          firstRow = y;
          break;
        }
      }
    }
    const metrics = JSON.parse(
      readFileSync(new URL('../../fonts/metrics.json', import.meta.url), 'utf8'),
    ) as Record<string, { capHeightEm: number }>;
    const capHeightEm = metrics[BUNDLED_FONTS.display.file]?.capHeightEm ?? Number.NaN;
    const capTop = 50 + (c.fonts.anchorEm.display - capHeightEm) * 100;
    expect(Math.abs(firstRow - capTop)).toBeLessThanOrEqual(1);
  });

  it('scales text horizontally with fonts.*.widthAdjust, not vertically', () => {
    const base = seasonCompiled(1920, 1080);
    const narrow: Compiled = {
      ...base,
      fonts: { ...base.fonts, widthAdjust: { display: 0.89, body: 1.15 } },
      cache: new Map<string, unknown>(),
    };
    const ink = (c: Compiled, tracking: number) => {
      const surface = backend.createSurface(900, 200);
      const ctx = surface.getContext2d();
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fontKerning = 'none';
      ctx.fillStyle = '#FFFFFF';
      drawText(ctx, c, 'BOSTON', 20, 20, 'display', 118, tracking);
      const { data } = ctx.getImageData(0, 0, 900, 200);
      const box = { x0: 900, y0: 200, x1: -1, y1: -1 };
      for (let y = 0; y < 200; y++) {
        for (let x = 0; x < 900; x++) {
          if ((data[(y * 900 + x) * 4 + 3] as number) > 127) {
            box.x0 = Math.min(box.x0, x);
            box.x1 = Math.max(box.x1, x);
            box.y0 = Math.min(box.y0, y);
            box.y1 = Math.max(box.y1, y);
          }
        }
      }
      // The transform is back to identity after the scaled draw.
      const t = (surface.source as Canvas).getContext('2d').getTransform();
      expect([t.a, t.b, t.c, t.d, t.e, t.f]).toEqual([1, 0, 0, 1, 0, 0]);
      return box;
    };
    const measure = backend.createSurface(1, 1).getContext2d();
    measure.fontKerning = 'none';
    for (const tracking of [0, 2]) {
      const a = ink(base, tracking);
      const b = ink(narrow, tracking);
      // Same rows and left edge; the ink is 0.89 as wide (the 5 tracking gaps keep their width).
      expect([b.y0, b.y1]).toEqual([a.y0, a.y1]);
      expect(Math.abs(b.x0 - a.x0)).toBeLessThanOrEqual(1);
      const wa = a.x1 - a.x0;
      const expected = 0.89 * (wa - tracking * 5) + tracking * 5;
      expect(Math.abs(b.x1 - b.x0 - expected)).toBeLessThanOrEqual(2);
    }
    // Measured widths scale too (auto-fit, inline results, medal dots, stats).
    const w1 = textWidth(measure, base, 'BOSTON', 'display', 118);
    expect(textWidth(measure, narrow, 'BOSTON', 'display', 118)).toBeCloseTo(0.89 * w1, 6);
    const b1 = textWidth(measure, base, '08.09', 'body', 20);
    expect(textWidth(measure, narrow, '08.09', 'body', 20)).toBeCloseTo(1.15 * b1, 6);
  });

  it('draws and measures unkerned, like the original', () => {
    const c = seasonCompiled(W, H);
    const surface = backend.createSurface(W, H);
    const real = surface.getContext2d();
    const kerning: unknown[] = [];
    // Record what drawScene assigns while forwarding everything to the real context.
    const spy = new Proxy(real, {
      get(target, prop) {
        const v: unknown = Reflect.get(target, prop, target);
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      },
      set(target, prop, value) {
        if (prop === 'fontKerning') kerning.push(value);
        return Reflect.set(target, prop, value, target);
      },
    });
    drawScene(spy, c, overviewState(c, 40), backend);
    expect(kerning).toEqual(['none']);

    real.fontKerning = 'none';
    const whole = textWidth(real, c, '41N', 'body', 18);
    const sum = ['4', '1', 'N'].reduce((s, ch) => s + real.measureText(ch).width, 0);
    // Equal up to float32 rounding (kerned, '41N' measures narrower than its glyph sum).
    expect(whole).toBeCloseTo(sum, 4);
  });
});
