import { effect, signal } from '@preact/signals';
import type { SectionId, ValidationIssue } from 'waycine';
import { readJson, STORAGE_KEYS, writeJson } from './storage';

/** Colour theme of the app chrome: follow the system, or always light or dark. */
export type ThemeMode = 'system' | 'light' | 'dark';
/** What the editor column shows (below 1800 px a tab chooses it; wider, the contents rail). */
export type EditorView = 'basics' | 'all';
/** The phone's bottom section bar: one section at a time, or All settings. */
export const PHONE_SECTIONS = ['stops', 'text', 'look', 'timing', 'stats', 'video', 'all'] as const;
export type PhoneSection = (typeof PHONE_SECTIONS)[number];

/** Viewer preferences kept in this browser (not part of the project). */
interface Prefs {
  followEdits: boolean;
  safeZones: boolean;
  themeMode: ThemeMode;
  theater: boolean;
  editorView: EditorView;
  /** Basics sections the viewer collapsed. */
  collapsed: SectionId[];
  /** All settings groups the viewer opened (true) or closed (false); others follow the width. */
  groups: Partial<Record<SectionId, boolean>>;
}

function readPrefs(): Prefs {
  const raw = readJson(STORAGE_KEYS.prefs) as Partial<Prefs> | null;
  const mode = raw?.themeMode;
  return {
    // Off by default: playback and edits never move the preview unless asked.
    followEdits: raw?.followEdits === true,
    safeZones: raw?.safeZones === true,
    themeMode: mode === 'light' || mode === 'dark' ? mode : 'system',
    theater: raw?.theater === true,
    editorView: raw?.editorView === 'all' ? 'all' : 'basics',
    collapsed: Array.isArray(raw?.collapsed) ? raw.collapsed : [],
    groups: typeof raw?.groups === 'object' && raw.groups !== null ? raw.groups : {},
  };
}

const prefs = readPrefs();

/** "Follow edits": opening or editing a stop seeks the paused preview to it. */
export const followEdits = signal(prefs.followEdits);
/** Show the safe-zone guide over the preview. */
export const safeZones = signal(prefs.safeZones);
/** App chrome theme. */
export const themeMode = signal<ThemeMode>(prefs.themeMode);
/** Theater mode: the editor column is hidden and the stage turns dark. */
export const theater = signal(prefs.theater);
/** Basics or All settings in the editor column. */
export const editorView = signal<EditorView>(prefs.editorView);
/** Collapsed Basics sections. */
export const collapsedSections = signal<ReadonlySet<SectionId>>(new Set(prefs.collapsed));
/** Explicit open state of All settings groups (missing: open at 1800 px and wider). */
export const groupOpen = signal<Readonly<Partial<Record<SectionId, boolean>>>>(prefs.groups);

effect(() => {
  writeJson(STORAGE_KEYS.prefs, {
    followEdits: followEdits.value,
    safeZones: safeZones.value,
    themeMode: themeMode.value,
    theater: theater.value,
    editorView: editorView.value,
    collapsed: [...collapsedSections.value],
    groups: groupOpen.value,
  } satisfies Prefs);
});

// The theme applies before the first paint (this module loads before the app renders).
effect(() => {
  const root = typeof document === 'undefined' ? null : document.documentElement;
  if (root === null) return;
  const mode = themeMode.value;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
});

/** All settings search text. */
export const settingsQuery = signal('');
/** All settings shows only the settings that differ from the starting point. */
export const changedOnly = signal(false);
/** All settings shows the project as JSON instead of the list. */
export const jsonView = signal(false);
/** The setting the help strip describes (hovered or focused), as a concrete path. */
export const helpPath = signal<string | null>(null);
/** The phone help strip is expanded. */
export const helpOpen = signal(false);
/** Asks All settings to scroll to (and open) a group once it is shown. */
export const revealGroup = signal<SectionId | null>(null);
/** Asks Basics to scroll to a section once it is shown. */
export const revealSection = signal<SectionId | null>(null);
/** Asks All settings to focus its search field once it is shown (a counter). */
export const focusSettingsSearch = signal(0);

/** Selected section of the phone's bottom bar. */
export const phoneSection = signal<PhoneSection>('stops');
/** Id of the stop whose editor is open (one at a time), or null. */
export const expandedStop = signal<string | null>(null);
/** Id of the stop waiting for a click on the preview ("Pick on map"), or null. */
export const pickTarget = signal<string | null>(null);
/** Stop whose place search should take focus once rendered (after "Add stop"). */
export const focusSearchOf = signal<string | null>(null);
/** Stop whose City label should take focus once rendered (placed by coordinates, export blocked). */
export const focusCityOf = signal<string | null>(null);
/** The phone preview shrunk to a 120 px strip by its button. */
export const previewCollapsed = signal(false);
/**
 * A phone's on-screen keyboard is (probably) open over the editor: a text
 * field in the editor has focus on a touch screen or in a short window. The
 * preview folds and the bottom bar hides while it is true.
 */
export const keyboardOpen = signal(false);
/** Problems found when the autosaved project was restored (values dropped or changed). */
export const restoreIssues = signal<readonly ValidationIssue[]>([]);
/** The open shared link replaced a project of this browser (so "Back to my project" exists). */
export const shareReplacedOwn = signal(false);
/** What waits for Keep is a demo opened by a demo link (`?demo=<id>`), not a shared project. */
export const linkIsDemo = signal(false);
/** New stops that have no place yet (hidden until one is picked). */
export const unplacedStops = signal<ReadonlySet<string>>(new Set());
/** Stops placed by an automatic lookup; the row asks the user to check them. */
export const checkLocationStops = signal<ReadonlySet<string>>(new Set());

export function withItem(set: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

const BASIC_SECTIONS: ReadonlySet<string> = new Set(PHONE_SECTIONS.filter((id) => id !== 'all'));

/** Shows the Basics view at `section` (the phone shows that section alone). */
export function showSection(section: SectionId): void {
  editorView.value = 'basics';
  if (BASIC_SECTIONS.has(section)) {
    phoneSection.value = section as PhoneSection;
    if (collapsedSections.peek().has(section)) {
      const next = new Set(collapsedSections.peek());
      next.delete(section);
      collapsedSections.value = next;
    }
  }
  revealSection.value = section;
}

/** Shows All settings at `group` (opened), or at its top. */
export function showAllSettings(group: SectionId | null = null): void {
  editorView.value = 'all';
  phoneSection.value = 'all';
  if (group !== null) {
    groupOpen.value = { ...groupOpen.peek(), [group]: true };
    revealGroup.value = group;
  }
}

// ---------------------------------------------------------------------------
// Toasts

/** A toast's button (Undo, Show). */
export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  message: string;
  /** Its buttons, in order (none, Undo, or Show and Undo). */
  actions: readonly ToastAction[];
}

/** The toast on screen (one at a time; a newer one replaces it). */
export const toasts = signal<readonly Toast[]>([]);
let toastSeq = 0;
/** How long a toast stays (paused while hovered or focused). */
export const TOAST_MS = 5000;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastHeld = false;

export function dismissToast(id: number): void {
  if (!toasts.peek().some((t) => t.id === id)) return;
  clearTimeout(toastTimer);
  toasts.value = toasts.peek().filter((t) => t.id !== id);
}

function arm(id: number): void {
  clearTimeout(toastTimer);
  if (!toastHeld) toastTimer = setTimeout(() => dismissToast(id), TOAST_MS);
}

/**
 * Shows a short message, with optional actions (Undo; Show and Undo), for
 * five seconds. One toast at a time: a newer one replaces the older one.
 */
export function showToast(message: string, action?: ToastAction | readonly ToastAction[]): void {
  toastSeq += 1;
  const id = toastSeq;
  const actions = action === undefined ? [] : Array.isArray(action) ? action : [action];
  toasts.value = [{ id, message, actions }];
  arm(id);
}

/** Hover or focus on the toast keeps it on screen; leaving restarts its time. */
export function holdToast(hold: boolean): void {
  toastHeld = hold;
  const current = toasts.peek()[0];
  if (hold) clearTimeout(toastTimer);
  else if (current !== undefined) arm(current.id);
}

// ---------------------------------------------------------------------------
// Dialogs and notices

/** The open dialog, if any (one at a time). */
export type DialogState =
  | { kind: 'none' }
  // `confirmPreset`: opened by the demo picker to ask about replacing an edited project with that demo.
  | { kind: 'start'; confirmPreset?: string }
  | { kind: 'share' }
  | { kind: 'export' }
  | { kind: 'project-json' }
  | { kind: 'export-blocked'; reason: 'no-stops' }
  | { kind: 'export-blocked'; reason: 'no-name'; stopId: string; number: number }
  | { kind: 'import-list'; text?: string }
  | {
      kind: 'open-issues';
      fileName: string;
      issues: ValidationIssue[];
      load: () => void;
    }
  | { kind: 'open-error'; fileName: string; message: string }
  | { kind: 'share-error'; message: string }
  | {
      kind: 'confirm-json';
      /** Stops before and after the Apply. */
      stops: [number, number];
      /** Top-level sections the draft leaves out, which go back to the defaults. */
      sections: string[];
      apply: () => void;
    };

export const dialog = signal<DialogState>({ kind: 'none' });

export function closeDialog(): void {
  dialog.value = { kind: 'none' };
}

/** Welcome block on the first visit. */
export const welcomeVisible = signal(false);
/** A shared link was opened and is waiting for Keep or Discard. */
export const sharePending = signal(false);
/** The loaded file was made with a newer Waycine. */
export const newerVersion = signal(false);
