import { describe, expect, it } from 'vitest';
import type { Stop } from '../../src/core/schema/types.js';
import { computeStats, regionKey, resolveStats } from '../../src/core/stats.js';
import { loadSeason } from '../helpers/projects.js';

describe('journey stats', () => {
  it('season: 7 stops, 5 regions, 1 country, 4 months, 99 days', () => {
    const stats = computeStats(loadSeason().stops);
    expect(stats.stops).toBe(7);
    expect(stats.regions).toBe(5);
    expect(stats.countries).toBe(1);
    expect(stats.months).toBe(4);
    expect(stats.days).toBe(99);
    expect(stats.year).toBe(2026);
    expect(stats.km).toBeGreaterThan(500);
    expect(Number.isInteger(stats.km)).toBe(true);
    expect(stats.mi).toBeCloseTo(stats.km / 1.609344, -1);
  });

  it('counts regions by code, else by name, and derives countries from region codes', () => {
    const stops: Stop[] = [
      { id: 'a', city: 'A', lat: 1, lon: 1, region: 'Massachusetts', regionCode: 'US-MA' },
      { id: 'b', city: 'B', lat: 1, lon: 2, region: 'MA', regionCode: 'us-ma' },
      { id: 'c', city: 'C', lat: 1, lon: 3, region: 'Ontario' },
      { id: 'd', city: 'D', lat: 1, lon: 4, regionCode: 'CA-QC' },
    ];
    const stats = computeStats(stops);
    expect(stats.regions).toBe(3);
    expect(stats.countries).toBe(2);
  });

  it('leaves values without data undefined and spans end dates', () => {
    const bare = computeStats([{ id: 'a', city: 'A', lat: 1, lon: 1 }]);
    expect(bare).toMatchObject({ stops: 1, km: 0, mi: 0 });
    expect(bare.regions).toBeUndefined();
    expect(bare.countries).toBeUndefined();
    expect(bare.months).toBeUndefined();
    expect(bare.days).toBeUndefined();
    expect(bare.year).toBeUndefined();
    const ranged = computeStats([
      { id: 'a', city: 'A', lat: 1, lon: 1, date: '2025-12-30', endDate: '2026-01-02' },
    ]);
    expect(ranged.days).toBe(4);
    expect(ranged.months).toBe(2);
    expect(ranged.year).toBe(2025);
  });

  it('resolves items: overrides, labelOne, omitted items, upper-casing', () => {
    const stats = computeStats([
      { id: 'a', city: 'A', lat: 0, lon: 0 },
      { id: 'b', city: 'B', lat: 0, lon: 1 },
    ]);
    const items = resolveStats(
      [
        { source: 'stops', label: 'stops', labelOne: 'stop' },
        { source: 'regions', label: 'REGIONS' },
        { source: 'custom', label: 'CREW' },
        { source: 'custom', label: 'crew', value: '22' },
        { source: 'km', label: 'KM', value: '1' },
        { source: 'km', label: 'KM' },
      ],
      stats,
      true,
    );
    expect(items).toEqual([
      { value: '2', label: 'STOPS' },
      { value: '22', label: 'CREW' },
      { value: '1', label: 'KM' },
      { value: '111', label: 'KM' },
    ]);
    const one = resolveStats(
      [{ source: 'stops', label: 'STOPS', labelOne: 'STOP' }],
      computeStats([{ id: 'a', city: 'A', lat: 0, lon: 0 }]),
      false,
    );
    expect(one).toEqual([{ value: '1', label: 'STOP' }]);
  });
});

describe('region and country normalization', () => {
  it('keys a region by its code, else country + region, ignoring case and spaces', () => {
    expect(regionKey({ id: 'a', city: 'A', lat: 0, lon: 0, regionCode: ' us-ma ' })).toBe('US-MA');
    expect(regionKey({ id: 'b', city: 'B', lat: 0, lon: 0, region: 'ma', country: 'us' })).toBe(
      'US-MA',
    );
    expect(regionKey({ id: 'c', city: 'C', lat: 0, lon: 0, region: 'US-MA', country: 'US' })).toBe(
      'US-MA',
    );
    expect(regionKey({ id: 'd', city: 'D', lat: 0, lon: 0, region: 'Bavaria' })).toBe('BAVARIA');
    expect(regionKey({ id: 'e', city: 'E', lat: 0, lon: 0, country: 'DE' })).toBe('');
  });

  it('counts a region given by code on one stop and by name + country on another once', () => {
    const stats = computeStats([
      { id: 'a', city: 'A', lat: 42, lon: -71, regionCode: 'US-MA' },
      { id: 'b', city: 'B', lat: 42, lon: -72, region: 'MA', country: 'US' },
      { id: 'c', city: 'C', lat: 41, lon: -73, region: 'NY', country: 'us' },
    ]);
    expect(stats.regions).toBe(2);
    expect(stats.countries).toBe(1);
  });
});
