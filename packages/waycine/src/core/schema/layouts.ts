import { deepFreeze } from './json.js';
import type { Layout, Layouts } from './types.js';

/**
 * Landscape profile: a literal port of the original's 16:9 scene.
 *
 * Fit: `ov_zoom = min((W - 640) / dlon, (H - 380) / dmercY)`, centre nudged by
 * (+0.25 lon, -0.05 mercY). Stop pin 180 Du left of and 60 Du above centre,
 * i.e. at (780, 480) in 1920x1080.
 */
export const LANDSCAPE_LAYOUT: Layout = deepFreeze<Layout>({
  fit: { marginX: 640, marginY: 380, nudgeDeg: [0.25, -0.05], nudgeMaxFrac: 0.1, offsetDu: [0, 0] },
  stopPin: [-180, -60],
  title: {
    x: 96,
    y: 80,
    size: 44,
    tracking: 3,
    subY: 134,
    subSize: 28,
    subTracking: 3,
    subAlpha: 0.9,
    minSize: 28,
    subMinSize: 18,
    shrinkStep: 2,
    descY: 176,
    descSize: 22,
    descTracking: 2,
    descAlpha: 0.8,
    descMinSize: 14,
  },
  card: {
    placement: 'rightOfPin',
    x: 70,
    dy: -150,
    leader: 'diagonal',
    leaderFrom: [14, -14],
    leaderTo: [-12, 150],
    results: 'inline',
    partnerWrapChars: 0,
    barPartner: 34,
    resultsBarPerRow: false,
  },
  pinLabels: { order: 'perPin', flipAboveX: null, medals: true },
  stats: {
    x: 96,
    y: 70,
    direction: 'row',
    pitch: 330,
    numberSize: 170,
    labelDx: 110,
    labelDy: 62,
  },
  safeArea: { top: 0.067, right: 0.05, bottom: 0.067, left: 0.05 },
});

/**
 * Portrait profile: a literal port of the original's 9:16 scene.
 *
 * Fit: `ov_zoom = min((W - 220) / dlon, (H - 900) / dmercY)`, centre nudged by
 * +0.25 mercY. Stop pin at (-0.22 * 1080, -0.20 * 1920) Du from centre, i.e.
 * (0.28 W, 0.30 H) = (302.4, 576) in 1080x1920.
 */
export const PORTRAIT_LAYOUT: Layout = deepFreeze<Layout>({
  fit: { marginX: 220, marginY: 900, nudgeDeg: [0, 0.25], nudgeMaxFrac: 0.1, offsetDu: [0, 0] },
  stopPin: [-237.6, -384],
  title: {
    x: 80,
    y: 260,
    size: 64,
    tracking: 3,
    subY: 340,
    subSize: 34,
    subTracking: 3,
    subAlpha: 0.9,
    minSize: 40,
    subMinSize: 22,
    shrinkStep: 2,
    descY: 400,
    descSize: 28,
    descTracking: 2,
    descAlpha: 0.8,
    descMinSize: 18,
  },
  card: {
    placement: 'belowPin',
    x: 90,
    dy: 120,
    leader: 'vertical',
    leaderFrom: [0, 16],
    leaderTo: [0, -14],
    results: 'stacked',
    partnerWrapChars: 30,
    barPartner: 70,
    resultsBarPerRow: true,
  },
  pinLabels: { order: 'afterPins', flipAboveX: 0.55, medals: false },
  stats: {
    x: 80,
    y: 250,
    direction: 'column',
    pitch: 150,
    numberSize: 140,
    labelDx: 95,
    labelDy: 50,
  },
  safeArea: { top: 0.12, right: 0.111, bottom: 0.229, left: 0.056 },
});

/**
 * Square profile (new; no original to match). Fit box insets l/r/t/b
 * .10/.10/.30/.12 of 1080 expressed as total margins (216, 453.6) plus a
 * 97.2 Du downward offset of the box centre. Stop pin at (0.28 W, 0.27 H).
 */
export const SQUARE_LAYOUT: Layout = deepFreeze<Layout>({
  fit: { marginX: 216, marginY: 453.6, nudgeDeg: [0, 0], nudgeMaxFrac: 0.1, offsetDu: [0, 97.2] },
  stopPin: [-237.6, -248.4],
  title: {
    x: 72,
    y: 100,
    size: 52,
    tracking: 3,
    subY: 164,
    subSize: 30,
    subTracking: 3,
    subAlpha: 0.9,
    minSize: 34,
    subMinSize: 20,
    shrinkStep: 2,
    descY: 210,
    descSize: 24,
    descTracking: 2,
    descAlpha: 0.8,
    descMinSize: 16,
  },
  card: {
    placement: 'belowPin',
    x: 80,
    dy: 110,
    leader: 'vertical',
    leaderFrom: [0, 16],
    leaderTo: [0, -14],
    results: 'stacked',
    partnerWrapChars: 30,
    barPartner: 70,
    resultsBarPerRow: true,
  },
  pinLabels: { order: 'afterPins', flipAboveX: 0.55, medals: false },
  stats: {
    x: 80,
    y: 90,
    direction: 'row',
    pitch: 320,
    numberSize: 150,
    labelDx: 100,
    labelDy: 55,
  },
  safeArea: { top: 0.06, right: 0.06, bottom: 0.06, left: 0.06 },
});

/** Default layouts for every profile. */
export const DEFAULT_LAYOUTS: Layouts = deepFreeze<Layouts>({
  landscape: LANDSCAPE_LAYOUT,
  portrait: PORTRAIT_LAYOUT,
  square: SQUARE_LAYOUT,
});
