import { expect, type Page, type Route } from '@playwright/test';

/**
 * Shared helpers for the editor specs. Geocoders are always mocked with
 * `page.route`: tests never reach photon.komoot.io or nominatim.openstreetmap.org.
 */

/** A Photon feature for `name` at (lat, lon). */
export function photonFeature(
  name: string,
  lat: number,
  lon: number,
  state = 'Massachusetts',
  country = 'United States',
  countrycode = 'US',
) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { name, state, country, countrycode, osm_key: 'place', osm_value: 'city' },
  };
}

/** Places the Photon mock knows, by lower-case query prefix. */
const PHOTON_PLACES: Record<string, ReturnType<typeof photonFeature>[]> = {
  worc: [
    photonFeature('Worcester', 42.2626, -71.8023),
    photonFeature('Worcester', 52.192, -2.22, 'England', 'United Kingdom', 'GB'),
  ],
  prov: [photonFeature('Providence', 41.824, -71.4128, 'Rhode Island')],
  salem: [photonFeature('Salem', 42.5195, -70.8967)],
};

export interface GeoMock {
  photon: URL[];
  nominatim: URL[];
}

const CORS = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };

/**
 * Mocks both geocoders. Photon answers from PHOTON_PLACES (or fails with
 * 503 when `photonDown`); Nominatim answers one precise result. Every
 * request URL is recorded.
 */
export async function mockGeocoders(
  page: Page,
  opts: { photonDown?: boolean } = {},
): Promise<GeoMock> {
  const calls: GeoMock = { photon: [], nominatim: [] };
  await page.route('https://photon.komoot.io/**', async (route: Route) => {
    const url = new URL(route.request().url());
    calls.photon.push(url);
    if (opts.photonDown) {
      await route.fulfill({ status: 503, headers: CORS, body: '{"message":"busy"}' });
      return;
    }
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const key = Object.keys(PHOTON_PLACES).find((k) => q.startsWith(k));
    const features = key === undefined ? [] : PHOTON_PLACES[key];
    await route.fulfill({
      status: 200,
      headers: CORS,
      body: JSON.stringify({ type: 'FeatureCollection', features }),
    });
  });
  await page.route('https://nominatim.openstreetmap.org/**', async (route: Route) => {
    const url = new URL(route.request().url());
    calls.nominatim.push(url);
    await route.fulfill({
      status: 200,
      headers: CORS,
      body: JSON.stringify([
        {
          lat: '42.2625932',
          lon: '-71.8022934',
          name: 'Worcester',
          display_name: 'Worcester, Worcester County, Massachusetts, United States',
          address: {
            city: 'Worcester',
            state: 'Massachusetts',
            'ISO3166-2-lvl4': 'US-MA',
            country: 'United States',
            country_code: 'us',
          },
        },
      ]),
    });
  });
  return calls;
}

/**
 * A first visit on the race season demo (16:9, seven stops with results), which
 * most specs are written against. `/` is the first visit a user gets: the
 * Europe trip demo.
 */
export const RACE_SEASON = '/?demo=race-season';

/** Opens the app (on the race season demo unless `path` says otherwise) and waits for the first frame. */
export async function openApp(page: Page, path = RACE_SEASON): Promise<void> {
  await page.goto(path);
  await expect(page.locator('canvas.preview')).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
}

/** A hash of the preview canvas pixels (changes when anything drawn changes). */
export function canvasHash(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLCanvasElement>('canvas.preview');
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return '';
    const { data } = ctx.getImageData(0, 0, el.width, el.height);
    let h = 2166136261;
    for (let i = 0; i < data.length; i += 3) {
      h ^= data[i] ?? 0;
      h = Math.imul(h, 16777619);
    }
    return `${el.width}x${el.height}:${(h >>> 0).toString(16)}`;
  });
}

/** Share of the preview's top row that has colour `rgb` (the background, where no grid line crosses). */
export function topRowShare(page: Page, rgb: [number, number, number]): Promise<number> {
  return page.evaluate((c) => {
    const el = document.querySelector<HTMLCanvasElement>('canvas.preview');
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return 0;
    const { data } = ctx.getImageData(0, 0, el.width, 1);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === c[0] && data[i + 1] === c[1] && data[i + 2] === c[2]) n++;
    }
    return n / el.width;
  }, rgb);
}

/** Shows timeline frame `frame` (as a drag of the scrub slider would). */
export async function showFrame(page: Page, frame: number): Promise<void> {
  await page
    .getByRole('slider', { name: 'Position in the video' })
    .evaluate((el: HTMLInputElement, f: number) => {
      el.value = String(f);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, frame);
  await expect(page.locator('canvas.preview')).toHaveAttribute('data-frame', String(frame));
}

/** A format option of the transport's "Video format" switch. */
export function formatRadio(page: Page, value: '16:9' | '9:16' | '1:1') {
  return page
    .getByRole('radiogroup', { name: 'Video format' })
    .getByRole('radio', { name: value, exact: true });
}

/** Labels of the timeline's parts, in order (`Intro`, `1 CHICAGO`, …, `Finale`). */
export function partLabels(page: Page): Promise<string[]> {
  return page.locator('.tl-lab .full').allTextContents();
}

/** Shows All settings (the tab below 1800 px). */
export async function openAllSettings(page: Page): Promise<void> {
  await page.getByRole('tab', { name: /^All settings/ }).click();
  await expect(page.getByRole('searchbox', { name: 'Search settings' })).toBeVisible();
}

/** Opens an All settings group (groups start collapsed below 1800 px). */
export async function openGroup(page: Page, name: string): Promise<void> {
  const toggle = page.locator('.grp-toggle', {
    has: page.locator('.grp-title', { hasText: name }),
  });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

/** The place search's result options. */
export function places(page: Page) {
  return page.getByRole('listbox', { name: 'Places found' }).getByRole('option');
}

/** Labels of the stop rows, in order. */
export function stopCities(page: Page): Promise<string[]> {
  return page.locator('.stop-row .stop-city').allTextContents();
}

/** Collects console errors and page errors. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** The browser's saved project, as stored. */
export function autosave(page: Page): Promise<string> {
  return page.evaluate(() => localStorage.getItem('waycine:v1:autosave') ?? '');
}
