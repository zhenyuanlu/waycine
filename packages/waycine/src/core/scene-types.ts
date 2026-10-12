/**
 * Data contracts between the three engine stages:
 * `compile(project, backend, opts) -> Compiled`,
 * `sceneAt(compiled, frame) -> SceneState`,
 * `drawScene(ctx, compiled, state, backend)`.
 *
 * Screen mapping (the original `to_screen`), for a camera `cam` on a W x H
 * output: `sx = W/2 + (lon - cam.cx) * cam.z`, `sy = H/2 - (y - cam.cy) * cam.z`
 * (output px, y down), where `y` is Mercator y in degrees.
 */

import type { FpsRational } from './schema/output.js';
import type { ExportMode, Layout, Medal, ProfileId, WaycineProject } from './schema/types.js';

/** A camera. */
export interface Cam {
  /** Centre longitude in degrees (unwrapped: may leave (-180, 180] across the antimeridian). */
  cx: number;
  /** Centre Mercator y in degrees (`degrees(ln(tan(pi/4 + lat/2)))`). */
  cy: number;
  /** Zoom: output px per degree at the ACTUAL output resolution (already includes S). */
  z: number;
}

/** Segment kinds, in timeline order: overview, stop x N, finale, hold. */
export type SegmentKind = 'overview' | 'stop' | 'finale' | 'hold';

/** Where a frame falls in the timeline. */
export interface SegmentRef {
  /** Segment kind. */
  kind: SegmentKind;
  /** Stop index (0-based among visible stops) for `stop`; 0 otherwise. */
  index: number;
  /** Frame within the segment, 0..n-1. */
  k: number;
  /** Segment length in frames. */
  n: number;
}

/** One pulsing pin. */
export interface Pulse {
  /** Stop index of the pin. */
  index: number;
  /** Pulse progress (unclamped): ring j is drawn with `v = u - pins.rings[j]` while 0 <= v <= 1. */
  u: number;
}

/** Title overlay (overview only). */
export interface TitleState {
  /** Fade-in alpha 0..1 (`fadeEasing(k / titleFadeFrames)`), before `overlayAlpha`. The subtitle also multiplies `layout.title.subAlpha`. */
  alpha: number;
}

/** Stop card overlay. */
export interface CardState {
  /** Stop index (0-based among visible stops). */
  stop: number;
  /**
   * Fade-in progress (unclamped): `(k - cardStart) / cardFadeFrames`, where
   * cardStart is cardDelayFrames, or max(cardDelayFrames, nFly) in fly mode.
   * Alpha = `fadeEasing(u)`, slide = `(1 - fadeEasing(u)) * card.slide`.
   */
  u: number;
  /** Camera the card is positioned with: the stop's END camera, in every phase (fixed on screen). */
  anchorCam: Cam;
  /** Extra alpha multiplier 0..1: 1 normally; ramps to 0 during the `fly`-mode card fade-out. */
  alpha: number;
}

/**
 * Description line overlay (`text.description`): under the subtitle in the
 * overview, and below the finale stats when `text.descriptionAt` is
 * `introAndFinale`.
 */
export interface DescriptionState {
  /** Where it is drawn: `overview` (at `layout.title.descY`) or `finale` (at `Compiled.text.descFinale`). */
  place: 'overview' | 'finale';
  /**
   * Eased alpha 0..1 before `layout.title.descAlpha` (and, in the overview,
   * `overlayAlpha`): the title fade in the overview; in the finale the stats
   * item fade of one more item, `fadeEasing(u * statsRate - j * statsStagger)`
   * with j = the number of stats drawn (0 when the stats are off).
   */
  alpha: number;
}

/** Finale stats overlay. */
export interface StatsState {
  /** Stats progress (unclamped, > 0): `(k - statsStart * n) / (statsDur * n)`. Item j alpha = `fadeEasing(u * statsRate - j * statsStagger)`. */
  u: number;
}

/** Post-processing applied after everything else, at output resolution. */
export interface PostState {
  /** Gaussian blur sigma in Du (0 = none): zoom-through `blurMax * v^blurExp`. */
  blurDu: number;
  /**
   * Blend toward the flash colour (`theme.flash`, or `theme.background` when
   * `timing.transition.flashTo` is `background`), 0..1: zoom-through flash, or the single-mode
   * recovery `1 - fadeEasing((k + 1) / (recoverFrames + 1))` (starts one step
   * in, so the pure flash frame of the zoom-through is not repeated).
   */
  flash: number;
}

/** Everything `drawScene` needs for one frame. Pure function of (compiled, frame). */
export interface SceneState {
  /** Frame index within the whole timeline, 0..totalFrames-1. */
  frame: number;
  /** Segment and local frame. */
  segment: SegmentRef;
  /** Camera for the map (graticule, route, pins, pin labels). */
  cam: Cam;
  /** Route extent in pins reached (fractional = partial leg), 0..N-1: leg i (from stop i-1 to i) is drawn to fraction `clamp(routeUpto - (i - 1), 0, 1)`. */
  routeUpto: number;
  /** Pins with index `i <= lit + 1e-6` are drawn (may be -1: none). */
  lit: number;
  /** Pulsing pins. */
  pulses: Pulse[];
  /** Draw pin labels this frame. */
  pinLabels: boolean;
  /** Single-mode overview outro multiplier 0..1 for the title, description, route, pins and pin labels (1 elsewhere). */
  overlayAlpha: number;
  /** Title overlay, or null. */
  title: TitleState | null;
  /** Stop card, or null. */
  card: CardState | null;
  /** Finale stats, or null when nothing is visible (u <= 0). */
  stats: StatsState | null;
  /** Description line, or null (no description, not in this segment, or not faded in yet in the finale). */
  description: DescriptionState | null;
  /** Post-processing. */
  post: PostState;
}

/** One stop result, resolved. */
export interface ResolvedResult {
  /** Medal kind. */
  medal: Medal;
  /** Text as drawn: verbatim (never upper-cased, so "1ST x2" keeps its lower-case x). */
  text: string;
  /** Medal dots on the pin label, 1..5. */
  count: number;
}

/** A visible stop with everything precomputed for drawing. */
export interface ResolvedStop {
  /** Index among visible stops (video order), 0-based. */
  index: number;
  /** Index in `project.stops`. */
  sourceIndex: number;
  /** Stop id. */
  id: string;
  /** Latitude in degrees. */
  lat: number;
  /** Longitude in degrees, unwrapped sequentially (`lon_i = lon_{i-1} + wrap180(lon_i - lon_{i-1})`). */
  lon: number;
  /** Mercator y in degrees. */
  y: number;
  /** City as drawn on the card and pin label. */
  city: string;
  /** Event as drawn ('' = none). */
  event: string;
  /** Partner line as drawn ('' = none). */
  partner: string;
  /** Partner split into drawn lines per `layout.card.partnerWrapChars` (empty when no partner). */
  partnerLines: string[];
  /** Resolved kicker (`text.kicker` with n/total). */
  kicker: string;
  /** Card date text ('' hides the date line): `dateText`, or the formatted date or range. */
  cardDate: string;
  /** Pin-label date text ('' hides it); combined for merged duplicate pins. */
  pinDate: string;
  /** Results with counts. */
  results: ResolvedResult[];
  /** Auto-fitted card city size in Du (`card.city.size` unless it overflows). */
  citySize: number;
  /** Auto-fitted card event size in Du. */
  eventSize: number;
  /** Index of the stop whose pin this stop shares (duplicate locations within 1e-4 deg); its own index otherwise. */
  pinOf: number;
}

/** One timeline segment. */
export interface TimelineSegment {
  /** Segment kind. */
  kind: SegmentKind;
  /** Stop index for `stop`; 0 otherwise. */
  index: number;
  /** First frame of the segment in the timeline. */
  start: number;
  /** Length in frames (>= 1). */
  n: number;
  /** Stop fly frames `floor(flyFrac * n)` (0 for non-stop segments). */
  nFly: number;
  /** Stop hold frames `n - nFly - nZoom` (0 for non-stop segments). */
  nHold: number;
  /** Stop zoom-through frames `floor(zoomFrac * n)`; 0 in fly mode and for the last stop without a finale. */
  nZoom: number;
  /** Camera at k = 0 (stop: previous stamp cam, or the overview end camera in single mode / fit camera in segments mode). */
  startCam: Cam;
  /** Camera at the end of the move (stop: its stamp cam; finale: `finaleEndCam`; overview: pushed-in fit cam). */
  endCam: Cam;
  /** Single mode: frames at the start of this segment that fade back from the flash colour (after a zoom-through); else 0. */
  recoverFrames: number;
  /** Single mode: overview outro frames at the end of this segment (overview only); else 0. */
  outroFrames: number;
  /** Fly mode: card fade-out frames at the end of this stop segment (0 for the last stop without a finale); else 0. */
  cardOutFrames: number;
}

/**
 * Something `compile` could not lay out as asked (the project still renders).
 * `text-overflow`: a card, title, subtitle or description text is still wider
 * than its limit at its smallest size, so it runs past the frame edge.
 */
export interface CompileWarning {
  /** Machine-readable code. */
  code: 'text-overflow';
  /** Project path of the text: `stops[2].city`, `stops[2].event`, `text.title`, `text.subtitle`, `text.description`. */
  path: string;
  /** Measured width at the size used, in Du. */
  widthDu: number;
  /** Width limit, in Du. */
  limitDu: number;
  /** Human-readable English message. */
  message: string;
}

/** A project compiled for one output size and mode. Immutable except `cache`. */
export interface Compiled {
  /** The validated project this was compiled from. */
  project: WaycineProject;
  /** Output width in px. */
  width: number;
  /** Output height in px. */
  height: number;
  /** Design-unit scale: output px per Du = `min(width, height) / 1080`. */
  S: number;
  /** Exact frame rate. */
  fps: FpsRational;
  /** Export mode the timeline was built for. */
  mode: ExportMode;
  /** Active layout profile. */
  profile: ProfileId;
  /** The active profile's layout (`project.layouts[profile]`). */
  layout: Layout;
  /** Visible stops in video order. */
  stops: ResolvedStop[];
  /**
   * Overview camera: the fit camera (z = z_ov), unless the pins or pin labels
   * would run under the title, in which case it is moved down (and zoomed out
   * when needed) to clear it. Stamp cameras and the grid always use the fit z_ov.
   */
  ovCam: Cam;
  /** Stop ("stamp") camera per visible stop: z = stampZoom * z_ov, pin at `layout.stopPin`. */
  stampCams: Cam[];
  /**
   * Finale end camera: the fit camera's centre, z = finaleZoom * z_ov, unless
   * the pins or pin labels would run under the finale stats, in which case it
   * is moved down (and zoomed out when needed) to clear them.
   */
  finaleEndCam: Cam;
  /** Frame counts shared by all segments. */
  frames: {
    /** Title fade-in frames. */
    titleFade: number;
    /** Card delay frames after a stop segment starts. */
    cardDelay: number;
    /** Card fade/slide-in frames. */
    cardFade: number;
  };
  /** Segments in order and the total length. */
  timeline: {
    /** Segments in playback order (contiguous: each `start` = previous `start + n`). */
    segments: TimelineSegment[];
    /** Total frames = sum of segment lengths. */
    totalFrames: number;
  };
  /** Graticule steps. */
  grid: {
    /** Step in degrees at the overview zoom. */
    baseStep: number;
    /** Major (labelled) step in degrees; a multiple of baseStep, kept after halving. */
    majorStep: number;
    /** Absolute z thresholds (px/deg, ascending): the step is `baseStep / 2^(count of thresholds <= z)`. Default one entry: 1.8 * z_ov. */
    splits: number[];
  };
  /** Resolved overview text (tokens replaced, case applied). */
  text: {
    /** Title as drawn. */
    title: string;
    /** Subtitle as drawn. */
    subtitle: string;
    /** Title size in Du (`layout.title.size`, shrunk when the title would pass the right margin). */
    titleSize: number;
    /** Subtitle size in Du (`layout.title.subSize`, shrunk likewise). */
    subSize: number;
    /** Description as drawn ('' = none). */
    description: string;
    /** Overview description size in Du (`layout.title.descSize`, shrunk likewise). */
    descSize: number;
    /**
     * Finale copy of the description (`text.descriptionAt` = `introAndFinale`,
     * the finale on, a description set), else null. Left edge at
     * `layout.stats.x`, top `FINALE_DESC_GAP_DU` below the lowest stats
     * baseline (at `layout.stats.y` when no stat is drawn), so it never meets
     * the stats; size shrunk to end `RIGHT_MARGIN_DU` before the right edge.
     */
    descFinale: {
      /** Left edge in Du. */
      x: number;
      /** Top (PIL ascender anchor) in Du. */
      y: number;
      /** Size in Du. */
      size: number;
    } | null;
  };
  /** Resolved finale stats, in order (items without data are omitted). */
  stats: {
    /** Number as drawn ("7", "2,340"). */
    value: string;
    /** Label as drawn. */
    label: string;
  }[];
  /** Fonts to use in `ctx.font` (`${px}px ${family}`). */
  fonts: {
    /** Display family (titles, city, stats), already quoted for `ctx.font` when needed. */
    display: string;
    /** Body family (subtitle, kicker, event, dates, lines, grid labels), already quoted. */
    body: string;
    /**
     * Font identity per role (`bundled:<file>`, `local:<localId>` or
     * `family:<name>`); part of every cached text-width key.
     */
    identity: { display: string; body: string };
    /**
     * Baseline offset below the PIL "la" anchor, in em, per role: alphabetic
     * baseline = anchor y + anchorEm * size. Bundled fonts use the original's
     * Bahnschrift ascender (`BundledFont.anchorEm`); other fonts
     * `measured cap height + ORIGINAL_CAP_TOP_EM`.
     */
    anchorEm: { display: number; body: number };
    /** Size multiplier per role (`fonts.*.sizeAdjust`). */
    sizeAdjust: { display: number; body: number };
    /** Horizontal text scale per role (`fonts.*.widthAdjust`); measured widths scale with it. */
    widthAdjust: { display: number; body: number };
  };
  /**
   * Per-compile memo for draw-time resources (scratch surfaces, measured
   * widths), keyed by the draw modules. Never read by `sceneAt`; safe to discard.
   */
  cache: Map<string, unknown>;
  /** Layout problems found while compiling (texts that overflow even at their smallest size). */
  warnings: CompileWarning[];
}
