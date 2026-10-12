import { clearCamera, finaleBoxes, statsBoxes, titleBoxes } from './clearance.js';
import type { Backend, Ctx2D } from './ctx.js';
import { formatDateRange } from './dates.js';
import { BUNDLED_FONTS, ORIGINAL_CAP_TOP_EM } from './fonts.js';
import { unwrapLongitudes } from './math/geo.js';
import { gridSplits, pickBaseStep, pickMajorStep } from './math/ladder.js';
import { mercY } from './math/mercator.js';
import type { Cam, Compiled, CompileWarning, ResolvedResult, ResolvedStop } from './scene-types.js';
import { duScale, fpsRational, outputSize, pickProfile } from './schema/output.js';
import type {
  ExportMode,
  FitTextSlot,
  FontRef,
  LayoutFit,
  Vec2,
  WaycineProject,
} from './schema/types.js';
import { computeStats, resolveStats, statTokenValues } from './stats.js';
import { buildTimeline, secondsToCount, secondsToFrames } from './timeline.js';
import { replaceTokens } from './tokens.js';

/** Options for `compile`. */
export interface CompileOptions {
  /** Output width in px (integer >= 1). Default: from `project.output`. Previews pass a smaller size. */
  width?: number;
  /** Output height in px (integer >= 1). Default: from `project.output`. */
  height?: number;
  /** Timeline mode. Default: `project.output.exportMode`. */
  mode?: ExportMode;
}

/** Floor for `camera.minSpanDeg` so a single stop never divides by zero. */
const MIN_SPAN_FLOOR = 1e-6;

/**
 * Right margin in Du that card texts, the title and the subtitle keep to the
 * frame edge: the original portrait card's own margin (its city may reach
 * 90 + 8 + 910 = 1008 of 1080). The fit limit of a text is the smaller of its
 * slot limit and `W - 72 Du - x`, so a landscape card (at about x 858 Du) also
 * shrinks names that would run off the frame; the portrait and square limits
 * are unchanged (W - 170 / W - 180 stay the smaller).
 */
export const RIGHT_MARGIN_DU = 72;

/**
 * Gap in Du between the lowest finale stats baseline and the top (PIL
 * ascender anchor) of the finale description, so the description sits under
 * the stats and never meets them, however the stats wrap.
 */
export const FINALE_DESC_GAP_DU = 28;

/** Tolerance in px before a fitted text counts as overflowing (sub-pixel measurement noise). */
const OVERFLOW_EPS_PX = 0.5;

/** Two stops closer than this in latitude and (unwrapped) longitude share a pin, in degrees. */
const SAME_PIN_DEG = 1e-4;

/**
 * The overview fit camera, ported literally:
 * `z_ov = min((W - marginX*S) / max(dlon, minSpan), (H - marginY*S) / max(dy, minSpan))`,
 * centre = bbox midpoint + the degree nudge (each component capped at
 * `nudgeMaxFrac * max(span, minSpan)`), then shifted so the content centre
 * sits `offsetDu * S` px from the frame centre.
 */
export function fitOverview(
  lons: readonly number[],
  ys: readonly number[],
  width: number,
  height: number,
  S: number,
  fit: LayoutFit,
  minSpanDeg: number,
): Cam {
  const minX = Math.min(...lons);
  const maxX = Math.max(...lons);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minSpan = Math.max(minSpanDeg, MIN_SPAN_FLOOR);
  const spanX = Math.max(maxX - minX, minSpan);
  const spanY = Math.max(maxY - minY, minSpan);
  const boxW = Math.max(1, width - fit.marginX * S);
  const boxH = Math.max(1, height - fit.marginY * S);
  const z = Math.min(boxW / spanX, boxH / spanY);
  const capX = Math.max(0, fit.nudgeMaxFrac * spanX);
  const capY = Math.max(0, fit.nudgeMaxFrac * spanY);
  const nudgeX = Math.min(capX, Math.max(-capX, fit.nudgeDeg[0]));
  const nudgeY = Math.min(capY, Math.max(-capY, fit.nudgeDeg[1]));
  let cx = (minX + maxX) / 2 + nudgeX;
  let cy = (minY + maxY) / 2 + nudgeY;
  if (fit.offsetDu[0] !== 0) {
    cx -= (fit.offsetDu[0] * S) / z;
  }
  if (fit.offsetDu[1] !== 0) {
    cy += (fit.offsetDu[1] * S) / z;
  }
  return { cx, cy, z };
}

/**
 * The stop ("stamp") camera of a pin at (lon, y): `z = z_ov * stampZoom`, and
 * the pin sits `stopPin * S` px from the frame centre (x right, y down):
 * `cx = lon - stopPin.x * S / z`, `cy = y + stopPin.y * S / z`. Landscape
 * `[-180, -60]` gives the original `(lon + 180/z, y - 60/z)` at 1080p.
 */
export function stampCamera(
  lon: number,
  y: number,
  zOv: number,
  stampZoom: number,
  stopPin: Vec2,
  S: number,
): Cam {
  const z = zOv * stampZoom;
  return { cx: lon - (stopPin[0] * S) / z, cy: y + (stopPin[1] * S) / z, z };
}

/** A CSS font-family token for `ctx.font`: bare when it is a plain identifier, else quoted. */
export function cssFamily(family: string): string {
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(family)) {
    return family;
  }
  return `"${family.replace(/["\\]/g, '')}"`;
}

/** Number of code points (what the original's `len()` counts). */
function codePoints(text: string): number {
  return Array.from(text).length;
}

/**
 * Splits a partner line in two by words when it is longer than `wrapChars`
 * (the original portrait rule: `cut = words // 2` when
 * `len(" ".join(words)) > wrapChars`); 0 = never, and the line is kept
 * verbatim. With wrapping on, lines are always the words re-joined by single
 * spaces, as the original drew them (runs of spaces collapse).
 */
export function wrapPartner(partner: string, wrapChars: number): string[] {
  if (partner === '') {
    return [];
  }
  if (!(wrapChars > 0)) {
    return [partner];
  }
  const words = partner.split(/\s+/).filter((word) => word !== '');
  const cut = codePoints(words.join(' ')) > wrapChars ? Math.floor(words.length / 2) : words.length;
  return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')].filter((line) => line !== '');
}

/** What an auto-fit needs to know about a text. */
interface FitSpec {
  /** Start size in Du. */
  size: number;
  /** Smallest size in Du. */
  minSize: number;
  /** Size decrement per step in Du (<= 0: never shrink). */
  shrinkStep: number;
  /** Tracking in Du, added per code point when `measureTracking`. */
  tracking: number;
  /** Measure with tracking (`width + tracking * len`). */
  measureTracking: boolean;
}

/** A font role as `compile` measures it. */
interface MeasureFont {
  /** CSS family token. */
  family: string;
  /** `fonts.*.sizeAdjust`. */
  sizeAdjust: number;
  /** `fonts.*.widthAdjust`. */
  widthAdjust: number;
}

/** Result of `fitTextSize`. */
interface FitResult {
  /** Size in Du to draw with. */
  size: number;
  /** Measured width in px at that size. */
  width: number;
  /** Width limit in px. */
  limit: number;
}

/**
 * Auto-fit: shrinks `spec.size` by `shrinkStep` while the measured width
 * (times `widthAdjust`, plus tracking when `measureTracking`) exceeds `limit`
 * px and the size is still above `minSize` (the original loop, so the result
 * can end up to one step below `minSize`). Sizes are `spec.size - j *
 * shrinkStep` from an integer step count, never an accumulated float. Also
 * returns the width at the final size, so callers can report an overflow.
 */
function fitTextSize(
  ctx: Ctx2D,
  text: string,
  spec: FitSpec,
  font: MeasureFont,
  S: number,
  limit: number,
): FitResult {
  const extra = spec.measureTracking ? spec.tracking * S * codePoints(text) : 0;
  const measure = (size: number): number => {
    ctx.font = `${size * S * font.sizeAdjust}px ${font.family}`;
    return ctx.measureText(text).width * font.widthAdjust + extra;
  };
  let size = spec.size;
  if (text === '') {
    return { size, width: 0, limit };
  }
  if (spec.shrinkStep > 0) {
    for (let j = 1; j <= 1000 && size > spec.minSize; j++) {
      if (measure(size) <= limit) {
        break;
      }
      size = spec.size - j * spec.shrinkStep;
    }
  }
  return { size, width: measure(size), limit };
}

/** The fit limit of a card slot in px: `fitMaxW`, capped so the text ends `RIGHT_MARGIN_DU` before the frame edge at rest. */
function cardSlotLimit(slot: FitTextSlot, width: number, S: number, restX: number): number {
  const own = slot.fitMaxW <= 0 ? width + slot.fitMaxW * S : slot.fitMaxW * S;
  return Math.min(own, width - RIGHT_MARGIN_DU * S - (restX + slot.dx * S));
}

/**
 * Baseline offset / em below the PIL "la" anchor for a font role: the bundled
 * `anchorEm` (the original's Bahnschrift ascender) for the bundled families;
 * for any other font, its measured cap height plus `ORIGINAL_CAP_TOP_EM`, so
 * its cap tops sit where the original's did (the layout y values were tuned
 * for them). Falls back to the bundled anchor when the host reports no ink box.
 */
function anchorEm(ctx: Ctx2D, ref: FontRef, family: string): number {
  for (const bundled of [BUNDLED_FONTS.display, BUNDLED_FONTS.body]) {
    if (ref.family === bundled.family) {
      return bundled.anchorEm;
    }
  }
  const px = 100;
  ctx.font = `${px}px ${family}`;
  const cap = ctx.measureText('H').actualBoundingBoxAscent;
  return cap !== undefined && cap > 0
    ? cap / px + ORIGINAL_CAP_TOP_EM
    : BUNDLED_FONTS.display.anchorEm;
}

/**
 * Identity of a font role for text-width caches: `bundled:<file>` for a
 * bundled family, `local:<localId>` for an uploaded font, else `family:<name>`.
 */
function fontIdentity(ref: FontRef): string {
  if (ref.source === 'local') {
    return `local:${ref.localId ?? ref.family}`;
  }
  for (const bundled of [BUNDLED_FONTS.display, BUNDLED_FONTS.body]) {
    if (ref.family === bundled.family) {
      return `bundled:${bundled.file}`;
    }
  }
  return `family:${ref.family}`;
}

/**
 * For each stop, the index of the first stop at the same place, else its own.
 * Compares the unwrapped longitudes the cameras and pins use (plain
 * difference, no wrap): a round-the-world trip that ends where it started
 * keeps its last stop 360 degrees east or west of the first, with its own pin,
 * while A -> B -> A across the antimeridian unwraps back to the same value.
 */
function pinOwners(lats: readonly number[], lons: readonly number[]): number[] {
  const owners: number[] = [];
  for (let i = 0; i < lats.length; i++) {
    let owner = i;
    for (let j = 0; j < i; j++) {
      const same =
        Math.abs((lats[i] ?? 0) - (lats[j] ?? 0)) <= SAME_PIN_DEG &&
        Math.abs((lons[i] ?? 0) - (lons[j] ?? 0)) <= SAME_PIN_DEG;
      if (same) {
        owner = owners[j] ?? j;
        break;
      }
    }
    owners.push(owner);
  }
  return owners;
}

/** A `text-overflow` warning when `fit` still ends past its limit. */
function overflowWarning(
  fit: FitResult,
  S: number,
  path: string,
  what: string,
): CompileWarning | null {
  if (!(fit.width > fit.limit + OVERFLOW_EPS_PX)) {
    return null;
  }
  const widthDu = fit.width / S;
  const limitDu = fit.limit / S;
  return {
    code: 'text-overflow',
    path,
    widthDu,
    limitDu,
    message: `${what} is too long: at its smallest size (${fit.size}) it is ${Math.round(widthDu)} Du wide, over the ${Math.round(limitDu)} Du that fit, so it runs past the frame edge. Shorten it or lower the minimum size.`,
  };
}

/**
 * Compiles a validated project (see `validateProject`) for one output size:
 * resolves the layout profile and S, unwraps longitudes, fits the overview
 * camera, builds stamp cameras, the timeline, grid steps, resolved text,
 * stats and auto-fitted text sizes, places the finale copy of the
 * description under the stats, and keeps the pins clear of the title block
 * and the finale stats and description. Uses `backend` only to measure text. Pure apart from text
 * measurement; throws if the project has no visible stop.
 */
export function compile(
  project: WaycineProject,
  backend: Backend,
  opts: CompileOptions = {},
): Compiled {
  const size = outputSize(project.output);
  const width = opts.width ?? size.width;
  const height = opts.height ?? size.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`compile: width and height must be integers >= 1 (got ${width} x ${height}).`);
  }
  const mode = opts.mode ?? project.output.exportMode;
  const S = duScale(width, height);
  const fps = fpsRational(project.output.fps);
  const profile = pickProfile(width, height, project.output.layout);
  const layout = project.layouts[profile];
  const { camera, text, timing } = project;

  const visible = project.stops
    .map((stop, sourceIndex) => ({ stop, sourceIndex }))
    .filter(({ stop }) => stop.hidden !== true);
  if (visible.length === 0) {
    throw new Error('compile: the project has no visible stop; add a stop or unhide one.');
  }
  const visibleStops = visible.map(({ stop }) => stop);
  const count = visibleStops.length;

  // Cameras.
  const lons = unwrapLongitudes(visibleStops.map((stop) => stop.lon));
  const ys = visibleStops.map((stop) => mercY(stop.lat));
  const fitCam = fitOverview(lons, ys, width, height, S, layout.fit, camera.minSpanDeg);
  const stampCams = lons.map((lon, i) =>
    stampCamera(lon, ys[i] ?? 0, fitCam.z, camera.stampZoom, layout.stopPin, S),
  );
  const plainFinaleCam: Cam = { cx: fitCam.cx, cy: fitCam.cy, z: fitCam.z * camera.finaleZoom };
  const ovFrames = secondsToFrames(timing.overviewSec, fps);
  const ovEndU = (ovFrames - 1) / Math.max(1, ovFrames - 1);
  const pushZ = 1 + timing.overview.pushIn * ovEndU;

  // Text and stats.
  const up = (s: string): string => (text.uppercase ? s.toUpperCase() : s);
  const stats = computeStats(visibleStops);
  const tokenValues = statTokenValues(stats);
  // Tokens without data (no countries, no dates) are left out with a separator.
  const fill = (template: string, values = tokenValues): string =>
    up(replaceTokens(template, values, { dropMissing: true }));
  const measure = backend.createSurface(1, 1).getContext2d();
  // Widths as the original measured them: unkerned (drawScene draws unkerned too).
  measure.fontKerning = 'none';
  const displayFamily = cssFamily(project.fonts.display.family);
  const bodyFamily = cssFamily(project.fonts.body.family);
  const displayAdjust = project.fonts.display.sizeAdjust > 0 ? project.fonts.display.sizeAdjust : 1;
  const bodyAdjust = project.fonts.body.sizeAdjust > 0 ? project.fonts.body.sizeAdjust : 1;
  const displayWidth =
    project.fonts.display.widthAdjust > 0 ? project.fonts.display.widthAdjust : 1;
  const bodyWidth = project.fonts.body.widthAdjust > 0 ? project.fonts.body.widthAdjust : 1;
  const displayFont: MeasureFont = {
    family: displayFamily,
    sizeAdjust: displayAdjust,
    widthAdjust: displayWidth,
  };
  const bodyFont: MeasureFont = {
    family: bodyFamily,
    sizeAdjust: bodyAdjust,
    widthAdjust: bodyWidth,
  };
  const warnings: CompileWarning[] = [];
  const warn = (w: CompileWarning | null): void => {
    if (w !== null) warnings.push(w);
  };

  // Card origin x at rest (after the slide): right of the pin on its stop
  // camera (landscape), or a fixed distance from the left edge.
  const cardX =
    layout.card.placement === 'rightOfPin'
      ? width / 2 + (layout.stopPin[0] + layout.card.x) * S
      : layout.card.x * S;
  const cityLimit = cardSlotLimit(project.card.city, width, S, cardX);
  const eventLimit = cardSlotLimit(project.card.event, width, S, cardX);

  const owners = pinOwners(
    visibleStops.map((stop) => stop.lat),
    lons,
  );
  const ownPinDates = visibleStops.map((stop) =>
    text.pinDate === ''
      ? ''
      : stop.dateText !== undefined && stop.dateText !== ''
        ? up(stop.dateText)
        : formatDateRange(stop.date, stop.endDate, text.pinDate, text.rangeSeparator),
  );
  const stops: ResolvedStop[] = visible.map(({ stop, sourceIndex }, i) => {
    const city = up(stop.city);
    const event = up(stop.event ?? '');
    const partner = up(stop.partner ?? '');
    const owner = owners[i] ?? i;
    const shared = ownPinDates.filter((date, j) => (owners[j] ?? j) === owner && date !== '');
    // Result lines stay verbatim ("1ST x2"): `text.uppercase` does not apply to them.
    const results: ResolvedResult[] = (stop.results ?? []).map((result) => ({
      medal: result.medal,
      text: result.text,
      count: Math.min(5, Math.max(1, Math.round(result.count ?? 1))),
    }));
    const cityFit = fitTextSize(measure, city, project.card.city, displayFont, S, cityLimit);
    const eventFit = fitTextSize(measure, event, project.card.event, bodyFont, S, eventLimit);
    if (project.card.show) {
      warn(overflowWarning(cityFit, S, `stops[${sourceIndex}].city`, `The card city "${city}"`));
      if (project.card.showEvent) {
        warn(
          overflowWarning(eventFit, S, `stops[${sourceIndex}].event`, `The card event "${event}"`),
        );
      }
    }
    return {
      index: i,
      sourceIndex,
      id: stop.id,
      lat: stop.lat,
      lon: lons[i] ?? stop.lon,
      y: ys[i] ?? 0,
      city,
      event,
      partner,
      partnerLines: wrapPartner(partner, layout.card.partnerWrapChars),
      kicker: fill(text.kicker, { ...tokenValues, n: i + 1, total: count }),
      cardDate:
        text.cardDate === ''
          ? ''
          : stop.dateText !== undefined && stop.dateText !== ''
            ? up(stop.dateText)
            : formatDateRange(stop.date, stop.endDate, text.cardDate, text.rangeSeparator),
      pinDate: [...new Set(shared)].join(text.pinDateJoin),
      results,
      citySize: cityFit.size,
      eventSize: eventFit.size,
      pinOf: owner,
    };
  });

  // Overview title, subtitle and description: shrink when they would pass the right margin.
  const t = layout.title;
  const title = fill(text.title);
  const subtitle = fill(text.subtitle);
  const description = fill(text.description);
  const titleLimit = width - (RIGHT_MARGIN_DU + t.x) * S;
  const titleFit = fitTextSize(
    measure,
    title,
    {
      size: t.size,
      minSize: t.minSize,
      shrinkStep: t.shrinkStep,
      tracking: t.tracking,
      measureTracking: true,
    },
    displayFont,
    S,
    titleLimit,
  );
  const subFit = fitTextSize(
    measure,
    subtitle,
    {
      size: t.subSize,
      minSize: t.subMinSize,
      shrinkStep: t.shrinkStep,
      tracking: t.subTracking,
      measureTracking: true,
    },
    bodyFont,
    S,
    titleLimit,
  );
  const descSpec: FitSpec = {
    size: t.descSize,
    minSize: t.descMinSize,
    shrinkStep: t.shrinkStep,
    tracking: t.descTracking,
    measureTracking: true,
  };
  const descFit = fitTextSize(measure, description, descSpec, bodyFont, S, titleLimit);
  const descWarning = timing.overview.enabled
    ? overflowWarning(descFit, S, 'text.description', `The description "${description}"`)
    : null;
  if (timing.overview.enabled) {
    warn(overflowWarning(titleFit, S, 'text.title', `The title "${title}"`));
    warn(overflowWarning(subFit, S, 'text.subtitle', `The subtitle "${subtitle}"`));
    warn(descWarning);
  }

  // Graticule (from the fit zoom, whatever the clearance does to the overview camera).
  const g = project.graticule;
  const baseStep =
    g.stepMode === 'fixed' && g.fixedStep > 0
      ? g.fixedStep
      : pickBaseStep(fitCam.z, g.targetSpacing * S);

  const timelineFor = (ovCam: Cam, finaleEndCam: Cam): Compiled['timeline'] =>
    buildTimeline({
      timing,
      fps,
      mode,
      stopDurations: visibleStops.map((stop) => stop.durationSec),
      ovCam,
      ovEndCam: { cx: ovCam.cx, cy: ovCam.cy, z: ovCam.z * pushZ },
      stampCams,
      finaleEndCam,
    });

  const base: Compiled = {
    project,
    width,
    height,
    S,
    fps,
    mode,
    profile,
    layout,
    stops,
    ovCam: fitCam,
    stampCams,
    finaleEndCam: plainFinaleCam,
    frames: {
      titleFade: secondsToFrames(timing.overview.titleFadeSec, fps),
      cardDelay: secondsToCount(timing.stop.labelDelaySec, fps),
      cardFade: secondsToFrames(timing.stop.labelFadeSec, fps),
    },
    timeline: timelineFor(fitCam, plainFinaleCam),
    grid: {
      baseStep,
      majorStep: pickMajorStep(baseStep),
      splits: gridSplits(fitCam.z, g.zoomSplit, g.maxSubdiv),
    },
    text: {
      title,
      subtitle,
      titleSize: titleFit.size,
      subSize: subFit.size,
      description,
      descSize: descFit.size,
      descFinale: null,
    },
    stats: resolveStats(project.stats.items, stats, text.uppercase),
    fonts: {
      display: displayFamily,
      body: bodyFamily,
      identity: {
        display: fontIdentity(project.fonts.display),
        body: fontIdentity(project.fonts.body),
      },
      anchorEm: {
        display: anchorEm(measure, project.fonts.display, displayFamily),
        body: anchorEm(measure, project.fonts.body, bodyFamily),
      },
      sizeAdjust: { display: displayAdjust, body: bodyAdjust },
      widthAdjust: { display: displayWidth, body: bodyWidth },
    },
    cache: new Map<string, unknown>(),
    warnings,
  };

  // The finale copy of the description sits under the stats as laid out at
  // full size (rows and columns may wrap), so it never meets them.
  let compiled = base;
  if (description !== '' && text.descriptionAt === 'introAndFinale' && timing.finale.enabled) {
    const st = layout.stats;
    const statBoxes = statsBoxes(measure, base);
    const y =
      statBoxes.length > 0
        ? Math.max(...statBoxes.map((b) => b.y1)) / S + FINALE_DESC_GAP_DU
        : st.y;
    const limit = width - (RIGHT_MARGIN_DU + st.x) * S;
    const fit = fitTextSize(measure, description, descSpec, bodyFont, S, limit);
    if (descWarning === null) {
      warn(
        overflowWarning(
          fit,
          S,
          'text.description',
          `The description "${description}" in the finale`,
        ),
      );
    }
    compiled = { ...base, text: { ...base.text, descFinale: { x: st.x, y, size: fit.size } } };
  }

  // Keep pins and pin labels clear of the title block (whole overview, pushed
  // in at its end) and of the finale stats and description (finale end camera).
  const bottomPx = height * (1 - layout.safeArea.bottom);
  const ovCam = clearCamera(measure, compiled, fitCam, titleBoxes(measure, compiled), bottomPx, [
    1,
    pushZ,
  ]);
  const finaleEndCam = clearCamera(
    measure,
    compiled,
    plainFinaleCam,
    finaleBoxes(measure, compiled),
    bottomPx,
  );
  if (ovCam === fitCam && finaleEndCam === plainFinaleCam) {
    return compiled;
  }
  return { ...compiled, ovCam, finaleEndCam, timeline: timelineFor(ovCam, finaleEndCam) };
}
