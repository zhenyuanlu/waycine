import { batch, computed, signal } from '@preact/signals';
import {
  createDefaultProject,
  outputSize,
  type ProfileId,
  pickProfile,
  THEMES,
  type Theme,
  themeIdFor,
  validateProject,
  type WaycineProject,
} from 'waycine';
import { copy } from '../copy/en';
import { History } from './history';
import { restoreLossIssues } from './issues';
import { jsonEqual, setPath } from './paths';
import { presetById, startPresetId } from './presets';
import { type Origin, readAutosave, type Snapshot } from './snapshot';
import { restoreIssues } from './ui';

/** Undo steps kept. */
export const UNDO_LIMIT = 100;
/** Edits with the same key within this many ms form one undo step. */
export const COALESCE_MS = 500;

/** The project as a bundled preset ships it (validated). */
export function presetProject(id: string): WaycineProject {
  return validateProject(presetById(id).source).project;
}

/** A project with the engine defaults, no stops and no title (the title field shows a placeholder). */
export function blankProject(): WaycineProject {
  const project = createDefaultProject();
  project.meta.name = copy.app.defaultProjectName;
  project.text.title = '';
  return project;
}

function initialSnapshot(): Snapshot & { restored: boolean } {
  const saved = readAutosave();
  if (saved !== null) {
    // Values the autosave held that did not survive validation (more than 99 stops, ...).
    restoreIssues.value = restoreLossIssues(saved.issues);
    return { ...saved, restored: true };
  }
  const demo = presetProject(firstVisitPresetId);
  return {
    project: demo,
    base: demo,
    origin: { kind: 'preset', id: firstVisitPresetId },
    restored: false,
  };
}

/**
 * The demo this visit starts on when the browser has no saved project: the
 * one `?demo=<id>` named when the page loaded, else the default. Read once,
 * because the query is taken out of the address afterwards (`openDemoLink`).
 */
export const firstVisitPresetId: string = startPresetId(
  typeof location === 'undefined' ? '' : location.search,
);

const initial = initialSnapshot();

/** True when this visit restored an autosaved project (so it is not the first run). */
export const restoredFromAutosave = initial.restored;

/** The project the editor edits and the preview shows. */
export const project = signal<WaycineProject>(initial.project);

/** What the project is compared against: changed-value dots and "Reset" go back to it. */
export const baseProject = signal<WaycineProject>(initial.base);

/** Where the project came from. */
export const origin = signal<Origin>(initial.origin);

/**
 * True when the project changed since it was loaded or saved to a file. A
 * project restored from the autosave counts as changed when it differs from
 * its starting point, so an edited demo is still asked about (and kept in
 * Recent) after a reload.
 */
export const dirty = signal(initial.restored && !jsonEqual(initial.project, initial.base));

/** Increases with every edit, undo and redo (not with loads). */
export const editCount = signal(0);

const history = new History<WaycineProject>(UNDO_LIMIT, COALESCE_MS);
export const canUndo = signal(false);
export const canRedo = signal(false);

function syncHistory(): void {
  canUndo.value = history.canUndo;
  canRedo.value = history.canRedo;
}

/** Layout profile of the current project (`layouts.*` settings edit this one). */
export const activeProfile = computed<ProfileId>(() => {
  const size = outputSize(project.value.output);
  return pickProfile(size.width, size.height, project.value.output.layout);
});

function show(next: WaycineProject): void {
  batch(() => {
    project.value = next;
    dirty.value = true;
    editCount.value += 1;
    syncHistory();
  });
}

/**
 * Makes `next` the project as one edit. Edits with the same `key` within
 * COALESCE_MS share one undo step (typing, dragging a slider); structural
 * edits pass no key.
 */
export function commit(next: WaycineProject, key?: string): void {
  const before = project.peek();
  if (next === before) return;
  history.record(before, performance.now(), key);
  show(next);
}

/**
 * Sets one value by concrete path as an edit. A colour edit names the theme
 * as the engine does (`themeIdFor`): the built-in theme with exactly these
 * colours, else custom (the swatch no longer describes it).
 */
export function setValue(path: string, value: unknown, key: string = path): void {
  let next = setPath(project.peek(), path, value);
  if (path.startsWith('theme.') && path !== 'theme.id') {
    const id = themeIdFor(next.theme);
    if (next.theme.id !== id) next = setPath(next, 'theme.id', id);
  }
  commit(next, key);
}

export function undo(): void {
  const previous = history.undo(project.peek());
  if (previous !== null) show(previous);
}

export function redo(): void {
  const next = history.redo(project.peek());
  if (next !== null) show(next);
}

/**
 * Replaces the project (a preset, a file, a share link, a recent project):
 * the undo history starts over and the project counts as unedited. A project
 * that comes back with its own starting point (`base`: the saved project
 * after a link is turned down) counts as changed when it differs from it.
 */
export function loadProject(
  next: WaycineProject,
  opts: { base?: WaycineProject; origin: Origin },
): void {
  history.clear();
  batch(() => {
    project.value = next;
    baseProject.value = opts.base ?? next;
    origin.value = opts.origin;
    dirty.value = opts.base !== undefined && !jsonEqual(next, opts.base);
    syncHistory();
  });
}

/** The project was saved to a file: it counts as unedited. */
export function markSaved(): void {
  dirty.value = false;
}

// ---------------------------------------------------------------------------
// Themes

const COLOR_KEYS = [
  'background',
  'grid',
  'route',
  'glow',
  'pin',
  'pinCore',
  'text',
  'accent',
  'flash',
] as const;

/** The built-in theme a palette is based on: its own id, else the one sharing most colours. */
export function closestTheme(theme: Theme): (typeof THEMES)[number] {
  let best = THEMES[0] as (typeof THEMES)[number];
  let bestScore = -1;
  for (const preset of THEMES) {
    let score = COLOR_KEYS.filter((k) => preset.theme[k] === theme[k]).length;
    if (preset.id === theme.id) score += 100;
    if (score > bestScore) {
      best = preset;
      bestScore = score;
    }
  }
  return best;
}

/** True when `theme` has exactly the colours of the built-in theme its id names (the engine's test). */
export function isBuiltInTheme(theme: Theme): boolean {
  const id = themeIdFor(theme);
  return id !== 'custom' && id === theme.id;
}

/** Replaces every colour (and the theme id) with built-in theme `id`; nothing else changes. */
export function applyTheme(id: string): void {
  const preset = THEMES.find((t) => t.id === id);
  if (preset === undefined) return;
  const theme = JSON.parse(JSON.stringify(preset.theme)) as Theme;
  commit({ ...project.peek(), theme });
}
