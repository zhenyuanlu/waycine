import { fileURLToPath } from 'node:url';
import { GlobalFonts } from '@napi-rs/canvas';
import { BUNDLED_FONTS, type BundledFont } from '../core/fonts.js';

/**
 * Absolute path of a bundled font file, resolved from this module's URL
 * (`src/node` and `dist/node` both sit two levels below the package root).
 */
export function bundledFontPath(file: string): string {
  return fileURLToPath(new URL(`../../fonts/${file}`, import.meta.url));
}

/**
 * Registers the bundled TTFs with `@napi-rs/canvas` under their alias
 * families (`WaycineDisplay`, `WaycineBody`). Idempotent: a family that is
 * already known to `GlobalFonts` is left alone.
 */
export function registerBundledFonts(): void {
  const fonts: readonly BundledFont[] = [BUNDLED_FONTS.display, BUNDLED_FONTS.body];
  for (const font of fonts) {
    if (GlobalFonts.has(font.family)) continue;
    const key = GlobalFonts.registerFromPath(bundledFontPath(font.file), font.family);
    if (key === null) {
      throw new Error(
        `waycine/node: could not register the bundled font ${font.file} as ${font.family}`,
      );
    }
  }
}
