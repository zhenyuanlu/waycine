/**
 * The minimal 2D drawing surface the engine needs.
 *
 * The core is compiled with lib ES2022 and no DOM, so it cannot name
 * `CanvasRenderingContext2D`. `Ctx2D` lists the only members the engine may call,
 * typed so that all three hosts satisfy it without a cast:
 * - DOM `CanvasRenderingContext2D`,
 * - DOM `OffscreenCanvasRenderingContext2D`,
 * - `SKRSContext2D` from `@napi-rs/canvas`.
 * The browser and node entries each hold a compile-time conformance check
 * (`ctx-conformance.ts`) that fails the build if this interface drifts.
 *
 * All coordinates are canvas pixels of the surface being drawn on (not Du).
 */

/**
 * Anything the host's `drawImage` accepts: a `Surface.source` from the same
 * backend (DOM canvas, OffscreenCanvas or napi `Canvas`) or a host image
 * object. Opaque to the core; never pass objects from another backend.
 */
export type DrawableSource = unknown;

/** Result of `measureText`. Only `width` is guaranteed on every host. */
export interface TextMetricsLike {
  /** Advance width in canvas px, at the current `font`. */
  readonly width: number;
  /** Distance from the baseline to the top of the inked glyphs, in canvas px. */
  readonly actualBoundingBoxAscent?: number;
  /** Distance from the baseline to the font's ascent line, in canvas px. */
  readonly fontBoundingBoxAscent?: number;
}

/**
 * RGBA pixel block (straight, not premultiplied, alpha; row-major, 4 bytes per
 * pixel). `putImageData` needs a real host object, so only pass objects that
 * came from the same context's `createImageData` or `getImageData`.
 */
export interface ImageDataLike {
  /** Width in pixels. */
  readonly width: number;
  /** Height in pixels. */
  readonly height: number;
  /** `width * height * 4` bytes, RGBA. */
  readonly data: Uint8ClampedArray;
}

/** `textBaseline` values (the engine uses `'alphabetic'`). */
export type TextBaselineValue =
  | 'alphabetic'
  | 'bottom'
  | 'hanging'
  | 'ideographic'
  | 'middle'
  | 'top';

/** `textAlign` values (the engine uses `'left'`). */
export type TextAlignValue = 'center' | 'end' | 'left' | 'right' | 'start';

/** `fontKerning` values (the engine uses `'none'`: the original laid text out unkerned). */
export type FontKerningValue = 'auto' | 'normal' | 'none';

/** `lineCap` values. */
export type LineCapValue = 'butt' | 'round' | 'square';

/** `lineJoin` values (routes use `'round'`, matching PIL `joint="curve"`). */
export type LineJoinValue = 'bevel' | 'miter' | 'round';

/** `imageSmoothingQuality` values. */
export type SmoothingQualityValue = 'high' | 'low' | 'medium';

/** `globalCompositeOperation` values (the full standard list, so every host type fits). */
export type CompositeOperationValue =
  | 'color'
  | 'color-burn'
  | 'color-dodge'
  | 'copy'
  | 'darken'
  | 'destination-atop'
  | 'destination-in'
  | 'destination-out'
  | 'destination-over'
  | 'difference'
  | 'exclusion'
  | 'hard-light'
  | 'hue'
  | 'lighten'
  | 'lighter'
  | 'luminosity'
  | 'multiply'
  | 'overlay'
  | 'saturation'
  | 'screen'
  | 'soft-light'
  | 'source-atop'
  | 'source-in'
  | 'source-out'
  | 'source-over'
  | 'xor';

/**
 * The subset of the Canvas 2D API used by the engine. Hosts may offer more;
 * the engine must not call anything that is not listed here.
 */
export interface Ctx2D {
  /**
   * The surface this context draws on (DOM canvas, OffscreenCanvas or napi
   * `Canvas`). Post-processing copies it onto a scratch surface with
   * `drawImage`, so the frame surface itself is never read back.
   */
  readonly canvas: DrawableSource;

  /** Push the drawing state (transform, alpha, styles, font, composite op). */
  save(): void;
  /** Pop the drawing state. */
  restore(): void;
  /** Replace the current transform with the matrix `[a c e; b d f]`. */
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  /** Reset the transform to identity. */
  resetTransform(): void;

  /** Global alpha multiplier, 0..1. */
  globalAlpha: number;
  /** Compositing operator (the engine uses `'source-over'`, and `'copy'` for the blur scratch copies). */
  globalCompositeOperation: CompositeOperationValue;

  /** Fill colour. The engine writes CSS colour strings only (`#RRGGBB` or `rgba(...)`). */
  get fillStyle(): unknown;
  set fillStyle(value: string);
  /** Stroke colour. The engine writes CSS colour strings only. */
  get strokeStyle(): unknown;
  set strokeStyle(value: string);

  /** Stroke width in canvas px. */
  lineWidth: number;
  /** Stroke end caps. */
  lineCap: LineCapValue;
  /** Stroke joins. */
  lineJoin: LineJoinValue;

  /** CSS font shorthand, always `${px}px ${family}` (for example `118px WaycineDisplay`). */
  font: string;
  /** Text baseline; the engine draws with `'alphabetic'`. */
  textBaseline: TextBaselineValue;
  /** Text alignment; the engine draws with `'left'`. */
  textAlign: TextAlignValue;
  /**
   * Kerning of `fillText` and `measureText`; the engine sets `'none'`. Optional
   * because older hosts lack it (they then kern, a sub-pixel difference).
   */
  fontKerning?: FontKerningValue;

  /** Start a new path. */
  beginPath(): void;
  /** Close the current sub-path. */
  closePath(): void;
  /** Move the pen without drawing. */
  moveTo(x: number, y: number): void;
  /** Add a straight segment. */
  lineTo(x: number, y: number): void;
  /** Add a circular arc (angles in radians, clockwise on a y-down canvas). */
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  /** Add an elliptical arc (angles and rotation in radians). */
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  /** Add a closed rectangle sub-path. */
  rect(x: number, y: number, w: number, h: number): void;
  /** Fill the current path (non-zero rule). */
  fill(): void;
  /** Stroke the current path. */
  stroke(): void;
  /** Fill a rectangle with `fillStyle`. */
  fillRect(x: number, y: number, w: number, h: number): void;
  /** Set a rectangle to transparent black. */
  clearRect(x: number, y: number, w: number, h: number): void;

  /** Draw text at the pen position (`x` per `textAlign`, `y` per `textBaseline`). */
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  /** Measure text at the current `font`. */
  measureText(text: string): TextMetricsLike;

  /** Draw a source at its natural size. */
  drawImage(image: DrawableSource, dx: number, dy: number): void;
  /** Draw a source scaled into a destination rectangle. */
  drawImage(image: DrawableSource, dx: number, dy: number, dw: number, dh: number): void;
  /** Draw a source sub-rectangle into a destination rectangle. */
  drawImage(
    image: DrawableSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;

  /** Read pixels (ignores the transform). */
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageDataLike;
  /** Write pixels, replacing (not blending) the target rectangle. Ignores transform and alpha. */
  putImageData(imageData: ImageDataLike, dx: number, dy: number): void;
  /** Allocate a transparent pixel block usable with `putImageData` on this context. */
  createImageData(width: number, height: number): ImageDataLike;

  /** Whether scaled `drawImage` interpolates. */
  imageSmoothingEnabled: boolean;
  /** Interpolation quality for scaled `drawImage` (the engine's upscales use `'medium'`). */
  imageSmoothingQuality: SmoothingQualityValue;
}

/** Options for `Backend.createSurface`. */
export interface SurfaceOptions {
  /**
   * Hint that the engine will call `getImageData` often on this surface
   * (glow and blur scratch buffers only). Maps to the DOM context attribute
   * of the same name; ignored where unsupported.
   */
  willReadFrequently?: boolean;
}

/** An offscreen drawing surface created by a `Backend`. */
export interface Surface {
  /** Width in pixels. */
  readonly width: number;
  /** Height in pixels. */
  readonly height: number;
  /** The surface's 2D context. Returns the same context on every call. */
  getContext2d(): Ctx2D;
  /**
   * The host object to pass to `Ctx2D.drawImage` (DOM canvas, OffscreenCanvas
   * or napi `Canvas`). Only draw it onto contexts of the same backend.
   */
  readonly source: DrawableSource;
}

/**
 * Host adapter: creates scratch surfaces (glow masks, blur buffers, text
 * measurement). Implemented by `createBrowserBackend()` (DOM canvas or
 * OffscreenCanvas) and `createNodeBackend()` (`@napi-rs/canvas`).
 */
export interface Backend {
  /** Short identifier for logs and tests, for example `'dom'`, `'offscreen'` or `'napi'`. */
  readonly name: string;
  /**
   * How post-processing reads a frame's pixels. `'copy'` (the default) draws
   * the frame onto a `willReadFrequently` scratch surface and reads that, so a
   * GPU-backed frame canvas is never read with `getImageData` (browsers);
   * `'direct'` calls `getImageData` on the frame's own context, which is
   * cheaper where `drawImage` of a canvas replays its whole drawing
   * (`@napi-rs/canvas`).
   */
  readonly frameReadback?: 'copy' | 'direct';
  /**
   * Create a transparent surface of `width` x `height` pixels (both integers
   * >= 1; callers round up). The bundled fonts must already be registered on
   * this host (browser: `loadBundledFonts()`; node: done by `createNodeBackend()`).
   */
  createSurface(width: number, height: number, opts?: SurfaceOptions): Surface;
}
