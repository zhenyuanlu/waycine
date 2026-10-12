import { regionShortCode } from './regions';

/** A place a geocoder found. */
export interface Place {
  /** One line for the result list: `Boston, Massachusetts, United States`. */
  label: string;
  /** Name of the place itself: `Boston`. */
  name: string;
  /** Latitude in degrees. */
  lat: number;
  /** Longitude in degrees. */
  lon: number;
  /** Region as shown on a stop: a short code when known (`MA`), else the name. */
  region?: string;
  /** Region key for the regions stat: `US-MA`. */
  regionCode?: string;
  /** Country, ISO 3166-1 alpha-2 upper case: `US`. */
  country?: string;
  /** Which service found it. */
  source: 'photon' | 'nominatim';
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function unique(parts: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    if (part !== undefined && !out.includes(part)) out.push(part);
  }
  return out;
}

/** Region fields from a region name or ISO 3166-2 code and a country code. */
function regionFields(
  country: string | undefined,
  regionName: string | undefined,
  isoCode: string | undefined,
): Pick<Place, 'region' | 'regionCode'> {
  if (isoCode !== undefined && /^[A-Z]{2}-[A-Z0-9]{1,3}$/i.test(isoCode)) {
    const code = isoCode.toUpperCase();
    return { region: code.slice(code.indexOf('-') + 1), regionCode: code };
  }
  const short = regionShortCode(country, regionName);
  if (short !== undefined && country !== undefined) {
    return { region: short, regionCode: `${country}-${short}` };
  }
  return regionName === undefined ? {} : { region: regionName };
}

function withOptional(place: Place, extra: Partial<Place>): Place {
  const out: Place = { ...place };
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) (out as unknown as Json)[key] = value;
  }
  return out;
}

/** Places from a Photon `/api` response (GeoJSON features); malformed entries are skipped. */
export function placesFromPhoton(body: unknown): Place[] {
  const features = isRecord(body) && Array.isArray(body.features) ? body.features : [];
  const out: Place[] = [];
  for (const feature of features) {
    if (!isRecord(feature) || !isRecord(feature.geometry) || !isRecord(feature.properties))
      continue;
    const coords = feature.geometry.coordinates;
    if (!Array.isArray(coords)) continue;
    const lon = num(coords[0]);
    const lat = num(coords[1]);
    if (lat === undefined || lon === undefined) continue;
    const p = feature.properties;
    const country = str(p.countrycode)?.toUpperCase();
    const name =
      str(p.name) ??
      str(p.city) ??
      str(p.street) ??
      str(p.county) ??
      str(p.state) ??
      str(p.country);
    if (name === undefined) continue;
    const state = str(p.state);
    out.push(
      withOptional(
        {
          label: unique([name, str(p.city), state, str(p.country)]).join(', '),
          name,
          lat,
          lon,
          source: 'photon',
        },
        { ...regionFields(country, state, undefined), country },
      ),
    );
  }
  return out;
}

/** Places from a Nominatim `format=jsonv2&addressdetails=1` response; malformed entries are skipped. */
export function placesFromNominatim(body: unknown): Place[] {
  const items = Array.isArray(body) ? body : [];
  const out: Place[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const lat = num(item.lat);
    const lon = num(item.lon);
    if (lat === undefined || lon === undefined) continue;
    const address = isRecord(item.address) ? item.address : {};
    const country = str(address.country_code)?.toUpperCase();
    const town =
      str(address.city) ??
      str(address.town) ??
      str(address.village) ??
      str(address.hamlet) ??
      str(address.municipality);
    const name = str(item.name) ?? town ?? str(item.display_name)?.split(',')[0]?.trim();
    if (name === undefined) continue;
    const state = str(address.state);
    out.push(
      withOptional(
        {
          label:
            str(item.display_name) ?? unique([name, town, state, str(address.country)]).join(', '),
          name,
          lat,
          lon,
          source: 'nominatim',
        },
        { ...regionFields(country, state, str(address['ISO3166-2-lvl4'])), country },
      ),
    );
  }
  return out;
}
