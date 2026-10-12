import { expect, test } from '@playwright/test';
import {
  formatRadio,
  partLabels,
  RACE_SEASON,
  showFrame,
  topRowShare,
  watchErrors,
} from './editor/helpers';

// Reduced motion turns off autoplay: a first visit shows a still of the
// overview with its route drawn (frame 56 of the race season) instead of playing.
// These specs open the race season demo; demos.spec.ts covers the default one.
test.use({ reducedMotion: 'reduce' });

/** The season's representative still: ceil(0.7 * 79) of its 80-frame overview. */
const SEASON_STILL = 56;

test('home page draws a still of the season without console errors', async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto(RACE_SEASON);

  await expect(page.getByRole('heading', { level: 1, name: 'Waycine' })).toBeVisible();

  const canvas = page.locator('canvas.preview');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(canvas).toHaveAttribute('data-frame', String(SEASON_STILL));
  await expect(page.getByRole('alert')).toHaveCount(0);
  // First paint is final: the app shows once the fonts and the first frame are there.
  await expect(page.locator('html')).toHaveClass(/\bready\b/);

  // The top row is the theme background (#07070B) except where a graticule
  // line crosses it, so require a large majority rather than one pixel.
  const backgroundShare = await topRowShare(page, [0x07, 0x07, 0x0b]);
  expect(backgroundShare).toBeGreaterThan(0.8);

  const aspect = await canvas.evaluate((el: HTMLCanvasElement) => el.width / el.height);
  expect(aspect).toBeCloseTo(16 / 9, 2);

  // The timeline names every part under its track.
  await expect
    .poll(() => partLabels(page))
    .toEqual([
      'Intro',
      '1 CHICAGO',
      '2 MILWAUKEE',
      '3 GRAND RAPIDS',
      '4 DETROIT',
      '5 TOLEDO',
      '6 CLEVELAND',
      '7 BUFFALO',
      'Finale',
    ]);
  await expect(page.getByText('0:01.9 / 0:14.7')).toBeVisible();

  expect(errors).toEqual([]);
});

test('player controls step, jump and scrub', async ({ page }) => {
  await page.goto(RACE_SEASON);
  const canvas = page.locator('canvas.preview');
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(canvas).toHaveAttribute('data-frame', String(SEASON_STILL));

  await page.keyboard.press('Home');
  await expect(canvas).toHaveAttribute('data-frame', '0');
  await page.keyboard.press('ArrowRight');
  await expect(canvas).toHaveAttribute('data-frame', '1');
  await page.keyboard.press('ArrowLeft');
  await expect(canvas).toHaveAttribute('data-frame', '0');
  // , and . step one frame too.
  await page.keyboard.press('.');
  await expect(canvas).toHaveAttribute('data-frame', '1');
  await page.keyboard.press(',');
  await expect(canvas).toHaveAttribute('data-frame', '0');

  // End, then [ goes to the start of the finale; [ and ] jump between parts.
  await page.keyboard.press('End');
  await expect(canvas).toHaveAttribute('data-frame', '439');
  await page.keyboard.press('[');
  await expect(canvas).toHaveAttribute('data-frame', '360');
  await page.keyboard.press('[');
  await expect(canvas).toHaveAttribute('data-frame', '320');
  await page.keyboard.press(']');
  await expect(canvas).toHaveAttribute('data-frame', '360');
  // The transport's stop buttons do the same.
  await page.getByRole('button', { name: 'Previous stop', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-frame', '320');
  await page.getByRole('button', { name: 'Next stop', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-frame', '360');

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

  // Playwright cannot fill a range input; set it the way a drag would.
  await showFrame(page, 100);
  const slider = page.getByRole('slider', { name: 'Position in the video' });
  await expect(slider).toHaveAttribute('aria-valuetext', /^0:03\.3 of 0:14\.7, Stop 1, CHICAGO$/);
  // On the timeline, Page Down jumps to the next part.
  await slider.focus();
  await page.keyboard.press('PageDown');
  await expect(canvas).toHaveAttribute('data-frame', '120');
});

test('Space on the project file row opens its dialog instead of playing', async ({ page }) => {
  await page.goto(RACE_SEASON);
  const canvas = page.locator('canvas.preview');
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });

  await page.getByRole('button', { name: /View and edit JSON/ }).focus();
  await page.keyboard.press('Space');
  const dialog = page.getByRole('dialog', { name: 'Project file' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Project JSON' })).toHaveValue(/"version": 1/);
  await page.waitForTimeout(300);
  await expect(canvas).toHaveAttribute('data-frame', String(SEASON_STILL));
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('the format switch reshapes the preview and "Start from…" loads the Europe demo', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => {
    errors.push(err.message);
  });
  await page.goto(RACE_SEASON);
  const canvas = page.locator('canvas.preview');
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  const aspect = (): Promise<number> =>
    canvas.evaluate((el: HTMLCanvasElement) => el.width / el.height);
  // The frame box keeps its size: a format change only changes the bitmap.
  const box = async () => {
    const b = await canvas.boundingBox();
    return b === null ? '' : `${Math.round(b.width)}x${Math.round(b.height)}`;
  };
  const before = await box();

  await expect(formatRadio(page, '16:9')).toBeChecked();
  // The bitmap is as wide as the box shows (pixel-exact), so its height is rounded: the
  // aspect is within half a pixel of the format's.
  await formatRadio(page, '9:16').check();
  await expect.poll(aspect).toBeCloseTo(9 / 16, 3);
  await formatRadio(page, '1:1').check();
  await expect.poll(aspect).toBeCloseTo(1, 3);
  // 4:5 lives in the Video section.
  await page.locator('[data-path="output.aspect"]').getByRole('radio', { name: '4:5' }).check();
  await expect.poll(aspect).toBeCloseTo(4 / 5, 3);
  await formatRadio(page, '1:1').check();
  expect(await box()).toBe(before);
  // The JSON text follows the format.
  await page.getByRole('button', { name: /View and edit JSON/ }).click();
  await expect(page.getByRole('textbox', { name: 'Project JSON' })).toHaveValue(/"aspect": "1:1"/);
  await page
    .getByRole('dialog', { name: 'Project file' })
    .getByRole('button', { name: 'Cancel' })
    .click();

  // The format change is an edit: replacing the project asks first. Cancel keeps it.
  await page.getByRole('button', { name: 'Start from…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Europe trip demo/ }).click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(formatRadio(page, '1:1')).toBeChecked();

  await page.getByRole('button', { name: 'Start from…' }).click();
  await dialog.getByRole('button', { name: /Europe trip demo/ }).click();
  await dialog.getByRole('button', { name: 'Replace' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(formatRadio(page, '9:16')).toBeChecked();
  await expect.poll(aspect).toBeCloseTo(9 / 16, 3);
  await expect.poll(async () => (await partLabels(page)).length).toBe(10);
  expect(await partLabels(page)).toContain('1 LISBON');
  expect(await partLabels(page)).toContain('8 VIENNA');
  // The frame shown stays where it was (the still of the season), inside the new length.
  await expect(page.getByText(/^0:01\.9 \/ 0:21\.3$/)).toBeVisible();

  // An unedited project is replaced without asking.
  await page.getByRole('button', { name: 'Start from…' }).click();
  await dialog
    .getByRole('button', { name: /Race season demo/ })
    .first()
    .click();
  await expect(formatRadio(page, '16:9')).toBeChecked();
  await expect(page.getByText(/^0:01\.9 \/ 0:14\.7$/)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});
