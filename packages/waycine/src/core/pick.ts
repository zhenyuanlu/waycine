import { wrap180 } from './math/geo.js';
import { fromScreen, latFromMercY } from './math/mercator.js';
import { sceneAt } from './scene.js';
import type { Compiled } from './scene-types.js';
import { MAX_LAT } from './schema/types.js';

/** A map position under a point of a frame. */
export interface PickedPlace {
  /** Latitude in degrees, clamped to +-85.05 (the Mercator limit the engine uses). */
  lat: number;
  /** Longitude in degrees, wrapped into (-180, 180]. */
  lon: number;
}

/**
 * The map position under output pixel `(x, y)` of timeline frame `frame`: the
 * inverse of that frame's camera transform (`sceneAt(compiled, frame).cam`).
 * `x` and `y` are in the compiled frame's pixels (0..width, 0..height, y
 * down); a host maps a click on a scaled preview into them first. Pure: no
 * drawing, only the camera. During a zoom-through the camera includes the
 * zoom, so the result stays under the cursor; post effects (blur, flash) are
 * ignored. The frame index is clamped to the timeline.
 */
export function pickPlace(compiled: Compiled, frame: number, x: number, y: number): PickedPlace {
  const last = Math.max(0, compiled.timeline.totalFrames - 1);
  const index = Math.min(last, Math.max(0, Math.round(frame)));
  const { cam } = sceneAt(compiled, index);
  const [lon, merc] = fromScreen(x, y, cam, compiled.width, compiled.height);
  const lat = Math.min(MAX_LAT, Math.max(-MAX_LAT, latFromMercY(merc)));
  return { lat, lon: wrap180(lon) };
}
