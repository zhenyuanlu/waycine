import { BUNDLED_FONTS, type BundledFont } from '../core/fonts.js';
import { errorMessage } from './errors.js';

/** Options for `loadBundledFonts`. */
export interface LoadFontsOptions {
  /**
   * Font files to register instead of fetching the bundled TTFs: for example
   * bytes a worker received from the page, or for a bundler that cannot
   * resolve `new URL(..., import.meta.url)`. Either face may be given alone;
   * the other is fetched. A call with `data` replaces faces registered earlier.
   */
  data?: { display?: BufferSource; body?: BufferSource };
}

type FaceKey = keyof typeof BUNDLED_FONTS;

/**
 * URL of a bundled TTF next to this package. The literal
 * `new URL('...', import.meta.url)` form lets bundlers find and copy the files;
 * the names must match `BUNDLED_FONTS[key].file`.
 */
function bundledFontUrl(key: FaceKey): URL {
  return key === 'display'
    ? new URL('../../fonts/BarlowCondensed-Bold.ttf', import.meta.url)
    : new URL('../../fonts/BarlowSemiCondensed-SemiBold.ttf', import.meta.url);
}

/** Bytes of both bundled faces. */
export interface BundledFontBytes {
  /** Barlow Condensed Bold (`WaycineDisplay`). */
  display: ArrayBuffer;
  /** Barlow Semi Condensed SemiBold (`WaycineBody`). */
  body: ArrayBuffer;
}

async function fetchFace(key: FaceKey): Promise<ArrayBuffer> {
  const url = bundledFontUrl(key);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Could not fetch ${BUNDLED_FONTS[key].file} (HTTP ${response.status}) from ${url.href}`,
    );
  }
  return response.arrayBuffer();
}

/**
 * Fetches the bundled TTFs (resolved as `loadBundledFonts` resolves them), for
 * example to hand them to a worker. The browser's HTTP cache makes repeat
 * calls cheap.
 */
export async function fetchBundledFontBytes(): Promise<BundledFontBytes> {
  const [display, body] = await Promise.all([fetchFace('display'), fetchFace('body')]);
  return { display, body };
}

/** The FontFaceSet of this realm: `document.fonts`, or `self.fonts` in a worker. */
function fontFaceSet(): FontFaceSet {
  if (typeof document !== 'undefined') {
    return document.fonts;
  }
  const fonts = (globalThis as { fonts?: FontFaceSet }).fonts;
  if (fonts) {
    return fonts;
  }
  throw new Error(
    'loadBundledFonts needs document.fonts or, in a worker, self.fonts; this environment has neither.',
  );
}

async function loadFace(font: BundledFont, source: string | BufferSource): Promise<FontFace> {
  // No weight descriptor: the engine's font strings (`118px WaycineDisplay`)
  // ask for the normal weight, so registering the face as normal makes the
  // match exact and rules out any synthetic-bold or weight-matching surprise.
  const face = new FontFace(font.family, source);
  try {
    await face.load();
  } catch (err) {
    throw new Error(`Could not load the ${font.family} font (${font.file}): ${errorMessage(err)}`, {
      cause: err,
    });
  }
  return face;
}

async function registerFaces(
  set: FontFaceSet,
  data: NonNullable<LoadFontsOptions['data']>,
  previous: Promise<FontFace[]> | undefined,
): Promise<FontFace[]> {
  const source = (key: FaceKey): string | BufferSource =>
    data[key] ?? `url(${JSON.stringify(bundledFontUrl(key).href)})`;
  const faces = await Promise.all([
    loadFace(BUNDLED_FONTS.display, source('display')),
    loadFace(BUNDLED_FONTS.body, source('body')),
  ]);
  const replaced = previous ? await previous.catch((): FontFace[] => []) : [];
  for (const face of replaced) {
    set.delete(face);
  }
  for (const face of faces) {
    set.add(face);
  }
  return faces;
}

/** Faces registered per FontFaceSet (one per window or worker), so repeat calls are free. */
const registrations = new WeakMap<FontFaceSet, Promise<FontFace[]>>();

/**
 * Registers the bundled fonts under their alias families (`WaycineDisplay`,
 * `WaycineBody`; see `BUNDLED_FONTS`) with `FontFace` on `document.fonts`
 * or, in a worker, `self.fonts`, and resolves once both have loaded. The TTFs
 * are resolved relative to this module (`new URL('../../fonts/<file>',
 * import.meta.url)`) unless `opts.data` supplies the bytes. Idempotent; await
 * it before the first `compile`, since text widths measured with a fallback
 * font would be cached.
 */
export async function loadBundledFonts(opts: LoadFontsOptions = {}): Promise<void> {
  const set = fontFaceSet();
  const previous = registrations.get(set);
  if (previous && opts.data === undefined) {
    await previous;
    return;
  }
  const next = registerFaces(set, opts.data ?? {}, previous);
  registrations.set(set, next);
  try {
    await next;
  } catch (err) {
    // Forget the failure so a later call can retry.
    if (registrations.get(set) === next) {
      registrations.delete(set);
    }
    throw err;
  }
}
