import { expect, test } from '@playwright/test';
import { autosave, formatRadio, openApp, RACE_SEASON } from './editor/helpers';

test.use({ reducedMotion: 'reduce' });

test('a share link round-trips the project into a new page without touching its autosave', async ({
  page,
  browser,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openApp(page);
  await page.getByLabel('Title', { exact: true }).fill('SHARED SEASON');
  await page.getByRole('radio', { name: /^Midnight Cyan/ }).click();
  await formatRadio(page, '9:16').check();

  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Share link' });
  const input = dialog.getByLabel('Link');
  await expect(input).toHaveValue(/#p=[A-Za-z0-9_-]+$/);
  const link = await input.inputValue();
  expect(link.length).toBeLessThan(8000);
  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await expect(dialog.getByText('Link copied.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  // A fresh browser profile opens the link.
  const other = await browser.newContext({ reducedMotion: 'reduce' });
  const viewer = await other.newPage();
  await viewer.goto('/');
  await expect(viewer.locator('canvas.preview')).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
  await viewer.getByLabel('Title', { exact: true }).fill('MY OWN PROJECT');
  await expect.poll(() => autosave(viewer)).toContain('MY OWN PROJECT');
  await viewer.goto(link);
  await expect(viewer.getByText('You opened a shared project.', { exact: false })).toBeVisible();
  await expect(viewer.getByLabel('Title', { exact: true })).toHaveText('SHARED SEASON');
  await expect(viewer.locator('[data-section="look"] .sec-meta')).toHaveText('Midnight Cyan');
  await expect(formatRadio(viewer, '9:16')).toBeChecked();
  // The viewer's own autosave is untouched until they keep the shared project.
  await viewer.waitForTimeout(800);
  expect(await viewer.evaluate(() => localStorage.getItem('waycine:v1:autosave'))).toContain(
    'MY OWN PROJECT',
  );

  // "Back to my project" goes back to the viewer's own project.
  await viewer.getByRole('button', { name: 'Back to my project' }).click();
  await expect(viewer.getByLabel('Title', { exact: true })).toHaveText('MY OWN PROJECT');
  expect(new URL(viewer.url()).hash).toBe('');

  // Open it again and keep it: now it is autosaved.
  await viewer.goto(link);
  await expect(viewer.getByLabel('Title', { exact: true })).toHaveText('SHARED SEASON');
  await viewer.getByRole('button', { name: 'Keep this project' }).click();
  await expect(viewer.getByText('You opened a shared project.', { exact: false })).toHaveCount(0);
  await expect
    .poll(() => viewer.evaluate(() => localStorage.getItem('waycine:v1:autosave')))
    .toContain('SHARED SEASON');
  // The viewer's own project was replaced: it is kept in Recent.
  await viewer.getByRole('button', { name: 'Start from…' }).click();
  await viewer
    .getByRole('dialog')
    .locator('.recent-list')
    .getByRole('button', { name: /^Europe trip demo/ })
    .click();
  await expect(viewer.getByLabel('Title', { exact: true })).toHaveText('MY OWN PROJECT');
  await other.close();
});

test('a first-time recipient keeps a shared link with one button', async ({ page, browser }) => {
  await openApp(page);
  await page.getByLabel('Title', { exact: true }).fill('FOR A NEW VIEWER');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const input = page.getByRole('dialog', { name: 'Share link' }).getByLabel('Link');
  await expect(input).toHaveValue(/#p=/);
  const link = await input.inputValue();

  const fresh = await browser.newContext({ reducedMotion: 'reduce' });
  const viewer = await fresh.newPage();
  await viewer.goto(link);
  await expect(viewer.getByLabel('Title', { exact: true })).toHaveText('FOR A NEW VIEWER');
  await expect(
    viewer.getByText('You opened a shared project. Keep it to edit and export it here.'),
  ).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Back to my project' })).toHaveCount(0);
  // Reduced motion: a still of the overview, not the almost empty first frame.
  await expect(viewer.locator('canvas.preview')).toHaveAttribute('data-frame', '56');
  await viewer.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(viewer.getByText('You opened a shared project.', { exact: false })).toHaveCount(0);
  await fresh.close();
});

test('a damaged share link says so and keeps the current project', async ({ page }) => {
  await openApp(page, `${RACE_SEASON}#p=not-a-real-link`);
  await expect(
    page.getByRole('dialog', { name: 'This share link could not be opened' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveText('2026 SEASON ROUTE');
});
