import type { Cam } from '../scene-types.js';

/**
 * Spherical Mercator in degrees, and the camera mapping between map
 * coordinates (lon, Mercator y) and output pixels. The arithmetic follows the
 * original operation by operation (radians = deg * (pi / 180), degrees =
 * rad * (180 / pi)) so state parity holds to rounding.
 */

/** Degrees to radians factor (`pi / 180`). */
export const DEG_TO_RAD = Math.PI / 180;
/** Radians to degrees factor (`180 / pi`). */
export const RAD_TO_DEG = 180 / Math.PI;

/** Mercator y in degrees: `degrees(ln(tan(pi/4 + radians(lat)/2)))`. */
export function mercY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * DEG_TO_RAD) / 2)) * RAD_TO_DEG;
}

/** Inverse Mercator: latitude in degrees for Mercator y in degrees. */
export function latFromMercY(y: number): number {
  return (2 * Math.atan(Math.exp(y * DEG_TO_RAD)) - Math.PI / 2) * RAD_TO_DEG;
}

/** Output-pixel x of longitude `lon` (y down): `W/2 + (lon - cx) * z`. */
export function screenX(lon: number, cam: Cam, width: number): number {
  return width / 2 + (lon - cam.cx) * cam.z;
}

/** Output-pixel y of Mercator y `y` (y down): `H/2 - (y - cy) * z`. */
export function screenY(y: number, cam: Cam, height: number): number {
  return height / 2 - (y - cam.cy) * cam.z;
}

/** Output pixel `[sx, sy]` of the map point (lon, Mercator y). */
export function toScreen(
  lon: number,
  y: number,
  cam: Cam,
  width: number,
  height: number,
): [number, number] {
  return [screenX(lon, cam, width), screenY(y, cam, height)];
}

/** Map point `[lon, mercY]` under output pixel (sx, sy); the inverse of `toScreen`. */
export function fromScreen(
  sx: number,
  sy: number,
  cam: Cam,
  width: number,
  height: number,
): [number, number] {
  return [cam.cx + (sx - width / 2) / cam.z, cam.cy - (sy - height / 2) / cam.z];
}
