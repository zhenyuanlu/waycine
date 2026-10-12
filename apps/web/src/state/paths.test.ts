import { describe, expect, it } from 'vitest';
import { FIELD_BY_PATH } from 'waycine';
import { concretePaths, getPath, jsonEqual, setPath } from './paths';

describe('paths', () => {
  it('reads and writes nested values immutably with structural sharing', () => {
    const root = { a: { b: 1, c: [1, 2] }, d: { e: 2 } };
    const next = setPath(root, 'a.b', 5);
    expect(getPath(next, 'a.b')).toBe(5);
    expect(root.a.b).toBe(1);
    expect(next.d).toBe(root.d);
    expect(next.a.c).toBe(root.a.c);
    expect(getPath(root, 'a.x.y')).toBeUndefined();
    expect(setPath(root, 'a.b', undefined).a).toEqual({ c: [1, 2] });
  });

  it('resolves per-profile and per-role catalog paths', () => {
    const margin = FIELD_BY_PATH.get('layouts.*.fit.marginX');
    const width = FIELD_BY_PATH.get('fonts.*.widthAdjust');
    const city = FIELD_BY_PATH.get('stops[].city');
    if (!margin || !width || !city) throw new Error('catalog entries missing');
    expect(concretePaths(margin, 'portrait')).toEqual(['layouts.portrait.fit.marginX']);
    expect(concretePaths(width, 'landscape')).toEqual([
      'fonts.display.widthAdjust',
      'fonts.body.widthAdjust',
    ]);
    expect(concretePaths(city, 'landscape')).toEqual([]);
  });

  it('compares JSON values deeply', () => {
    expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
  });
});
