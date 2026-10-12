import { describe, expect, it } from 'vitest';
import { boxBlur, gaussianBlur, pillowBoxRadius } from '../../src/core/draw/blur.js';

/**
 * Pillow 12.3 `ImageFilter.GaussianBlur(sigma)` of a 1 x 81 "L" image with
 * 255 at x = 40, samples x = 20..60 (a one-row image makes the vertical pass
 * an identity, so this pins the line algorithm and its rounding).
 */
const PILLOW_IMPULSE: Record<string, number[]> = {
  '2.5': [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 7, 12, 20, 30, 36, 38, 36, 30, 20, 12, 7, 2, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  '6': [
    0, 0, 0, 0, 0, 1, 1, 2, 3, 3, 5, 6, 7, 9, 10, 12, 13, 14, 15, 16, 16, 16, 15, 14, 13, 12, 10, 9,
    7, 6, 5, 3, 3, 2, 1, 1, 0, 0, 0, 0, 0,
  ],
};

/** Same image layout, a step of 200 from x = 40 on, sigma 2.5 (samples x = 20..60). */
const PILLOW_STEP_2_5 = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 7, 17, 33, 57, 85, 115, 143, 167, 183, 193, 198, 200,
  200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200,
];

function sum(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] as number;
  return s;
}

describe('pillowBoxRadius (Pillow _gaussian_blur_radius, 3 passes, float32)', () => {
  it('matches the float32 values Pillow computes', () => {
    expect(pillowBoxRadius(10)).toBe(9.475000381469727);
    expect(pillowBoxRadius(2.5)).toBe(2.030120372772217);
    expect(pillowBoxRadius(6)).toBe(5.458333492279053);
  });

  it('returns a radius below sigma and 0 for sigma 0', () => {
    for (const s of [0.5, 1, 3, 20]) expect(pillowBoxRadius(s)).toBeLessThan(s);
    expect(Math.abs(pillowBoxRadius(0))).toBe(0);
  });
});

describe('gaussianBlur (port of Pillow ImagingGaussianBlur)', () => {
  it('reproduces Pillow impulse responses bit for bit', () => {
    for (const [sigma, expected] of Object.entries(PILLOW_IMPULSE)) {
      const line = new Uint8Array(81);
      line[40] = 255;
      gaussianBlur(line, 81, 1, 1, Number(sigma));
      expect(Array.from(line.slice(20, 61))).toEqual(expected);
    }
  });

  it('reproduces a Pillow step response bit for bit', () => {
    const line = new Uint8Array(81);
    line.fill(200, 40);
    gaussianBlur(line, 81, 1, 1, 2.5);
    expect(Array.from(line.slice(20, 61))).toEqual(PILLOW_STEP_2_5);
  });

  it('preserves mass away from the borders', () => {
    const w = 64;
    const h = 64;
    const img = new Uint8Array(w * h);
    for (let y = 26; y < 38; y++) img.fill(255, y * w + 26, y * w + 38);
    const before = sum(img);
    gaussianBlur(img, w, h, 1, 2.5);
    expect(Math.abs(sum(img) - before) / before).toBeLessThan(0.01);
    const big = new Uint8Array(w * h);
    for (let y = 22; y < 42; y++) big.fill(200, y * w + 22, y * w + 42);
    const b0 = sum(big);
    gaussianBlur(big, w, h, 1, 6);
    expect(Math.abs(sum(big) - b0) / b0).toBeLessThan(0.01);
  });

  it('keeps a constant image constant (clamp-to-edge borders)', () => {
    const img = new Uint8Array(20 * 12).fill(137);
    gaussianBlur(img, 20, 12, 1, 6);
    expect(img.every((v) => v === 137)).toBe(true);
  });

  it('is symmetric for symmetric input, in x and y', () => {
    const w = 41;
    const h = 41;
    const img = new Uint8Array(w * h);
    img[20 * w + 20] = 255;
    img[20 * w + 10] = 90;
    img[20 * w + 30] = 90;
    gaussianBlur(img, w, h, 1, 2.5);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = img[y * w + x];
        expect(img[y * w + (w - 1 - x)]).toBe(v);
        expect(img[(h - 1 - y) * w + x]).toBe(v);
      }
    }
    expect(img[20 * w + 20]).toBeGreaterThan(0);
    expect(img[20 * w + 20]).toBeLessThan(255);
  });

  it('blurs RGBA channels independently, like four separate planes', () => {
    const w = 23;
    const h = 17;
    const rgba = new Uint8ClampedArray(w * h * 4);
    const planes = [0, 1, 2, 3].map(() => new Uint8Array(w * h));
    for (let i = 0; i < w * h; i++) {
      for (let ch = 0; ch < 4; ch++) {
        const v = (i * (37 + ch * 11) + ch * 53) % 256;
        rgba[i * 4 + ch] = v;
        (planes[ch] as Uint8Array)[i] = v;
      }
    }
    gaussianBlur(rgba, w, h, 4, 2.5);
    for (const plane of planes) gaussianBlur(plane, w, h, 1, 2.5);
    for (let i = 0; i < w * h; i++) {
      for (let ch = 0; ch < 4; ch++) expect(rgba[i * 4 + ch]).toBe((planes[ch] as Uint8Array)[i]);
    }
  });

  it('keepAlpha blurs RGB exactly as the full blur and leaves alpha alone', () => {
    const w = 16;
    const h = 9;
    const full = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < full.length; i++) full[i] = (i * 29) % 256;
    const kept = full.slice();
    gaussianBlur(full, w, h, 4, 1.5);
    gaussianBlur(kept, w, h, 4, 1.5, 3, true);
    for (let i = 0; i < w * h; i++) {
      for (let ch = 0; ch < 3; ch++) expect(kept[i * 4 + ch]).toBe(full[i * 4 + ch]);
      expect(kept[i * 4 + 3]).toBe(((i * 4 + 3) * 29) % 256);
    }
  });

  it('leaves the image unchanged for sigma <= 0 and box radius 0', () => {
    const img = new Uint8Array([0, 255, 0, 10]);
    gaussianBlur(img, 4, 1, 1, 0);
    boxBlur(img, 4, 1, 1, 0, 3);
    expect(Array.from(img)).toEqual([0, 255, 0, 10]);
  });

  it('gives the same result with reused scratch buffers', () => {
    const w = 37;
    const h = 29;
    const a = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < a.length; i++) a[i] = (i * 53 + 7) % 256;
    const b = a.slice();
    const c = a.slice();
    const scratch = {};
    gaussianBlur(a, w, h, 4, 2.5, 3, true);
    // Twice with one scratch: the second call reuses the buffers the first grew.
    gaussianBlur(b, w, h, 4, 2.5, 3, true, { scratch });
    gaussianBlur(c, w, h, 4, 2.5, 3, true, { scratch });
    expect(Array.from(b)).toEqual(Array.from(a));
    expect(Array.from(c)).toEqual(Array.from(a));
  });
});

describe('fused small-radius blur (zoom-through fast path)', () => {
  /** Deterministic pseudo-random RGBA with some hard edges. */
  function image(w: number, h: number): Uint8ClampedArray {
    const d = new Uint8ClampedArray(w * h * 4);
    let s = 12345;
    for (let i = 0; i < d.length; i++) {
      s = (s * 1103515245 + 12345) % 2147483648;
      d[i] = (i >> 2) % 7 === 0 ? 255 : (s >> 8) % 256;
    }
    return d;
  }

  it('stays within 2 levels of the Pillow port (1 on average) and keeps alpha', () => {
    const w = 61;
    const h = 43;
    for (const sigma of [0.094, 0.375, 0.5, 0.75, 1.17]) {
      expect(pillowBoxRadius(sigma)).toBeLessThan(1);
      const exact = image(w, h);
      const fused = exact.slice();
      const alpha = exact.filter((_, i) => i % 4 === 3);
      gaussianBlur(exact, w, h, 4, sigma, 3, true);
      gaussianBlur(fused, w, h, 4, sigma, 3, true, { fuseSmall: true });
      let worst = 0;
      let total = 0;
      let n = 0;
      for (let y = 3; y < h - 3; y++) {
        for (let x = 3; x < w - 3; x++) {
          for (let ch = 0; ch < 3; ch++) {
            const i = (y * w + x) * 4 + ch;
            const diff = Math.abs((exact[i] as number) - (fused[i] as number));
            worst = Math.max(worst, diff);
            total += diff;
            n++;
          }
        }
      }
      expect(worst, `sigma ${sigma}`).toBeLessThanOrEqual(2);
      expect(total / n, `sigma ${sigma}`).toBeLessThan(1);
      expect(Array.from(fused.filter((_, i) => i % 4 === 3))).toEqual(Array.from(alpha));
    }
  });

  it('leaves a constant image constant and falls back to the exact path at radius >= 1', () => {
    const flat = new Uint8ClampedArray(20 * 10 * 4).fill(137);
    gaussianBlur(flat, 20, 10, 4, 1, 3, true, { fuseSmall: true });
    expect(flat.every((v) => v === 137)).toBe(true);
    const a = image(30, 20);
    const b = a.slice();
    gaussianBlur(a, 30, 20, 4, 2.5, 3, true);
    gaussianBlur(b, 30, 20, 4, 2.5, 3, true, { fuseSmall: true });
    expect(Array.from(b)).toEqual(Array.from(a));
  });
});
