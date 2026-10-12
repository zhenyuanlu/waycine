import { type CivilDate, dayNumber, monthNumber, parseIsoDate } from './dates.js';
import { haversineKm, KM_PER_MILE } from './math/geo.js';
import type { StatItem, StatSource, Stop } from './schema/types.js';
import { formatNumber, type TokenKey, type TokenValues } from './tokens.js';

/**
 * Journey statistics for the finale stats and the text tokens. A value is
 * `undefined` when the stops carry no data for it (no regions, no countries,
 * no dates); such stat items are omitted and such tokens stay literal.
 */
export interface JourneyStats {
  /** Visible stops. */
  stops: number;
  /** Distinct regions by `regionKey`: `regionCode`, else `country-region`, else `region` (trimmed, upper-cased). */
  regions: number | undefined;
  /** Distinct countries (`country`, else the `regionCode` prefix before '-'). */
  countries: number | undefined;
  /** Inclusive calendar-month span from the earliest date to the latest (end) date. */
  months: number | undefined;
  /** Inclusive day span from the earliest date to the latest (end) date. */
  days: number | undefined;
  /** Great-circle length of the route in km (rounded: whole km from 10 km, else 0.1 km). */
  km: number;
  /** The same in statute miles. */
  mi: number;
  /** Year of the first dated stop in video order. */
  year: number | undefined;
}

/** One resolved finale stat. */
export interface ResolvedStat {
  /** Number as drawn ("7", "2,340"). */
  value: string;
  /** Label as drawn. */
  label: string;
}

function normKey(value: string | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function roundDistance(value: number): number {
  return value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
}

/**
 * Region key of a stop: its `regionCode` (`US-MA`), else its `region`
 * prefixed with its country when it has one (`region: "MA", country: "US"`
 * -> `US-MA`, so it matches stops that give the code), else the bare region.
 * Trimmed and upper-cased; '' when the stop names no region.
 */
export function regionKey(stop: Stop): string {
  const code = normKey(stop.regionCode);
  if (code !== '') {
    return code;
  }
  const region = normKey(stop.region);
  if (region === '') {
    return '';
  }
  const country = normKey(stop.country);
  return country !== '' && !region.startsWith(`${country}-`) ? `${country}-${region}` : region;
}

function countryOf(stop: Stop): string {
  const country = normKey(stop.country);
  if (country !== '') {
    return country;
  }
  const code = normKey(stop.regionCode);
  const dash = code.indexOf('-');
  return dash > 0 ? code.slice(0, dash) : '';
}

/** Computes the journey statistics of the visible stops, in video order. */
export function computeStats(stops: readonly Stop[]): JourneyStats {
  const regions = new Set<string>();
  const countries = new Set<string>();
  let first: CivilDate | null = null;
  let last: CivilDate | null = null;
  let year: number | undefined;
  let km = 0;
  let prev: Stop | undefined;
  for (const stop of stops) {
    const region = regionKey(stop);
    if (region !== '') {
      regions.add(region);
    }
    const country = countryOf(stop);
    if (country !== '') {
      countries.add(country);
    }
    const start = parseIsoDate(stop.date);
    if (start !== null) {
      year ??= start.year;
      const end = parseIsoDate(stop.endDate);
      const stopEnd = end !== null && dayNumber(end) > dayNumber(start) ? end : start;
      if (first === null || dayNumber(start) < dayNumber(first)) {
        first = start;
      }
      if (last === null || dayNumber(stopEnd) > dayNumber(last)) {
        last = stopEnd;
      }
    }
    if (prev !== undefined) {
      km += haversineKm(prev.lat, prev.lon, stop.lat, stop.lon);
    }
    prev = stop;
  }
  return {
    stops: stops.length,
    regions: regions.size > 0 ? regions.size : undefined,
    countries: countries.size > 0 ? countries.size : undefined,
    months:
      first !== null && last !== null ? monthNumber(last) - monthNumber(first) + 1 : undefined,
    days: first !== null && last !== null ? dayNumber(last) - dayNumber(first) + 1 : undefined,
    km: roundDistance(km),
    mi: roundDistance(km / KM_PER_MILE),
    year,
  };
}

/** Token values for the overview text (no `n`). */
export function statTokenValues(stats: JourneyStats): TokenValues {
  const values: Partial<Record<TokenKey, number>> = {
    total: stats.stops,
    stops: stats.stops,
    km: stats.km,
    mi: stats.mi,
  };
  if (stats.regions !== undefined) values.regions = stats.regions;
  if (stats.countries !== undefined) values.countries = stats.countries;
  if (stats.months !== undefined) values.months = stats.months;
  if (stats.days !== undefined) values.days = stats.days;
  if (stats.year !== undefined) values.year = stats.year;
  return values;
}

/** The computed value of a stat source, or undefined (`custom`, or no data). */
export function statValue(stats: JourneyStats, source: StatSource): number | undefined {
  switch (source) {
    case 'stops':
      return stats.stops;
    case 'regions':
      return stats.regions;
    case 'countries':
      return stats.countries;
    case 'months':
      return stats.months;
    case 'days':
      return stats.days;
    case 'km':
      return stats.km;
    case 'mi':
      return stats.mi;
    case 'custom':
      return undefined;
  }
}

/**
 * Resolves the finale stat items: an item's `value` override is drawn
 * verbatim, otherwise the computed number is formatted; items with neither are
 * omitted. `labelOne` replaces `label` when the value is exactly 1.
 */
export function resolveStats(
  items: readonly StatItem[],
  stats: JourneyStats,
  uppercase: boolean,
): ResolvedStat[] {
  const out: ResolvedStat[] = [];
  for (const item of items) {
    const override = item.value !== undefined && item.value !== '' ? item.value : undefined;
    const computed = statValue(stats, item.source);
    if (override === undefined && computed === undefined) {
      continue;
    }
    const value = override ?? formatNumber(computed ?? 0);
    const isOne = override === undefined ? computed === 1 : override.trim() === '1';
    const label = isOne && item.labelOne !== undefined ? item.labelOne : item.label;
    out.push({
      value: uppercase ? value.toUpperCase() : value,
      label: uppercase ? label.toUpperCase() : label,
    });
  }
  return out;
}
