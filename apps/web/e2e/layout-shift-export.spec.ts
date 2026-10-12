import { expect, test } from '@playwright/test';
import {
  cls,
  expectNoOverflow,
  openRecorded,
  outside,
  SCHEMES,
  takeShifts,
  VIEWPORTS,
} from './editor/shifts';

/**
 * The export dialog keeps one layout in every state: setup -> progress ->
 * done moves nothing, including the automatic switch from progress to done
 * (every layout-shift entry counts). On a phone the finished sheet still fits
 * the screen, with Done and Close on it. Runs in the export project (one
 * export at a time), at 720p so it is quick.
 */

for (const vp of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    test(`the export dialog moves nothing at ${vp.name}, ${scheme}: setup -> progress -> done`, async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const { page, close } = await openRecorded(browser, vp, scheme);
      await page.getByRole('button', { name: 'Keep exploring' }).click();
      await page
        .getByRole('button', { name: vp.phone ? 'Export' : 'Export video', exact: true })
        .first()
        .click();
      const dialog = page.locator('dialog[open]');
      const start = dialog.getByRole('button', { name: 'Export video' });
      await expect(start).toBeEnabled({ timeout: 30_000 });
      await dialog.getByRole('radio', { name: /^720p/ }).click();
      await page.waitForTimeout(500);
      await takeShifts(page);

      await start.click();
      await expect(dialog.locator('.x-band.is-run .x-pct')).toBeVisible({ timeout: 20_000 });
      await expect(dialog.locator('.export-done')).toBeVisible({ timeout: 150_000 });
      await page.waitForTimeout(500);
      const shifts = await takeShifts(page);
      console.log(`export CLS ${vp.name} ${scheme}: ${cls(shifts)}`);
      expect(outside(shifts), 'setup -> progress -> done').toEqual([]);

      // The finished sheet fits: nothing wider than the dialog, Done and Close on screen.
      const width = await dialog.evaluate((el) => [el.clientWidth, el.scrollWidth]);
      expect(width[1]).toBeLessThanOrEqual(width[0] as number);
      await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeInViewport({
        ratio: 1,
      });
      await expect(dialog.getByRole('button', { name: 'Close' })).toBeInViewport({ ratio: 1 });
      await expectNoOverflow(page);
      await close();
    });
  }
}
