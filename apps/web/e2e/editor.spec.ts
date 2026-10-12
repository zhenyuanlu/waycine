import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import {
  autosave,
  canvasHash,
  formatRadio,
  openAllSettings,
  openApp,
  openGroup,
  showFrame,
  topRowShare,
  watchErrors,
} from './editor/helpers';

test.use({ reducedMotion: 'reduce' });

/** The Look section's live summary (the theme's name). */
function lookSummary(page: Page) {
  return page.locator('[data-section="look"] .sec-meta');
}

test('first visit: welcome block, numbered sections and no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  const welcome = page.getByRole('region', { name: 'Welcome to Waycine' });
  await expect(welcome).toBeVisible();
  for (const name of ['Stops', 'Titles & text', 'Look', 'Timing', 'Finale stats', 'Video']) {
    await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
  }
  await welcome.getByRole('button', { name: 'Keep exploring' }).click();
  await expect(welcome).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('editing the title changes the preview; undo and redo work from the keyboard', async ({
  page,
}) => {
  await openApp(page);
  await showFrame(page, 40);
  const before = await canvasHash(page);
  const title = page.getByLabel('Title', { exact: true });
  await expect(title).toHaveText('2026 SEASON ROUTE');
  await title.fill('SUMMER ON THE WATER');
  await expect.poll(() => canvasHash(page)).not.toBe(before);
  const edited = await canvasHash(page);
  // The changed-value dot resets the field.
  await expect(page.getByRole('button', { name: 'Title is changed. Reset it.' })).toBeVisible();

  // (Exact pixels of the first frames drawn can differ slightly from later
  // draws of the same text on a GPU canvas, so undo is checked against the edit.)
  await page.keyboard.press('Control+z');
  await expect(title).toHaveText('2026 SEASON ROUTE');
  await expect.poll(() => canvasHash(page)).not.toBe(edited);
  await expect(page.getByRole('button', { name: 'Title is changed. Reset it.' })).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(title).toHaveText('SUMMER ON THE WATER');
  await page.getByRole('button', { name: 'Title is changed. Reset it.' }).click();
  await expect(title).toHaveText('2026 SEASON ROUTE');
});

test('a theme row recolours the preview; a colour edit marks it edited', async ({ page }) => {
  await openApp(page);
  expect(await topRowShare(page, [0x07, 0x07, 0x0b])).toBeGreaterThan(0.8);
  const ember = page.getByRole('radio', { name: /^Ember/ });
  await ember.click();
  await expect(ember).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => topRowShare(page, [0x0c, 0x08, 0x06])).toBeGreaterThan(0.8);
  await expect(lookSummary(page)).toHaveText('Ember');

  await page.locator('[data-path="theme.accent"] input.hex').fill('#22CC88');
  await expect(lookSummary(page)).toHaveText('Ember (edited)');
  await expect(ember).toHaveAccessibleName('Ember (edited)');
  // "Reset to theme" puts the theme's own colours back.
  await page.getByRole('button', { name: 'Reset to theme' }).click();
  await expect(lookSummary(page)).toHaveText('Ember');
  // Colour names work too.
  const accent = page.locator('[data-path="theme.accent"] input.hex');
  await accent.fill('orange');
  await accent.press('Enter');
  await expect(accent).toHaveValue('#FFA500');
  await expect(lookSummary(page)).toHaveText('Ember (edited)');
  // Another theme replaces the edited colours, with Undo.
  await page.getByRole('radio', { name: /^Mono/ }).click();
  const toast = page.locator('.toast', { hasText: 'Your edited colours were replaced.' });
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(lookSummary(page)).toHaveText('Ember (edited)');
});

test('the transition is a choice: Fly, Flash to white, Dip to dark or Flash to colour', async ({
  page,
}) => {
  await openApp(page);
  const group = page.getByRole('radiogroup', { name: 'Transition between stops' });
  const radio = (name: RegExp) => group.getByRole('radio', { name });
  const summary = page.locator('[data-section="timing"] .sec-meta');
  const flash = page.locator('[data-path="theme.flash"] input.hex');
  await expect(radio(/^Flash to white/)).toBeChecked();
  await expect(flash).toBeEnabled();
  await expect(flash).toHaveValue('#FFFFFF');

  await radio(/^Fly/).click();
  await expect(radio(/^Fly/)).toBeChecked();
  await expect(flash).toBeDisabled();
  await expect(summary).toHaveText(/ · Fly$/);

  // Dip to dark fades through the background, and the disabled field shows that colour.
  await radio(/^Dip to dark/).click();
  await expect(summary).toHaveText(/ · Dip to dark$/);
  await expect(flash).toBeDisabled();
  await expect(flash).toHaveValue('#07070B');

  // Another flash colour is its own choice; Flash to white puts white back.
  await radio(/^Flash to white/).click();
  await expect(flash).toBeEnabled();
  await flash.fill('#FFCC00');
  await expect(radio(/^Flash to colour/)).toBeChecked();
  await expect(summary).toHaveText(/ · Flash to colour$/);
  await radio(/^Flash to white/).click();
  await expect(flash).toHaveValue('#FFFFFF');
  await expect(page.locator('[data-section="look"] .sec-meta')).toHaveText('Orchid');

  // The project says how: zoom through, into the background colour.
  await radio(/^Dip to dark/).click();
  await page.getByRole('button', { name: /View and edit JSON/ }).click();
  const json = page.getByRole('textbox', { name: 'Project JSON' });
  await expect(json).toHaveValue(/"flashTo": "background"/);
});

test('the description line: chips, "Shows as" and where it shows', async ({ page }) => {
  await openApp(page);
  await showFrame(page, 40);
  const before = await canvasHash(page);
  const row = page.locator('.frow-wrap[data-path="text.description"]');
  const field = row.getByRole('textbox', { name: 'Description' });
  await field.click();
  await page.keyboard.type('Demo crew, ');
  await row.getByRole('button', { name: 'Insert km' }).click();
  // The chip brings its noun (the number, then "KM"); typing goes on after it (each key is
  // an edit; the caret must not jump).
  await page.keyboard.type(' rowed');
  await expect(row.locator('.shows-as .vid')).toHaveText(/^DEMO CREW, \d[\d,]* KM ROWED$/);
  await expect.poll(() => canvasHash(page)).not.toBe(before);
  const at = row.page().locator('.frow-wrap[data-path="text.descriptionAt"] select');
  await expect(at).toHaveAccessibleName('Show description');
  // "Intro and finale" draws the line under the finale stats too.
  await showFrame(page, 420);
  const finale = await canvasHash(page);
  await at.selectOption({ label: 'Intro and finale' });
  await expect(at.locator('option:checked')).toHaveText('Intro and finale');
  await expect.poll(() => canvasHash(page)).not.toBe(finale);
});

test('choosing a transition shows it; a paused flash is held back and tagged', async ({ page }) => {
  await openApp(page);
  await showFrame(page, 0);
  const group = page.getByRole('radiogroup', { name: 'Transition between stops' });
  await group.getByRole('radio', { name: /^Fly/ }).click();
  await group.getByRole('radio', { name: /^Flash to white/ }).click();
  // With reduced motion the preview pauses on the last frame before the first cut between
  // two stops, where the flash would peak: it is held back, and the overlay says so.
  const canvas = page.locator('canvas.preview');
  await expect.poll(async () => Number(await canvas.getAttribute('data-frame'))).toBeGreaterThan(0);
  await expect(page.locator('.overlay .flash-tag')).toBeVisible();
  expect(await topRowShare(page, [255, 255, 255])).toBeLessThan(0.5);
});

test('chip fields: Ctrl+A and Home reach a leading chip; INSERT works at the caret', async ({
  page,
}) => {
  await openApp(page);
  const row = page.locator('.frow-wrap[data-path="text.subtitle"]');
  const field = row.getByRole('textbox', { name: 'Subtitle' });
  const shows = row.locator('.shows-as .vid');
  // The subtitle starts with a chip: select all and retype replaces all of it.
  await field.focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Summer');
  await expect(shows).toHaveText('SUMMER');
  await expect(row.locator('.tok')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(row.locator('.tok')).toHaveCount(2);
  // Home goes before the leading chip.
  await field.focus();
  await page.keyboard.press('Home');
  await page.keyboard.type('X');
  await expect(shows).toHaveText(/^X7 RACES/);

  // From the keyboard: the caret stays where it was while Tab reaches INSERT.
  const desc = page.locator('.frow-wrap[data-path="text.description"]');
  const descField = desc.getByRole('textbox', { name: 'Description' });
  await descField.click();
  await page.keyboard.type('AB');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Tab');
  await expect(desc.getByRole('button', { name: 'Insert stops' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(desc.locator('.shows-as .vid')).toHaveText('A 7 STOPSB');
  // Enter right after a chip opens its editor; Esc closes it and returns to the field.
  await expect(descField).toBeFocused();
  await page.keyboard.press('Enter');
  const pop = page.getByRole('dialog', { name: 'Change the stops token' });
  await expect(pop).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(descField).toBeFocused();
  // "More…" lists the other things to insert, with their values now.
  await desc.getByRole('button', { name: 'More…' }).click();
  await expect(page.getByRole('menuitem', { name: 'Insert miles' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Insert year' }).click();
  await expect(desc.locator('.shows-as .vid')).toHaveText(/^A 7 STOPS 2026B$/);
});

test('timeline labels stay whole or show their number, also while playing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  const clipped = await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('.tl-input');
    if (!input) return ['no timeline'];
    const bad = new Set<string>();
    for (let f = 0; f <= Number(input.max); f += 3) {
      input.value = String(f);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      for (const cell of document.querySelectorAll<HTMLElement>('.tl-lab')) {
        const full = cell.querySelector<HTMLElement>('.full');
        if (
          full &&
          full.scrollWidth > cell.clientWidth + 0.5 &&
          !cell.classList.contains('short')
        ) {
          bad.add(full.textContent ?? '');
        }
      }
    }
    return [...bad];
  });
  expect(clipped).toEqual([]);
});

test('Loop is off by default, shown in the transport and toggled with L', async ({ page }) => {
  await openApp(page);
  const loopButton = page.getByRole('button', { name: 'Loop', exact: true });
  await expect(loopButton).toHaveAttribute('aria-pressed', 'false');
  await page.locator('body').press('l');
  await expect(loopButton).toHaveAttribute('aria-pressed', 'true');
  await loopButton.click();
  await expect(loopButton).toHaveAttribute('aria-pressed', 'false');
});

test('the export dialog chooses the format; a number past its limit says so', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Export video', exact: true }).first().click();
  const dialog = page.locator('dialog[open]');
  const format = dialog.getByRole('radiogroup', { name: 'Format' });
  await format.getByRole('radio', { name: '9:16', exact: true }).click();
  await expect(dialog.getByText('Portrait · 29.97 fps')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /^1080p/ })).toContainText('1080 × 1920');
  await expect(formatRadio(page, '9:16')).toBeChecked();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  const stop = page.locator('[data-path="timing.stopSec"]').getByRole('spinbutton');
  await stop.fill('999');
  await stop.press('Enter');
  await expect(page.locator('[data-path="timing.stopSec"]').getByRole('status')).toHaveText(
    /^Kept at the limit: \S+ s\.$/,
  );
});

test('chip fields keep the caret: End after a trailing chip, one Backspace per chip', async ({
  page,
}) => {
  await openApp(page);
  const row = page.locator('.frow-wrap[data-path="text.subtitle"]');
  const shows = row.locator('.shows-as .vid');
  // The subtitle ends with a chip; End and typing go after it.
  await row.getByRole('textbox', { name: 'Subtitle' }).focus();
  await page.keyboard.press('End');
  await page.keyboard.type(' 2026');
  await expect(shows).toHaveText(/^7 RACES +\/ +5 STATES 2026$/);
  // Backspace deletes the typed text, then the whole chip at once.
  for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
  await expect(shows).toHaveText(/^7 RACES +\/$/);
});

test('All settings search and groups reach every setting', async ({ page }) => {
  await openApp(page);
  await openAllSettings(page);
  const search = page.getByRole('searchbox', { name: 'Search settings' });
  await search.fill('glow blur');
  await expect(page.locator('.row[data-path="route.glowBlur"]')).toBeVisible();
  await expect(page.locator('.row[data-path="theme.route"]')).toHaveCount(0);
  // Searching matches JSON paths too.
  await search.fill('timing.transition.zoomGain');
  await expect(page.locator('.row[data-path="timing.transition.zoomGain"]')).toBeVisible();
  await search.press('Escape');
  await expect(search).toHaveValue('');

  for (const name of ['Camera', 'Route', 'Pins', 'Stop card', 'Map grid & HUD', 'Layout']) {
    await expect(page.getByRole('heading', { level: 3, name, exact: true })).toBeAttached();
  }
  await formatRadio(page, '9:16').check();
  await openGroup(page, 'Layout');
  const row = page.locator('.row[data-path="layouts.portrait.title.size"]');
  await expect(row.locator('.ptag')).toHaveText('9:16');
  await row.getByRole('spinbutton').fill('80');
  await expect(row.getByRole('spinbutton')).toHaveValue('80');
  await expect(row.locator('.u')).toHaveText('px');
  await expect(row).toHaveClass(/is-changed/);
  // The changed filter shows it; "Reset changed" puts it back with Undo.
  await page.getByRole('button', { name: /^Changed/ }).click();
  await expect(page.locator('.row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Reset changed (2)' }).click();
  await expect(page.getByText('Nothing is changed yet.')).toBeVisible();
  await expect(formatRadio(page, '16:9')).toBeChecked();
});

test('reload keeps the autosaved project', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('Title', { exact: true }).fill('KEPT AFTER RELOAD');
  await page.getByRole('radio', { name: /^Mono/ }).click();
  // The autosave waits 500 ms after the last edit.
  await expect.poll(() => autosave(page)).toContain('"id":"mono"');
  const saved = await page.evaluate(() => localStorage.getItem('waycine:v1:autosave'));
  expect(saved).toContain('KEPT AFTER RELOAD');
  await expect(page.locator('.save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.locator('canvas.preview')).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
  await expect(page.getByLabel('Title', { exact: true })).toHaveText('KEPT AFTER RELOAD');
  await expect(lookSummary(page)).toHaveText('Mono');
  // Not a first visit any more: no welcome block.
  await expect(page.getByRole('region', { name: 'Welcome to Waycine' })).toHaveCount(0);
  // The starting point survives too: the title still shows as changed.
  await expect(page.getByRole('button', { name: 'Title is changed. Reset it.' })).toBeVisible();
});

test('saves and opens .waycine.json files; a damaged file lists its problems', async ({
  page,
}, testInfo) => {
  await openApp(page);
  await page.getByLabel('Title', { exact: true }).fill('SAVED TITLE');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('race-season-demo.waycine.json');
  const savedPath = testInfo.outputPath('saved.waycine.json');
  await file.saveAs(savedPath);
  const saved = JSON.parse(await readFile(savedPath, 'utf8')) as Record<string, unknown>;
  expect(saved.$schema).toBe('https://zhenyuanlu.github.io/waycine/schema/v1.json');
  expect(saved.text).toMatchObject({ title: 'SAVED TITLE' });
  expect(saved.stops).toHaveLength(7);
  expect(saved).not.toHaveProperty('camera'); // defaults are left out

  // Open a changed copy.
  const changed = { ...saved, text: { ...(saved.text as object), title: 'OPENED TITLE' } };
  await page.locator('#open-project-input').setInputFiles({
    name: 'trip.waycine.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(changed)),
  });
  await expect(page.getByLabel('Title', { exact: true })).toHaveText('OPENED TITLE');

  // Values out of range: the file is listed with its problems and loads only on request.
  const damaged = { ...changed, route: { coreWidth: 'thick' }, output: { fps: 17 }, stops: [] };
  await page.locator('#open-project-input').setInputFiles({
    name: 'damaged.waycine.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(damaged)),
  });
  const dialog = page.getByRole('dialog', { name: 'damaged.waycine.json has problems' });
  await expect(dialog).toBeVisible();
  // Problems are named by their labels; the paths are under "Technical details".
  await expect(dialog.getByText(/^Line width: Expected a number, got "thick"/)).toBeVisible();
  await expect(dialog.getByText(/^Frame rate: 17 is not supported/)).toBeVisible();
  await dialog.getByText('Technical details').click();
  await expect(dialog.getByText(/route\.coreWidth \[wrong-type\]/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Load with defaults for invalid fields' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Add a stop to see your journey.')).toBeVisible();

  // Not JSON at all.
  await page.locator('#open-project-input').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ this is not json'),
  });
  const broken = page.getByRole('dialog', { name: 'notes.json could not be opened' });
  await expect(broken).toBeVisible();
  await expect(broken.getByText(/This file is damaged or is not a Waycine project/)).toBeVisible();
  // The parser's message waits under "Technical details".
  await expect(broken.locator('pre.error-detail')).toBeHidden();
});

test('"Start from…" asks before replacing an edited project and keeps it in Recent', async ({
  page,
}) => {
  await openApp(page);
  await formatRadio(page, '1:1').check();
  await page.getByRole('button', { name: 'Start from…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Europe trip demo/ }).click();
  await expect(dialog.getByRole('heading', { name: 'Replace the current project?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Replace' }).click();
  await expect(formatRadio(page, '9:16')).toBeChecked();
  await expect(page.locator('.tl-lab .full', { hasText: '1 LISBON' })).toBeVisible();

  await page.getByRole('button', { name: 'Start from…' }).click();
  const recent = page.getByRole('dialog').locator('.recent-list');
  await expect(recent.getByRole('button', { name: /^Race season demo/ })).toBeVisible();
  // Unedited: switching does not ask.
  await recent.getByRole('button', { name: /^Race season demo/ }).click();
  await expect(formatRadio(page, '1:1')).toBeChecked();
  await expect(page.locator('.tl-lab .full', { hasText: '1 CHICAGO' })).toBeVisible();
});

test('an uploaded font is used on this device and missing elsewhere', async ({ page }) => {
  await openApp(page);
  await openAllSettings(page);
  await openGroup(page, 'Look');
  const fontFile = fileURLToPath(
    new URL('../../../packages/waycine/fonts/BarlowSemiCondensed-SemiBold.ttf', import.meta.url),
  );
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload font: Display font' }).click();
  await (await chooser).setFiles(fontFile);
  await expect(
    page.getByText('Using BarlowSemiCondensed-SemiBold.ttf (uploaded on this device)'),
  ).toBeAttached();
  // The width scale restarts at 1 for the new font.
  await expect(
    page.locator('.row[data-path="fonts.display.widthAdjust"]').getByRole('spinbutton'),
  ).toHaveValue('1');

  // A project that names an uploaded font this device does not have.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('waycine:v1:autosave')))
    .toContain('"source":"local"');
  await page.locator('#open-project-input').setInputFiles({
    name: 'with-font.waycine.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        meta: { name: 'Font test' },
        stops: [{ id: 'a', city: 'Boston', lat: 42.36, lon: -71.06 }],
        fonts: { body: { family: 'WaycineLocal_gone', source: 'local', localId: 'gone' } },
      }),
    ),
  });
  await expect(page.getByText(/Font missing on this device: the body font/)).toBeVisible();
  await expect(page.locator('canvas.preview')).toHaveAttribute('data-ready', 'true');
});

test('on a phone, one section shows at a time and the export dialog fits the screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.getByRole('button', { name: 'Keep exploring' }).click();
  const bar = page.getByRole('tablist', { name: 'Editor sections' });
  await bar.getByRole('tab', { name: 'All' }).click();
  const search = page.getByRole('searchbox', { name: 'Search settings' });
  await search.fill('glow');
  await expect(page.locator('.row[data-path="route.glowBlur"]')).toBeVisible();
  // The preview stays on screen in All settings.
  await expect(page.locator('canvas.preview')).toBeInViewport();

  await bar.getByRole('tab', { name: 'Timing' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Transition between stops' })).toBeVisible();
  await expect(page.locator('[data-section="stops"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Export video' })).toBeVisible();
  // The main action stays at the bottom of the sheet.
  await expect(dialog.getByRole('button', { name: 'Export video' })).toBeInViewport();
});

test('a partial project file asks before replacing the whole project, and Undo brings it back', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: /View and edit JSON/ }).click();
  const fileDialog = page.getByRole('dialog', { name: 'Project file' });
  const text = fileDialog.getByRole('textbox', { name: 'Project JSON' });
  await text.fill('{ "version": 1, "timing": { "stopSec": 2 }, "text": { "title": "42" } }');
  await fileDialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Replace the whole project?' });
  await expect(
    confirm.getByText('This replaces the whole project: 7 stops become 0.'),
  ).toBeVisible();
  // The demo differs from the defaults in these parts; the draft names only timing and text.
  await expect(
    confirm.getByText('These parts go back to the defaults: project name, finale stats.'),
  ).toBeVisible();
  // Cancel is focused and keeps everything.
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveText('2026 SEASON ROUTE');

  // The draft is still there.
  await page.getByRole('button', { name: /View and edit JSON/ }).click();
  await expect(text).toHaveValue(/"title": "42"/);
  await fileDialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await confirm.getByRole('button', { name: 'Apply anyway' }).click();
  // Repairs are listed in the reopened dialog.
  await expect(fileDialog.getByText(/^Applied with \d+ issues?:$/)).toBeVisible();
  await fileDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveText('42');
  await expect(page.getByText('Add a stop to see your journey.')).toBeVisible();
  // No stop to draw: the readout is back at the start.
  await expect(page.getByText('0:00.0 / 0:00.0')).toBeVisible();
  const toast = page.locator('.toast', { hasText: 'Applied JSON.' });
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveText('2026 SEASON ROUTE');
});

test('Subtitle and Stop label say what the video shows; bad numbers say why in words', async ({
  page,
}) => {
  await openApp(page);
  const subtitle = page.locator('[data-path="text.subtitle"] .shows-as');
  await expect(subtitle).toHaveText(/^Shows as\s+7 RACES +\/ +5 STATES$/);
  await expect(page.locator('[data-path="text.kicker"] .shows-as')).toHaveText(
    /^Shows as \(stop 1\)\s+RACE 01 \/ 07$/,
  );
  // Raw token syntax never shows: the subtitle's tokens are chips.
  await expect(page.locator('[data-path="text.subtitle"] .tok')).toHaveCount(2);
  await expect(page.locator('.video-length')).toHaveText(
    /^0:14\.7 · 440 frames · intro, 7 stops, finale$/,
  );

  // An out-of-range number is explained under the field (not only a red border).
  const row = page.locator('[data-path="timing.stopSec"]');
  const box = row.getByRole('spinbutton');
  await box.fill('0');
  const error = row.getByRole('alert');
  await expect(error).toHaveText(/^Enter a number from \S+ to \S+\.$/);
  const describedBy = (await box.getAttribute('aria-describedby')) ?? '';
  expect(describedBy.split(' ')).toContain(await error.getAttribute('id'));
  await box.blur();
  await expect(row.getByRole('alert')).toHaveCount(0);
  await expect(box).not.toHaveValue('0');

  // Own stops: an empty title with a placeholder, and counts read zero instead of token syntax.
  await page.getByRole('button', { name: 'Start with my own stops' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveText('');
  await expect(page.getByLabel('Title', { exact: true })).toHaveAttribute(
    'aria-placeholder',
    'YOUR TITLE',
  );
  await expect(subtitle).toHaveText(/^Shows as\s+0 STOPS +\/ +0 KM$/);
});

test('on a short phone screen, typing shrinks the preview, keeps the play row and hides the bottom bar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 480 });
  await openApp(page);
  await page.getByRole('button', { name: 'Keep exploring' }).click();
  const stage = page.locator('main.stage');
  const bar = page.getByRole('tablist', { name: 'Editor sections' });
  await expect(stage).not.toHaveClass(/is-keyboard/);
  await expect(bar).toBeVisible();
  await bar.getByRole('tab', { name: 'Text' }).click();
  await page.getByLabel('Title', { exact: true }).focus();
  await expect(stage).toHaveClass(/is-keyboard/);
  // The preview stays on screen (120 px) with its play row; only the bottom bar goes.
  await expect(page.locator('canvas.preview')).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Play|Pause)$/ })).toBeVisible();
  expect((await page.locator('.frame-box').boundingBox())?.height).toBe(120);
  await expect(bar).toBeHidden();
  await page.getByLabel('Title', { exact: true }).blur();
  await expect(stage).not.toHaveClass(/is-keyboard/);
  await expect(bar).toBeVisible();
});

test('on a tall phone screen, focusing a field moves nothing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.getByRole('button', { name: 'Keep exploring' }).click();
  await page
    .getByRole('tablist', { name: 'Editor sections' })
    .getByRole('tab', { name: 'Text' })
    .click();
  const before = await page.locator('.side').boundingBox();
  await page.getByLabel('Title', { exact: true }).focus();
  await expect(page.locator('main.stage')).not.toHaveClass(/is-keyboard/);
  expect(await page.locator('.side').boundingBox()).toEqual(before);
});

test('Tab reaches "Skip to editor" first and it lands on the editor', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('button', { name: 'Skip to editor' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#editor')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('tab', { name: 'Basics' })).toBeFocused();
  // The demo picker comes first in the editor.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Europe trip', exact: true })).toBeFocused();
});

test('the theme menu switches the chrome to dark and back', async ({ page }) => {
  await openApp(page);
  const paper = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await paper()).toBe('rgb(250, 250, 248)');
  await page.getByRole('button', { name: 'Colour theme' }).click();
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await paper()).toBe('rgb(17, 17, 19)');
  await page.getByRole('button', { name: 'Colour theme' }).click();
  await page.getByRole('menuitemradio', { name: 'System' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
});

test('theater mode hides the editor and gives the stage the room', async ({ page }) => {
  await openApp(page);
  const canvas = page.locator('canvas.preview');
  const width = async () => (await canvas.boundingBox())?.width ?? 0;
  const before = await width();
  await page.getByRole('button', { name: 'Hide editor' }).click();
  await expect(page.locator('#editor')).toBeHidden();
  await expect.poll(width).toBeGreaterThan(before + 100);
  await page.keyboard.press('\\');
  await expect(page.locator('#editor')).toBeVisible();
});

test('"/" opens All settings at its search field', async ({ page }) => {
  await openApp(page);
  await page.locator('body').press('/');
  await expect(page.getByRole('searchbox', { name: 'Search settings' })).toBeFocused();
  await page.keyboard.type('flash');
  await expect(page.locator('.row[data-path="theme.flash"]')).toBeVisible();
});
