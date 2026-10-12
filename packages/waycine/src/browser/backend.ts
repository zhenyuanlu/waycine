import type { Backend, Ctx2D, Surface, SurfaceOptions } from '../core/ctx.js';

/** A canvas the browser backend draws on and Mediabunny can encode from. */
export type HostCanvas = HTMLCanvasElement | OffscreenCanvas;

/** True when `OffscreenCanvas` exists and gives a 2D context (Safari before 16.4 had WebGL only). */
export function offscreen2dAvailable(): boolean {
  if (typeof OffscreenCanvas === 'undefined') {
    return false;
  }
  try {
    return new OffscreenCanvas(1, 1).getContext('2d') !== null;
  } catch {
    return false;
  }
}

function isOffscreen(canvas: HostCanvas): canvas is OffscreenCanvas {
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas;
}

/**
 * Creates a `width` x `height` canvas: an `OffscreenCanvas` when `offscreen`
 * is true, else a detached DOM `<canvas>` (which needs a `document`).
 */
export function createHostCanvas(width: number, height: number, offscreen: boolean): HostCanvas {
  if (offscreen) {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document === 'undefined') {
    throw new Error(
      'Waycine needs a 2D OffscreenCanvas or a document to create canvases in; this environment has neither.',
    );
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * The 2D context of `canvas`. `willReadFrequently` keeps glow and blur scratch
 * buffers in CPU memory, which makes their `getImageData` calls cheap.
 */
export function context2d(canvas: HostCanvas, opts: SurfaceOptions = {}): Ctx2D {
  const settings: CanvasRenderingContext2DSettings = opts.willReadFrequently
    ? { willReadFrequently: true }
    : {};
  const ctx = isOffscreen(canvas)
    ? canvas.getContext('2d', settings)
    : canvas.getContext('2d', settings);
  if (!ctx) {
    throw new Error(
      `Could not get a 2D context for a ${canvas.width}x${canvas.height} canvas; the browser may be out of canvas memory.`,
    );
  }
  return ctx;
}

/** Rounds a requested surface side up to an integer >= 1. */
function surfaceSide(px: number): number {
  return Number.isFinite(px) ? Math.max(1, Math.ceil(px)) : 1;
}

/**
 * Canvas backend for browsers and workers: surfaces are `OffscreenCanvas`
 * when available, else DOM `<canvas>` elements. `Surface.source` is the
 * canvas itself. Call `loadBundledFonts()` before the first `compile`.
 */
export function createBrowserBackend(): Backend {
  const offscreen = offscreen2dAvailable();
  return {
    name: offscreen ? 'offscreen' : 'dom',
    // Frame canvases stay GPU-backed: post-processing copies them to a
    // willReadFrequently scratch surface instead of calling getImageData on them.
    frameReadback: 'copy',
    createSurface(width: number, height: number, opts?: SurfaceOptions): Surface {
      const canvas = createHostCanvas(surfaceSide(width), surfaceSide(height), offscreen);
      const ctx = context2d(canvas, opts);
      return {
        width: canvas.width,
        height: canvas.height,
        getContext2d: () => ctx,
        source: canvas,
      };
    },
  };
}
