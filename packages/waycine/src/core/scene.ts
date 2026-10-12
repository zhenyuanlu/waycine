import { ease } from './math/easing.js';
import type {
  Cam,
  CardState,
  Compiled,
  DescriptionState,
  PostState,
  Pulse,
  SceneState,
  TimelineSegment,
} from './scene-types.js';
import type { ZoomInterp } from './schema/types.js';

/**
 * Per-frame scene state: a line-by-line port of the original overview /
 * stamp / pullback loops, generalised from the original's fixed seven stops
 * to N, with every constant read from the project. Arithmetic keeps the
 * original's operation order so segments mode matches the reference states
 * to rounding.
 */

/** Linear interpolation, written as the original `s + (e - s) * u`. */
function lerp(s: number, e: number, u: number): number {
  return s + (e - s) * u;
}

/** Camera interpolation: lon and y linear; z linear (the original) or geometric (`log`). */
export function lerpCam(start: Cam, end: Cam, u: number, zoomInterp: ZoomInterp): Cam {
  const z =
    zoomInterp === 'log' && start.z > 0 && end.z > 0
      ? start.z * (end.z / start.z) ** u
      : lerp(start.z, end.z, u);
  return { cx: lerp(start.cx, end.cx, u), cy: lerp(start.cy, end.cy, u), z };
}

/** The timeline segment holding `frame` (already clamped to the timeline). */
export function segmentAt(c: Compiled, frame: number): TimelineSegment {
  const segments = c.timeline.segments;
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const seg = segments[mid];
    if (seg !== undefined && seg.start <= frame) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const found = segments[lo];
  if (found === undefined) {
    throw new Error('sceneAt: the compiled timeline has no segments.');
  }
  return found;
}

/** Clamps a frame index to `0..totalFrames-1` (non-integers are floored, NaN is 0). */
export function clampFrame(c: Compiled, frame: number): number {
  const last = Math.max(0, c.timeline.totalFrames - 1);
  if (!Number.isFinite(frame)) {
    return frame === Number.POSITIVE_INFINITY ? last : 0;
  }
  return Math.min(last, Math.max(0, Math.floor(frame)));
}

function noPost(): PostState {
  return { blurDu: 0, flash: 0 };
}

/**
 * Single-mode recovery from the flash colour over the first `recoverFrames` of
 * a segment. It starts one step in (`(k + 1) / (recoverFrames + 1)`): the
 * previous zoom-through already ended on a pure flash frame, and starting at
 * 1 would show that frame twice.
 */
function recoverFlash(c: Compiled, seg: TimelineSegment, k: number): number {
  if (seg.recoverFrames <= 0 || k >= seg.recoverFrames) {
    return 0;
  }
  return 1 - ease(c.project.camera.fadeEasing, (k + 1) / (seg.recoverFrames + 1));
}

/** A fade-out ramp over the last `frames` of an n-frame segment: 1 before it, 0 on the last frame. */
function tailFade(c: Compiled, k: number, n: number, frames: number): number {
  if (frames <= 0 || k < n - frames) {
    return 1;
  }
  const j = k - (n - frames) + 1;
  return 1 - ease(c.project.camera.fadeEasing, j / frames);
}

function overviewState(c: Compiled, seg: TimelineSegment, frame: number, k: number): SceneState {
  const { camera, pins, timing } = c.project;
  const ov = timing.overview;
  const count = c.stops.length;
  const n = seg.n;
  const u = k / Math.max(1, n - 1);
  const cam: Cam = { cx: c.ovCam.cx, cy: c.ovCam.cy, z: c.ovCam.z * (1 + ov.pushIn * u) };
  const progress = ov.routeEndFrac > 0 ? Math.min(1, u / ov.routeEndFrac) : 1;
  const eased = ease(camera.flyEasing, progress);
  const upto = (count - 1) * eased;
  const pulses: Pulse[] = [];
  if (count > 1) {
    for (let i = 0; i < count; i++) {
      const d = upto - i;
      if (d >= 0 && d < ov.pulseWindow) {
        pulses.push({ index: i, u: d * ov.pulseRate });
      }
    }
  } else if (eased < ov.pulseWindow) {
    // A single stop has no route to travel; its pulse follows the route clock instead.
    pulses.push({ index: 0, u: eased * ov.pulseRate });
  }
  const titleAlpha = ease(camera.fadeEasing, k / c.frames.titleFade);
  return {
    frame,
    segment: { kind: 'overview', index: 0, k, n },
    cam,
    routeUpto: upto,
    lit: upto,
    pulses,
    pinLabels: pins.label.show,
    overlayAlpha: tailFade(c, k, n, seg.outroFrames),
    title: { alpha: titleAlpha },
    card: null,
    stats: null,
    // The description fades in with the title.
    description: c.text.description !== '' ? { place: 'overview', alpha: titleAlpha } : null,
    post: noPost(),
  };
}

function stopState(c: Compiled, seg: TimelineSegment, frame: number, k: number): SceneState {
  const { camera, card: cardSettings, timing } = c.project;
  const { stop: st, transition: tr } = timing;
  const i = seg.index;
  const n = seg.n;
  const { nFly, nHold, nZoom } = seg;
  const start = seg.startCam;
  const end = seg.endCam;
  const pin = c.stops[i];
  // Fly mode starts one step into the flight: frame 0 would repeat the camera,
  // route and (faded-out) card of the previous part's last frame. The flight
  // still arrives at k = nFly - 1, and the hold starts at nFly.
  const fly = tr.mode === 'fly';
  const flyK = fly ? k + 1 : k;
  let cam: Cam;
  if (k < nFly) {
    const u = ease(camera.flyEasing, flyK / nFly);
    const moved = lerpCam(start, end, u, camera.zoomInterp);
    // Slight zoom-out arc mid-flight for a sense of travel.
    cam = {
      cx: moved.cx,
      cy: moved.cy,
      z: moved.z * (1 - camera.flyZoomOut * Math.sin(Math.PI * u)),
    };
  } else if (k < nFly + nHold || pin === undefined) {
    cam = { cx: end.cx, cy: end.cy, z: end.z };
  } else {
    const v = (k - nFly - nHold + 1) / nZoom;
    const zf = 1 + tr.zoomGain * v ** tr.zoomExp;
    const e = ease(camera.flyEasing, v);
    cam = { cx: end.cx + (pin.lon - end.cx) * e, cy: end.cy + (pin.y - end.cy) * e, z: end.z * zf };
  }

  const upto = i > 0 ? i - 1 + Math.min(1, flyK / Math.max(1, nFly)) : 0;
  const lightAt = nFly * st.pinLightAt;
  const lightsUp = k >= lightAt;
  const pulseDur = n * st.pulseDurFrac;
  const pulses: Pulse[] =
    lightsUp && pulseDur > 0 ? [{ index: i, u: (k - lightAt) / pulseDur }] : [];

  // Fly mode shows the card once the camera has arrived, so the lit pin never
  // sweeps under the card text while the camera still moves.
  const cardStart = fly ? Math.max(c.frames.cardDelay, nFly) : c.frames.cardDelay;
  let card: CardState | null = null;
  if (cardSettings.show && k >= cardStart) {
    card = {
      stop: i,
      u: (k - cardStart) / c.frames.cardFade,
      anchorCam: { cx: end.cx, cy: end.cy, z: end.z },
      alpha: tailFade(c, k, n, seg.cardOutFrames),
    };
  }

  let post = noPost();
  if (nZoom > 0 && k >= n - nZoom) {
    const v = (k - (n - nZoom) + 1) / nZoom;
    const flash =
      tr.whiteStart < 1
        ? Math.max(0, (v - tr.whiteStart) / (1 - tr.whiteStart)) ** tr.whiteExp
        : v >= 1
          ? 1
          : 0;
    post = { blurDu: tr.blurMax * v ** tr.blurExp, flash };
  }
  const recover = recoverFlash(c, seg, k);
  if (recover > post.flash) {
    post = { blurDu: post.blurDu, flash: recover };
  }

  return {
    frame,
    segment: { kind: 'stop', index: i, k, n },
    cam,
    routeUpto: Math.max(0, upto),
    lit: lightsUp ? i : i - 1,
    pulses,
    pinLabels: false,
    overlayAlpha: 1,
    title: null,
    card,
    stats: null,
    description: null,
    post,
  };
}

function finaleState(c: Compiled, seg: TimelineSegment, frame: number, k: number): SceneState {
  const { camera, pins, stats: statsSettings, timing } = c.project;
  const fin = timing.finale;
  const count = c.stops.length;
  const n = seg.n;
  const arrive = n * fin.cameraEndFrac;
  // Fly mode: one step in, like the stops (k = 0 would repeat the last stop frame).
  const moveK = timing.transition.mode === 'fly' ? k + 1 : k;
  const u = ease(camera.flyEasing, arrive > 0 ? Math.min(1, moveK / arrive) : 1);
  const cam = lerpCam(seg.startCam, seg.endCam, u, camera.zoomInterp);

  const pulses: Pulse[] = [];
  const pulseFrom = n * fin.pulseStart;
  const pulseDur = n * fin.pulseDur;
  if (k > pulseFrom && pulseDur > 0) {
    for (let i = 0; i < count; i++) {
      pulses.push({ index: i, u: (k - pulseFrom) / pulseDur - i * fin.pulseStagger });
    }
  }

  const statsDur = n * fin.statsDur;
  const statsU = statsDur > 0 ? (k - n * fin.statsStart) / statsDur : 0;
  const recover = recoverFlash(c, seg, k);

  // The finale description fades in as one more stats item, after the last stat drawn.
  let description: DescriptionState | null = null;
  if (c.text.descFinale !== null && statsU > 0) {
    const after = statsSettings.show ? c.stats.length : 0;
    const alpha = ease(camera.fadeEasing, statsU * fin.statsRate - after * fin.statsStagger);
    if (alpha > 0) description = { place: 'finale', alpha };
  }

  return {
    frame,
    segment: { kind: 'finale', index: 0, k, n },
    cam,
    routeUpto: count - 1,
    lit: count - 1,
    pulses,
    pinLabels: pins.label.show && u > fin.pinLabelsAfter,
    overlayAlpha: 1,
    title: null,
    card: null,
    stats: statsSettings.show && statsU > 0 ? { u: statsU } : null,
    description,
    post: { blurDu: 0, flash: recover },
  };
}

/**
 * The scene state of one frame: a pure function of `(c, frame)` (no clocks,
 * no randomness). `frame` is an integer timeline index; values outside
 * `0..totalFrames-1` are clamped.
 */
export function sceneAt(c: Compiled, frame: number): SceneState {
  const f = clampFrame(c, frame);
  const seg = segmentAt(c, f);
  const k = f - seg.start;
  switch (seg.kind) {
    case 'overview':
      return overviewState(c, seg, f, k);
    case 'stop':
      return stopState(c, seg, f, k);
    case 'finale':
      return finaleState(c, seg, f, k);
    case 'hold': {
      // A static hold of the previous segment's last frame.
      if (seg.start === 0) {
        throw new Error('sceneAt: a hold segment cannot start the timeline.');
      }
      const last = sceneAt(c, seg.start - 1);
      return { ...last, frame: f, segment: { kind: 'hold', index: 0, k, n: seg.n } };
    }
  }
}
