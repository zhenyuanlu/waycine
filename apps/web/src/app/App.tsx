import { effect } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import type { Compiled } from 'waycine/browser';
import { copy } from '../copy/en';
import { Editor } from '../editor/Editor';
import { exporting } from '../export/exporter';
import {
  loop,
  pause,
  play,
  playing,
  seek,
  seekToEnd,
  step,
  stepSeconds,
  timeline,
  togglePlay,
} from '../player/player';
import { jumpSegment, toggleFullscreen } from '../player/Transport';
import {
  onEditWhileSharePending,
  openDemoLink,
  openProjectFile,
  openSharedLinkFromHash,
  requestExport,
  saveProjectFile,
} from '../state/actions';
import { engineState } from '../state/engine';
import { startFollowing } from '../state/follow';
import { isPhone } from '../state/media';
import { startAutosave } from '../state/persist';
import { editCount, redo, restoredFromAutosave, undo } from '../state/project';
import {
  dialog,
  focusSettingsSearch,
  keyboardOpen,
  pickTarget,
  showAllSettings,
  theater,
  welcomeVisible,
} from '../state/ui';
import { PhoneBar, Toasts } from './Chrome';
import { Dialogs } from './Dialogs';
import { Header, openFilePicker } from './Header';
import { Stage } from './Stage';

const OWN_INPUT_TYPES = new Set(['checkbox', 'radio']);

/** True when a key press belongs to a text field or control rather than the player. */
function ownsKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (
    target.isContentEditable ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    // Sliders handle arrows, Home and End themselves; Space still plays.
    if (target.type === 'range') return key !== ' ';
    // Checkboxes and radios take Space and arrows; other shortcuts pass.
    if (OWN_INPUT_TYPES.has(target.type)) return key === ' ' || key.startsWith('Arrow');
    return true;
  }
  // Arrow keys move within radio groups, tabs and menus.
  if (
    key.startsWith('Arrow') &&
    target.closest('[role="radiogroup"], [role="tablist"], [role="menu"]')
  ) {
    return true;
  }
  // Space activates a focused button, link, disclosure summary or ARIA control; leave that to the browser.
  return (
    key === ' ' &&
    target.closest(
      'button, a[href], summary, [role="button"], [role="checkbox"], [role="switch"], [role="option"], [role="radio"], [role="tab"]',
    ) !== null
  );
}

/** Ctrl/Cmd shortcuts: undo, redo, save, open, export. They work while typing in a field. */
function onCommandKey(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  // A textarea keeps its own undo (the project JSON draft is not applied yet).
  const inTextarea = event.target instanceof HTMLTextAreaElement;
  if (key === 'z' && !inTextarea) {
    if (event.shiftKey) redo();
    else undo();
  } else if (key === 'y' && !inTextarea) {
    redo();
  } else if (key === 's') {
    saveProjectFile();
  } else if (key === 'o') {
    openFilePicker();
  } else if (key === 'e') {
    requestExport();
  } else {
    return false;
  }
  return true;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
    if (dialog.peek().kind === 'none' && onCommandKey(event)) event.preventDefault();
    return;
  }
  if (event.altKey || dialog.peek().kind !== 'none' || ownsKey(event.target, event.key)) {
    return;
  }
  switch (event.key) {
    case ' ':
      // Playback would compete with the export for the main thread.
      if (!exporting.peek()) togglePlay();
      break;
    case 'ArrowLeft':
      if (event.shiftKey) stepSeconds(-1);
      else step(-1);
      break;
    case 'ArrowRight':
      if (event.shiftKey) stepSeconds(1);
      else step(1);
      break;
    case ',':
      step(-1);
      break;
    case '.':
      step(1);
      break;
    case 'Home':
      pause();
      seek(0);
      break;
    case 'End':
      seekToEnd();
      break;
    case '[':
      jumpSegment(-1);
      break;
    case ']':
      jumpSegment(1);
      break;
    case 'l':
    case 'L':
      loop.value = !loop.peek();
      break;
    case 'f':
    case 'F':
      toggleFullscreen();
      break;
    case '\\':
      if (!isPhone.peek()) theater.value = !theater.peek();
      break;
    case '/':
      theater.value = false;
      showAllSettings();
      focusSettingsSearch.value += 1;
      break;
    default:
      return;
  }
  event.preventDefault();
}

/**
 * A still that shows what the video is about: the overview with its route
 * fully drawn (`timing.overview.routeEndFrac` of the way in), or frame 0
 * when the video has no overview.
 */
function representativeFrame(compiled: Compiled): number {
  const overview = compiled.timeline.segments.find((seg) => seg.kind === 'overview');
  if (overview === undefined) return 0;
  const frac = compiled.project.timing.overview.routeEndFrac;
  const k = Math.min(overview.n - 1, Math.ceil(Math.max(0, frac) * (overview.n - 1)));
  return overview.start + k;
}

/**
 * Introduces a project the viewer has not seen yet (the first visit, a shared
 * link) once its preview is ready: it plays once (no loop) and stops as soon
 * as the viewer starts working in the editor; with reduced motion it shows a
 * representative still instead of the almost empty first frame.
 */
function introduceOnce(): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let started = false;
  let stopWatching: () => void = () => undefined;
  const dispose = effect(() => {
    const state = engineState.value;
    if (state.kind === 'ready' && timeline.value !== null && !started) {
      started = true;
      queueMicrotask(() => {
        dispose();
        if (reduced) {
          pause();
          seek(representativeFrame(state.compiled));
          return;
        }
        play();
        // The first click or focus in the editor ends the intro (the motion would compete with it).
        const side = document.querySelector('.side');
        const stop = (): void => {
          stopWatching();
          if (playing.peek()) pause();
        };
        side?.addEventListener('pointerdown', stop, true);
        side?.addEventListener('focusin', stop, true);
        stopWatching = () => {
          side?.removeEventListener('pointerdown', stop, true);
          side?.removeEventListener('focusin', stop, true);
        };
      });
    }
  });
  return () => {
    dispose();
    stopWatching();
  };
}

/** Text fields of the editor that bring up a phone's on-screen keyboard. */
const TYPING_FIELDS =
  '.side input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="date"]), .side textarea, .side [contenteditable="true"]';

/** Below this visible height (CSS px) a focused field on a phone means the keyboard is up. */
const KEYBOARD_VIEWPORT_PX = 600;
/** Longest wait for the tap that moved focus away from a field to land. */
const TAP_LAND_MS = 300;

/**
 * Tracks whether a phone's on-screen keyboard is (probably) open over the
 * editor: in the phone layout, a text field of the editor has focus and the
 * visible part of the window is under 600 px (the keyboard took the rest).
 * A phone without the keyboard up, and a tablet, never change layout. While it
 * is open the preview shrinks to 120 px (the transport row stays) and the
 * bottom bar hides (`keyboardOpen`). This is a deliberate exception to the
 * no-layout-shift rule: the user's own input causes it.
 */
function watchKeyboard(): () => void {
  const phone = window.matchMedia('(max-width: 1023px)');
  const update = (): void => {
    const active = document.activeElement;
    const typing = active instanceof Element && active.matches(TYPING_FIELDS);
    const short = (window.visualViewport?.height ?? window.innerHeight) < KEYBOARD_VIEWPORT_PX;
    const open = phone.matches && typing && short;
    if (keyboardOpen.peek() !== open) keyboardOpen.value = open;
    document.documentElement.classList.toggle('keyboard-open', open);
  };
  // Focus moving from one field to the next leaves and enters in one task: decide after it.
  // When the layout would grow back, wait for the tap that moved focus to land first, so the
  // control under the finger is the one it hits (it would otherwise move 100 px under it).
  const later = (): void => {
    if (!keyboardOpen.peek()) {
      window.setTimeout(update, 0);
      return;
    }
    let done = false;
    const land = (): void => {
      if (done) return;
      done = true;
      document.removeEventListener('click', land, true);
      window.clearTimeout(fallback);
      window.setTimeout(update, 0);
    };
    document.addEventListener('click', land, true);
    const fallback = window.setTimeout(land, TAP_LAND_MS);
  };
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', later);
  window.visualViewport?.addEventListener('resize', update);
  phone.addEventListener('change', update);
  return () => {
    document.removeEventListener('focusin', update);
    document.removeEventListener('focusout', later);
    window.visualViewport?.removeEventListener('resize', update);
    phone.removeEventListener('change', update);
  };
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false;
}

/** Drop a project file (or a CSV list) anywhere on the page. Returns true while a file is over the page. */
function useFileDrop(): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const enter = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      depth += 1;
      setOver(true);
    };
    const leave = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const overHandler = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const drop = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setOver(false);
      const file = event.dataTransfer?.files[0];
      if (!file) return;
      if (/\.(csv|tsv|txt)$/i.test(file.name)) {
        void file.text().then((text) => {
          dialog.value = { kind: 'import-list', text };
        });
      } else {
        void openProjectFile(file);
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overHandler);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overHandler);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return over;
}

/** Longest the first paint waits for the fonts and the first frame. */
const READY_FALLBACK_MS = 1500;

/**
 * First paint is final: the app stays invisible until the
 * chrome's Barlow faces, the boot decision (shared link, welcome) and the
 * first preview frame exist, or 1.5 s have passed.
 */
function revealWhenReady(booted: Promise<void>): void {
  const root = document.documentElement;
  const fonts = Promise.all([
    document.fonts?.load('600 12px "Waycine Label"'),
    document.fonts?.load('700 16px "Waycine Display"'),
  ]).catch(() => undefined);
  const frameReady = new Promise<void>((resolve) => {
    const dispose = effect(() => {
      if (engineState.value.kind !== 'loading') {
        queueMicrotask(() => dispose());
        resolve();
      }
    });
  });
  const reveal = (): void => {
    requestAnimationFrame(() => root.classList.add('ready'));
  };
  void Promise.all([fonts, booted, frameReady]).then(reveal);
  window.setTimeout(reveal, READY_FALLBACK_MS);
}

/**
 * Starts the app services once: autosave, "follow edits", a shared link in
 * the URL hash or a demo link in the query, and on the first visit the
 * welcome block and autoplay.
 */
function useBoot(): void {
  useEffect(() => {
    startAutosave();
    startFollowing();
    const stopShareWatch = effect(() => {
      void editCount.value;
      onEditWhileSharePending();
    });
    // Leaving "Pick on map" by any route (a dialog opening) cancels it.
    const stopPickWatch = effect(() => {
      if (dialog.value.kind !== 'none' && pickTarget.peek() !== null) pickTarget.value = null;
    });
    const stopKeyboard = watchKeyboard();
    let stopIntro: () => void = () => undefined;
    const booted = openSharedLinkFromHash().then((shared) => {
      // A demo link (`?demo=<id>`) over a saved project opens like a shared link.
      const opened = openDemoLink(shared) || shared;
      if (!opened && !restoredFromAutosave) welcomeVisible.value = true;
      if (opened || !restoredFromAutosave) stopIntro = introduceOnce();
    });
    revealWhenReady(booted);
    const onHash = (): void => {
      void openSharedLinkFromHash();
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      stopShareWatch();
      stopPickWatch();
      stopKeyboard();
      stopIntro();
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}

export function App() {
  useBoot();
  const dropping = useFileDrop();
  const phone = isPhone.value;
  return (
    <div class={`app${theater.value && !phone ? ' is-theater' : ''}`}>
      <Header />
      <div class="work">
        {/* The editor comes first in the page (and the tab order); the grid puts the stage on its left. */}
        <aside class="side" id="editor" tabIndex={-1} aria-label={copy.app.editorLabel}>
          <Editor />
        </aside>
        <Stage />
      </div>
      {phone && <PhoneBar />}
      <Toasts />
      <Dialogs />
      {dropping && (
        <div class="drop-overlay" aria-hidden="true">
          <p>{copy.app.dropHint}</p>
        </div>
      )}
    </div>
  );
}
