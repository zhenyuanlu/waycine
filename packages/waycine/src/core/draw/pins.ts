import type { Ctx2D } from '../ctx.js';
import type { Compiled, SceneState } from '../scene-types.js';
import { drawLabelBackdrop, labelPlaces, labelSceneOf } from './label-placement.js';
import { drawPinLabel } from './pin-labels.js';
import { circlePath, fade, fillCircle, pinPoint, strokeRingInward } from './util.js';

/** A pin is drawn when its index is at most `lit + LIT_EPS` (the original's epsilon). */
const LIT_EPS = 1e-6;

/**
 * Pins (the original's pin pass): for every lit pin, its pulse rings, the halo and
 * the core; pin labels either right after each pin (`perPin`, the original's
 * landscape scene: later pins cover earlier labels) or after all pins
 * (`afterPins`, its portrait scene).
 * Duplicate-location stops share their owner's pin (`pinOf`); their pulses
 * ring around it. Everything is multiplied by `s.overlayAlpha`. With
 * `pins.label.placement: 'auto'` each label is drawn at the place chosen for
 * it in this scene (see `labelPlaces`), and a label the route still crosses
 * gets its backdrop first, under every pin.
 */
export function drawPins(ctx: Ctx2D, c: Compiled, s: SceneState): void {
  const alpha = s.overlayAlpha;
  if (!(alpha > 0)) return;
  const pins = c.project.pins;
  const S = c.S;
  const theme = c.project.theme;
  const labels = s.pinLabels && pins.label.show;
  const order = c.layout.pinLabels.order;
  const drawn: number[] = [];
  const litMax = s.lit + LIT_EPS;
  const scene = labels ? labelSceneOf(c, s) : null;
  const places = scene === null ? [] : labelPlaces(ctx, c, scene);

  // Backdrops of crossed labels go under all pins, so they only dim the route.
  for (let i = 0; i < c.stops.length; i++) {
    const place = places[i];
    const stop = c.stops[i];
    if (place === undefined || !place.crossed) continue;
    if (stop === undefined || i > litMax || stop.pinOf !== i) continue;
    const p = pinPoint(c, i, s.cam);
    drawLabelBackdrop(ctx, c, i, p.x, p.y, alpha, place.spot);
  }

  for (let i = 0; i < c.stops.length; i++) {
    const stop = c.stops[i];
    if (stop === undefined || i > litMax || stop.pinOf !== i) continue;
    const p = pinPoint(c, i, s.cam);

    // Pulse rings of this pin and of lit stops merged into it.
    ctx.strokeStyle = theme.pin;
    for (const pulse of s.pulses) {
      const owner = c.stops[pulse.index];
      if (owner === undefined || owner.pinOf !== i || pulse.index > litMax) continue;
      for (const offset of pins.rings) {
        const v = pulse.u - offset;
        if (v < 0 || v > 1) continue;
        const r = (pins.ringStart + pins.ringGrow * fade(c, v)) * S;
        ctx.globalAlpha = pins.ringAlpha * (1 - v) * alpha;
        strokeRingInward(ctx, p.x, p.y, r, pins.ringWidth * S);
      }
    }

    // Halo, then core.
    const r = pins.radius * S;
    ctx.globalAlpha = pins.haloAlpha * alpha;
    ctx.fillStyle = theme.pin;
    fillCircle(ctx, p.x, p.y, r + pins.haloPad * S);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = theme.pinCore;
    ctx.beginPath();
    circlePath(ctx, p.x, p.y, r);
    ctx.fill();

    if (labels && order === 'perPin') drawPinLabel(ctx, c, i, p.x, p.y, alpha, places[i]?.spot);
    else drawn.push(i);
  }

  if (labels && order === 'afterPins') {
    for (const i of drawn) {
      const p = pinPoint(c, i, s.cam);
      drawPinLabel(ctx, c, i, p.x, p.y, alpha, places[i]?.spot);
    }
  }
  ctx.globalAlpha = 1;
}
