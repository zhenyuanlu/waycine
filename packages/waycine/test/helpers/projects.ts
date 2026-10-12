import { readFileSync } from 'node:fs';
import type { WaycineProject } from '../../src/core/schema/types.js';
import { validateProject } from '../../src/core/schema/validate.js';

/**
 * The reference season the parity fixtures and most goldens were made from.
 * It is not shipped as a preset: it lives with the test projects.
 */
export const REFERENCE_SEASON = 'season-2026';

/**
 * The other test projects in `test/fixtures/projects/` (the reference season
 * is loaded on its own, with `loadSeason`).
 */
export const FIXTURE_PROJECTS = [
  'pacific',
  'single-stop',
  'long-names',
  'duplicate-location',
  'partner-results',
  'round-the-world',
  'equator',
] as const;

/** Loads and validates a bundled preset from `presets/`. */
export function loadPreset(name: string): WaycineProject {
  const url = new URL(`../../presets/${name}.waycine.json`, import.meta.url);
  return validateProject(JSON.parse(readFileSync(url, 'utf8')) as unknown).project;
}

/**
 * Loads a bundled preset for the 0.5 em test metric (`createMeasureBackend`).
 * A preset's font width calibration (`fonts.*.widthAdjust`) maps the bundled
 * Barlow faces onto the original's Bahnschrift widths; the test metric stands
 * in for the original's own font (the reference states were recorded with the
 * same metric), so the calibration is reset to 1.
 */
export function loadPresetForTestMetric(name: string): WaycineProject {
  const project = loadPreset(name);
  project.fonts.display.widthAdjust = 1;
  project.fonts.body.widthAdjust = 1;
  return project;
}

/** Reads a test project from `test/fixtures/projects/` (not validated). */
export function readFixtureProject(name: string): unknown {
  const url = new URL(`../fixtures/projects/${name}.waycine.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as unknown;
}

/** Loads and validates a test project from `test/fixtures/projects/`. */
export function loadFixtureProject(name: string): WaycineProject {
  return validateProject(readFixtureProject(name)).project;
}

/** Loads and validates the reference season (a fresh project per call). */
export function loadSeason(): WaycineProject {
  return loadFixtureProject(REFERENCE_SEASON);
}

/**
 * Loads the reference season for the 0.5 em test metric, with the same
 * calibration reset as `loadPresetForTestMetric`.
 */
export function loadSeasonForTestMetric(): WaycineProject {
  const project = loadSeason();
  project.fonts.display.widthAdjust = 1;
  project.fonts.body.widthAdjust = 1;
  return project;
}
