import { signal } from '@preact/signals';
import { previewScale, previewSharp } from '../state/preview-scale';

/**
 * Adaptive preview: when frames take too long to draw while the preview plays
 * (a phone, a 4K screen, a 4K project), it steps down so playback keeps up:
 * first to the video's own size (when the screen asked for more pixels than
 * that), then to half resolution, with a note. Exports are not affected. The
 * viewer can go back to full resolution; the preview then stays there for
 * the session.
 */

/** Average draw time (ms) above which the preview steps down (25 fps). */
export const SLOW_FRAME_MS = 40;
/** The average covers this many of the latest frames (one slow frame alone never decides). */
export const SLOW_FRAME_COUNT = 10;
/** A frame this slow (ms) is a visible stutter at 30 fps... */
export const STUTTER_MS = 50;
/** ...and this many of them among the latest SLOW_FRAME_COUNT step it down too. */
export const STUTTER_COUNT = 3;

/** Draw times of the latest frames (at most SLOW_FRAME_COUNT). */
let recent: number[] = [];

/** False once the viewer asked for full resolution (no automatic change after that). */
export const autoQuality = signal(true);

/** Forget the frames timed so far (playback paused, or the preview size changed). */
export function resetFrameTimes(): void {
  recent = [];
}

/**
 * Records how long one frame took to draw while playing. When the latest
 * SLOW_FRAME_COUNT frames average more than SLOW_FRAME_MS, or STUTTER_COUNT
 * of them took over STUTTER_MS (the zoom-throughs stutter while the average
 * stays low), the preview steps down: no more pixels than the video first,
 * then half resolution. Returns true when it stepped.
 */
export function recordFrameTime(ms: number): boolean {
  recent.push(ms);
  if (recent.length > SLOW_FRAME_COUNT) recent.shift();
  if (recent.length < SLOW_FRAME_COUNT || !autoQuality.peek() || previewScale.peek() !== 1) {
    return false;
  }
  const average = recent.reduce((sum, t) => sum + t, 0) / recent.length;
  const stutters = recent.filter((t) => t > STUTTER_MS).length;
  if (average <= SLOW_FRAME_MS && stutters < STUTTER_COUNT) return false;
  if (previewSharp.peek()) previewSharp.value = false;
  else previewScale.value = 0.5;
  resetFrameTimes();
  return true;
}

/** Back to full resolution, and no automatic change for the rest of the session. */
export function restoreFullResolution(): void {
  autoQuality.value = false;
  previewSharp.value = true;
  previewScale.value = 1;
  resetFrameTimes();
}
