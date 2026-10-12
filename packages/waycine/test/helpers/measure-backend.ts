import type { Backend, Ctx2D, Surface } from '../../src/core/ctx.js';

/** Options for `createMeasureBackend`. */
export interface MeasureBackendOptions {
  /** Cap height reported as `actualBoundingBoxAscent` for 'H', in em (default: none reported). */
  capHeightEm?: number;
  /** Called with every value assigned to `fontKerning`. */
  onKerning?: (value: unknown) => void;
}

/**
 * A measuring-only backend for state tests: `measureText` returns a
 * deterministic width of 0.5 em per code point, which is all `compile` needs.
 * Drawing calls are not implemented.
 */
export function createMeasureBackend(opts: MeasureBackendOptions = {}): Backend {
  return {
    name: 'measure-only',
    createSurface(width: number, height: number): Surface {
      let font = '10px sans-serif';
      let kerning: unknown = 'auto';
      const ctx = {
        get font(): string {
          return font;
        },
        set font(value: string) {
          font = value;
        },
        get fontKerning(): unknown {
          return kerning;
        },
        set fontKerning(value: unknown) {
          kerning = value;
          opts.onKerning?.(value);
        },
        measureText(text: string) {
          const px = Number.parseFloat(font);
          return {
            width: 0.5 * px * Array.from(text).length,
            fontBoundingBoxAscent: 0.9 * px,
            actualBoundingBoxAscent:
              opts.capHeightEm === undefined ? undefined : opts.capHeightEm * px,
          };
        },
      };
      return {
        width,
        height,
        getContext2d: () => ctx as unknown as Ctx2D,
        source: null,
      };
    },
  };
}
