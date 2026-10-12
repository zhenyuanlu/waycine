/**
 * Local coordinate parsing for the place search box. Everything here runs on
 * the device: text that looks like coordinates (or any web link) is never
 * sent to a geocoder.
 *
 * Accepted forms:
 * - decimal pairs `42.369, -71.121`, `42.369 -71.121`, `42.369;-71.121`
 * - hemisphere letters `42.369 N, 71.121 W`, `N 42.369 W 71.121`
 * - degrees, minutes, seconds `42 22 8.4 N 71 7 15.6 W`, with or without the
 *   degree, minute and second marks
 * - Google Maps links with `!3dLAT!4dLON` (the place) or `@lat,lon` (the view)
 */

import { MAX_LAT } from 'waycine';

/** Why a coordinate-like text cannot be used. */
export type CoordinateError = 'latitude' | 'longitude' | 'mercator' | 'link';

/** Result of `parseCoordinates`. */
export type CoordinateParse =
  | { kind: 'coords'; lat: number; lon: number }
  | { kind: 'error'; error: CoordinateError };

const NUM = String.raw`[-+]?\d+(?:\.\d+)?`;
const DECIMAL_PAIR = new RegExp(String.raw`^\s*(${NUM})\s*[,;\s]\s*(${NUM})\s*$`);
const MAPS_AT = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
const MAPS_DATA = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
const LINK = /^(?:https?:\/\/|www\.)|\b(?:maps\.app\.goo\.gl|goo\.gl\/maps)\b/i;

// Degree, minute and second marks: the degree sign, the masculine ordinal
// (a common stand-in), prime and double prime, and ASCII quotes.
const DEG_MARK = '(?:\u00B0|\u00BA|deg|d)';
const MIN_MARK = "(?:'|\u2032|\u2019|min|m)";
const SEC_MARK = `(?:"|\u2033|\u201D|''|sec|s)`;
const HEMI = '([NSEWnsew])';

/** Degrees, then optional minutes and seconds, with or without marks. */
const DMS = String.raw`(\d+(?:\.\d+)?)\s*${DEG_MARK}?\s*(?:(\d+(?:\.\d+)?)\s*${MIN_MARK}?\s*)?(?:(\d+(?:\.\d+)?)\s*${SEC_MARK}?\s*)?`;
const SEP = String.raw`\s*[,;]?\s*`;
/** Hemisphere letters before each value: `N 42.369 W 71.121`. */
const PREFIX_PAIR = new RegExp(String.raw`^\s*${HEMI}\s*${DMS}${SEP}${HEMI}\s*${DMS}\s*$`);
/** Hemisphere letters (optional) after each value: `42.369 N, 71.121 W`, `40 26 46 79 58 56`. */
const SUFFIX_PAIR = new RegExp(String.raw`^\s*${DMS}${HEMI}?${SEP}${DMS}${HEMI}?\s*$`);

function checked(lat: number, lon: number): CoordinateParse {
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return { kind: 'error', error: 'latitude' };
  if (!Number.isFinite(lon) || Math.abs(lon) > 180) return { kind: 'error', error: 'longitude' };
  if (Math.abs(lat) > MAX_LAT) return { kind: 'error', error: 'mercator' };
  return { kind: 'coords', lat, lon };
}

interface Part {
  hemi: string;
  value: number;
  hasDms: boolean;
}

function toPart(
  hemi: string | undefined,
  deg: string | undefined,
  min?: string,
  sec?: string,
): Part {
  return {
    hemi: (hemi ?? '').toUpperCase(),
    value: Number(deg ?? 0) + Number(min ?? 0) / 60 + Number(sec ?? 0) / 3600,
    hasDms: min !== undefined || sec !== undefined,
  };
}

/** Latitude and longitude from a hemisphere/DMS pair, or null when it is not one. */
function fromHemispheres(a: Part, b: Part): CoordinateParse | null {
  if (a.hemi === '' && b.hemi === '') {
    // Degrees, minutes and seconds without letters: latitude first.
    return a.hasDms || b.hasDms ? checked(a.value, b.value) : null;
  }
  const isLat = (h: string) => h === 'N' || h === 'S';
  const isLon = (h: string) => h === 'E' || h === 'W';
  const swap = isLon(a.hemi) || isLat(b.hemi);
  const latPart = swap ? b : a;
  const lonPart = swap ? a : b;
  if (latPart.hemi !== '' && !isLat(latPart.hemi)) return null;
  if (lonPart.hemi !== '' && !isLon(lonPart.hemi)) return null;
  const lat = latPart.hemi === 'S' ? -latPart.value : latPart.value;
  const lon = lonPart.hemi === 'W' ? -lonPart.value : lonPart.value;
  return checked(lat, lon);
}

/**
 * Parses `text` as coordinates. Returns `null` when the text does not look
 * like coordinates or a link (then it is a place name to search for); an
 * `error` when it does but cannot be used (a value out of range, or a link
 * without coordinates); else latitude and longitude in degrees (latitude
 * first, as in `42.369, -71.121`).
 */
export function parseCoordinates(text: string): CoordinateParse | null {
  const input = text.trim();
  if (input === '') return null;

  const data = MAPS_DATA.exec(input);
  if (data) return checked(Number(data[1]), Number(data[2]));
  if (LINK.test(input)) {
    const at = MAPS_AT.exec(input);
    return at ? checked(Number(at[1]), Number(at[2])) : { kind: 'error', error: 'link' };
  }

  const pair = DECIMAL_PAIR.exec(input);
  if (pair) return checked(Number(pair[1]), Number(pair[2]));

  const pre = PREFIX_PAIR.exec(input);
  if (pre)
    return fromHemispheres(
      toPart(pre[1], pre[2], pre[3], pre[4]),
      toPart(pre[5], pre[6], pre[7], pre[8]),
    );
  const post = SUFFIX_PAIR.exec(input);
  if (post)
    return fromHemispheres(
      toPart(post[4], post[1], post[2], post[3]),
      toPart(post[8], post[5], post[6], post[7]),
    );
  return null;
}

/** `42.36900, -71.12100`: five decimals (about 1 m). */
export function formatCoordinates(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}
