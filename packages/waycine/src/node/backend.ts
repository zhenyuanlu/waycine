import { createCanvas } from '@napi-rs/canvas';
import type { Backend, Surface, SurfaceOptions } from '../core/ctx.js';
import { registerBundledFonts } from './fonts.js';

/**
 * `@napi-rs/canvas` backend for Node (CLI, tests, goldens). Registers the
 * bundled TTFs with `GlobalFonts.registerFromPath` under their alias families
 * on first use. `Surface.source` is the napi `Canvas`. Requires the optional
 * peer dependency `@napi-rs/canvas`.
 *
 * Memory: `@napi-rs/canvas` frees the pixel buffers of `getImageData` (the
 * engine reads its glow mask every frame and the frame itself on zoom-through
 * frames) only in finalizers that Node runs from the event loop. A loop that
 * renders many frames must therefore yield once per frame, for example
 * `await new Promise((r) => setImmediate(r))`; a loop that never yields grows
 * by the size of every pixel block it read (about 8 MB per 1080p frame read).
 */
export function createNodeBackend(): Backend {
  registerBundledFonts();
  return {
    name: 'napi',
    // Drawing a napi Canvas with drawImage replays its recorded drawing (about as
    // slow as the frame itself); reading its pixels directly is a cheap copy.
    frameReadback: 'direct',
    // `willReadFrequently` is a DOM hint; Skia raster surfaces are always CPU-readable.
    createSurface(width: number, height: number, _opts?: SurfaceOptions): Surface {
      const w = Math.max(1, Math.ceil(width));
      const h = Math.max(1, Math.ceil(height));
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d');
      return { width: w, height: h, getContext2d: () => ctx, source: canvas };
    },
  };
}
