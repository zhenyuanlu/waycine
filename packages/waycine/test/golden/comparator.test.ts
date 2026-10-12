import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  comparePixels,
  compileCase,
  decodePng,
  GOLDEN_CASES,
  GOLDEN_TOLERANCE,
  goldenFile,
  goldenMode,
  MANIFEST_FILE,
  type Pixels,
  PNG_DIR,
  readManifest,
  renderGolden,
  STRICT_MAX_ABS,
  UPDATE,
  writeManifest,
} from './golden.js';

/** A width x height frame filled with (v, v, v). */
function flat(width: number, height: number, v: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

/** A copy of `p` with the first `count` pixels' red channel raised by `by`. */
function spoil(p: Pixels, count: number, by: number): Pixels {
  const data = new Uint8ClampedArray(p.data);
  for (let k = 0; k < count; k++) data[k * 4] = (data[k * 4] as number) + by;
  return { ...p, data };
}

describe('golden comparator', () => {
  const base = flat(100, 100, 10);

  it('passes identical frames with zero difference', () => {
    expect(comparePixels(base, base)).toEqual({
      meanAbs: 0,
      differing: 0,
      share: 0,
      maxAbs: 0,
      pass: true,
    });
  });

  it('fails a mean absolute difference of 1.5 levels or more', () => {
    expect(comparePixels(base, flat(100, 100, 11)).pass).toBe(true);
    const off = comparePixels(base, flat(100, 100, 12));
    expect(off.meanAbs).toBe(2);
    expect(off.share).toBe(0);
    expect(off.pass).toBe(false);
  });

  it('fails when 0.5% of the pixels or more differ by more than 16 levels', () => {
    // 10,000 pixels: 49 pixels 17 levels off in one channel pass, 50 fail.
    const under = comparePixels(base, spoil(base, 49, 17));
    expect(under.differing).toBe(49);
    expect(under.pass).toBe(true);
    const at = comparePixels(base, spoil(base, 50, 17));
    expect(at.share).toBe(GOLDEN_TOLERANCE.pixelShare);
    expect(at.pass).toBe(false);
    // Exactly 16 levels is not a differing pixel.
    expect(comparePixels(base, spoil(base, 200, 16)).differing).toBe(0);
  });

  it('fails frames of different sizes', () => {
    expect(comparePixels(base, flat(100, 99, 10)).pass).toBe(false);
  });

  it('ignores alpha', () => {
    const data = new Uint8ClampedArray(base.data);
    for (let i = 3; i < data.length; i += 4) data[i] = 0;
    expect(comparePixels(base, { ...base, data }).meanAbs).toBe(0);
  });
});

describe('golden files', () => {
  const expected = new Set(
    GOLDEN_CASES.flatMap((gc) => {
      const c = compileCase(gc);
      return gc.frames(c).map((frame) => goldenFile(gc, frame));
    }),
  );

  it('carry a manifest of the machine that made them (update mode writes it)', () => {
    if (UPDATE) writeManifest();
    expect(existsSync(MANIFEST_FILE)).toBe(true);
    const made = readManifest();
    expect(Object.keys(made ?? {}).sort()).toEqual(['arch', 'napiCanvas', 'platform']);
    // Which comparison ran: strict on the machine named there, tolerant elsewhere.
    console.info(
      `golden mode: ${goldenMode()} (goldens made on ${made?.platform} ${made?.arch}, @napi-rs/canvas ${made?.napiCanvas})`,
    );
  });

  it('are exactly the case frames (update mode removes the others)', () => {
    const present = existsSync(PNG_DIR)
      ? readdirSync(PNG_DIR).filter((name) => name.endsWith('.png'))
      : [];
    const extra = present.filter((name) => !expected.has(name));
    if (UPDATE) {
      for (const name of extra) rmSync(`${PNG_DIR}${name}`);
      return;
    }
    expect(extra).toEqual([]);
    expect([...expected].filter((name) => !present.includes(name))).toEqual([]);
  });

  it('round-trip through PNG without loss', async () => {
    const gc = GOLDEN_CASES[0];
    if (gc === undefined) throw new Error('no golden case');
    const { canvas, pixels } = renderGolden(compileCase(gc), 220);
    const decoded = await decodePng(canvas.toBuffer('image/png'));
    expect(comparePixels(decoded, pixels).maxAbs).toBe(0);
  });

  it('decode to the case size', async () => {
    for (const gc of GOLDEN_CASES) {
      const file = goldenFile(gc, gc.frames(compileCase(gc))[0] ?? 0);
      if (!existsSync(`${PNG_DIR}${file}`)) continue;
      const png = await decodePng(readFileSync(`${PNG_DIR}${file}`));
      expect([png.width, png.height], file).toEqual([gc.width, gc.height]);
    }
  });

  // The tolerances absorb platform text rasterization, so tolerant goldens catch
  // visible regressions (fonts, text opacity, layout), not sub-pixel geometry: a
  // pin radius of 10 Du instead of 9 or a card row 4 Du lower still passes
  // there. The strict mode (on the machine that made them) catches those too.
  it.skipIf(UPDATE || goldenMode() !== 'strict')(
    'strict mode catches a pin 1 Du larger and a card row 4 Du lower',
    async () => {
      const gc = GOLDEN_CASES.find((g) => g.name === 'season-16x9');
      if (gc === undefined) throw new Error('no season-16x9 case');
      const golden = await decodePng(readFileSync(`${PNG_DIR}${goldenFile(gc, 220)}`));
      const pin = compileCase(gc, (p) => {
        p.pins.radius = 10;
      });
      const row = compileCase(gc, (p) => {
        p.card.date.dy += 4;
      });
      for (const c of [pin, row]) {
        const r = comparePixels(golden, renderGolden(c, 220).pixels);
        expect(r.maxAbs).toBeGreaterThan(STRICT_MAX_ABS);
        // ...which the tolerant thresholds let through.
        expect(r.pass).toBe(true);
      }
    },
  );

  it.skipIf(UPDATE)('catch the reference season without its font width calibration', async () => {
    const gc = GOLDEN_CASES.find((g) => g.name === 'season-16x9');
    if (gc === undefined) throw new Error('no season-16x9 case');
    const golden = await decodePng(readFileSync(`${PNG_DIR}${goldenFile(gc, 220)}`));
    const plain = compileCase(gc, (p) => {
      p.fonts.display.widthAdjust = 1;
      p.fonts.body.widthAdjust = 1;
    });
    const r = comparePixels(golden, renderGolden(plain, 220).pixels);
    expect(r.meanAbs).toBeGreaterThan(GOLDEN_TOLERANCE.meanAbs);
    expect(r.pass).toBe(false);
  });
});
