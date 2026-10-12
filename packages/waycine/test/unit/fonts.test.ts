import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUNDLED_FONTS, DEFAULTS } from '../../src/core/index.js';

interface FontMetrics {
  unitsPerEm: number;
  ascentEm: number;
  descentEm: number;
  capHeightEm: number;
  bytes: number;
}

const fontsDir = new URL('../../fonts/', import.meta.url);
const metrics = JSON.parse(readFileSync(new URL('metrics.json', fontsDir), 'utf8')) as Record<
  string,
  FontMetrics
>;

describe('bundled fonts', () => {
  for (const role of ['display', 'body'] as const) {
    const font = BUNDLED_FONTS[role];

    it(`${role}: ships a real TrueType file`, () => {
      const buf = readFileSync(new URL(font.file, fontsDir));
      expect(buf.readUInt32BE(0)).toBe(0x00010000);
      expect(buf.length).toBeGreaterThan(50_000);
      expect(buf.length).toBe(metrics[font.file]?.bytes);
    });

    it(`${role}: constants match fonts/metrics.json`, () => {
      expect(metrics[font.file]?.ascentEm).toBe(font.ascentEm);
      expect(metrics[font.file]?.descentEm).toBe(font.descentEm);
    });

    it(`${role}: anchors text on the original's Bahnschrift baseline`, () => {
      // Bahnschrift: hhea ascender 1626, cap height 1454, unitsPerEm 2048.
      expect(font.anchorEm).toBe(1626 / 2048);
      const capHeightEm = metrics[font.file]?.capHeightEm ?? Number.NaN;
      // Cap top below the anchor: Barlow at this anchor vs Bahnschrift (0.084 em).
      expect(Math.abs(font.anchorEm - capHeightEm - (1626 - 1454) / 2048)).toBeLessThan(0.011);
    });

    it(`${role}: is the default ${role} family`, () => {
      expect(DEFAULTS.fonts[role].family).toBe(font.family);
    });
  }

  it('ships the OFL license text', () => {
    expect(readFileSync(new URL('OFL.txt', fontsDir), 'utf8')).toContain('SIL Open Font License');
  });
});
