import dayTrip from 'waycine/presets/day-trip.waycine.json';
import europeTrip from 'waycine/presets/europe-trip.waycine.json';
import raceSeason from 'waycine/presets/race-season.waycine.json';
import roadTrip from 'waycine/presets/road-trip.waycine.json';
import worldTour from 'waycine/presets/world-tour.waycine.json';
import { copy } from '../copy/en';

/** A bundled starting project. */
export interface PresetEntry {
  /** Stable id (the preset file name without `.waycine.json`). */
  id: string;
  /** Short name on the demo picker's chip. */
  name: string;
  /** Name shown in "Start from" (the project's own name). */
  label: string;
  /** One line under the name: what the demo is for and its format. */
  hint: string;
  /** The preset JSON as shipped (validated when loaded). */
  source: unknown;
}

/** Id of the demo a first visit starts on. */
export const DEFAULT_PRESET_ID = 'europe-trip';

/** Bundled demos in the order "Start from" lists them, the default first. */
export const PRESETS: readonly PresetEntry[] = [
  { id: DEFAULT_PRESET_ID, ...copy.demos['europe-trip'], source: europeTrip },
  { id: 'race-season', ...copy.demos['race-season'], source: raceSeason },
  { id: 'road-trip', ...copy.demos['road-trip'], source: roadTrip },
  { id: 'world-tour', ...copy.demos['world-tour'], source: worldTour },
  { id: 'day-trip', ...copy.demos['day-trip'], source: dayTrip },
];

/**
 * Id of the demo a visit without a saved project starts on: the bundled demo
 * that `?demo=<id>` in the address names (a link to one demo), else the
 * default. `search` is `location.search`.
 */
export function startPresetId(search: string): string {
  const asked = new URLSearchParams(search).get('demo');
  return PRESETS.find((p) => p.id === asked)?.id ?? DEFAULT_PRESET_ID;
}

/** The preset with `id`, or the default one. */
export function presetById(id: string): PresetEntry {
  const found = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  if (found === undefined) {
    throw new Error('No bundled presets.');
  }
  return found;
}
