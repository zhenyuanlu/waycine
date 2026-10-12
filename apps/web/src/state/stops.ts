import { computed } from '@preact/signals';
import {
  MAX_STOPS,
  type Medal,
  type StatItem,
  type Stop,
  type StopResult,
  type WaycineProject,
} from 'waycine';
import type { Place } from '../geo/places';
import { commit, project } from './project';
import { checkLocationStops, unplacedStops, withItem } from './ui';

/**
 * Stop list edits. Every function is one undoable edit; field edits pass a
 * coalescing key (`stop:<id>:<field>`) so typing is one undo step.
 */

/** A stop id not used by `stops`: `stop-<n>`. */
export function newStopId(stops: readonly Stop[], prefix = 'stop'): string {
  const ids = new Set(stops.map((s) => s.id));
  let n = stops.length + 1;
  while (ids.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/** True when the project holds MAX_STOPS stops (a video holds at most 99): no stop can be added. */
export const stopsFull = computed(() => project.value.stops.length >= MAX_STOPS);

/** How many more stops fit: MAX_STOPS minus `existing` (never below 0). */
export function stopRoom(existing: number): number {
  return Math.max(0, MAX_STOPS - existing);
}

function withStops(p: WaycineProject, stops: Stop[]): WaycineProject {
  return { ...p, stops };
}

function indexOf(id: string): number {
  return project.peek().stops.findIndex((s) => s.id === id);
}

/** Replaces stop `id` by `update(stop)` as one edit (coalesced by `key`). */
export function updateStop(id: string, update: (stop: Stop) => Stop, key?: string): void {
  const p = project.peek();
  const i = p.stops.findIndex((s) => s.id === id);
  const stop = p.stops[i];
  if (stop === undefined) return;
  const stops = [...p.stops];
  stops[i] = update(stop);
  commit(withStops(p, stops), key);
}

/** Sets or clears (empty string, undefined) one optional stop field. */
export function setStopField<K extends keyof Stop>(
  id: string,
  key: K,
  value: Stop[K] | undefined,
): void {
  updateStop(
    id,
    (stop) => {
      const next = { ...stop };
      if (value === undefined || (value === '' && key !== 'city')) delete next[key];
      else next[key] = value;
      return next;
    },
    `stop:${id}:${String(key)}`,
  );
}

/** Makes a new stop placed somewhere visible again. */
function placed(id: string): void {
  if (unplacedStops.peek().has(id)) unplacedStops.value = withItem(unplacedStops.peek(), id, false);
  if (checkLocationStops.peek().has(id))
    checkLocationStops.value = withItem(checkLocationStops.peek(), id, false);
}

function unhideIfNew(id: string, stop: Stop): Stop {
  if (!unplacedStops.peek().has(id)) return stop;
  const { hidden: _hidden, ...rest } = stop;
  return rest;
}

/** Moves stop `id` to coordinates (from typed or pasted coordinates, or a click on the map). */
export function setStopCoords(id: string, lat: number, lon: number): void {
  updateStop(id, (stop) => unhideIfNew(id, { ...stop, lat, lon }));
  placed(id);
}

/** Fills a stop from a geocoder result: place, city label (upper case), region and country. */
export function setStopPlace(id: string, place: Place): void {
  updateStop(id, (stop) => {
    const next: Stop = unhideIfNew(id, {
      ...stop,
      lat: place.lat,
      lon: place.lon,
      city: place.name.toUpperCase(),
    });
    delete next.region;
    delete next.regionCode;
    delete next.country;
    if (place.region !== undefined) next.region = place.region;
    if (place.regionCode !== undefined) next.regionCode = place.regionCode;
    if (place.country !== undefined) next.country = place.country;
    return next;
  });
  placed(id);
}

/**
 * Appends a new stop and returns its id, or null when the project already
 * holds MAX_STOPS stops. It starts hidden, at the last stop's place, until a
 * place is picked (so the video never shows a stop that is not placed yet).
 */
export function addStop(): string | null {
  const p = project.peek();
  if (p.stops.length >= MAX_STOPS) return null;
  const id = newStopId(p.stops);
  const last = p.stops[p.stops.length - 1];
  const stop: Stop = { id, city: '', lat: last?.lat ?? 0, lon: last?.lon ?? 0, hidden: true };
  unplacedStops.value = withItem(unplacedStops.peek(), id, true);
  commit(withStops(p, [...p.stops, stop]));
  return id;
}

/** Duplicates stop `id` right after it; returns the copy's id, or null (no such stop, or MAX_STOPS reached). */
export function duplicateStop(id: string): string | null {
  const p = project.peek();
  if (p.stops.length >= MAX_STOPS) return null;
  const i = indexOf(id);
  const stop = p.stops[i];
  if (stop === undefined) return null;
  const copy: Stop = { ...JSON.parse(JSON.stringify(stop)), id: newStopId(p.stops) };
  const stops = [...p.stops];
  stops.splice(i + 1, 0, copy);
  commit(withStops(p, stops));
  return copy.id;
}

/** Moves stop `id` to position `to` (clamped). */
export function moveStopTo(id: string, to: number): void {
  const p = project.peek();
  const from = indexOf(id);
  if (from < 0) return;
  const target = Math.max(0, Math.min(p.stops.length - 1, to));
  if (target === from) return;
  const stops = [...p.stops];
  const [stop] = stops.splice(from, 1);
  stops.splice(target, 0, stop as Stop);
  commit(withStops(p, stops));
}

export function moveStop(id: string, delta: number): void {
  moveStopTo(id, indexOf(id) + delta);
}

export function toggleHidden(id: string): void {
  updateStop(id, (stop) => {
    if (stop.hidden === true) {
      const { hidden: _hidden, ...rest } = stop;
      return rest;
    }
    return { ...stop, hidden: true };
  });
  placed(id);
}

/** Deletes stop `id`; returns what `restoreStop` needs to put it back. */
export function deleteStop(id: string): { stop: Stop; index: number } | null {
  const p = project.peek();
  const index = indexOf(id);
  const stop = p.stops[index];
  if (stop === undefined) return null;
  commit(
    withStops(
      p,
      p.stops.filter((s) => s.id !== id),
    ),
  );
  return { stop, index };
}

export function restoreStop(stop: Stop, index: number): void {
  const p = project.peek();
  if (p.stops.some((s) => s.id === stop.id)) return;
  const stops = [...p.stops];
  stops.splice(Math.min(index, stops.length), 0, stop);
  commit(withStops(p, stops));
}

/** Orders stops by date (undated stops keep their relative order, at the end). */
export function sortByDate(): void {
  const p = project.peek();
  const keyed = p.stops.map((stop, i) => ({ stop, i }));
  keyed.sort((a, b) => {
    const da = a.stop.date;
    const db = b.stop.date;
    if (da === undefined || db === undefined) {
      if (da === db) return a.i - b.i;
      return da === undefined ? 1 : -1;
    }
    return da < db ? -1 : da > db ? 1 : a.i - b.i;
  });
  const stops = keyed.map((k) => k.stop);
  if (stops.every((s, i) => s === p.stops[i])) return;
  commit(withStops(p, stops));
}

// ---------------------------------------------------------------------------
// Results

export function updateResult(id: string, index: number, patch: Partial<StopResult>): void {
  updateStop(
    id,
    (stop) => {
      const results = [...(stop.results ?? [])];
      const current = results[index];
      if (current === undefined) return stop;
      results[index] = { ...current, ...patch };
      return { ...stop, results };
    },
    `stop:${id}:result:${index}:${Object.keys(patch).join(',')}`,
  );
}

export function addResult(id: string, medal: Medal = 'gold'): void {
  updateStop(id, (stop) => ({
    ...stop,
    results: [...(stop.results ?? []), { medal, text: '', count: 1 }],
  }));
}

export function removeResult(id: string, index: number): void {
  updateStop(id, (stop) => {
    const results = (stop.results ?? []).filter((_, i) => i !== index);
    const next: Stop = { ...stop, results };
    if (results.length === 0) delete next.results;
    return next;
  });
}

// ---------------------------------------------------------------------------
// Finale stats

function withItems(items: StatItem[]): void {
  const p = project.peek();
  commit({ ...p, stats: { ...p.stats, items } });
}

export function updateStat(index: number, patch: Partial<StatItem>, key?: string): void {
  const p = project.peek();
  const items = [...p.stats.items];
  const current = items[index];
  if (current === undefined) return;
  const next: StatItem = { ...current, ...patch };
  for (const k of ['labelOne', 'value'] as const) {
    if (next[k] === '') delete next[k];
  }
  items[index] = next;
  commit({ ...p, stats: { ...p.stats, items } }, key);
}

export function addStat(): void {
  withItems([...project.peek().stats.items, { source: 'stops', label: 'STOPS', labelOne: 'STOP' }]);
}

export function removeStat(index: number): void {
  withItems(project.peek().stats.items.filter((_, i) => i !== index));
}

export function moveStat(index: number, delta: number): void {
  const items = [...project.peek().stats.items];
  const target = index + delta;
  if (target < 0 || target >= items.length) return;
  const [item] = items.splice(index, 1);
  items.splice(target, 0, item as StatItem);
  withItems(items);
}
