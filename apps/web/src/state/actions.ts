import { batch } from '@preact/signals';
import { validateProject, type WaycineProject } from 'waycine';
import { copy } from '../copy/en';
import { fileBaseName, slugify } from '../export/filename';
import { compactProject } from './compact';
import { blockingIssues } from './issues';
import { autosavePaused, pushRecent, type RecentEntry, recentProject, saveNow } from './persist';
import { PRESETS } from './presets';
import {
  blankProject,
  dirty,
  editCount,
  firstVisitPresetId,
  loadProject,
  markSaved,
  origin,
  presetProject,
  project,
  restoredFromAutosave,
} from './project';
import { decodeShare, encodeShare, SHARE_MAX_CHARS, shareFromHash, shareUrl } from './share';
import { readAutosave } from './snapshot';
import {
  checkLocationStops,
  closeDialog,
  dialog,
  expandedStop,
  linkIsDemo,
  newerVersion,
  sharePending,
  shareReplacedOwn,
  showToast,
  unplacedStops,
  welcomeVisible,
} from './ui';

/** `$schema` of saved files. */
export const SCHEMA_URL = 'https://zhenyuanlu.github.io/waycine/schema/v1.json';

/** The starting points offered by the welcome card and "Start from...". */
export type StartChoice =
  | { kind: 'own-stops' }
  | { kind: 'preset'; id: string }
  | { kind: 'blank' }
  | { kind: 'recent'; entry: RecentEntry };

function resetSessionState(): void {
  batch(() => {
    expandedStop.value = null;
    unplacedStops.value = new Set();
    checkLocationStops.value = new Set();
    welcomeVisible.value = false;
  });
}

/**
 * Loads a new project. The current one goes to Recent first, unless it is a
 * bundled preset nobody edited (that one is always a click away).
 */
function replaceWith(next: WaycineProject, opts: Parameters<typeof loadProject>[1]): void {
  ownProjectToRecent();
  if (dirty.peek() || origin.peek().kind !== 'preset') pushRecent(project.peek());
  resetSessionState();
  sharePending.value = false;
  linkIsDemo.value = false;
  autosavePaused.value = false;
  loadProject(next, opts);
}

/** Starts from a preset, a blank project, the current look without stops, or a recent project. */
export function startFrom(choice: StartChoice): void {
  switch (choice.kind) {
    case 'own-stops': {
      // Keep the look (theme, fonts, timing, layout); clear the stops and the demo's words.
      // The title starts empty (the field shows a placeholder), so typing never appends to it.
      const current = project.peek();
      const fresh = blankProject();
      const next: WaycineProject = {
        ...current,
        meta: { name: fresh.meta.name },
        stops: [],
        text: {
          ...current.text,
          title: fresh.text.title,
          subtitle: fresh.text.subtitle,
          kicker: fresh.text.kicker,
        },
        stats: { ...current.stats, items: fresh.stats.items },
      };
      replaceWith(next, { origin: { kind: 'own-stops' } });
      break;
    }
    case 'preset':
      replaceWith(presetProject(choice.id), { origin: { kind: 'preset', id: choice.id } });
      break;
    case 'blank':
      replaceWith(blankProject(), { origin: { kind: 'blank' } });
      break;
    case 'recent':
      replaceWith(recentProject(choice.entry), { origin: { kind: 'recent' } });
      break;
  }
}

/** True when replacing the project would lose edits (it still goes to Recent). */
export function replacingLosesEdits(): boolean {
  return dirty.peek();
}

/**
 * Opens demo `id` from the demo picker: at once, or through the "Replace the
 * current project?" question of "Start from" when edits would be replaced.
 */
export function chooseDemo(id: string): void {
  if (replacingLosesEdits()) dialog.value = { kind: 'start', confirmPreset: id };
  else startFrom({ kind: 'preset', id });
}

// ---------------------------------------------------------------------------
// Files

/** The project as saved: compact JSON with a schema link, two-space indented. */
export function projectFileText(p: WaycineProject): string {
  return `${JSON.stringify({ $schema: SCHEMA_URL, ...compactProject(p) }, null, 2)}\n`;
}

/** File name of a saved project: `<slug>.waycine.json` (named after the title while the name is the default). */
export function projectFileName(p: WaycineProject): string {
  return `${slugify(fileBaseName(p))}.waycine.json`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Downloads the project as a `.waycine.json` file. */
export function saveProjectFile(): void {
  const p = project.peek();
  const name = projectFileName(p);
  downloadBlob(new Blob([projectFileText(p)], { type: 'application/json' }), name);
  markSaved();
  showToast(copy.toast.saved(name));
}

/**
 * Opens project JSON text (a file or a drop). A syntax error shows what is
 * wrong; a file with problems lists them and loads with defaults for the
 * invalid fields only when the user agrees; a clean file loads at once.
 */
export function openProjectText(text: string, fileName: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    dialog.value = {
      kind: 'open-error',
      fileName,
      message: error instanceof Error ? error.message : String(error),
    };
    return;
  }
  const result = validateProject(parsed);
  const load = (): void => {
    newerVersion.value = result.issues.some((i) => i.code === 'newer-version');
    replaceWith(result.project, { origin: { kind: 'file', name: fileName } });
    closeDialog();
  };
  const problems = blockingIssues(result.issues);
  if (problems.length > 0) {
    dialog.value = { kind: 'open-issues', fileName, issues: problems, load };
  } else {
    load();
  }
}

export async function openProjectFile(file: File): Promise<void> {
  openProjectText(await file.text(), file.name);
}

// ---------------------------------------------------------------------------
// Share links

/** A share link for the current project and whether it is too long to share comfortably. */
export async function createShareLink(): Promise<{ url: string; tooLong: boolean }> {
  const encoded = await encodeShare(project.peek());
  const url = shareUrl(window.location.href, encoded);
  return { url, tooLong: url.length > SHARE_MAX_CHARS };
}

function clearHash(): void {
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}`);
}

let shareEditBaseline = 0;

/**
 * Opens a shared link from the URL hash, if there is one: the project shows
 * with a Keep / Discard banner and the autosave stays untouched until the
 * user keeps it or edits it. Returns true when a link was opened.
 */
export async function openSharedLinkFromHash(): Promise<boolean> {
  const encoded = shareFromHash(window.location.hash);
  if (encoded === null) return false;
  let raw: unknown;
  try {
    raw = await decodeShare(encoded);
  } catch (error) {
    dialog.value = {
      kind: 'share-error',
      message: error instanceof Error ? error.message : String(error),
    };
    clearHash();
    return false;
  }
  const result = validateProject(raw);
  saveNow();
  // "Back to my project" only when this browser has one to go back to.
  const own = readAutosave() !== null;
  batch(() => {
    shareReplacedOwn.value = own;
    linkIsDemo.value = false;
    autosavePaused.value = true;
    resetSessionState();
    newerVersion.value = result.issues.some((i) => i.code === 'newer-version');
    loadProject(result.project, { origin: { kind: 'share' } });
    sharePending.value = true;
  });
  shareEditBaseline = editCount.peek();
  return true;
}

/** Takes `?demo=<id>` out of the address (other query parts and the hash stay). */
function clearDemoQuery(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('demo');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Handles a demo link (`?demo=<id>`) once, at start. A first visit already
 * started on that demo (`firstVisitPresetId`). When this browser has a saved
 * project, the demo opens over it the way a shared link does: with the Keep /
 * Back banner, and the saved project stays untouched until the user keeps or
 * edits the demo (it then goes to Recent). Either way the query leaves the
 * address, so a reload opens what is saved instead of the demo again. Nothing
 * opens when a shared link already did (`shareOpened`) or the id names no
 * demo. Returns true when the demo opened over a saved project.
 */
export function openDemoLink(shareOpened: boolean): boolean {
  const asked = new URLSearchParams(window.location.search).get('demo');
  if (asked === null) return false;
  clearDemoQuery();
  if (shareOpened || !restoredFromAutosave || !PRESETS.some((p) => p.id === asked)) return false;
  batch(() => {
    shareReplacedOwn.value = true;
    linkIsDemo.value = true;
    autosavePaused.value = true;
    resetSessionState();
    loadProject(presetProject(asked), { origin: { kind: 'preset', id: asked } });
    sharePending.value = true;
  });
  shareEditBaseline = editCount.peek();
  return true;
}

/**
 * A shared link or a demo link is showing over this browser's saved project,
 * and that project is about to be replaced for good: it goes to Recent first.
 */
function ownProjectToRecent(): void {
  if (!sharePending.peek() || !shareReplacedOwn.peek()) return;
  const own = readAutosave();
  if (own !== null) pushRecent(own.project);
}

/** The first edit of a shared project (or a linked demo) keeps it (the autosave resumes). */
export function onEditWhileSharePending(): void {
  if (sharePending.peek() && editCount.peek() !== shareEditBaseline) keepSharedProject();
}

/** Keeps the shared project or the linked demo: the project it replaces goes to Recent. */
export function keepSharedProject(): void {
  ownProjectToRecent();
  batch(() => {
    sharePending.value = false;
    linkIsDemo.value = false;
    autosavePaused.value = false;
  });
  clearHash();
}

/** Goes back to the autosaved project (or the default) and forgets the link. */
export function discardSharedProject(): void {
  const saved = readAutosave();
  batch(() => {
    sharePending.value = false;
    linkIsDemo.value = false;
    autosavePaused.value = false;
    newerVersion.value = false;
    resetSessionState();
    if (saved !== null) {
      loadProject(saved.project, { base: saved.base, origin: saved.origin });
    } else {
      loadProject(presetProject(firstVisitPresetId), {
        origin: { kind: 'preset', id: firstVisitPresetId },
      });
    }
  });
  clearHash();
}

// ---------------------------------------------------------------------------
// Export

/** Opens the export dialog, or explains what must be fixed first. */
export function requestExport(): void {
  const p = project.peek();
  const visible = p.stops.map((s, i) => ({ s, i })).filter(({ s }) => s.hidden !== true);
  if (visible.length === 0) {
    dialog.value = { kind: 'export-blocked', reason: 'no-stops' };
    return;
  }
  const unnamed = visible.find(({ s }) => s.city.trim() === '');
  if (unnamed !== undefined) {
    dialog.value = {
      kind: 'export-blocked',
      reason: 'no-name',
      stopId: unnamed.s.id,
      number: unnamed.i + 1,
    };
    return;
  }
  dialog.value = { kind: 'export' };
}
