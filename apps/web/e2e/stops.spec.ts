import { expect, test } from '@playwright/test';
import {
  autosave,
  mockGeocoders,
  openApp,
  partLabels,
  places,
  stopCities,
  watchErrors,
} from './editor/helpers';

// Reduced motion keeps the preview still (no autoplay).
test.use({ reducedMotion: 'reduce' });

const SEASON = [
  'CHICAGO',
  'MILWAUKEE',
  'GRAND RAPIDS',
  'DETROIT',
  'TOLEDO',
  'CLEVELAND',
  'BUFFALO',
];

test('adds a stop by searching (Photon typeahead, Enter picks)', async ({ page }) => {
  const errors = watchErrors(page);
  const geo = await mockGeocoders(page);
  await openApp(page);
  // Follow edits is off by default; with it on, an edit moves the preview to its stop.
  await page.getByRole('switch', { name: 'Follow edits' }).check();

  await page.getByRole('button', { name: 'Add stop' }).first().click();
  const search = page.getByRole('combobox', { name: 'Search a place or paste coordinates' });
  await expect(search).toBeFocused();
  // Under 3 characters nothing is sent.
  await search.pressSequentially('Wo', { delay: 30 });
  await page.waitForTimeout(500);
  expect(geo.photon).toHaveLength(0);
  await search.pressSequentially('rcester', { delay: 30 });
  const options = places(page);
  // Results float over the fields below: name, region line and coordinates.
  await expect(options.first()).toHaveAccessibleName('Worcester, Massachusetts, United States');
  await expect(options.first()).toContainText('42.26° N 71.80° W');
  await expect(page.getByText('2 places', { exact: true })).toBeVisible();
  // One request after the 350 ms pause, with the documented parameters.
  expect(geo.photon).toHaveLength(1);
  const url = geo.photon[0] as URL;
  expect(url.searchParams.get('q')).toBe('Worcester');
  expect(url.searchParams.get('lang')).toBe('en');
  expect(url.searchParams.get('limit')).toBe('6');
  await expect(page.getByRole('link', { name: /OpenStreetMap contributors/ })).toHaveAttribute(
    'href',
    'https://www.openstreetmap.org/copyright',
  );

  await search.press('Enter');
  await expect.poll(() => stopCities(page)).toEqual([...SEASON, 'WORCESTER']);
  await expect.poll(() => partLabels(page)).toContain('8 WORCESTER');
  // Follow edits: the preview shows the new stop.
  const canvas = page.locator('canvas.preview');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-frame')))
    .toBeGreaterThan(300);
  // The place change can be shown or undone from its toast.
  const toast = page.locator('.toast', { hasText: 'Placed WORCESTER.' });
  await expect(toast).toBeVisible();
  await expect(toast.getByRole('button', { name: 'Show' })).toBeVisible();
  await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
  expect(geo.nominatim).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('"Search more precisely" asks Nominatim with the documented parameters', async ({ page }) => {
  const geo = await mockGeocoders(page);
  await openApp(page);
  await page.getByRole('button', { name: /^Stop 1: CHICAGO/ }).click();
  const search = page.getByRole('combobox', { name: 'Search a place or paste coordinates' });
  await search.fill('Worcester MA');
  await page.getByRole('button', { name: 'Search more precisely' }).click();
  await expect(places(page).first()).toHaveAccessibleName(
    'Worcester, Worcester County, Massachusetts, United States',
  );
  expect(geo.nominatim).toHaveLength(1);
  const url = geo.nominatim[0] as URL;
  expect(url.searchParams.get('format')).toBe('jsonv2');
  expect(url.searchParams.get('addressdetails')).toBe('1');
  expect(url.searchParams.get('accept-language')).toBe('en');
  await places(page).first().click();
  await expect.poll(() => stopCities(page)).toEqual(['WORCESTER', ...SEASON.slice(1)]);
});

test('adds a stop by pasting coordinates, which never leave the page', async ({ page }) => {
  const geo = await mockGeocoders(page);
  await openApp(page);
  await page.getByRole('button', { name: 'Add stop' }).first().click();
  const row = page.locator('.stop-row').last();
  await expect(row.locator('.status-chip', { hasText: 'Not placed' })).toBeVisible();
  const search = page.getByRole('combobox', { name: 'Search a place or paste coordinates' });
  await search.fill('42.2626, -71.8023');
  await expect(places(page)).toHaveText(/Use coordinates 42\.26260, -71\.80230/);
  await search.press('Enter');
  await expect(row.locator('.status-chip', { hasText: 'Not placed' })).toHaveCount(0);
  // The new stop is in the video now; it has no name yet, and the app says so.
  await expect(row.locator('.status-chip', { hasText: 'No name' })).toBeVisible();
  await expect(
    page.locator('.toast', { hasText: 'Placed at 42.26260, -71.80230. Type a city label.' }),
  ).toBeVisible();
  await expect(row.getByLabel('City label')).toBeFocused();
  await row.getByLabel('City label').fill('Worcester');
  await expect(row.locator('.stop-city')).toHaveText('Worcester');
  await row.getByText('More for this stop').click();
  await expect(row.getByLabel('Latitude')).toHaveValue('42.2626');
  await expect(row.getByLabel('Longitude')).toHaveValue('-71.8023');

  // A Google Maps link and a coordinate out of range stay local too.
  await search.fill('https://www.google.com/maps/@40.7127753,-74.0059728,12z');
  await expect(places(page)).toHaveText(/Use coordinates 40\.71278, -74\.00597/);
  await search.fill('95, 10');
  await expect(page.getByText('Latitude must be between -90 and 90.')).toBeVisible();
  await page.waitForTimeout(500);
  expect(geo.photon).toHaveLength(0);
  expect(geo.nominatim).toHaveLength(0);
});

test('reorders stops with the action row, Alt+Arrow and the drag handle', async ({ page }) => {
  await openApp(page);
  // The open stop's action row: move Chicago down.
  await page.getByRole('button', { name: /^Stop 1: CHICAGO/ }).click();
  const actions = page.getByRole('group', { name: 'Actions for stop 1' });
  await actions.getByRole('button', { name: 'Move down' }).click();
  await expect.poll(() => stopCities(page)).toEqual([SEASON[1], SEASON[0], ...SEASON.slice(2)]);
  await page.getByRole('button', { name: /^Stop 2: CHICAGO/ }).click();

  // Keyboard: Alt+Up on Chicago's row moves it back.
  await page.getByRole('button', { name: /^Stop 2: CHICAGO/ }).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => stopCities(page)).toEqual(SEASON);
  await expect(page.getByRole('button', { name: /^Stop 1: CHICAGO/ })).toBeFocused();

  // Pointer: drag Grand Rapids' handle above Milwaukee.
  const handle = page.getByRole('button', { name: 'Drag to reorder stop 3' });
  const target = page.locator('.stop-row').nth(1);
  // The mouse only reaches what is on screen.
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('rows not laid out');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height * 0.25, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() => stopCities(page))
    .toEqual([SEASON[0], SEASON[2], SEASON[1], ...SEASON.slice(3)]);

  // Undo restores the order.
  await page.keyboard.press('Control+z');
  await expect.poll(() => stopCities(page)).toEqual(SEASON);
});

test('deletes a stop and brings it back from the toast', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /^Stop 4: DETROIT/ }).click();
  await page
    .getByRole('group', { name: 'Actions for stop 4' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect.poll(() => stopCities(page)).not.toContain('DETROIT');
  await expect.poll(async () => (await partLabels(page)).length).toBe(8);
  const toast = page.locator('.toast', { hasText: 'Deleted DETROIT.' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => stopCities(page)).toEqual(SEASON);
  await expect.poll(() => partLabels(page)).toContain('4 DETROIT');
});

test('when place search is down, the coordinates open with a hint', async ({ page }) => {
  await mockGeocoders(page, { photonDown: true });
  await openApp(page);
  await page.getByRole('button', { name: 'Add stop' }).first().click();
  await page.getByRole('combobox', { name: 'Search a place or paste coordinates' }).fill('Salem');
  await expect(page.getByText(/Place search is offline/)).toBeVisible();
  const row = page.locator('.stop-row').last();
  await expect(row.getByLabel('Latitude')).toBeVisible();
  // The way out is one button away: it goes to Latitude.
  await row.getByRole('button', { name: 'Enter latitude and longitude' }).click();
  await expect(row.getByLabel('Latitude')).toBeFocused();
  await row.getByLabel('Latitude').fill('100');
  await expect(row.getByText('Latitude must be between -85.05 and 85.05.')).toBeVisible();
});

test('a stop without a name blocks the export with a way to fix it', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /^Stop 2: MILWAUKEE/ }).click();
  await page.locator('.stop-row').nth(1).getByLabel('City label').fill('');
  await page.getByRole('button', { name: 'Export video' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Not ready to export' });
  await expect(dialog.getByText('Stop 2 has no name.', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Go to stop 2' }).click();
  // The empty City label, which is what blocks the export.
  await expect(page.locator('.stop-row').nth(1).getByLabel('City label')).toBeFocused();
});

test('Enter right after typing a new place picks that place, not the previous results', async ({
  page,
}) => {
  const geo = await mockGeocoders(page);
  await openApp(page);
  await page.getByRole('button', { name: 'Add stop' }).first().click();
  const search = page.getByRole('combobox', { name: 'Search a place or paste coordinates' });
  await search.pressSequentially('Salem', { delay: 20 });
  await expect(places(page).first()).toHaveAccessibleName(/^Salem/);
  await search.fill('Providence');
  // The Salem rows stay dimmed while Providence loads, but they are not offered.
  await expect(search).not.toHaveAttribute('aria-activedescendant', /./);
  await search.press('Enter');
  await expect.poll(() => stopCities(page)).toEqual([...SEASON, 'PROVIDENCE']);
  expect(geo.photon.map((u) => u.searchParams.get('q'))).toEqual(['Salem', 'Providence']);
});

test('a list import never takes the project past 99 stops, and a reload keeps all 99', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Import list…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a list of stops' });
  const rows = Array.from({ length: 120 }, (_, i) => `Town ${i + 1},${(i % 80) - 40},${i - 60}`);
  await dialog.getByLabel('Stop list').fill(['city,lat,lon', ...rows].join('\n'));
  await expect(dialog.getByText('92 of 120 rows can be imported.')).toBeVisible();
  await expect(dialog.getByText(/A video holds at most 99 stops; 92 more fit\./)).toBeVisible();
  await expect(dialog.getByRole('cell', { name: 'Over the 99-stop limit' }).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Import 92 stops' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.stop-row')).toHaveCount(99);
  await expect(page.getByRole('button', { name: 'Add stop' }).first()).toBeDisabled();
  await expect(page.getByText('A video holds at most 99 stops.').first()).toBeVisible();
  await expect.poll(() => autosave(page)).toContain('Town 92');
  await page.reload();
  await expect(page.locator('canvas.preview')).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
  await expect(page.locator('.stop-row')).toHaveCount(99);
  // Nothing was dropped on the way back, so no repair notice.
  await expect(page.getByText(/Your saved project was repaired/)).toHaveCount(0);
});

test('imports a CSV list: rows with coordinates at once, others looked up and flagged', async ({
  page,
}) => {
  const geo = await mockGeocoders(page);
  await openApp(page);
  await page.getByRole('button', { name: 'Import list…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a list of stops' });
  await dialog
    .getByLabel('Stop list')
    .fill(
      'city,lat,lon,date,event\nSalem,42.5195,-70.8967,2026-10-01,Harbor race\nProvidence,,,2026-10-08,River sprint\nNowhere,95,10,,\n',
    );
  await expect(dialog.getByText('2 of 3 rows can be imported.')).toBeVisible();
  await expect(dialog.getByRole('cell', { name: 'Latitude out of range' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Import 2 stops' }).click();
  await expect(dialog).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(() => stopCities(page)).toEqual([...SEASON, 'Salem', 'Providence']);
  // Only the row without coordinates was looked up.
  expect(geo.photon.map((u) => u.searchParams.get('q'))).toEqual(['Providence']);
  const looked = page.locator('.stop-row').last();
  await expect(looked.locator('.status-chip', { hasText: 'Check location' })).toBeVisible();
});

test('pasting spreadsheet rows into the stop list opens the import with them', async ({ page }) => {
  await openApp(page);
  await page.locator('.stop-list').evaluate((el) => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Salem\t42.5195\t-70.8967\nLowell\t42.6334\t-71.3162');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  });
  const dialog = page.getByRole('dialog', { name: 'Import a list of stops' });
  await expect(dialog.getByLabel('Stop list')).toHaveValue(/Salem\t42\.5195/);
});

test('"Pick on map" places a stop where the preview is clicked', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /^Stop 1: CHICAGO/ }).click();
  const row = page.locator('.stop-row').first();
  await row.getByText('More for this stop').click();
  const lat = row.getByLabel('Latitude');
  await expect(lat).toHaveValue('41.8781');
  await row.getByRole('button', { name: 'Pick on map' }).click();
  await expect(page.getByText(/Click the map to place CHICAGO/)).toBeVisible();
  const canvas = page.locator('canvas.preview');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  // Well below the pin: a place further south.
  await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.9 } });
  await expect(page.getByText(/Click the map to place/)).toHaveCount(0);
  await expect.poll(async () => Number(await lat.inputValue())).toBeLessThan(41.5);
});
