import { createDefaultProject, type WaycineProject } from '../../src/core/index.js';
import { loadFixtureProject, loadSeason } from './projects.js';

/**
 * The projects of the liveness test (`unit/fields-liveness.test.ts`), by
 * fixture name. A setting that reaches the pixels only in some projects names
 * one of them in `liveWhen`, and `unit/fields.test.ts` checks those names
 * against this record. Every entry builds a fresh project per call.
 */

/** Engine defaults with the season's seven stops (results, a partner line, one country). */
function probeBase(): WaycineProject {
  const project = createDefaultProject();
  project.stops = loadSeason().stops;
  // Mixed case, so the all-caps setting shows.
  project.text.title = 'My Journey';
  return project;
}

const LONG_TITLE =
  'The longest journey across the whole island and back again, by bike, by boat and on foot, in one very long and very wet summer';
const LONG_SUBTITLE =
  '{stops|STOP|STOPS}  /  {km} KM  /  THREE WEEKS  /  TWO BIKES  /  ONE TENT  /  NO REGRETS  /  MANY FERRIES  /  ENDLESS RAIN  /  COLD TEA  /  WARM PEOPLE  /  ONE MORE HILL';

const DESCRIPTION = 'Summer racing tour  /  {km} KM';
const LONG_DESCRIPTION =
  'Seven races in five states, two boats, forty paddlers, one coach, early mornings on the river and long drives home, written down here as one very long line';

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Liveness fixtures by name (the `liveWhen` values). */
export const LIVENESS_FIXTURES: Record<string, () => WaycineProject> = {
  default: probeBase,
  fly: () => {
    const p = probeBase();
    p.timing.transition.mode = 'fly';
    return p;
  },
  portrait: () => {
    const p = probeBase();
    p.output.aspect = '9:16';
    return p;
  },
  square: () => {
    const p = probeBase();
    p.output.aspect = '1:1';
    return p;
  },
  // Card names and a title that must shrink to fit (auto-fit settings).
  longNames: () => {
    const p = loadFixtureProject('long-names');
    p.output.aspect = '16:9';
    p.text.title = LONG_TITLE;
    p.text.subtitle = LONG_SUBTITLE;
    p.text.description = LONG_DESCRIPTION;
    return p;
  },
  // A description line under the subtitle (intro only).
  description: () => {
    const p = probeBase();
    p.text.description = DESCRIPTION;
    return p;
  },
  // The description also in the finale, under the stats.
  descriptionFinale: () => {
    const p = probeBase();
    p.text.description = DESCRIPTION;
    p.text.descriptionAt = 'introAndFinale';
    return p;
  },
  // Pin labels beside their pins on the side the layout's flip rule gives.
  fixedLabels: () => {
    const p = probeBase();
    p.pins.label.placement = 'fixed';
    return p;
  },
  // Zoom-throughs that dip into the background colour instead of the flash colour.
  flashBackground: () => {
    const p = probeBase();
    p.timing.transition.flashTo = 'background';
    return p;
  },
  // A fixed step that differs from the automatic one (0.25 for the season).
  fixedGrid: () => {
    const p = probeBase();
    p.graticule.stepMode = 'fixed';
    p.graticule.fixedStep = 1;
    return p;
  },
  // Overview nudges larger than their cap in every profile.
  nudged: () => {
    const p = probeBase();
    for (const layout of Object.values(p.layouts)) layout.fit.nudgeDeg = [1, 1];
    return p;
  },
  // Two pins so close that the second covers the first one's label.
  crowded: () => {
    const p = probeBase();
    p.stops = [
      { id: 'a', city: 'Alpha', lat: 40, lon: -74, date: '2026-06-01' },
      { id: 'b', city: 'Bravo', lat: 40, lon: -73.95, date: '2026-06-08' },
      { id: 'c', city: 'Charlie', lat: 42, lon: -70, date: '2026-06-15' },
    ];
    return p;
  },
  // Stats stacked in a column in every profile (the column wraps below the safe-area top).
  statsColumn: () => {
    const p = probeBase();
    for (const layout of Object.values(p.layouts)) layout.stats.direction = 'column';
    return p;
  },
  // A route the finale camera must move to clear the stats (the safe-area bottom limits it).
  clearance: () => loadFixtureProject('equator'),
  partnerResults: () => loadFixtureProject('partner-results'),
  duplicates: () => loadFixtureProject('duplicate-location'),
  // Every stop spans three days, so dates render as ranges.
  ranges: () => {
    const p = probeBase();
    for (const stop of p.stops) {
      if (stop.date !== undefined) stop.endDate = addDays(stop.date, 2);
    }
    return p;
  },
  // Regions counted from region names (no codes), shown in the subtitle and the stats.
  regions: () => {
    const p = probeBase();
    for (const stop of p.stops) delete stop.regionCode;
    p.text.subtitle = '{regions|REGION|REGIONS}';
    p.stats.items = [{ source: 'regions', label: 'REGIONS', labelOne: 'REGION' }];
    return p;
  },
  customSize: () => {
    const p = probeBase();
    p.output.aspect = 'custom';
    p.output.width = 1600;
    p.output.height = 900;
    return p;
  },
};
