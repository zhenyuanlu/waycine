import { computed, effect, signal } from '@preact/signals';
import {
  type Backend,
  type Compiled,
  compile,
  createBrowserBackend,
  type FrameSize,
  type LoadFontsOptions,
  loadBundledFonts,
  outputSize,
  type WaycineProject,
} from 'waycine/browser';
import { fontsVersion } from './fonts-version';
import { ensureLocalFonts, missingFontRoles, withFallbackFonts } from './local-fonts';
import { previewScale, previewSharp } from './preview-scale';
import { fitPreview } from './preview-size';
import { project } from './project';

/** Which step of the preview pipeline failed. */
export type EngineStage = 'fonts' | 'compile' | 'render';

export type EngineState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ready'; compiled: Compiled; backend: Backend }
  | { kind: 'error'; stage: EngineStage; error: unknown };

type FontsState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; error: unknown };

const fontsState = signal<FontsState>({ kind: 'loading' });

/**
 * The project as drawn on this device: the edited project, with the bundled
 * font standing in for an uploaded font this device does not have. The
 * preview and the export use it.
 */
export const renderProject = computed<WaycineProject>(() =>
  withFallbackFonts(project.value, missingFontRoles.value),
);

/** True when the project has no visible stop (nothing to draw yet). */
export const noVisibleStops = computed<boolean>(
  () => !project.value.stops.some((stop) => stop.hidden !== true),
);

/**
 * CSS size of the preview's frame box and the device pixel ratio; null until
 * measured. The frame box is sized by the page grid alone (never by the
 * canvas), so this only decides how many pixels the preview draws.
 */
export const previewBox = signal<{ cssWidth: number; cssHeight: number; dpr: number } | null>(null);

/** Set by the preview when drawing a frame throws; cleared by the next good frame. */
export const renderError = signal<unknown>(null);

let backendResult: { backend: Backend } | { error: unknown } | undefined;

function browserBackend(): { backend: Backend } | { error: unknown } {
  if (!backendResult) {
    try {
      backendResult = { backend: createBrowserBackend() };
    } catch (error) {
      backendResult = { error };
    }
  }
  return backendResult;
}

let lastSize: FrameSize | null = null;

/** Current preview size; keeps the same object while the size is unchanged, so no recompile. */
export const previewSize = computed<FrameSize | null>(() => {
  const box = previewBox.value;
  if (!box) {
    return null;
  }
  const out = outputSize(project.value.output);
  // The picture is contained in the frame box: as wide as the box, or as the box height allows.
  const pictureWidth = Math.min(box.cssWidth, (box.cssHeight * out.width) / out.height);
  const next = fitPreview(out, pictureWidth * previewScale.value, box.dpr, previewSharp.value);
  if (lastSize && lastSize.width === next.width && lastSize.height === next.height) {
    return lastSize;
  }
  lastSize = next;
  return next;
});

/** The project compiled at preview size, or why it could not be. */
export const engineState = computed<EngineState>(() => {
  const fonts = fontsState.value;
  // Subscribe to font reloads: a new face means new text widths.
  void fontsVersion.value;
  if (fonts.kind === 'error') {
    return { kind: 'error', stage: 'fonts', error: fonts.error };
  }
  const size = previewSize.value;
  if (fonts.kind === 'loading' || !size) {
    return { kind: 'loading' };
  }
  if (noVisibleStops.value) {
    return { kind: 'empty' };
  }
  const host = browserBackend();
  if ('error' in host) {
    return { kind: 'error', stage: 'compile', error: host.error };
  }
  try {
    const compiled = compile(renderProject.value, host.backend, size);
    return { kind: 'ready', compiled, backend: host.backend };
  } catch (error) {
    return { kind: 'error', stage: 'compile', error };
  }
});

/** Registers font faces (the bundled ones, or `opts.data`), then recompiles the preview. */
export async function loadFonts(opts?: LoadFontsOptions): Promise<void> {
  await loadBundledFonts(opts);
  fontsVersion.value += 1;
}

/** Loads the bundled fonts; compiling waits for them so text is never measured with a fallback. */
export function startEngine(): void {
  loadFonts().then(
    () => {
      fontsState.value = { kind: 'ready' };
    },
    (error: unknown) => {
      fontsState.value = { kind: 'error', error };
    },
  );
  // Uploaded fonts named by the project: load them from this browser, or fall back.
  effect(() => {
    ensureLocalFonts(project.value);
  });
  // Surface engine failures in the console too, with their stack.
  effect(() => {
    const state = engineState.value;
    if (state.kind === 'error') {
      console.error(`Waycine ${state.stage} failed:`, state.error);
    }
  });
  effect(() => {
    const error = renderError.value;
    if (error !== null) {
      console.error('Waycine render failed:', error);
    }
  });
}
