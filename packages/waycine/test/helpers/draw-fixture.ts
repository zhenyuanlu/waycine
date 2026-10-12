/**
 * Hand-made `Compiled` and `SceneState` fixtures for the reference season in the
 * landscape (or portrait) profile, built straight from the original formulas
 * (the original landscape and portrait map scenes)
 * so the draw tests do not depend on `compile` / `sceneAt`.
 */

import {
  BUNDLED_FONTS,
  type Cam,
  type Compiled,
  type ProfileId,
  type ResolvedStop,
  type SceneState,
} from '../../src/core/index.js';
import { loadSeason } from './projects.js';

const outCubic = (u: number): number => 1 - (1 - Math.min(Math.max(u, 0), 1)) ** 3;
const inOutSine = (u: number): number =>
  0.5 - 0.5 * Math.cos(Math.PI * Math.min(Math.max(u, 0), 1));
const merc = (lat: number): number =>
  (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;

/** `Compiled` for the season at `width` x `height` (single mode). */
export function seasonCompiled(
  width: number,
  height: number,
  profile: ProfileId = 'landscape',
): Compiled {
  const project = loadSeason();
  const layout = project.layouts[profile];
  const S = Math.min(width, height) / 1080;
  const total = project.stops.length;
  const stops: ResolvedStop[] = project.stops.map((s, index) => {
    const date = s.date ?? '';
    const [yyyy = '', mm = '', dd = ''] = date.split('-');
    return {
      index,
      sourceIndex: index,
      id: s.id,
      lat: s.lat,
      lon: s.lon,
      y: merc(s.lat),
      city: s.city,
      event: s.event ?? '',
      partner: s.partner ?? '',
      partnerLines: s.partner ? [s.partner] : [],
      kicker: `RACE ${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
      cardDate: date ? `${yyyy}.${mm}.${dd}` : '',
      pinDate: date ? `${mm}.${dd}` : '',
      results: (s.results ?? []).map((r) => ({
        medal: r.medal,
        text: r.text,
        count: r.count ?? 1,
      })),
      citySize: project.card.city.size,
      eventSize: project.card.event.size,
      pinOf: index,
    };
  });
  const xs = stops.map((s) => s.lon);
  const ys = stops.map((s) => s.y);
  const dlon = Math.max(...xs) - Math.min(...xs);
  const dy = Math.max(...ys) - Math.min(...ys);
  const zOv = Math.min(
    (width - layout.fit.marginX * S) / Math.max(dlon, project.camera.minSpanDeg),
    (height - layout.fit.marginY * S) / Math.max(dy, project.camera.minSpanDeg),
  );
  const ovCam: Cam = {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2 + layout.fit.nudgeDeg[0],
    cy: (Math.min(...ys) + Math.max(...ys)) / 2 + layout.fit.nudgeDeg[1],
    z: zOv,
  };
  const zS = zOv * project.camera.stampZoom;
  const stampCams: Cam[] = stops.map((s) => ({
    cx: s.lon - (layout.stopPin[0] * S) / zS,
    cy: s.y + (layout.stopPin[1] * S) / zS,
    z: zS,
  }));
  return {
    project,
    width,
    height,
    S,
    fps: { num: 30000, den: 1001 },
    mode: 'single',
    profile,
    layout,
    stops,
    ovCam,
    stampCams,
    finaleEndCam: { cx: ovCam.cx, cy: ovCam.cy, z: zOv * project.camera.finaleZoom },
    frames: { titleFade: 8, cardDelay: 3, cardFade: 6 },
    timeline: { segments: [], totalFrames: 440 },
    grid: { baseStep: 0.25, majorStep: 1, splits: [1.8 * zOv] },
    text: {
      title: '2026 SEASON ROUTE',
      subtitle: '7 RACES  /  5 STATES',
      titleSize: layout.title.size,
      subSize: layout.title.subSize,
      description: '',
      descSize: layout.title.descSize,
      descFinale: null,
    },
    stats: [
      { value: '7', label: 'RACES' },
      { value: '5', label: 'STATES' },
      { value: '4', label: 'MONTHS' },
    ],
    fonts: {
      display: project.fonts.display.family,
      body: project.fonts.body.family,
      identity: {
        display: `bundled:${BUNDLED_FONTS.display.file}`,
        body: `bundled:${BUNDLED_FONTS.body.file}`,
      },
      anchorEm: { display: BUNDLED_FONTS.display.anchorEm, body: BUNDLED_FONTS.body.anchorEm },
      sizeAdjust: { display: 1, body: 1 },
      widthAdjust: { display: 1, body: 1 },
    },
    cache: new Map(),
    warnings: [],
  };
}

const NO_POST = { blurDu: 0, flash: 0 };

/** The overview of the original's landscape scene (80 frames), frame k. */
export function overviewState(c: Compiled, k: number, n = 80): SceneState {
  const u = k / Math.max(1, n - 1);
  const upto = (c.stops.length - 1) * inOutSine(Math.min(1, u / 0.7));
  const pulses = c.stops
    .map((_, i) => ({ index: i, u: (upto - i) * 1.4 }))
    .filter((p) => upto - p.index >= 0 && upto - p.index < 0.8);
  return {
    frame: k,
    segment: { kind: 'overview', index: 0, k, n },
    cam: { cx: c.ovCam.cx, cy: c.ovCam.cy, z: c.ovCam.z * (1 + 0.05 * u) },
    routeUpto: upto,
    lit: upto,
    pulses,
    pinLabels: true,
    overlayAlpha: 1,
    title: { alpha: outCubic(k / 8) },
    card: null,
    stats: null,
    description: null,
    post: NO_POST,
  };
}

/** The stamp of stop i in the original's landscape scene (40 frames), frame k (stop i > 0). */
export function stampState(c: Compiled, i: number, k: number, n = 40): SceneState {
  const nFly = Math.floor(n * 0.42);
  const nZoom = Math.floor(n * 0.22);
  const nHold = n - nFly - nZoom;
  const start = c.stampCams[i - 1] as Cam;
  const end = c.stampCams[i] as Cam;
  const pin = c.stops[i] as ResolvedStop;
  let cam: Cam;
  let post = NO_POST;
  if (k < nFly) {
    const u = inOutSine(k / nFly);
    cam = {
      cx: start.cx + (end.cx - start.cx) * u,
      cy: start.cy + (end.cy - start.cy) * u,
      z: (start.z + (end.z - start.z) * u) * (1 - 0.25 * Math.sin(Math.PI * u)),
    };
  } else if (k < nFly + nHold) {
    cam = end;
  } else {
    const v = (k - nFly - nHold + 1) / nZoom;
    const e = inOutSine(v);
    cam = {
      cx: end.cx + (pin.lon - end.cx) * e,
      cy: end.cy + (pin.y - end.cy) * e,
      z: end.z * (1 + 7 * v ** 2.2),
    };
    post = { blurDu: 6 * v ** 2, flash: Math.max(0, (v - 0.55) / 0.45) ** 1.5 };
  }
  const lightAt = nFly * 0.8;
  return {
    frame: 80 + (i * n + k),
    segment: { kind: 'stop', index: i, k, n },
    cam,
    routeUpto: Math.max(0, i - 1 + Math.min(1, k / Math.max(1, nFly))),
    lit: k >= lightAt ? i : i - 1,
    pulses: k >= lightAt ? [{ index: i, u: (k - lightAt) / (n * 0.45) }] : [],
    pinLabels: false,
    overlayAlpha: 1,
    title: null,
    card: k >= 3 ? { stop: i, u: (k - 3) / 6, anchorCam: end, alpha: 1 } : null,
    stats: null,
    description: null,
    post,
  };
}

/** The pullback (finale) of the original's landscape scene (80 frames), frame k. */
export function finaleState(c: Compiled, k: number, n = 80): SceneState {
  const last = c.stops.length - 1;
  const start = c.stampCams[last] as Cam;
  const end = c.finaleEndCam;
  const u = inOutSine(Math.min(1, k / (n * 0.55)));
  const statsU = (k - n * 0.35) / (n * 0.3);
  return {
    frame: 360 + k,
    segment: { kind: 'finale', index: 0, k, n },
    cam: {
      cx: start.cx + (end.cx - start.cx) * u,
      cy: start.cy + (end.cy - start.cy) * u,
      z: start.z + (end.z - start.z) * u,
    },
    routeUpto: last,
    lit: last,
    pulses:
      k > n * 0.3
        ? c.stops.map((_, i) => ({ index: i, u: (k - n * 0.3) / (n * 0.5) - i * 0.06 }))
        : [],
    pinLabels: u > 0.6,
    overlayAlpha: 1,
    title: null,
    card: null,
    stats: statsU > 0 ? { u: statsU } : null,
    description: null,
    post: NO_POST,
  };
}
