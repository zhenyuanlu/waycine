import { describe, expect, it } from 'vitest';
import { drawPost, flashColor } from '../../src/core/draw/post.js';
import {
  applyTransitionStyle,
  type Compiled,
  compile,
  createDefaultProject,
  DEFAULTS,
  drawScene,
  sceneAt,
  TRANSITION_STYLES,
  type TransitionStyle,
  transitionStyle,
  type WaycineProject,
} from '../../src/core/index.js';
import { createNodeBackend } from '../../src/node/index.js';
import { loadPreset, loadSeason } from '../helpers/projects.js';
import { recordingCtx } from '../helpers/record-ctx.js';

/**
 * The zoom-through flash target (`timing.transition.flashTo`) and the
 * transition styles the editor shows (`transitionStyle` /
 * `applyTransitionStyle`). `background` blends toward `theme.background`
 * instead of `theme.flash`; the flash curve, the blur and the timing are the
 * same, and fly mode has no flash either way.
 */

const backend = createNodeBackend();
const W = 192;
const H = 108;

function season(edit?: (p: WaycineProject) => void): Compiled {
  const p = loadSeason();
  edit?.(p);
  return compile(p, backend, { width: W, height: H });
}

/** The pure flash frame (v = 1) of stop 1's zoom-through and the first recovery frame of stop 2. */
function flashFrames(c: Compiled): { peak: number; recover: number } {
  const s0 = c.timeline.segments.find((s) => s.kind === 'stop' && s.index === 0);
  if (s0 === undefined) throw new Error('no stop 1');
  return { peak: s0.start + s0.n - 1, recover: s0.start + s0.n };
}

function pixels(c: Compiled, frame: number): Uint8ClampedArray {
  const surface = backend.createSurface(c.width, c.height);
  const ctx = surface.getContext2d();
  drawScene(ctx, c, sceneAt(c, frame), backend);
  return ctx.getImageData(0, 0, c.width, c.height).data;
}

/** True when every pixel is exactly `[r, g, b]`. */
function uniform(data: Uint8ClampedArray, rgb: [number, number, number]): boolean {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== rgb[0] || data[i + 1] !== rgb[1] || data[i + 2] !== rgb[2]) return false;
  }
  return true;
}

describe('timing.transition.flashTo', () => {
  it('defaults to the flash colour', () => {
    expect(DEFAULTS.timing.transition.flashTo).toBe('color');
    expect(loadSeason().timing.transition.flashTo).toBe('color');
    expect(loadPreset('europe-trip').timing.transition.flashTo).toBe('color');
  });

  it('changes no state: the same flash and blur curve, frame for frame', () => {
    for (const mode of ['zoomThrough', 'fly'] as const) {
      const color = season((p) => (p.timing.transition.mode = mode));
      const dip = season((p) => {
        p.timing.transition.mode = mode;
        p.timing.transition.flashTo = 'background';
      });
      expect(dip.timeline).toEqual(color.timeline);
      for (let f = 0; f < color.timeline.totalFrames; f++) {
        expect(sceneAt(dip, f), `${mode} frame ${f}`).toEqual(sceneAt(color, f));
      }
    }
  });

  it('blends the zoom-through and the recovery into theme.background', () => {
    const color = season();
    const dip = season((p) => (p.timing.transition.flashTo = 'background'));
    expect(flashColor(color)).toBe('#FFFFFF');
    expect(flashColor(dip)).toBe('#07070B');
    const { peak, recover } = flashFrames(dip);
    // The pure flash frame is a solid fill of the target colour.
    expect(sceneAt(dip, peak).post.flash).toBe(1);
    expect(uniform(pixels(color, peak), [255, 255, 255])).toBe(true);
    expect(uniform(pixels(dip, peak), [7, 7, 11])).toBe(true);
    // The recovery fill uses the same colour at the same alpha.
    for (const [c, fill] of [
      [color, '#FFFFFF'],
      [dip, '#07070B'],
    ] as const) {
      const post = sceneAt(c, recover).post;
      expect(post.flash).toBeGreaterThan(0);
      const { ctx, calls } = recordingCtx();
      drawPost(ctx, c, post, backend);
      const rect = calls.find((call) => call.name === 'fillRect');
      expect(rect?.fill).toBe(fill);
      expect(rect?.alpha).toBe(post.flash);
      expect(rect?.args).toEqual([0, 0, W, H]);
    }
  });

  it('follows the background when it changes, and ignores theme.flash', () => {
    const c = season((p) => {
      p.timing.transition.flashTo = 'background';
      p.theme.background = '#203040';
      p.theme.flash = '#FF0000';
    });
    expect(uniform(pixels(c, flashFrames(c).peak), [0x20, 0x30, 0x40])).toBe(true);
  });

  it('draws no flash in fly mode', () => {
    const c = season((p) => {
      p.timing.transition.mode = 'fly';
      p.timing.transition.flashTo = 'background';
    });
    for (let f = 0; f < c.timeline.totalFrames; f++) expect(sceneAt(c, f).post.flash).toBe(0);
  });
});

describe('transitionStyle / applyTransitionStyle', () => {
  it('reads the season and the Europe preset: the season flashes to white, Europe flies', () => {
    expect(transitionStyle(loadSeason())).toBe('flashWhite');
    expect(transitionStyle(loadPreset('europe-trip'))).toBe('fly');
    expect(transitionStyle(DEFAULTS)).toBe('flashWhite');
  });

  it('reads every combination', () => {
    const p = createDefaultProject();
    p.timing.transition.flashTo = 'background';
    expect(transitionStyle(p)).toBe('dipBackground');
    p.timing.transition.flashTo = 'color';
    p.theme.flash = '#B35AC7';
    expect(transitionStyle(p)).toBe('flashColor');
    p.theme.flash = '#ffffff';
    expect(transitionStyle(p)).toBe('flashWhite');
    p.timing.transition.mode = 'fly';
    p.timing.transition.flashTo = 'background';
    expect(transitionStyle(p)).toBe('fly');
  });

  it.each(TRANSITION_STYLES)('round-trips %s from every other style', (style) => {
    for (const from of TRANSITION_STYLES) {
      const start = applyTransitionStyle(createDefaultProject(), from);
      expect(transitionStyle(start)).toBe(from);
      const next = applyTransitionStyle(start, style);
      expect(transitionStyle(next), `${from} -> ${style}`).toBe(style);
    }
  });

  it('writes only what the style needs, without touching the input', () => {
    const base = DEFAULTS;
    const dip = applyTransitionStyle(base, 'dipBackground');
    expect(dip.timing.transition).toEqual({
      ...base.timing.transition,
      mode: 'zoomThrough',
      flashTo: 'background',
    });
    expect(dip.theme).toBe(base.theme);
    expect(dip.stops).toBe(base.stops);
    expect(DEFAULTS.timing.transition.flashTo).toBe('color');

    // Fly keeps the flash settings, so switching back restores the same look.
    const fly = applyTransitionStyle(dip, 'fly');
    expect(fly.timing.transition.mode).toBe('fly');
    expect(fly.timing.transition.flashTo).toBe('background');
    expect(transitionStyle(applyTransitionStyle(fly, 'dipBackground'))).toBe('dipBackground');

    // Nothing to change: the same object.
    expect(applyTransitionStyle(base, 'flashWhite')).toBe(base);
    expect(applyTransitionStyle(dip, 'dipBackground')).toBe(dip);
  });

  it('picks the accent for a colour flash and marks the theme custom, white restores it', () => {
    const coloured = applyTransitionStyle(DEFAULTS, 'flashColor');
    expect(coloured.theme.flash).toBe(DEFAULTS.theme.accent);
    expect(coloured.theme.id).toBe('custom');
    expect(coloured.timing.transition).toEqual(DEFAULTS.timing.transition);
    // A colour that is not white is kept.
    const own = createDefaultProject();
    own.theme.flash = '#123456';
    own.theme.id = 'custom';
    own.timing.transition.flashTo = 'background';
    const kept = applyTransitionStyle(own, 'flashColor');
    expect(kept.theme).toBe(own.theme);
    expect(kept.timing.transition.flashTo).toBe('color');
    // Back to white: the built-in theme again.
    const white = applyTransitionStyle(coloured, 'flashWhite');
    expect(white.theme).toEqual(DEFAULTS.theme);
    expect(white.theme.id).toBe('orchid');
  });

  it('gives frames that match the style', () => {
    const styles: [TransitionStyle, [number, number, number] | null][] = [
      ['flashWhite', [255, 255, 255]],
      ['dipBackground', [7, 7, 11]],
      ['flashColor', [0xb3, 0x5a, 0xc7]],
      ['fly', null],
    ];
    for (const [style, rgb] of styles) {
      const c = compile(applyTransitionStyle(loadSeason(), style), backend, {
        width: W,
        height: H,
      });
      if (rgb === null) {
        expect(c.timeline.segments.every((s) => s.nZoom === 0)).toBe(true);
        continue;
      }
      expect(uniform(pixels(c, flashFrames(c).peak), rgb), style).toBe(true);
    }
  });
});
