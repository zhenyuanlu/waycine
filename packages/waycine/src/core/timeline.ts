import type { Cam, TimelineSegment } from './scene-types.js';
import type { FpsRational } from './schema/output.js';
import type { ExportMode, Timing } from './schema/types.js';

/**
 * Timeline construction: durations become frames once, here. Segment lengths
 * are `max(1, round(sec * fps))`; phase splits inside a stop use `floor`
 * (the original's `int()`); delays and optional fades may be 0 frames.
 */

/** Segment length in frames for `sec` seconds: `max(1, round(sec * fps))`. */
export function secondsToFrames(sec: number, fps: FpsRational): number {
  return Math.max(1, secondsToCount(sec, fps));
}

/** Frame count for a delay or an optional fade: `max(0, round(sec * fps))` (0 = none). */
export function secondsToCount(sec: number, fps: FpsRational): number {
  if (!Number.isFinite(sec) || sec <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((sec * fps.num) / fps.den));
}

/** Everything the timeline needs besides timing. */
export interface TimelineInput {
  /** Project timing. */
  timing: Timing;
  /** Frame rate. */
  fps: FpsRational;
  /** Export mode. */
  mode: ExportMode;
  /** Per visible stop: its `durationSec` override, if any. */
  stopDurations: readonly (number | undefined)[];
  /** Overview fit camera. */
  ovCam: Cam;
  /** Overview camera at its last frame (z pushed in by `pushIn`). */
  ovEndCam: Cam;
  /** Stop cameras. */
  stampCams: readonly Cam[];
  /** Finale end camera. */
  finaleEndCam: Cam;
}

/** Segments in playback order and the total length in frames. */
export interface Timeline {
  /** Contiguous segments. */
  segments: TimelineSegment[];
  /** Sum of the segment lengths. */
  totalFrames: number;
}

function clampInt(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Builds the segments: `[overview] + stop x N + [finale] + [hold]`.
 *
 * - Stop phases: `nFly = floor(flyFrac * n)` (at most `n - 1` in `fly` mode),
 *   `nZoom = floor(zoomFrac * n)` (0 in `fly` mode, and for the last stop when
 *   the finale is disabled), hold = the rest.
 * - Fly mode is one continuous flight: a stop ends on its stop camera and the
 *   next stop (or the finale) starts from it; no flash, so no recovery.
 * - Stop 0 starts from the fit camera in segments mode (the original) and from
 *   the overview's end camera in single mode (fit camera without an overview).
 * - Single mode only: the overview ends with `outroFrames`; every segment right
 *   after a zoom-through starts with `recoverFrames`.
 * - Fly mode: each stop ends with `cardOutFrames`, except the last stop when
 *   the finale is disabled (the video then ends on its card).
 */
export function buildTimeline(input: TimelineInput): Timeline {
  const { timing, fps, mode, stampCams } = input;
  const single = mode === 'single';
  const zoomThrough = timing.transition.mode === 'zoomThrough';
  const count = stampCams.length;
  const segments: TimelineSegment[] = [];
  let start = 0;

  const push = (seg: Omit<TimelineSegment, 'start'>): void => {
    segments.push({ ...seg, start });
    start += seg.n;
  };
  const recoverAfterPrevious = (n: number): number => {
    const prev = segments[segments.length - 1];
    if (!single || prev === undefined || prev.kind !== 'stop' || prev.nZoom <= 0) {
      return 0;
    }
    return Math.min(n, secondsToCount(timing.transition.recoverSec, fps));
  };

  if (timing.overview.enabled) {
    const n = secondsToFrames(timing.overviewSec, fps);
    push({
      kind: 'overview',
      index: 0,
      n,
      nFly: 0,
      nHold: 0,
      nZoom: 0,
      startCam: input.ovCam,
      endCam: input.ovEndCam,
      recoverFrames: 0,
      outroFrames: single ? Math.min(n, secondsToCount(timing.overview.outroSec, fps)) : 0,
      cardOutFrames: 0,
    });
  }

  for (let i = 0; i < count; i++) {
    const n = secondsToFrames(input.stopDurations[i] ?? timing.stopSec, fps);
    // Fly mode keeps at least one hold frame, so every stop ends exactly on its
    // stop camera and the next flight (or the finale) continues from there.
    const nFly = clampInt(Math.floor(n * timing.stop.flyFrac), 0, zoomThrough ? n : n - 1);
    const lastWithoutFinale = i === count - 1 && !timing.finale.enabled;
    const nZoom =
      zoomThrough && !lastWithoutFinale
        ? clampInt(Math.floor(n * timing.stop.zoomFrac), 0, n - nFly)
        : 0;
    const prevCam = i > 0 ? stampCams[i - 1] : undefined;
    const firstCam = single && timing.overview.enabled ? input.ovEndCam : input.ovCam;
    push({
      kind: 'stop',
      index: i,
      n,
      nFly,
      nHold: n - nFly - nZoom,
      nZoom,
      startCam: prevCam ?? firstCam,
      endCam: stampCams[i] ?? input.ovCam,
      recoverFrames: recoverAfterPrevious(n),
      outroFrames: 0,
      // The last stop of a video without a finale keeps its card, so the video
      // does not end on a bare map (zoom-through treats that stop the same way).
      cardOutFrames:
        zoomThrough || lastWithoutFinale
          ? 0
          : Math.min(n, secondsToCount(timing.stop.cardFadeOutSec, fps)),
    });
  }

  if (timing.finale.enabled) {
    const n = secondsToFrames(timing.finaleSec, fps);
    push({
      kind: 'finale',
      index: 0,
      n,
      nFly: 0,
      nHold: 0,
      nZoom: 0,
      startCam: stampCams[count - 1] ?? input.ovCam,
      endCam: input.finaleEndCam,
      recoverFrames: recoverAfterPrevious(n),
      outroFrames: 0,
      cardOutFrames: 0,
    });
  }

  if (timing.endHoldSec > 0) {
    const prev = segments[segments.length - 1];
    const cam = prev?.endCam ?? input.ovCam;
    push({
      kind: 'hold',
      index: 0,
      n: secondsToFrames(timing.endHoldSec, fps),
      nFly: 0,
      nHold: 0,
      nZoom: 0,
      startCam: cam,
      endCam: cam,
      recoverFrames: 0,
      outroFrames: 0,
      cardOutFrames: 0,
    });
  }

  return { segments, totalFrames: start };
}
