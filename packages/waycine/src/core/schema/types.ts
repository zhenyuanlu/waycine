/**
 * The Waycine project format, schema version 1 (`*.waycine.json`).
 *
 * Units used in the JSDoc below:
 * - **Du** (design unit) = `min(W, H) / 1080` output px, so 1 Du is one output
 *   pixel at 1080p. All geometry is in Du unless stated otherwise.
 * - **s** seconds. Durations become frames once, in `compile`:
 *   `frames = max(1, round(sec * fps))`; phase splits inside a segment use `floor`.
 * - **frac** a unitless fraction (of a segment's frames, of a phase, of the frame size...).
 * - **deg** degrees of longitude, or degrees of Mercator y ("mercY",
 *   `y = degrees(ln(tan(pi/4 + lat/2)))`).
 * - **alpha** 0..1 opacity. Defaults that came from 8-bit alphas are stored as
 *   exact fractions (`120 / 255`).
 *
 * Text fields are never trimmed or collapsed: double spaces are meaningful.
 */

/** Current project-file schema version. */
export const SCHEMA_VERSION = 1;

/** Most stops a project may hold. */
export const MAX_STOPS = 99;
/** Latitude limit of the Web Mercator projection used by the engine, in degrees. */
export const MAX_LAT = 85.05;

/** Result medal kinds. `ring` is an outline medal (the original's "qual"); `none` draws no medal. */
export const MEDALS = ['gold', 'silver', 'bronze', 'ring', 'none'] as const;
/** A result medal kind. */
export type Medal = (typeof MEDALS)[number];

/** Layout profiles. `landscape` ports the original's 16:9 scene, `portrait` its 9:16 scene; `square` is new. */
export const PROFILE_IDS = ['landscape', 'portrait', 'square'] as const;
/** A layout profile id. */
export type ProfileId = (typeof PROFILE_IDS)[number];

/** Easing curves. `inOutSine` is the original `ease_in_out`, `outCubic` the original `ease_out`. Inputs are clamped to [0, 1]. */
export const EASINGS = ['inOutSine', 'outCubic', 'inOutCubic', 'linear'] as const;
/** An easing curve name. */
export type Easing = (typeof EASINGS)[number];

/** Stop-to-stop transitions. `zoomThrough` zooms into the pin and flashes (the original); `fly` has no zoom phase. */
export const TRANSITION_MODES = ['zoomThrough', 'fly'] as const;
/** A transition mode. */
export type TransitionMode = (typeof TRANSITION_MODES)[number];

/**
 * What a zoom-through flashes into: `color` blends toward `theme.flash` (the
 * original, white by default); `background` blends toward `theme.background`
 * ("dip to dark"), so it follows the background when that changes.
 */
export const FLASH_TARGETS = ['color', 'background'] as const;
/** A zoom-through flash target. */
export type FlashTarget = (typeof FLASH_TARGETS)[number];

/** Where the description line shows: under the intro title only, or also in the finale. */
export const DESCRIPTION_PLACES = ['intro', 'introAndFinale'] as const;
/** A description placement. */
export type DescriptionPlace = (typeof DESCRIPTION_PLACES)[number];

/** Camera zoom interpolation during flights: `linear` in z (the original) or `log` (geometric). */
export const ZOOM_INTERPS = ['linear', 'log'] as const;
/** A zoom interpolation mode. */
export type ZoomInterp = (typeof ZOOM_INTERPS)[number];

/** Side of travel the route arcs bulge to. `right` is the original; `alternate` flips every leg. */
export const BULGE_SIDES = ['right', 'left', 'alternate'] as const;
/** A bulge side. */
export type BulgeSide = (typeof BULGE_SIDES)[number];

/** Graticule step selection: `auto` (ladder) or `fixed` (`graticule.fixedStep`). */
export const STEP_MODES = ['auto', 'fixed'] as const;
/** A graticule step mode. */
export type StepMode = (typeof STEP_MODES)[number];

/** Graticule label format: `plain` ("72W", "41N") or `degree` (adds a degree sign before the hemisphere letter). */
export const LABEL_FORMATS = ['plain', 'degree'] as const;
/** A graticule label format. */
export type LabelFormat = (typeof LABEL_FORMATS)[number];

/** Output aspect ratios. `custom` uses `output.width` / `output.height`. */
export const ASPECTS = ['16:9', '9:16', '1:1', '4:5', 'custom'] as const;
/** An output aspect ratio. */
export type Aspect = (typeof ASPECTS)[number];

/** Output short-side sizes in px. */
export const SHORT_SIDES = [720, 1080, 1440, 2160] as const;
/** An output short-side size (px). */
export type ShortSide = (typeof SHORT_SIDES)[number];

/**
 * Output frame rates (frames per second). NTSC rates (23.976, 29.97, 59.94)
 * are exact rationals `n * 1000 / 1001` (for example 29.97 = 30000/1001).
 */
export const FPS_VALUES = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60] as const;
/** An output frame rate (fps). */
export type Fps = (typeof FPS_VALUES)[number];

/** Supersampling factors (render at k x size, then downscale). */
export const SUPERSAMPLES = [1, 2] as const;
/** A supersampling factor. */
export type Supersample = (typeof SUPERSAMPLES)[number];

/** Layout profile choice: `auto` picks by aspect (> 1.2 landscape, < 0.83 portrait, else square). */
export const LAYOUT_CHOICES = ['auto', ...PROFILE_IDS] as const;
/** A layout profile choice. */
export type LayoutChoice = (typeof LAYOUT_CHOICES)[number];

/** Encoder quality presets (bits per pixel 0.13 / 0.20 / 0.32; 8 / 12 / 20 Mbps at 1080p29.97). */
export const QUALITIES = ['standard', 'high', 'max'] as const;
/** An encoder quality preset. */
export type Quality = (typeof QUALITIES)[number];

/**
 * Export modes. `single`: one continuous file (adds the overview outro fade,
 * the post-flash recovery fade, and stop 1 flies from the overview's end
 * camera). `segments`: the original separate pieces, reproduced exactly.
 */
export const EXPORT_MODES = ['single', 'segments'] as const;
/** An export mode. */
export type ExportMode = (typeof EXPORT_MODES)[number];

/** Finale stat sources. `custom` shows `value` verbatim. */
export const STAT_SOURCES = [
  'stops',
  'regions',
  'countries',
  'months',
  'days',
  'km',
  'mi',
  'custom',
] as const;
/** A finale stat source. */
export type StatSource = (typeof STAT_SOURCES)[number];

/** Font sources: the vendored OFL fonts, or a font the user uploaded on this device. */
export const FONT_SOURCES = ['bundled', 'local'] as const;
/** A font source. */
export type FontSource = (typeof FONT_SOURCES)[number];

/** Card placement: right of the pin (landscape) or below the pin, x from the left edge (portrait, square). */
export const CARD_PLACEMENTS = ['rightOfPin', 'belowPin'] as const;
/** A card placement. */
export type CardPlacement = (typeof CARD_PLACEMENTS)[number];

/** Card leader line shape. */
export const LEADER_KINDS = ['diagonal', 'vertical'] as const;
/** A leader line shape. */
export type LeaderKind = (typeof LEADER_KINDS)[number];

/** Card result rows: all on one line (`inline`, landscape) or one per line (`stacked`). */
export const RESULT_LAYOUTS = ['inline', 'stacked'] as const;
/** A result-row layout. */
export type ResultLayout = (typeof RESULT_LAYOUTS)[number];

/**
 * Pin-label draw order. `perPin`: each pin's label right after that pin, so
 * later pins cover earlier labels (the original's landscape scene).
 * `afterPins`: all pins, then all labels (its portrait scene).
 */
export const PIN_LABEL_ORDERS = ['perPin', 'afterPins'] as const;
/** A pin-label draw order. */
export type PinLabelOrder = (typeof PIN_LABEL_ORDERS)[number];

/**
 * Where pin labels sit. `auto`: each label takes the place around its pin
 * (beside, above, below or diagonal) that best clears the route, the other
 * pins and labels, the title and the stats. `fixed`: always beside the pin,
 * on the side the layout's flip rule gives (the original).
 */
export const PIN_LABEL_PLACEMENTS = ['auto', 'fixed'] as const;
/** A pin-label placement mode. */
export type PinLabelPlacement = (typeof PIN_LABEL_PLACEMENTS)[number];

/** Finale stats arrangement. */
export const STATS_DIRECTIONS = ['row', 'column'] as const;
/** A finale stats arrangement. */
export type StatsDirection = (typeof STATS_DIRECTIONS)[number];

/** A colour, always `#RRGGBB` (upper-case hex) after validation. */
export type Hex = string;
/** A pair of numbers `[x, y]`. */
export type Vec2 = [number, number];

// ---------------------------------------------------------------------------
// Stops

/** One result line on a stop card, plus the medal dots on its pin label. */
export interface StopResult {
  /** Medal drawn before the text (card) and as dots on the pin label. */
  medal: Medal;
  /** Result text, drawn verbatim (whitespace preserved, for example `"500M  2ND  (MIXED)"`). */
  text: string;
  /** Number of medal dots on the pin label, 1..5. Default 1. */
  count?: number;
}

/** One stop of the journey. Array order is video order. */
export interface Stop {
  /** Stable id, unique within the project (UI keys, share links). Generated as `stop-N` when missing. */
  id: string;
  /** Place name as typed; rendered upper-case when `text.uppercase` is on. */
  city: string;
  /** Latitude in degrees, clamped to +-85.05. */
  lat: number;
  /** Longitude in degrees, normalized to (-180, 180]. `compile` unwraps it across the antimeridian. */
  lon: number;
  /** Event name (card line under the city). */
  event?: string;
  /** Start date, ISO `YYYY-MM-DD`. */
  date?: string;
  /** Optional end date, ISO `YYYY-MM-DD` (renders as a range). */
  endDate?: string;
  /** Free text that replaces the formatted date on the card and the pin label. */
  dateText?: string;
  /** Extra card line (credit or partner), drawn verbatim. */
  partner?: string;
  /** Region name or code as displayed (state, province...). */
  region?: string;
  /**
   * Normalized region key used to count distinct regions, ISO 3166-2 style
   * (`US-MA`; case and surrounding spaces are ignored). Falls back to
   * `country-region` (`US` + `MA` -> `US-MA`), then to `region`.
   */
  regionCode?: string;
  /** Country, ISO 3166-1 alpha-2 (`US`). */
  country?: string;
  /** Results shown on the card (and as medal dots on the pin label). */
  results?: StopResult[];
  /** Per-stop segment length override in s (replaces `timing.stopSec`). */
  durationSec?: number;
  /** Hidden stops are skipped entirely (no pin, route leg, card or stat). */
  hidden?: boolean;
}

// ---------------------------------------------------------------------------
// Text

/**
 * Text templates. Templates only replace tokens; nothing is evaluated.
 *
 * Token grammar: `{key}`, `{key:0W}` or `{key|ONE|MANY}`.
 * - Keys: `n` (1-based stop number; kicker only), `total` (visible stops),
 *   `stops`, `regions`, `countries`, `months`, `days`, `km`, `mi`
 *   (the finale-stat values, see `StatSource`), `year` (year of the first dated stop).
 * - `{key}` renders the number with `Intl.NumberFormat('en-US')` (so 2340 -> "2,340").
 * - `{key:0W}` zero-pads the integer to W digits (`{n:02}` -> "03"); no grouping.
 * - `{key|ONE|MANY}` renders the number, one space, then `ONE` when the value
 *   is exactly 1, else `MANY` (`{stops|RACE|RACES}` -> "7 RACES", "1 RACE").
 * - A known key without data (no stop names a country, no stop has a date)
 *   is left out of the drawn text together with one neighbouring separator
 *   ("/", "|" or ","), and validation warns about it (`token-no-data`).
 * - Unknown keys and malformed tokens stay literal.
 */
export interface TextSettings {
  /** Overview title. Engine default `"MY JOURNEY"`. */
  title: string;
  /** Overview subtitle (tokens allowed). Engine default `"{stops|STOP|STOPS}  /  {km} KM"`. */
  subtitle: string;
  /**
   * Optional third overview line under the subtitle (tokens allowed), drawn in
   * the body font and `theme.text`. Default `""` (not drawn).
   */
  description: string;
  /**
   * Where the description shows: `intro` (under the subtitle, fading with the
   * title) or `introAndFinale` (also in the finale, below the stats, fading in
   * after them). Default `intro`.
   */
  descriptionAt: DescriptionPlace;
  /** Card kicker per stop (tokens allowed). Engine default `"STOP {n:02} / {total:02}"`. */
  kicker: string;
  /** Card date format: `YYYY`, `MM`, `DD`, `M`, `D`, `MMM` (JAN..DEC) are replaced. Default `"YYYY.MM.DD"`. */
  cardDate: string;
  /** Pin-label date format (same tokens). Default `"MM.DD"`; an empty string hides pin dates. */
  pinDate: string;
  /** Separator between the formatted `date` and `endDate` of a range. Default `" - "`. */
  rangeSeparator: string;
  /** Joins the dates of merged duplicate-location pins on one label. Default `" / "`. */
  pinDateJoin: string;
  /**
   * Render project text upper-case (stored text stays as typed): title,
   * subtitle, kicker, cities, events, partner lines, date text and stat labels.
   * Result lines are always drawn verbatim ("1ST x2"). Default true.
   */
  uppercase: boolean;
  /**
   * Solid text: every text is drawn opaque, ignoring text alphas and fade-ins,
   * as the original did (its imaging library ignores the alpha of text drawn
   * on an RGB frame). The title shows from the first overview frame, card text
   * slides in opaque while its bar, leader and medals fade, finale stats pop
   * in, and grid, pin-label, event and card-line alphas count as 1. Shapes keep
   * their alphas; the single-mode overview outro and the fly-mode card fade-out
   * still fade text. Default false (text fades); the `race-season` preset sets true.
   */
  solid: boolean;
}

// ---------------------------------------------------------------------------
// Theme and fonts

/** Medal colours. */
export interface MedalColors {
  /** Default `#E8C15A`. */
  gold: Hex;
  /** Default `#CFD4DC`. */
  silver: Hex;
  /** Default `#CD8C5C`. */
  bronze: Hex;
  /** Outline medal; built-in themes set it to their accent. Default `#B35AC7`. */
  ring: Hex;
}

/** Colours. Defaults are the Orchid theme (the original's colours). */
export interface Theme {
  /** Built-in theme id this palette came from (`orchid`, ...), or `custom`. */
  id: string;
  /** Frame background. Default `#07070B`. */
  background: Hex;
  /** Graticule lines and labels, HUD corners. Default `#FFFFFF`. */
  grid: Hex;
  /** Route core stroke. Default `#C77DDB`. */
  route: Hex;
  /** Route glow. Default `#660874`. */
  glow: Hex;
  /** Pin halo and pulse rings. Default `#B35AC7`. */
  pin: Hex;
  /** Pin core disc. Default `#FFFFFF`. */
  pinCore: Hex;
  /** Titles, card city/event/partner/results, stats numbers, pin-label city. Default `#FFFFFF`. */
  text: Hex;
  /** Subtitle, card kicker/date/bar, stats labels, pin-label date. Default `#B35AC7`. */
  accent: Hex;
  /** Zoom-through flash target and recovery colour when `timing.transition.flashTo` is `color`. Default `#FFFFFF`. */
  flash: Hex;
  /** Medal colours (same in every built-in theme except `ring`). */
  medals: MedalColors;
}

/** One font role. */
export interface FontRef {
  /**
   * CSS family used in `ctx.font`. Bundled fonts register under alias families
   * `WaycineDisplay` (Barlow Condensed Bold) and `WaycineBody` (Barlow Semi
   * Condensed SemiBold).
   */
  family: string;
  /** Nominal weight of the face (700 display, 600 body); informational for bundled fonts. */
  weight: number;
  /** `bundled` (vendored TTF) or `local` (uploaded on this device; missing elsewhere -> fallback warning). */
  source: FontSource;
  /** Multiplier on every size drawn with this role (metric calibration). Default 1. */
  sizeAdjust: number;
  /**
   * Horizontal scale of every text drawn with this role, about each text's
   * left edge; measured widths (auto-fit, inline results, medal dots, flipped
   * labels, stats) scale with it, heights do not. Width calibration for a
   * substitute font. Default 1.
   */
  widthAdjust: number;
  /** IndexedDB key of the uploaded font file when `source` is `local`. */
  localId?: string;
}

/** Font roles. Display = the original's Bahnschrift "Bold Condensed"; body = "SemiBold". */
export interface Fonts {
  /** Titles, card city, pin-label city, stats numbers and labels. */
  display: FontRef;
  /** Subtitle, kicker, event, dates, card lines, graticule labels. */
  body: FontRef;
}

// ---------------------------------------------------------------------------
// Timing

/** Overview segment (route draws through all pins). */
export interface OverviewTiming {
  /** Include the overview segment. Default true. */
  enabled: boolean;
  /** Fraction of the segment by which the route reaches the last pin. Default 0.7. */
  routeEndFrac: number;
  /** Camera push-in over the segment: `z = z_ov * (1 + pushIn * u)`. Default 0.05. */
  pushIn: number;
  /** Title fade-in duration in s. Default 8 frames at 30000/1001 (0.26693 s). */
  titleFadeSec: number;
  /** A pin pulses while `0 <= upto - i < pulseWindow` (pins). Default 0.8. */
  pulseWindow: number;
  /** Pulse progress per pin of route travel: `u = (upto - i) * pulseRate`. Default 1.4. */
  pulseRate: number;
  /**
   * Single mode only: fade title, route, pins and pin labels to 0 over the last
   * `outroSec` of the overview so stop 1 does not pop. Default 8 frames (0.26693 s).
   */
  outroSec: number;
}

/** Stop segments (fly in, hold with card, zoom through). */
export interface StopTiming {
  /** Fly phase length: `nFly = floor(flyFrac * n)`. Default 0.42. */
  flyFrac: number;
  /** Zoom-through phase length: `nZoom = floor(zoomFrac * n)` (0 in `fly` mode). Default 0.22. */
  zoomFrac: number;
  /** The pin lights and its pulse starts at `k >= pinLightAt * nFly`. Default 0.8. */
  pinLightAt: number;
  /** Pulse duration as a fraction of the segment: `u = (k - pinLightAt * nFly) / (pulseDurFrac * n)`. Default 0.45. */
  pulseDurFrac: number;
  /** Card appears after this delay in s. Default 3 frames (0.1001 s). */
  labelDelaySec: number;
  /** Card fade/slide-in duration in s: `u = (k - delay) / fade`. Default 6 frames (0.2002 s). */
  labelFadeSec: number;
  /** `fly` mode only: card fade-out at the end of each stop, in s. Default 6 frames (0.2002 s). */
  cardFadeOutSec: number;
}

/** Transition between stops. */
export interface TransitionTiming {
  /** `zoomThrough` (default) or `fly`. */
  mode: TransitionMode;
  /** Zoom-through zoom factor: `zf = 1 + zoomGain * v^zoomExp`. Default 7. */
  zoomGain: number;
  /** Zoom-through exponent. Default 2.2. */
  zoomExp: number;
  /** Zoom-through blur sigma at v = 1, in Du: `blur = blurMax * v^blurExp`. Default 6. */
  blurMax: number;
  /** Zoom-through blur exponent. Default 2. */
  blurExp: number;
  /** Flash starts at this v: `flash = max(0, (v - whiteStart) / (1 - whiteStart))^whiteExp`. Default 0.55. */
  whiteStart: number;
  /** Flash exponent. Default 1.5. */
  whiteExp: number;
  /** Single mode only: fade back from the flash colour after a zoom-through, in s. Default 6 frames (0.2002 s). */
  recoverSec: number;
  /**
   * Colour the zoom-through blends into and the recovery fades back from:
   * `color` = `theme.flash` (default), `background` = `theme.background`.
   */
  flashTo: FlashTarget;
}

/** Finale segment (pull back to the whole route plus stats). */
export interface FinaleTiming {
  /** Include the finale. When false in zoomThrough mode the last stop skips its zoom-to-flash. Default true. */
  enabled: boolean;
  /** Camera arrives at this fraction of the segment. Default 0.55. */
  cameraEndFrac: number;
  /** Pulses start after `k > pulseStart * n`. Default 0.3. */
  pulseStart: number;
  /** Pulse duration fraction: `u = (k - pulseStart * n) / (pulseDur * n) - pulseStagger * i`. Default 0.5. */
  pulseDur: number;
  /** Per-pin pulse delay (in pulse u). Default 0.06. */
  pulseStagger: number;
  /** Pin labels show once the eased camera u exceeds this. Default 0.6. */
  pinLabelsAfter: number;
  /** Stats start at this fraction: `u = (k - statsStart * n) / (statsDur * n)`. Default 0.35. */
  statsStart: number;
  /** Stats duration fraction. Default 0.3. */
  statsDur: number;
  /** Stats item alpha: `ease(u * statsRate - j * statsStagger)`. Default 2.2. */
  statsRate: number;
  /** Stats per-item delay. Default 0.35. */
  statsStagger: number;
}

/** All timing. Segment defaults are 80 / 40 / 80 frames at 30000/1001 fps (440 frames for 7 stops). */
export interface Timing {
  /** Overview length in s. Default 80 frames (2.66933 s). */
  overviewSec: number;
  /** Stop segment length in s (per-stop `durationSec` overrides). Default 40 frames (1.33467 s). */
  stopSec: number;
  /** Finale length in s. Default 80 frames (2.66933 s). */
  finaleSec: number;
  /** Static hold of the last frame, in s; 0 = none. Default 0. */
  endHoldSec: number;
  /** Overview segment. */
  overview: OverviewTiming;
  /** Stop segments. */
  stop: StopTiming;
  /** Stop-to-stop transition. */
  transition: TransitionTiming;
  /** Finale segment. */
  finale: FinaleTiming;
}

// ---------------------------------------------------------------------------
// Camera, route, pins

/** Camera behaviour. A camera is (lon, mercY, z = output px per degree). */
export interface CameraSettings {
  /** Stop camera zoom relative to the overview fit: `z_s = stampZoom * z_ov`. Default 2.3. */
  stampZoom: number;
  /** Mid-flight zoom-out: `z *= 1 - flyZoomOut * sin(pi * u)`. Default 0.25. */
  flyZoomOut: number;
  /** Finale end zoom relative to the fit: `z = finaleZoom * z_ov`. Default 0.92. */
  finaleZoom: number;
  /** Minimum fitted span in deg on each axis (single stop, collinear or city-scale trips). Default 0.02. */
  minSpanDeg: number;
  /** Camera moves, zoom-through centring and the overview route draw. Default `inOutSine`. */
  flyEasing: Easing;
  /** Fades, card slide, ring growth, stats items. Default `outCubic`. */
  fadeEasing: Easing;
  /** z interpolation during flights and the finale. Default `linear`. */
  zoomInterp: ZoomInterp;
}

/** The route line. */
export interface RouteSettings {
  /** Draw the route (glow and core). Default true. */
  show: boolean;
  /** Core stroke width in Du. Default 3. */
  coreWidth: number;
  /** Glow stroke width in Du, before blurring. Default 16. */
  glowWidth: number;
  /** Glow blur sigma in Du (Pillow GaussianBlur radius). Default 10. */
  glowBlur: number;
  /** Glow opacity multiplier, 0..1. Default 1. */
  glowOpacity: number;
  /** Arc bulge: control point `m + bulge * (-dy, dx)` of each leg. Default 0.22. */
  bulge: number;
  /** Side of travel the arcs bulge to. Default `right`. */
  bulgeSide: BulgeSide;
  /** Samples per leg (quadratic Bezier). Default 24. */
  samples: number;
}

/** Pin labels (city + date + medal dots next to each pin). */
export interface PinLabelSettings {
  /** Draw pin labels where the segment allows them. Default true. */
  show: boolean;
  /** Placement mode. Default `auto`; `fixed` is the original's. */
  placement: PinLabelPlacement;
  /** Label x offset from the pin, in Du (mirrored when flipped). Default 18. */
  dx: number;
  /** City text top (PIL ascender anchor) relative to the pin, in Du. Default -30. */
  cityDy: number;
  /** Date text top relative to the pin, in Du. Default -4. */
  dateDy: number;
  /** City size in Du (display font). Default 24. */
  citySize: number;
  /** City tracking in Du per glyph. Default 1. */
  cityTracking: number;
  /** Date size in Du (body font, no tracking). Default 20. */
  dateSize: number;
  /** City and date alpha. Default 230/255. */
  alpha: number;
  /** First medal centre = label x + date width + medalGap, in Du. Default 14. */
  medalGap: number;
  /** Medal dot radius in Du. Default 7. */
  medalR: number;
  /** Distance between medal dot centres in Du. Default 17. */
  medalStep: number;
  /** Medal dot centre y relative to the pin, in Du. Default 8. */
  medalDy: number;
  /** Medal dot alpha. Default 235/255. */
  medalAlpha: number;
}

/** Pins, pulse rings and medals. */
export interface PinSettings {
  /** Pin core radius in Du. Default 9. */
  radius: number;
  /** Halo radius beyond the core, in Du. Default 4. */
  haloPad: number;
  /** Halo alpha. Default 120/255. */
  haloAlpha: number;
  /** Pulse ring offsets in pulse u: ring k is drawn with `v = u - rings[k]` while 0 <= v <= 1. Default [0, 0.35]. */
  rings: number[];
  /** Ring radius at v = 0, in Du: `r = ringStart + ringGrow * ease(v)`. Default 10. */
  ringStart: number;
  /** Ring growth in Du. Default 60. */
  ringGrow: number;
  /** Ring stroke width in Du (PIL outlines grow inward: stroke at `r - w/2`). Default 3. */
  ringWidth: number;
  /** Ring alpha at v = 0 (fades linearly to 0 at v = 1). Default 230/255. */
  ringAlpha: number;
  /** Medal shine ellipse alpha factor (times the medal alpha). Default 0.35. */
  medalShine: number;
  /** `ring` medal outline width as a fraction of its radius. Default 0.35. */
  ringMedalWidth: number;
  /** Pin labels. */
  label: PinLabelSettings;
}

// ---------------------------------------------------------------------------
// Card

/**
 * One text slot of the stop card. Positions are relative to the card origin
 * `(lx, ly)`, and y is the PIL ascender anchor (top of the ascent line), not the baseline.
 */
export interface TextSlot {
  /** x offset from the card origin, in Du. */
  dx: number;
  /** y offset from the card origin, in Du. */
  dy: number;
  /** Font size in Du. */
  size: number;
  /** Tracking in Du added after every grapheme (0 draws the string whole). */
  tracking: number;
  /** Alpha multiplier (times the card alpha). */
  alpha: number;
}

/** A text slot that shrinks when the text overflows. */
export interface FitTextSlot extends TextSlot {
  /** Smallest size in Du the auto-fit may reach. */
  minSize: number;
  /** Size decrement per auto-fit step, in Du. */
  shrinkStep: number;
  /**
   * Auto-fit width limit in Du. Values <= 0 are relative to the frame width
   * (`-170` means W - 170 Du); positive values are an absolute width. The text
   * shrinks while its measured width exceeds the limit and size > minSize.
   */
  fitMaxW: number;
  /** Measure with tracking (`width + tracking * code points`) when fitting. City false, event true (as the original). */
  measureTracking: boolean;
}

/** Partner and result line metrics. */
export interface CardLineSettings {
  /** x of partner and result rows from the card origin, in Du. Default 12. */
  dx: number;
  /** Font size in Du (body font). Default 27. */
  size: number;
  /** Tracking in Du. Default 2. */
  tracking: number;
  /** Alpha multiplier. Default 0.9. */
  alpha: number;
  /** Line height of partner lines, in Du. Default 34. */
  partnerLineH: number;
  /** Line height of stacked result rows, in Du. Default 36. */
  resultRowH: number;
  /** Result medal radius in Du. Default 10. */
  medalR: number;
  /** Medal centre x from the row start, in Du. Default 10. */
  medalDx: number;
  /** Medal centre y from the row top, in Du. Default 15. */
  medalDy: number;
  /** Result text x from the row start, in Du. Default 26. */
  textDx: number;
  /** Inline results: next row start = text x + width + tracking * length + inlineGap (Du). Default 26. */
  inlineGap: number;
}

/** Card accent bar height: `base + (partner ? layout barPartner : 0) + results term`, in Du. */
export interface CardBarSettings {
  /** Base height in Du. Default 236. */
  base: number;
  /** Height per result (once, or per row when the layout says `resultsBarPerRow`), in Du. Default 36. */
  perResult: number;
}

/** The per-stop card (kicker, city, event, date, partner, results). */
export interface CardSettings {
  /** Draw cards. Default true. */
  show: boolean;
  /** Show the kicker line. Default true. */
  showKicker: boolean;
  /** Show the event line. Default true. */
  showEvent: boolean;
  /** Show the date line. Default true. */
  showDate: boolean;
  /** Show the partner line(s). Default true. */
  showPartner: boolean;
  /** Show result rows. Default true. */
  showResults: boolean;
  /** Slide-in distance in Du: `x += (1 - ease(u)) * slide`. Default 40. */
  slide: number;
  /**
   * Opacity 0..1 of the soft backdrop in the background colour that dims the
   * route and the grid under the card, so no line runs through its text.
   * Default 0.85; 0 draws none (the original).
   */
  backdrop: number;
  /** Leader line alpha multiplier. Default 0.6. */
  leaderAlpha: number;
  /** Leader line width in Du. Default 2. */
  leaderWidth: number;
  /** Accent bar width in Du. Default 6. */
  barWidth: number;
  /** Accent bar left edge from the card origin, in Du. Default -12. */
  barDx: number;
  /** Kicker slot (body font, accent colour). Default {12, -4, 26, 3, 1}. */
  kicker: TextSlot;
  /** City slot (display font). Default {8, 30, 118, 2, 1}, min 60, step 6, fit W-170, measured without tracking. */
  city: FitTextSlot;
  /** Event slot (body font). Default {12, 162, 30, 2, 0.92}, min 20, step 2, fit W-180, measured with tracking. */
  event: FitTextSlot;
  /** Date slot (body font, accent colour). Default {12, 202, 24, 2, 1}. */
  date: TextSlot;
  /** Partner/result rows start at card origin y + rowsY, in Du. Default 244. */
  rowsY: number;
  /** Partner and result line metrics. */
  line: CardLineSettings;
  /** Accent bar height. */
  bar: CardBarSettings;
}

// ---------------------------------------------------------------------------
// Stats, graticule, HUD

/** One finale stat. */
export interface StatItem {
  /** Where the number comes from. */
  source: StatSource;
  /** Label drawn after the number (for example `"RACES"`). */
  label: string;
  /** Label used when the value is exactly 1 (for example `"RACE"`); falls back to `label`. */
  labelOne?: string;
  /** Overrides the computed value; required for `custom`. Drawn verbatim. */
  value?: string;
}

/** Finale stats. */
export interface StatsSettings {
  /** Draw the stats. Default true. */
  show: boolean;
  /** Label size in Du (display font). Default 52. */
  labelSize: number;
  /** Label tracking in Du. Default 2. */
  labelTracking: number;
  /** Items in order. Row layouts wrap when a row overflows. */
  items: StatItem[];
}

/** Latitude/longitude grid. */
export interface GraticuleSettings {
  /** Draw the grid. Default true. */
  show: boolean;
  /** `auto` ladder or `fixed` step. Default `auto`. */
  stepMode: StepMode;
  /** Step in deg for `fixed` mode. Default 0.25. */
  fixedStep: number;
  /** `auto`: pick the ladder step whose spacing at the overview zoom is closest to this, in Du. Default 63. */
  targetSpacing: number;
  /** Halve the step once z >= zoomSplit * z_ov. Default 1.8. */
  zoomSplit: number;
  /** Maximum number of halvings, a whole number 0..4. Default 1. */
  maxSubdiv: number;
  /** Line width in Du. Default 1. */
  lineWidth: number;
  /** Minor line alpha. Default 12/255. */
  minorAlpha: number;
  /** Major line alpha. Default 34/255. */
  majorAlpha: number;
  /** Label major lines. Default true. */
  labels: boolean;
  /**
   * Leave out a grid label that would touch a corner mark or another grid
   * label. Default true; false draws every label (the original).
   */
  clearLabels: boolean;
  /** Label size in Du (body font). Default 18. */
  labelSize: number;
  /** Label alpha. Default 90/255. */
  labelAlpha: number;
  /** Longitude label position: [dx from the line, y top from the frame top], in Du. Default [5, 18]. */
  lonLabelOffset: Vec2;
  /** Latitude label position: [x from the frame left, dy top from the line], in Du. Default [18, 4]. */
  latLabelOffset: Vec2;
  /** Label format. Default `plain`. */
  labelFormat: LabelFormat;
}

/** HUD corner brackets. */
export interface HudSettings {
  /** Draw the corner brackets. Default true. */
  corners: boolean;
  /** Bracket arm length in Du. Default 40. */
  cornerLen: number;
  /** Bracket inset from the frame edges in Du. Default 28. */
  cornerMargin: number;
  /** Bracket stroke width in Du. Default 2. */
  cornerWidth: number;
  /** Bracket alpha. Default 120/255. */
  cornerAlpha: number;
}

// ---------------------------------------------------------------------------
// Output

/** Output video settings. */
export interface OutputSettings {
  /** Aspect ratio. Default `16:9`. */
  aspect: Aspect;
  /** Short side in px for preset aspects. Default 1080. */
  shortSide: ShortSide;
  /** `custom` aspect width in px: even, 320..4096. */
  width?: number;
  /** `custom` aspect height in px: even, 320..4096. */
  height?: number;
  /** Frames per second. Default 29.97 (muxed as 30000/1001). */
  fps: Fps;
  /**
   * Supersampling factor: 2 draws each frame at twice the width and height
   * and averages 2x2 pixels; allowed only while the doubled frame has at most
   * 4096 x 4096 (16.7 M) pixels, otherwise the render falls back to 1.
   * Default 1.
   */
  supersample: Supersample;
  /** Layout profile, or `auto` by aspect. Default `auto`. */
  layout: LayoutChoice;
  /** Encoder quality preset. Default `high`. */
  quality: Quality;
  /** Explicit bitrate in Mbps; 0 = from `quality`. Default 0. */
  bitrateMbps: number;
  /** One file or separate segment clips. Default `single`. */
  exportMode: ExportMode;
}

// ---------------------------------------------------------------------------
// Layouts (per profile)

/**
 * Overview fit, ported literally from the original:
 * `z_ov = min((W - marginX*S) / max(dlon, minSpan), (H - marginY*S) / max(dy, minSpan))`
 * and centre `(midLon + nudgeLon, midY + nudgeY)`, then shifted so the fitted
 * box centre sits `offsetDu` from the frame centre.
 */
export interface LayoutFit {
  /** Total horizontal margin (left + right) in Du. Landscape 640, portrait 220. */
  marginX: number;
  /** Total vertical margin (top + bottom) in Du. Landscape 380, portrait 900. */
  marginY: number;
  /** Camera-centre nudge in deg `[lon, mercY]` (the original's literal offsets). Landscape [0.25, -0.05], portrait [0, 0.25]. */
  nudgeDeg: Vec2;
  /**
   * Caps each nudge component at this fraction of the fitted span on that axis
   * (`max(span, minSpanDeg)`), so a fixed degree nudge cannot throw a
   * city-scale trip off screen. Inactive for the reference season (the parity
   * fixture). Default 0.1.
   */
  nudgeMaxFrac: number;
  /** Screen offset of the fitted content centre from the frame centre, in Du (x right, y down). Default [0, 0]. */
  offsetDu: Vec2;
}

/** Overview title block. y values are PIL ascender anchors (top of the ascent line). */
export interface LayoutTitle {
  /** Left edge in Du. */
  x: number;
  /** Title top in Du. */
  y: number;
  /** Title size in Du (display font, `theme.text`). */
  size: number;
  /** Title tracking in Du. */
  tracking: number;
  /** Subtitle top in Du. */
  subY: number;
  /** Subtitle size in Du (body font, `theme.accent`). */
  subSize: number;
  /** Subtitle tracking in Du. */
  subTracking: number;
  /** Subtitle alpha multiplier (times the title alpha). */
  subAlpha: number;
  /**
   * Smallest title size in Du. A title wider than the frame allows (it must end
   * 72 Du before the right edge) shrinks by `shrinkStep` down to this size.
   */
  minSize: number;
  /** Smallest subtitle size in Du (same rule as `minSize`). */
  subMinSize: number;
  /** Title, subtitle and description size decrement per auto-fit step, in Du. */
  shrinkStep: number;
  /** Description top in Du (`text.description`; body font, `theme.text`). */
  descY: number;
  /** Description size in Du; the finale copy uses it too. */
  descSize: number;
  /** Description tracking in Du. */
  descTracking: number;
  /** Description alpha multiplier (times the title alpha in the intro, its own fade in the finale). */
  descAlpha: number;
  /** Smallest description size in Du (same rule as `minSize`). */
  descMinSize: number;
}

/** Card placement for this profile. */
export interface LayoutCard {
  /** Where the card sits relative to the pin. */
  placement: CardPlacement;
  /** `rightOfPin`: card origin x from the pin; `belowPin`: from the frame's left edge. In Du (before the slide). */
  x: number;
  /** Card origin y from the pin, in Du. */
  dy: number;
  /** Leader line shape. */
  leader: LeaderKind;
  /** Leader start from the pin centre, in Du. */
  leaderFrom: Vec2;
  /** Leader end: `diagonal` from the card origin (moves with the slide); `vertical` from (pin x, card origin y). In Du. */
  leaderTo: Vec2;
  /** Result rows inline or stacked. */
  results: ResultLayout;
  /** Split the partner line in two (by words) when longer than this many characters; 0 = never. */
  partnerWrapChars: number;
  /** Extra bar height when a partner line exists, in Du (34 landscape, 70 portrait). */
  barPartner: number;
  /** Bar grows per result row (true) or once when any result exists (false). */
  resultsBarPerRow: boolean;
}

/** Pin-label behaviour for this profile. */
export interface LayoutPinLabels {
  /** Draw order of pins and labels. Landscape `perPin`, portrait/square `afterPins`. */
  order: PinLabelOrder;
  /** Flip labels to the left of pins whose x exceeds this fraction of W; null = flip only on overflow. */
  flipAboveX: number | null;
  /** Draw medal dots on pin labels. */
  medals: boolean;
}

/** Finale stats geometry for this profile. y values are PIL ascender anchors. */
export interface LayoutStats {
  /** First item x in Du. */
  x: number;
  /** First item number top in Du. */
  y: number;
  /** Items in a row or a column. */
  direction: StatsDirection;
  /** Distance between item origins in Du (x for rows, y for columns). */
  pitch: number;
  /** Number size in Du (display font). */
  numberSize: number;
  /** Label x from the item origin, in Du. */
  labelDx: number;
  /** Label top from the number top, in Du. */
  labelDy: number;
}

/**
 * Safe-area insets, as fractions of the frame per side. The preview draws all
 * four as a guide; `top` and `bottom` also steer layout (see each).
 */
export interface LayoutSafeArea {
  /**
   * Top inset fraction of H. Also bounds the finale stats column: a column
   * wraps once an item would end below `top * H` px plus 480 Du.
   */
  top: number;
  /** Right inset fraction of W. Preview guide only. */
  right: number;
  /**
   * Bottom inset fraction of H. Also the lowest the overview and finale content
   * may be moved down to clear the title or stats before the zoom is reduced.
   */
  bottom: number;
  /** Left inset fraction of W. Preview guide only. */
  left: number;
}

/** Geometry of one layout profile. */
export interface Layout {
  /** Overview fit. */
  fit: LayoutFit;
  /** Stop camera: the pin sits this offset from the frame centre, in Du `[x right, y down]`. Landscape [-180, -60]. */
  stopPin: Vec2;
  /** Overview title block. */
  title: LayoutTitle;
  /** Stop card placement. */
  card: LayoutCard;
  /** Pin labels. */
  pinLabels: LayoutPinLabels;
  /** Finale stats. */
  stats: LayoutStats;
  /** Safe-area insets (preview guide; top and bottom also bound layout). */
  safeArea: LayoutSafeArea;
}

/** Stored layouts, one per profile (switching aspect keeps each profile's tweaks). */
export type Layouts = Record<ProfileId, Layout>;

// ---------------------------------------------------------------------------
// Project

/** Project metadata. */
export interface ProjectMeta {
  /** Project name; export file names use its slug. Default `"Untitled journey"`. */
  name: string;
}

/** A Waycine project, schema version 1. `validateProject` returns this with every field filled. */
export interface WaycineProject {
  /** Optional JSON-schema URL (`https://zhenyuanlu.github.io/waycine/schema/v1.json`). */
  $schema?: string;
  /** Schema version; always 1 here. */
  version: typeof SCHEMA_VERSION;
  /** Metadata. */
  meta: ProjectMeta;
  /** Stops in video order: at most 99, at least one visible. */
  stops: Stop[];
  /** Text templates and date formats. */
  text: TextSettings;
  /** Colours. */
  theme: Theme;
  /** Fonts. */
  fonts: Fonts;
  /** Timing. */
  timing: Timing;
  /** Camera. */
  camera: CameraSettings;
  /** Route. */
  route: RouteSettings;
  /** Pins and pin labels. */
  pins: PinSettings;
  /** Stop card. */
  card: CardSettings;
  /** Finale stats. */
  stats: StatsSettings;
  /** Map grid. */
  graticule: GraticuleSettings;
  /** HUD corners. */
  hud: HudSettings;
  /** Output video. */
  output: OutputSettings;
  /** Per-profile layout geometry. */
  layouts: Layouts;
}

// ---------------------------------------------------------------------------
// Validation

/** Issue severity. `error`: the project cannot be rendered as is. `warning`: a value was fixed, kept or dropped. */
export type IssueLevel = 'error' | 'warning';

/** Machine-readable issue codes. */
export type IssueCode =
  | 'not-object'
  | 'newer-version'
  | 'bad-version'
  | 'unknown-key'
  | 'wrong-type'
  | 'coerced'
  | 'clamped'
  | 'invalid-enum'
  | 'invalid-color'
  | 'invalid-date'
  | 'invalid-stop'
  | 'missing-city'
  | 'duplicate-id'
  | 'too-many-stops'
  | 'no-stops'
  | 'invalid-stat'
  | 'token-no-data';

/** One validation finding. */
export interface ValidationIssue {
  /** Severity. */
  level: IssueLevel;
  /** Location, dotted with indices: `stops[2].lat`, `theme.route`, `layouts.portrait.fit.marginX`; `''` for the root. */
  path: string;
  /** Machine-readable code. */
  code: IssueCode;
  /** Human-readable English message. */
  message: string;
}

/** Result of `validateProject`. */
export interface ValidationResult {
  /** The repaired project (defaults filled, values clamped; unknown keys kept). */
  project: WaycineProject;
  /** Everything that was fixed, kept or is still wrong. */
  issues: ValidationIssue[];
}
