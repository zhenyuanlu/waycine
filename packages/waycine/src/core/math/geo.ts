import { DEG_TO_RAD } from './mercator.js';

/** Mean Earth radius in km (IUGG), used for route distances. */
export const EARTH_RADIUS_KM = 6371.0088;
/** Kilometres per statute mile. */
export const KM_PER_MILE = 1.609344;

/** Wraps an angle difference in degrees into (-180, 180]. */
export function wrap180(deg: number): number {
  const r = deg - 360 * Math.floor((deg + 180) / 360);
  return r === -180 ? 180 : r;
}

/**
 * Unwraps longitudes along the route so no leg jumps across the antimeridian:
 * each longitude is shifted by a whole number of turns to within 180 deg of the
 * previous (already unwrapped) one. Values that need no shift stay bit-exact.
 */
export function unwrapLongitudes(lons: readonly number[]): number[] {
  const out: number[] = [];
  let prev: number | undefined;
  for (const lon of lons) {
    let v = lon;
    if (prev !== undefined) {
      const turns = Math.round((prev - lon) / 360);
      if (turns !== 0) {
        v = lon + 360 * turns;
      }
    }
    out.push(v);
    prev = v;
  }
  return out;
}

/** Great-circle distance in km (haversine). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * DEG_TO_RAD;
  const p2 = lat2 * DEG_TO_RAD;
  const dp = p2 - p1;
  const dl = wrap180(lon2 - lon1) * DEG_TO_RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
