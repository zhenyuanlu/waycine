import { type Box, finaleBoxes, titleBoxes } from '../clearance.js';
import type { Ctx2D } from '../ctx.js';
import type { Cam, Compiled, SceneState } from '../scene-types.js';
import type { Vec2 } from '../schema/types.js';
import {
  type LabelSpot,
  labelLineHeight,
  type PinLabelLayout,
  pinLabelLayout,
} from './pin-labels.js';
import { routePath } from './route.js';
import { cached, fillSoftRect, pinPoint } from './util.js';

/**
 * Pin label placement (new; the original always drew a label beside its pin,
 * so a route leaving towards the label ran through the text). With
 * `pins.label.placement: 'auto'` every label takes, once per scene, the place
 * around its pin that costs least: route running through it, other pins and
 * labels under it, the title or the stats under it, and parts outside the
 * frame all cost; so does leaving the side the layout prefers. The places are
 * chosen for the whole overview and for the whole finale from one camera each,
 * so a label never jumps while the camera moves. A label that the route still
 * crosses at its best place gets a small backdrop that dims the line under
 * its text. Plain arithmetic and text measurement only: the same project and
 * size always give the same places.
 */

/** The two parts of the video that draw pin labels. */
export type LabelScene = 'overview' | 'finale';

/** Where one pin's label goes in a scene. */
export interface LabelPlace {
  /** The place around the pin. */
  spot: LabelSpot;
  /** True when the route still runs through the label there, so it gets a backdrop. */
  crossed: boolean;
}

/** Clear space kept around the route's core line, in Du. */
const ROUTE_CLEAR_DU = 5;
/** Clear space kept around other pins, in Du. */
const PIN_GAP_DU = 4;
/** Clear space kept between two labels, in Du. */
const LABEL_GAP_DU = 14;
/** Clear space kept around the title block and the finale stats, in Du. */
const OVERLAY_GAP_DU = 14;
/** Distance kept from the frame edge, in Du. */
const EDGE_DU = 20;
/** A text line's height in Du: turns an overlap area into a length. */
const LINE_DU = 20;

// Costs, per Du of overlap. A label leaves its preferred place only for a
// place that is better by more than the place's own cost.
const ROUTE_COST = 1;
const PIN_COST = 3;
const LABEL_COST = 4;
const OVERLAY_COST = 6;
const EDGE_COST = 12;
/** Cost of each place by preference rank: the preferred side, the other side, the diagonals, above, below. */
const RANK_COST = [0, 6, 10, 11, 13, 14, 17, 18] as const;
/** Two places whose costs differ by less than this count as equal (the more preferred one wins). */
const TIE_DU = 3;
/** Rounds of choosing each label's place given the others. */
const PASSES = 4;
/** Route length under a label (Du) from which the label counts as crossed. */
const CROSSED_DU = 3;

/** Backdrop of a crossed label: strength, padding and soft edge in Du, steps. */
const BACKDROP_ALPHA = 0.82;
const BACKDROP_PAD_DU = 3;
const BACKDROP_FEATHER_DU = 8;
const BACKDROP_STEPS = 4;

/** The boxes of a laid-out label: the city line, and the date line with its medal dots. */
export function labelBoxes(c: Compiled, i: number, g: PinLabelLayout): Box[] {
  const L = c.project.pins.label;
  const out: Box[] = [
    {
      x0: g.cityX,
      y0: g.cityY,
      x1: g.cityX + g.cityW,
      y1: g.cityY + labelLineHeight(c, 'display', L.citySize),
    },
  ];
  const hasDate = (c.stops[i]?.pinDate ?? '') !== '';
  if (hasDate || g.dots.length > 0) {
    const r = L.medalR * c.S;
    let x0 = hasDate ? g.dateX : Number.POSITIVE_INFINITY;
    let x1 = hasDate ? g.dateX + g.dateW : Number.NEGATIVE_INFINITY;
    let y0 = hasDate ? g.dateY : Number.POSITIVE_INFINITY;
    let y1 = hasDate ? g.dateY + labelLineHeight(c, 'body', L.dateSize) : Number.NEGATIVE_INFINITY;
    for (const d of g.dots) {
      x0 = Math.min(x0, d.x - r);
      x1 = Math.max(x1, d.x + r);
      y0 = Math.min(y0, d.y - r);
      y1 = Math.max(y1, d.y + r);
    }
    out.push({ x0, y0, x1, y1 });
  }
  return out;
}

function grow(b: Box, by: number): Box {
  return { x0: b.x0 - by, y0: b.y0 - by, x1: b.x1 + by, y1: b.y1 + by };
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Length of the segment a-b inside `box` (Liang-Barsky clipping). */
function lengthInside(a: Vec2, b: Vec2, box: Box): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a[0] - box.x0],
    [dx, box.x1 - a[0]],
    [-dy, a[1] - box.y0],
    [dy, box.y1 - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return 0;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return 0;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return 0;
      if (t < t1) t1 = t;
    }
  }
  return t1 > t0 ? (t1 - t0) * Math.hypot(dx, dy) : 0;
}

/** Route length inside any of `boxes`, in px. */
export function routeInside(route: readonly Vec2[], boxes: readonly Box[]): number {
  let sum = 0;
  for (let k = 1; k < route.length; k++) {
    const a = route[k - 1] as Vec2;
    const b = route[k] as Vec2;
    for (const box of boxes) sum += lengthInside(a, b, box);
  }
  return sum;
}

/** Area of `box` outside `frame`, in px^2. */
function outsideArea(box: Box, frame: Box): number {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  return Math.max(0, w * h - overlapArea(box, frame));
}

/** The camera whose frame the labels of `scene` are placed for. */
export function labelSceneCam(c: Compiled, scene: LabelScene): Cam {
  if (scene === 'finale') return c.finaleEndCam;
  // The overview at its end: pushed in, so the frame edges are closest.
  const z = c.ovCam.z * (1 + c.project.timing.overview.pushIn);
  return { cx: c.ovCam.cx, cy: c.ovCam.cy, z };
}

/** The places in preference order for a label whose layout rule puts it on `side`. */
function ranked(side: 'e' | 'w'): readonly LabelSpot[] {
  return side === 'e'
    ? ['e', 'w', 'ne', 'se', 'nw', 'sw', 'n', 's']
    : ['w', 'e', 'nw', 'sw', 'ne', 'se', 'n', 's'];
}

interface Candidate {
  spot: LabelSpot;
  boxes: Box[];
  /** Cost that does not depend on the other labels. */
  own: number;
  /** Route length under the label, in Du. */
  routeDu: number;
}

function placeLabels(ctx: Ctx2D, c: Compiled, scene: LabelScene): (LabelPlace | undefined)[] {
  const out: (LabelPlace | undefined)[] = c.stops.map(() => undefined);
  const pins = c.project.pins;
  if (pins.label.placement !== 'auto' || !pins.label.show) return out;
  const S = c.S;
  const cam = labelSceneCam(c, scene);
  const owners = c.stops.filter((stop) => stop.pinOf === stop.index).map((stop) => stop.index);
  const at = new Map(owners.map((i) => [i, pinPoint(c, i, cam)]));
  const route = c.project.route.show ? routePath(c, cam, c.stops.length - 1) : [];
  const routePad = (c.project.route.coreWidth / 2 + ROUTE_CLEAR_DU) * S;
  const pinGap = PIN_GAP_DU * S;
  const labelGap = LABEL_GAP_DU * S;
  const pinR = (pins.radius + pins.haloPad) * S;
  const edge = EDGE_DU * S;
  const frame: Box = { x0: edge, y0: edge, x1: c.width - edge, y1: c.height - edge };
  const overlays = (scene === 'overview' ? titleBoxes(ctx, c) : finaleBoxes(ctx, c)).map((b) =>
    grow(b, OVERLAY_GAP_DU * S),
  );
  const line = LINE_DU * S;
  /** px^2 of overlap as Du of length. */
  const asDu = (area: number): number => area / line / S;

  const candidates = new Map<number, Candidate[]>();
  for (const i of owners) {
    const p = at.get(i);
    if (p === undefined) continue;
    const fixed = pinLabelLayout(ctx, c, i, p.x, p.y);
    if (fixed === null) continue;
    const list: Candidate[] = [];
    ranked(fixed.flip ? 'w' : 'e').forEach((spot, rank) => {
      const g = pinLabelLayout(ctx, c, i, p.x, p.y, spot);
      if (g === null) return;
      const boxes = labelBoxes(c, i, g);
      const padded = boxes.map((b) => grow(b, routePad));
      const routeDu = routeInside(route, padded) / S;
      let own = (RANK_COST[rank] ?? 0) + ROUTE_COST * routeDu;
      for (const b of boxes) {
        for (const j of owners) {
          if (j === i) continue;
          const q = at.get(j);
          if (q === undefined) continue;
          const pin: Box = { x0: q.x - pinR, y0: q.y - pinR, x1: q.x + pinR, y1: q.y + pinR };
          own += PIN_COST * asDu(overlapArea(grow(b, pinGap), pin));
        }
        for (const o of overlays) own += OVERLAY_COST * asDu(overlapArea(b, o));
        own += EDGE_COST * asDu(outsideArea(b, frame));
      }
      list.push({ spot, boxes, own, routeDu });
    });
    if (list.length > 0) candidates.set(i, list);
  }

  // Every label starts at its preferred place; then each in turn takes its
  // cheapest place given where the others are now.
  const chosen = new Map<number, Candidate>();
  for (const [i, list] of candidates) chosen.set(i, list[0] as Candidate);
  for (let pass = 0; pass < PASSES; pass++) {
    let moved = false;
    for (const [i, list] of candidates) {
      let best: Candidate | undefined;
      let bestCost = Number.POSITIVE_INFINITY;
      for (const cand of list) {
        let cost = cand.own;
        for (const [j, other] of chosen) {
          if (j === i) continue;
          for (const a of cand.boxes) {
            const wide = grow(a, labelGap);
            for (const b of other.boxes) cost += LABEL_COST * asDu(overlapArea(wide, b));
          }
        }
        // Candidates come in preference order: a later one has to be clearly better.
        if (cost < bestCost - TIE_DU) {
          best = cand;
          bestCost = cost;
        }
      }
      if (best !== undefined && best !== chosen.get(i)) {
        chosen.set(i, best);
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const [i, cand] of chosen) {
    out[i] = { spot: cand.spot, crossed: cand.routeDu >= CROSSED_DU };
  }
  return out;
}

/**
 * The place of every pin's label in `scene`, by stop index; `undefined` for a
 * label that keeps the layout's own rule (`pins.label.placement: 'fixed'`,
 * labels off, or a stop without a pin of its own). Computed once per compile
 * and scene.
 */
export function labelPlaces(
  ctx: Ctx2D,
  c: Compiled,
  scene: LabelScene,
): readonly (LabelPlace | undefined)[] {
  return cached(c, `draw.labels.places.${scene}`, () => placeLabels(ctx, c, scene));
}

/** The label scene a frame belongs to: the overview, the finale, a hold after either; else null. */
export function labelSceneOf(c: Compiled, s: SceneState): LabelScene | null {
  let kind = s.segment.kind;
  if (kind === 'hold') {
    const segments = c.timeline.segments;
    const at = segments.findIndex(
      (g) => g.kind === 'hold' && s.frame >= g.start && s.frame < g.start + g.n,
    );
    kind = at > 0 ? (segments[at - 1]?.kind ?? 'hold') : 'hold';
  }
  return kind === 'overview' || kind === 'finale' ? kind : null;
}

/**
 * The backdrop of a crossed label: a small soft-edged plate in the background
 * colour under each of its lines, at pin position (x, y) px, times `alpha`.
 * Drawn after the route and before the pins.
 */
export function drawLabelBackdrop(
  ctx: Ctx2D,
  c: Compiled,
  i: number,
  x: number,
  y: number,
  alpha: number,
  spot: LabelSpot,
): void {
  if (!(alpha > 0)) return;
  const g = pinLabelLayout(ctx, c, i, x, y, spot);
  if (g === null) return;
  const S = c.S;
  ctx.fillStyle = c.project.theme.background;
  for (const b of labelBoxes(c, i, g)) {
    const box = grow(b, BACKDROP_PAD_DU * S);
    fillSoftRect(
      ctx,
      box.x0,
      box.y0,
      box.x1,
      box.y1,
      BACKDROP_FEATHER_DU * S,
      BACKDROP_STEPS,
      BACKDROP_ALPHA * alpha,
    );
  }
  ctx.globalAlpha = 1;
}
