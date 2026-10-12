import type { Ctx2D } from '../../src/core/ctx.js';

/** One recorded context call: method name, arguments, and the context state it ran with. */
export interface Call {
  name: string;
  args: unknown[];
  font: string;
  alpha: number;
  fill: unknown;
}

/**
 * A recording `Ctx2D` for layout tests: every method call is recorded (with
 * the current font, alpha and fill style), properties are plain fields, and
 * `measureText` returns 0.5 em per code point, like the measure-only backend.
 * Nothing is drawn.
 */
export function recordingCtx(): { ctx: Ctx2D; calls: Call[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {
    font: '10px sans-serif',
    globalAlpha: 1,
    fillStyle: '#000000',
    canvas: { width: 1, height: 1 },
  };
  const measureText = (text: string) => {
    const px = Number.parseFloat(String(state.font));
    return { width: 0.5 * px * Array.from(text).length };
  };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (typeof key !== 'string') return undefined;
      if (key === 'measureText') return measureText;
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push({
          name: key,
          args,
          font: String(target.font),
          alpha: Number(target.globalAlpha),
          fill: target.fillStyle,
        });
        return undefined;
      };
    },
    set(target, key, value) {
      if (typeof key === 'string') target[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as Ctx2D, calls };
}

/** Whole strings drawn with `fillText` (tracked text arrives one grapheme per call). */
export function texts(calls: readonly Call[]): string[] {
  return calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]));
}
