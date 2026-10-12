import { expect, type Page, test } from '@playwright/test';
import { autosave, formatRadio, openApp, partLabels, watchErrors } from './editor/helpers';

// Reduced motion turns off autoplay: a first visit shows a still instead of playing.
test.use({ reducedMotion: 'reduce' });

/** The bundled demos in the order "Start from" lists them, with what each one shows once loaded. */
const DEMOS = [
  {
    name: 'Europe trip demo',
    hint: 'A holiday through eight cities · vertical 9:16',
    aspect: 9 / 16,
    first: '1 LISBON',
    last: '8 VIENNA',
    look: 'Midnight Cyan',
    transition: 'Fly',
  },
  {
    name: 'Race season demo',
    hint: 'A team’s season with results and medals · 16:9',
    aspect: 16 / 9,
    first: '1 CHICAGO',
    last: '7 BUFFALO',
    look: 'Orchid',
    transition: 'Flash to white',
  },
  {
    name: 'Road trip demo',
    hint: 'A loop through the parks, in miles · square 1:1',
    aspect: 1,
    first: '1 LAS VEGAS',
    last: '8 LAS VEGAS',
    look: 'Ember',
    transition: 'Dip to dark',
  },
  {
    name: 'World tour demo',
    hint: 'Nine shows around the world · 16:9',
    aspect: 16 / 9,
    first: '1 LONDON',
    last: '9 NEW YORK',
    look: 'Mono (edited)',
    transition: 'Flash to colour',
  },
  {
    name: 'Day trip demo',
    hint: 'One day in one place, hour by hour · 4:5',
    aspect: 4 / 5,
    first: '1 V&A Waterfront',
    // Eight stops, one of them hidden.
    last: '7 Stellenbosch',
    look: 'Mono',
    transition: 'Fly',
  },
] as const;

function projectName(page: Page) {
  return page.getByRole('textbox', { name: 'Project name' });
}

/** A demo's chip in the demo picker at the top of the editor ("Europe trip" for "Europe trip demo"). */
function demoChip(page: Page, demo: (typeof DEMOS)[number]) {
  return page
    .getByRole('region', { name: 'Demos' })
    .getByRole('button', { name: demo.name.replace(/ demo$/, ''), exact: true });
}

/** The loaded project is `demo`: its name, format, stops, theme and transition. */
async function expectDemo(page: Page, demo: (typeof DEMOS)[number]): Promise<void> {
  await expect(projectName(page)).toHaveValue(demo.name);
  const canvas = page.locator('canvas.preview');
  await expect
    .poll(() => canvas.evaluate((el: HTMLCanvasElement) => el.width / el.height))
    .toBeCloseTo(demo.aspect, 2);
  await expect.poll(() => partLabels(page)).toContain(demo.first);
  expect(await partLabels(page)).toContain(demo.last);
  await expect(page.locator('[data-section="look"] .sec-meta')).toHaveText(demo.look);
  await expect(page.locator('[data-section="timing"] .sec-meta')).toHaveText(
    new RegExp(` · ${demo.transition}$`),
  );
  // Nothing to repair and nothing to warn about.
  await expect(page.getByRole('alert')).toHaveCount(0);
}

test('a first visit opens the Europe trip demo with the welcome block', async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page, '/');
  await expectDemo(page, DEMOS[0]);
  await expect(formatRadio(page, '9:16')).toBeChecked();
  await expect(page.getByLabel('Title', { exact: true })).toHaveText('Europe summer 2026');
  // A still of the overview with its route drawn, not the almost empty first frame.
  await expect(page.locator('canvas.preview')).toHaveAttribute('data-frame', '56');
  const welcome = page.getByRole('region', { name: 'Welcome to Waycine' });
  await expect(welcome).toContainText('This is a demo.');
  for (const name of ['Start with my own stops', 'Blank project', 'Keep exploring']) {
    await expect(welcome.getByRole('button', { name, exact: true })).toBeVisible();
  }
  // The demo picker sits above it: the five demos, the loaded one marked, each saying what it shows.
  const picker = page.getByRole('region', { name: 'Demos' });
  await expect(picker.getByRole('button')).toHaveText(
    DEMOS.map((demo) => demo.name.replace(/ demo$/, '')),
  );
  for (const demo of DEMOS) {
    await expect(demoChip(page, demo)).toHaveAttribute('title', demo.hint);
    await expect(demoChip(page, demo)).toHaveAttribute(
      'aria-pressed',
      demo === DEMOS[0] ? 'true' : 'false',
    );
  }
  const pickerBox = await picker.boundingBox();
  const welcomeBox = await welcome.boundingBox();
  expect(pickerBox?.y ?? 0).toBeLessThan(welcomeBox?.y ?? 0);
  expect(errors).toEqual([]);
});

test('the demo picker opens every demo with one click; "Start from" lists them too', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openApp(page, '/');
  // An unedited demo is replaced without asking.
  for (const demo of [...DEMOS.slice(1), DEMOS[0]]) {
    await demoChip(page, demo).click();
    await expectDemo(page, demo);
    await expect(demoChip(page, demo)).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('region', { name: 'Demos' }).locator('[aria-pressed="true"]'),
    ).toHaveCount(1);
    // Loading a demo ends the first visit: the welcome block is gone, the picker stays.
    await expect(page.getByRole('region', { name: 'Welcome to Waycine' })).toHaveCount(0);
  }

  await page.getByRole('button', { name: 'Start from…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Start from' })).toBeVisible();
  // My own stops, the five demos in order, a blank project.
  await expect(dialog.locator('.choice-list').first().locator('.choice-title')).toHaveText([
    'My own stops',
    ...DEMOS.map((demo) => demo.name),
    'Blank project',
  ]);
  for (const demo of DEMOS) {
    await expect(dialog.locator('.choice', { hasText: demo.name }).first()).toContainText(
      demo.hint,
    );
  }
  await dialog.locator('.choice', { hasText: DEMOS[2].name }).first().click();
  await expect(dialog).toHaveCount(0);
  await expectDemo(page, DEMOS[2]);
  expect(errors).toEqual([]);
});

test('the demo picker asks before replacing an edited project, also after a reload', async ({
  page,
}) => {
  const title = page.getByLabel('Title', { exact: true });
  const question = page
    .getByRole('dialog')
    .getByRole('heading', { name: 'Replace the current project?' });
  await openApp(page, '/');
  await title.fill('MY EDITED TRIP');

  // Cancel closes the question and keeps everything.
  await demoChip(page, DEMOS[2]).click();
  await expect(question).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(title).toHaveText('MY EDITED TRIP');

  // After a reload the saved project still counts as edited.
  await expect.poll(() => autosave(page)).toContain('MY EDITED TRIP');
  await page.reload();
  await expect(page.locator('canvas.preview')).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
  await expect(title).toHaveText('MY EDITED TRIP');
  await demoChip(page, DEMOS[2]).click();
  await expect(question).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Replace' }).click();
  await expectDemo(page, DEMOS[2]);

  // The replaced project is in Recent; opened from there it is nobody's demo.
  await page.getByRole('button', { name: 'Start from…' }).click();
  await page
    .getByRole('dialog')
    .locator('.recent-list')
    .getByRole('button', { name: /^Europe trip demo/ })
    .click();
  await expect(title).toHaveText('MY EDITED TRIP');
  await expect(
    page.getByRole('region', { name: 'Demos' }).locator('[aria-pressed="true"]'),
  ).toHaveCount(0);
});

/** The query of the page's address. */
function query(page: Page): string {
  return new URL(page.url()).search;
}

test('a demo link opens that demo on a first visit and leaves the address', async ({ browser }) => {
  const visit = async (path: string) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await openApp(page, path);
    return { page, close: () => context.close() };
  };

  const road = await visit('/?demo=road-trip');
  await expectDemo(road.page, DEMOS[2]);
  // A first visit like any other: the welcome block, and nothing to keep or go back to.
  await expect(road.page.getByRole('region', { name: 'Welcome to Waycine' })).toBeVisible();
  await expect(road.page.getByText('You opened a demo.', { exact: false })).toHaveCount(0);
  expect(query(road.page)).toBe('');
  await road.close();

  // A name that is not a demo opens the default.
  const unknown = await visit('/?demo=season-2026');
  await expectDemo(unknown.page, DEMOS[0]);
  expect(query(unknown.page)).toBe('');
  await unknown.close();
});

test('a demo link over a saved project asks first: back to mine, or keep the demo', async ({
  page,
}) => {
  const title = page.getByLabel('Title', { exact: true });
  const notice = page.getByText('You opened a demo. Keep it, or go back to your own project?');
  await openApp(page, '/?demo=road-trip');
  await title.fill('MY OWN LOOP');
  await expect.poll(() => autosave(page)).toContain('MY OWN LOOP');

  // The demo shows, the saved project is not touched, and the address is plain again.
  await openApp(page, '/?demo=day-trip');
  await expectDemo(page, DEMOS[4]);
  await expect(notice).toBeVisible();
  await expect(page.locator('.save-state')).toHaveText('Demo link');
  expect(query(page)).toBe('');
  await page.waitForTimeout(800);
  expect(await autosave(page)).toContain('MY OWN LOOP');

  await page.getByRole('button', { name: 'Back to my project' }).click();
  await expect(projectName(page)).toHaveValue('Road trip demo');
  await expect(title).toHaveText('MY OWN LOOP');
  await expect(notice).toHaveCount(0);

  // Keeping the demo saves it; the project it replaces is kept in Recent.
  await openApp(page, '/?demo=day-trip');
  await page.getByRole('button', { name: 'Keep this project' }).click();
  await expect(notice).toHaveCount(0);
  await expect.poll(() => autosave(page)).toContain('Day trip demo');
  await page.getByRole('button', { name: 'Start from…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.locator('.recent-list').getByRole('button', { name: /^Road trip demo/ }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  // A reload opens what is saved, not the link again; an unknown name changes nothing.
  await page.reload();
  await expect(page.locator('canvas.preview')).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
  await expect(projectName(page)).toHaveValue('Day trip demo');
  await expect(notice).toHaveCount(0);
  await openApp(page, '/?demo=nowhere');
  await expect(projectName(page)).toHaveValue('Day trip demo');
  await expect(notice).toHaveCount(0);
  expect(query(page)).toBe('');
});
