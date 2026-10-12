import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  computeStats,
  THEMES,
  TRANSITION_STYLES,
  themeIdFor,
  transitionStyle,
  validateProject,
} from '../../src/core/index.js';
import { readFixtureProject } from '../helpers/projects.js';

const PRESET_DIR = new URL('../../presets/', import.meta.url);
const SUFFIX = '.waycine.json';

function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, 'utf8')) as unknown;
}

function readPreset(name: string): unknown {
  return readJson(new URL(`${name}${SUFFIX}`, PRESET_DIR));
}

/** Names of the shipped presets, sorted. */
const SHIPPED = readdirSync(PRESET_DIR)
  .filter((file) => file.endsWith(SUFFIX))
  .map((file) => file.slice(0, -SUFFIX.length))
  .sort();

describe('shipped presets', () => {
  const projects = SHIPPED.map((name) => validateProject(readPreset(name)).project);

  it('are the five demos', () => {
    expect(SHIPPED).toEqual(['day-trip', 'europe-trip', 'race-season', 'road-trip', 'world-tour']);
  });

  it.each(SHIPPED)('%s validates with no issues at all and is named as a demo', (name) => {
    const { project, issues } = validateProject(readPreset(name));
    expect(issues).toEqual([]);
    expect(project.meta.name).toMatch(/ demo$/);
  });

  it('cover the four formats', () => {
    expect(new Set(projects.map((p) => p.output.aspect))).toEqual(
      new Set(['16:9', '9:16', '1:1', '4:5']),
    );
  });

  it('cover every transition style', () => {
    expect(new Set(projects.map((p) => transitionStyle(p)))).toEqual(new Set(TRANSITION_STYLES));
  });

  it('cover every built-in theme and a custom one, each named as the engine names it', () => {
    expect(new Set(projects.map((p) => p.theme.id))).toEqual(
      new Set([...THEMES.map((t) => t.id), 'custom']),
    );
    for (const p of projects) expect(themeIdFor(p.theme)).toBe(p.theme.id);
  });

  it('cover every finale stat source', () => {
    const sources = new Set(projects.flatMap((p) => p.stats.items.map((item) => item.source)));
    expect(sources).toEqual(
      new Set(['stops', 'regions', 'countries', 'months', 'days', 'km', 'mi', 'custom']),
    );
  });
});

describe('the reference season (a test project, not a shipped preset)', () => {
  const { project, issues } = validateProject(readFixtureProject('season-2026'));

  it('validates with zero error issues', () => {
    expect(issues.filter((issue) => issue.level === 'error')).toEqual([]);
  });

  it('has no warnings either (no unknown keys, nothing coerced)', () => {
    expect(issues).toEqual([]);
  });

  it('has 7 stops in race order', () => {
    expect(project.stops).toHaveLength(7);
    expect(project.stops.map((stop) => stop.city)).toEqual([
      'BOSTON',
      'NEW YORK',
      'SPRINGFIELD',
      'FLUSHING',
      'HARTFORD',
      'RHODE ISLAND',
      'MERCER COUNTY',
    ]);
  });

  it('keeps result text verbatim, including double spaces, and parses medal counts', () => {
    const boston = project.stops[0];
    expect(boston?.results?.[0]).toEqual({
      medal: 'gold',
      text: '500M  6TH  (1ST ALUMNI)',
      count: 1,
    });
    const flushing = project.stops[3];
    expect(flushing?.results?.map((r) => [r.medal, r.count])).toEqual([
      ['gold', 2],
      ['bronze', 3],
    ]);
    expect(project.stops[1]?.results?.[0]?.medal).toBe('ring');
  });

  it('uses ISO dates and the season settings', () => {
    expect(project.stops[0]?.date).toBe('2026-06-13');
    expect(project.meta.name).toBe('2026 Dragon Boat Season');
    expect(project.text.title).toBe('2026 SEASON ROUTE');
    expect(project.text.subtitle).toBe('{stops|RACE|RACES}  /  {regions|STATE|STATES}');
    expect(project.text.kicker).toBe('RACE {n:02} / {total:02}');
    // The original drew every text opaque.
    expect(project.text.solid).toBe(true);
    expect(project.output).toMatchObject({ aspect: '16:9', shortSide: 1080, fps: 29.97 });
    expect(project.timing.transition.mode).toBe('zoomThrough');
    expect(project.stats.items.map((item) => [item.source, item.label])).toEqual([
      ['stops', 'RACES'],
      ['regions', 'STATES'],
      ['months', 'MONTHS'],
    ]);
  });

  it('calibrates the bundled fonts to the original widths, not sizes', () => {
    // Barlow Condensed Bold is about 11% wider and Barlow Semi Condensed
    // SemiBold about 13% narrower than the original's Bahnschrift instances.
    expect(project.fonts.display).toMatchObject({ sizeAdjust: 1, widthAdjust: 0.89 });
    expect(project.fonts.body).toMatchObject({ sizeAdjust: 1, widthAdjust: 1.15 });
  });

  it('counts 5 distinct regions', () => {
    expect(new Set(project.stops.map((stop) => stop.regionCode)).size).toBe(5);
  });
});

describe('europe-trip preset', () => {
  const { project, issues } = validateProject(readPreset('europe-trip'));

  it('validates with no issues at all', () => {
    expect(issues).toEqual([]);
  });

  it('is a neutral 9:16 demo: eight cities, country codes, summer 2026 date ranges', () => {
    expect(project.meta.name).toBe('Europe trip demo');
    expect(project.stops.map((stop) => [stop.city, stop.country])).toEqual([
      ['Lisbon', 'PT'],
      ['Madrid', 'ES'],
      ['Barcelona', 'ES'],
      ['Paris', 'FR'],
      ['Amsterdam', 'NL'],
      ['Berlin', 'DE'],
      ['Prague', 'CZ'],
      ['Vienna', 'AT'],
    ]);
    for (const stop of project.stops) {
      expect(stop.date?.startsWith('2026-0')).toBe(true);
      expect((stop.endDate ?? '') > (stop.date ?? '')).toBe(true);
      expect(stop.lat).toBeGreaterThan(38);
      expect(stop.lat).toBeLessThan(53);
      expect(stop.lon).toBeGreaterThan(-10);
      expect(stop.lon).toBeLessThan(17);
    }
  });

  it('uses 9:16 1080p, Midnight Cyan, the fly transition, 30 fps and 2 s stops', () => {
    expect(project.output).toMatchObject({ aspect: '9:16', shortSide: 1080, fps: 30 });
    expect(project.theme.id).toBe('midnight-cyan');
    expect(project.timing.transition.mode).toBe('fly');
    expect(project.timing.stopSec).toBe(2);
    expect(project.text.subtitle).toBe(
      '{stops|CITY|CITIES}  /  {countries|COUNTRY|COUNTRIES}  /  {km} KM',
    );
    expect(project.stats.items.map((item) => [item.source, item.label])).toEqual([
      ['stops', 'CITIES'],
      ['countries', 'COUNTRIES'],
      ['km', 'KM'],
    ]);
  });
});

describe('race-season preset', () => {
  const { project } = validateProject(readPreset('race-season'));
  const reference = validateProject(readFixtureProject('season-2026')).project;

  it('is a made-up season: seven races in five states, none of them a stop of the reference season', () => {
    expect(project.meta.name).toBe('Race season demo');
    expect(project.stops.map((stop) => [stop.city, stop.region])).toEqual([
      ['CHICAGO', 'IL'],
      ['MILWAUKEE', 'WI'],
      ['GRAND RAPIDS', 'MI'],
      ['DETROIT', 'MI'],
      ['TOLEDO', 'OH'],
      ['CLEVELAND', 'OH'],
      ['BUFFALO', 'NY'],
    ]);
    expect(computeStats(project.stops)).toMatchObject({ stops: 7, regions: 5, months: 4 });
    const referenceCities = new Set(reference.stops.map((stop) => stop.city));
    const referenceEvents = new Set(reference.stops.map((stop) => stop.event));
    for (const stop of project.stops) {
      expect(referenceCities.has(stop.city)).toBe(false);
      expect(referenceEvents.has(stop.event)).toBe(false);
    }
  });

  it('shows results with every medal kind, medal counts, a stop without results and an extra line', () => {
    const medals = project.stops.flatMap((stop) => (stop.results ?? []).map((r) => r.medal));
    expect(new Set(medals)).toEqual(new Set(['gold', 'silver', 'bronze', 'ring', 'none']));
    expect(project.stops[3]?.results?.map((r) => [r.medal, r.count])).toEqual([
      ['gold', 2],
      ['bronze', 3],
    ]);
    expect(project.stops[2]?.results).toBeUndefined();
    expect(project.stops[3]?.partner).toBe('JOINT CREW WITH DEMO DRAGON BOAT TEAM');
  });

  it('uses 16:9 at 29.97 fps, the default theme, Flash to white and solid text', () => {
    expect(project.output).toMatchObject({ aspect: '16:9', shortSide: 1080, fps: 29.97 });
    expect(project.theme.id).toBe('orchid');
    expect(transitionStyle(project)).toBe('flashWhite');
    expect(project.text.solid).toBe(true);
    expect(project.text.title).toBe('2026 SEASON ROUTE');
    expect(project.fonts.display.widthAdjust).toBe(1);
    expect(project.stats.items.map((item) => [item.source, item.label])).toEqual([
      ['stops', 'RACES'],
      ['regions', 'STATES'],
      ['months', 'MONTHS'],
    ]);
  });
});

describe('road-trip preset', () => {
  const { project } = validateProject(readPreset('road-trip'));

  it('is a loop in miles: it ends where it starts, 11 days through 3 states', () => {
    expect(project.meta.name).toBe('Road trip demo');
    const first = project.stops[0];
    const last = project.stops.at(-1);
    expect(project.stops).toHaveLength(8);
    expect([last?.lat, last?.lon]).toEqual([first?.lat, first?.lon]);
    expect(computeStats(project.stops)).toMatchObject({ days: 11, regions: 3, mi: 777 });
    expect(project.stats.items.map((item) => item.source)).toEqual(['days', 'regions', 'mi']);
  });

  it('uses 1:1 at 24 fps, Ember, Dip to dark, a description, month dates and a longer stop', () => {
    expect(project.output).toMatchObject({ aspect: '1:1', shortSide: 1080, fps: 24 });
    expect(project.theme.id).toBe('ember');
    expect(transitionStyle(project)).toBe('dipBackground');
    expect(project.text.description).not.toBe('');
    expect(project.text.descriptionAt).toBe('introAndFinale');
    expect(project.text).toMatchObject({ cardDate: 'MMM D', pinDate: 'MMM D' });
    expect(project.stops.filter((stop) => stop.endDate !== undefined)).toHaveLength(3);
    expect(project.stops.find((stop) => stop.durationSec !== undefined)?.city).toBe('Grand Canyon');
    expect(project.route.bulgeSide).toBe('left');
    expect(project.timing.endHoldSec).toBe(1);
  });
});

describe('world-tour preset', () => {
  const { project } = validateProject(readPreset('world-tour'));

  it('goes round the world across the Pacific: nine shows in eight countries', () => {
    expect(project.meta.name).toBe('World tour demo');
    expect(project.stops.map((stop) => stop.city)).toEqual([
      'London',
      'Istanbul',
      'Dubai',
      'Singapore',
      'Tokyo',
      'Sydney',
      'Los Angeles',
      'Mexico City',
      'New York',
    ]);
    expect(computeStats(project.stops)).toMatchObject({ stops: 9, countries: 8, year: 2026 });
    const sydney = project.stops[5];
    const losAngeles = project.stops[6];
    // More than half the globe apart in longitude: the route takes the short way over 180 degrees.
    expect(Math.abs((losAngeles?.lon ?? 0) - (sydney?.lon ?? 0))).toBeGreaterThan(180);
    expect((sydney?.lat ?? 0) < 0).toBe(true);
  });

  it('uses 16:9 at 30 fps, its own colours, Flash to colour, a year token and an own-value stat', () => {
    expect(project.output).toMatchObject({ aspect: '16:9', shortSide: 1080, fps: 30 });
    expect(project.theme.id).toBe('custom');
    expect(transitionStyle(project)).toBe('flashColor');
    expect(project.theme.flash).toBe(project.theme.route);
    expect(project.text.title).toBe('World tour {year}');
    expect(project.stops[4]?.dateText).toBe('MAR 25 + 26');
    expect(project.stops[5]?.partner).toBe('With the Harbour City Strings');
    expect(project.stats.items.at(-1)).toMatchObject({
      source: 'custom',
      value: '4',
      label: 'CONTINENTS',
    });
    expect(project.graticule.labelFormat).toBe('degree');
  });
});

describe('day-trip preset', () => {
  const { project } = validateProject(readPreset('day-trip'));

  it('is one day in one place, south of the equator: clock times instead of dates, one stop left out', () => {
    expect(project.meta.name).toBe('Day trip demo');
    expect(project.stops).toHaveLength(8);
    expect(project.stops.filter((stop) => stop.hidden === true).map((stop) => stop.city)).toEqual([
      'Hout Bay',
    ]);
    for (const stop of project.stops) {
      expect(stop.date).toBe('2026-11-14');
      expect(stop.dateText).toMatch(/^[0-9]{2}:[0-9]{2}$/);
      expect(stop.lat).toBeLessThan(-33);
      expect(stop.lon).toBeGreaterThan(18);
    }
    const shown = project.stops.filter((stop) => stop.hidden !== true);
    expect(computeStats(shown)).toMatchObject({ stops: 7, km: 124 });
  });

  it('uses 4:5 at 25 fps, Mono, the fly transition, mixed-case text and its own portrait framing', () => {
    expect(project.output).toMatchObject({ aspect: '4:5', shortSide: 1080, fps: 25 });
    expect(project.theme.id).toBe('mono');
    expect(transitionStyle(project)).toBe('fly');
    expect(project.text.uppercase).toBe(false);
    expect(project.hud.corners).toBe(false);
    expect(project.layouts.portrait.fit).toMatchObject({ marginY: 560, offsetDu: [0, 110] });
    expect(project.layouts.portrait.stats).toMatchObject({ direction: 'row', pitch: 330, y: 170 });
    expect(project.stats.items.at(-1)).toMatchObject({ source: 'custom', value: '11' });
  });
});
