import { LruCache } from './lru';
import { type Place, placesFromNominatim, placesFromPhoton } from './places';
import { RateQueue } from './queue';

/**
 * Place search. Photon (komoot) serves the typeahead; Nominatim (OSM
 * Foundation) only answers the explicit "Search more precisely" button,
 * through one global queue with at least 1.1 s between requests, as its usage
 * policy requires. Both share one memory + localStorage LRU cache of 500
 * searches. Requests go straight from the browser with its default referrer
 * (never `no-referrer`: Nominatim identifies web apps by it).
 */

export const PHOTON_URL = 'https://photon.komoot.io/api/';
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/** Typeahead waits for this many characters. */
export const TYPEAHEAD_MIN_CHARS = 3;
/** Typeahead waits this long after the last keystroke. */
export const TYPEAHEAD_DEBOUNCE_MS = 350;
/** Nominatim: at least this long between two requests. */
export const NOMINATIM_SPACING_MS = 1100;
/** CSV import lookups: at most one Photon request per second. */
export const IMPORT_SPACING_MS = 1000;
/** Results per search. */
export const RESULT_LIMIT = 6;

const CACHE_KEY = 'waycine:v1:geocache';
const CACHE_SIZE = 500;

/** A search failed (network, server error or unreadable reply); `status` is the HTTP status, if any. */
export class GeocoderError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'GeocoderError';
  }
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

let cache: LruCache<Place[]> | null = null;

/** The shared search cache (created on first use). */
export function searchCache(): LruCache<Place[]> {
  cache ??= new LruCache<Place[]>(CACHE_SIZE, browserStorage(), CACHE_KEY);
  return cache;
}

const nominatimQueue = new RateQueue(NOMINATIM_SPACING_MS);
const importQueue = new RateQueue(IMPORT_SPACING_MS);

function cacheKey(source: Place['source'], query: string): string {
  return `${source}|${query.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new GeocoderError(error instanceof Error ? error.message : String(error), null);
  }
  if (!response.ok) {
    throw new GeocoderError(`The search service answered ${response.status}.`, response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new GeocoderError('The search service sent an unreadable reply.', response.status);
  }
}

function photonUrl(query: string): string {
  const params = new URLSearchParams({ q: query, lang: 'en', limit: String(RESULT_LIMIT) });
  return `${PHOTON_URL}?${params}`;
}

function nominatimUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    'accept-language': 'en',
    limit: String(RESULT_LIMIT),
  });
  return `${NOMINATIM_URL}?${params}`;
}

/** Photon typeahead search (cached). Abort `signal` on the next keystroke. */
export async function searchPhoton(query: string, signal?: AbortSignal): Promise<Place[]> {
  const key = cacheKey('photon', query);
  const hit = searchCache().get(key);
  if (hit !== undefined) return hit;
  const places = placesFromPhoton(await fetchJson(photonUrl(query.trim()), signal));
  searchCache().set(key, places);
  return places;
}

/** Nominatim search behind the "Search more precisely" button (cached, rate limited). */
export async function searchNominatim(query: string, signal?: AbortSignal): Promise<Place[]> {
  const key = cacheKey('nominatim', query);
  const hit = searchCache().get(key);
  if (hit !== undefined) return hit;
  const places = await nominatimQueue.run(
    async () => placesFromNominatim(await fetchJson(nominatimUrl(query.trim()), signal)),
    signal,
  );
  searchCache().set(key, places);
  return places;
}

/** One Photon lookup for the list import: cached, at most one request per second. */
export async function lookupForImport(query: string, signal?: AbortSignal): Promise<Place | null> {
  const key = cacheKey('photon', query);
  const hit = searchCache().get(key);
  if (hit !== undefined) return hit[0] ?? null;
  const places = await importQueue.run(
    async () => placesFromPhoton(await fetchJson(photonUrl(query.trim()), signal)),
    signal,
  );
  searchCache().set(key, places);
  return places[0] ?? null;
}
