import { describe, expect, it } from 'vitest';
import { missingGlyphs, unsupportedCharacters } from './glyphs';
import { blankProject } from './project';

// Test strings built from char codes so this file stays ASCII.
const chars = (...codes: number[]): string => String.fromCodePoint(...codes);
const E_ACUTE = chars(0xe9);
const MOSKVA = chars(0x41c, 0x43e, 0x441, 0x43a, 0x432, 0x430);
const ATHINA = chars(0x391, 0x3b8, 0x3ae, 0x3bd, 0x3b1);
const PIN_EMOJI = chars(0x1f4cd);

describe('missing glyphs', () => {
  it('accepts Latin letters with accents, digits and punctuation', () => {
    expect(unsupportedCharacters(`Montr${E_ACUTE}al - 500M  6TH (1ST) / x2`)).toEqual([]);
  });

  it('lists letters of other scripts and emoji once each', () => {
    expect(unsupportedCharacters(`${MOSKVA} ${ATHINA} ${PIN_EMOJI}${PIN_EMOJI}`)).toHaveLength(
      new Set([...MOSKVA, ...ATHINA]).size + 1,
    );
  });

  it('checks the drawn texts of visible stops, only with the bundled fonts', () => {
    const p = blankProject();
    p.stops = [
      { id: 'a', city: MOSKVA, lat: 55.75, lon: 37.62 },
      { id: 'b', city: ATHINA, lat: 37.98, lon: 23.73, hidden: true },
    ];
    expect(missingGlyphs(p).join('')).toBe(MOSKVA.slice(0, 6));
    p.fonts.display.source = 'local';
    expect(missingGlyphs(p)).toEqual([]);
  });
});
