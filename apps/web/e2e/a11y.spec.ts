import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { mockGeocoders, openAllSettings, openApp } from './editor/helpers';

/**
 * Accessibility: axe (WCAG 2.x A and AA, plus best practice) finds nothing on
 * the main views and on the states that only exist while something is open:
 * menus, the chip editor, the place list, the project-file dialog and the
 * export dialog in setup, progress and done.
 */

test.use({ reducedMotion: 'reduce' });
// Each scan of a full page takes seconds while the other specs run in parallel.
test.describe.configure({ timeout: 120_000 });

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function expectNoViolations(page: Page, name: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const found = result.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(found, name).toEqual([]);
}

/**
 * The matrix: the first-run view, All settings open and the export dialog open, on a desktop
 * window and a phone, in the light and the dark colour scheme.
 */
const VIEWS = [
  { name: 'desktop', width: 1440, height: 900, phone: false },
  { name: 'phone', width: 390, height: 844, phone: true },
] as const;
for (const view of VIEWS) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${view.name}, ${scheme}: first run, All settings and the export dialog`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: view.width, height: view.height });
      // The first visit a user gets: the Europe trip demo.
      await openApp(page, '/');
      await expectNoViolations(page, `${view.name} ${scheme}: first run`);

      if (view.phone) {
        await page
          .getByRole('tablist', { name: 'Editor sections' })
          .getByRole('tab', { name: 'All' })
          .click();
        await expect(page.getByRole('searchbox', { name: 'Search settings' })).toBeVisible();
      } else {
        await openAllSettings(page);
      }
      await expectNoViolations(page, `${view.name} ${scheme}: All settings`);

      await page.locator('.export-btn').first().click();
      const dialog = page.locator('dialog[open]');
      await expect(dialog.getByRole('button', { name: 'Export video' })).toBeEnabled({
        timeout: 30_000,
      });
      await expectNoViolations(page, `${view.name} ${scheme}: export dialog`);
    });
  }
}

test('desktop: first run, an open stop with its place list, the chip editor and menus', async ({
  page,
}) => {
  await mockGeocoders(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await expectNoViolations(page, 'first run');

  await page.getByRole('button', { name: /^Stop 1: CHICAGO/ }).click();
  await page.getByRole('combobox', { name: 'Search a place or paste coordinates' }).fill('Worc');
  await expect(page.getByRole('option').first()).toBeVisible({ timeout: 10_000 });
  await expectNoViolations(page, 'place list');
  await page.keyboard.press('Escape');

  // The chip editor, opened from the keyboard: End, then Enter right after the last chip.
  await page.getByRole('textbox', { name: 'Subtitle' }).focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Change the regions token' })).toBeVisible();
  await expectNoViolations(page, 'chip editor');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Colour theme' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expectNoViolations(page, 'theme menu');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /View and edit JSON/ }).click();
  await expect(page.getByRole('textbox', { name: 'Project JSON' })).toBeVisible();
  await expectNoViolations(page, 'project file dialog');
});

test('All settings with every group open, in the dark theme', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page);
  await openAllSettings(page);
  const closed = page.locator('.grp-toggle[aria-expanded="false"]');
  while ((await closed.count()) > 0) await closed.first().click();
  await expectNoViolations(page, 'All settings, dark');
});

test('wide screens: inline help at 2560, the docked column at 3440', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await openApp(page);
  await page.locator('.rail-i').nth(6).click();
  await expectNoViolations(page, '2560 inline help');
  await page.setViewportSize({ width: 3440, height: 1440 });
  await expect(page.locator('.dock')).toBeVisible();
  await expectNoViolations(page, '3440 docked');
});

test('the File menu at 1100 px and the phone More menu', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await openApp(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expectNoViolations(page, 'File menu');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expectNoViolations(page, 'phone More menu');
});

test('the export dialog in setup, progress and done', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);
  await page.getByRole('button', { name: 'Export video', exact: true }).first().click();
  const dialog = page.locator('dialog[open]');
  const start = dialog.getByRole('button', { name: 'Export video' });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await dialog.getByRole('radio', { name: /^720p/ }).click();
  await expectNoViolations(page, 'export setup');
  await start.click();
  await expect(dialog.locator('.x-pct')).toBeVisible();
  await expectNoViolations(page, 'export progress');
  await expect(dialog.locator('.export-done')).toBeVisible({ timeout: 90_000 });
  await expectNoViolations(page, 'export done');
});
