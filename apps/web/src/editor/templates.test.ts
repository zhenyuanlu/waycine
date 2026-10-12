import { describe, expect, it } from 'vitest';
import { replaceTokens, type TokenValues } from 'waycine';
import { buildToken, parseToken, splitTemplate } from './templates';

// The editor keeps its own copy of the engine's token syntax and key list (the
// engine exports neither). These tests fail when the two copies drift apart.

/** One value per engine key: the typecheck fails when the engine adds or removes a key. */
const values = {
  n: 1,
  total: 7,
  stops: 7,
  regions: 5,
  countries: 1,
  months: 4,
  days: 99,
  km: 1190,
  mi: 739,
  year: 2026,
} satisfies Required<TokenValues>;

describe('the editor reads templates the way the engine fills them', () => {
  it('knows every engine token key', () => {
    for (const key of Object.keys(values)) {
      const raw = `{${key}}`;
      expect(splitTemplate(raw)).toEqual([{ kind: 'token', raw, key }]);
      expect(replaceTokens(raw, values)).not.toMatch(/[{}]/);
    }
  });

  it('leaves an unknown key as text, like the engine', () => {
    expect(splitTemplate('{foo}')).toEqual([{ kind: 'text', text: '{foo}' }]);
    expect(replaceTokens('{foo}', values)).toBe('{foo}');
  });

  it('reads and writes the three token forms the engine fills', () => {
    const forms: [raw: string, filled: string][] = [
      ['{n:02}', '01'],
      ['{stops|RACE|RACES}', '7 RACES'],
      ['{year}', '2026'],
    ];
    for (const [raw, filled] of forms) {
      const parts = parseToken(raw);
      expect(parts === null ? null : buildToken(parts)).toBe(raw);
      expect(replaceTokens(raw, values)).toBe(filled);
    }
  });

  it('treats a malformed token as text, like the engine', () => {
    expect(parseToken('{stops|A}')).toBeNull();
    expect(splitTemplate('{stops|A}')).toEqual([{ kind: 'text', text: '{stops|A}' }]);
    expect(replaceTokens('{stops|A}', values)).toBe('{stops|A}');
  });
});
