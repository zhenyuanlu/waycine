import { effect, signal } from '@preact/signals';
import { validateProject, type WaycineProject } from 'waycine';
import { searchCache } from '../geo/geocoder';
import { compactProject } from './compact';
import { baseProject, origin, project, restoredFromAutosave } from './project';
import { serializeSnapshot } from './snapshot';
import { readJson, STORAGE_KEYS, writeJson } from './storage';

/** Autosave waits this long after the last change. */
export const AUTOSAVE_DEBOUNCE_MS = 500;
/** Recent projects kept. */
export const RECENT_LIMIT = 10;

/**
 * True while the autosave must not be written: a shared link was opened and
 * the user has neither kept it nor edited it yet (so their own autosaved
 * project survives a glance at someone else's link).
 */
export const autosavePaused = signal(false);

/**
 * What the header's save-state slot says: `idle` (nothing to save yet, an
 * untouched first visit), `saving` (an edit waits for the autosave),
 * `saved`, `failed` (this browser could not store it) or `paused` (a shared
 * link waits for Keep).
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed' | 'paused';
export const saveStatus = signal<SaveStatus>(restoredFromAutosave ? 'saved' : 'idle');

let timer: ReturnType<typeof setTimeout> | undefined;

// What the page started with: an untouched first visit writes nothing, so the
// next visit is still a first visit (welcome card, autoplay).
const start = { project: project.peek(), base: baseProject.peek(), origin: origin.peek() };

let wroteThisSession = false;

function unchangedSinceStart(): boolean {
  return (
    !wroteThisSession &&
    project.peek() === start.project &&
    baseProject.peek() === start.base &&
    origin.peek() === start.origin
  );
}

/** Writes the autosave now (also used before leaving the page). */
export function saveNow(): void {
  clearTimeout(timer);
  timer = undefined;
  if (autosavePaused.peek() || unchangedSinceStart()) return;
  const snapshot = { project: project.peek(), base: baseProject.peek(), origin: origin.peek() };
  const stored = serializeSnapshot(snapshot, new Date().toISOString());
  let result = writeJson(STORAGE_KEYS.autosave, stored);
  if (result === 'full') {
    // The place-search cache shares this site's storage: the project comes first.
    searchCache().clear();
    result = writeJson(STORAGE_KEYS.autosave, stored);
  }
  saveStatus.value = result === 'ok' ? 'saved' : 'failed';
  wroteThisSession = true;
}

/** Starts the debounced autosave of the project (and what it is compared against). */
export function startAutosave(): void {
  effect(() => {
    void project.value;
    void baseProject.value;
    void origin.value;
    if (autosavePaused.value) {
      saveStatus.value = 'paused';
      return;
    }
    if (unchangedSinceStart()) return;
    if (saveStatus.peek() !== 'failed') saveStatus.value = 'saving';
    clearTimeout(timer);
    timer = setTimeout(saveNow, AUTOSAVE_DEBOUNCE_MS);
  });
  window.addEventListener('pagehide', () => {
    if (timer !== undefined) saveNow();
  });
  // Phones often discard a background tab without a pagehide: save when it is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timer !== undefined) saveNow();
  });
}

// ---------------------------------------------------------------------------
// Recent projects

/** One recent project. */
export interface RecentEntry {
  id: string;
  name: string;
  savedAt: string;
  stops: number;
  project: unknown;
}

function isEntry(value: unknown): value is RecentEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.savedAt === 'string' &&
    typeof v.stops === 'number' &&
    typeof v.project === 'object'
  );
}

function readRecentList(): RecentEntry[] {
  const raw = readJson(STORAGE_KEYS.recent);
  return Array.isArray(raw) ? raw.filter(isEntry) : [];
}

/** Recent projects, newest first. */
export const recentProjects = signal<readonly RecentEntry[]>(readRecentList());

function writeRecent(list: RecentEntry[]): void {
  recentProjects.value = list;
  writeJson(STORAGE_KEYS.recent, list);
}

/**
 * Keeps `p` in Recent (newest first, at most RECENT_LIMIT). An identical
 * project already there moves to the top instead of being added twice.
 * Projects without stops are not kept.
 */
export function pushRecent(p: WaycineProject): void {
  if (p.stops.length === 0) return;
  const compact = compactProject(p);
  const json = JSON.stringify(compact);
  const others = readRecentList().filter((e) => JSON.stringify(e.project) !== json);
  const entry: RecentEntry = {
    id: `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: p.meta.name,
    savedAt: new Date().toISOString(),
    stops: p.stops.length,
    project: compact,
  };
  writeRecent([entry, ...others].slice(0, RECENT_LIMIT));
}

export function removeRecent(id: string): void {
  writeRecent(readRecentList().filter((e) => e.id !== id));
}

/** The validated project of a recent entry. */
export function recentProject(entry: RecentEntry): WaycineProject {
  return validateProject(entry.project).project;
}
