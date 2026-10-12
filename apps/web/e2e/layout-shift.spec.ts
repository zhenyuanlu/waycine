import { expect, type Page, test } from '@playwright/test';
import { mockGeocoders } from './editor/helpers';
import {
  cls,
  expectNoOverflow,
  openRecorded,
  outside,
  SCHEMES,
  type Shift,
  takeShifts,
  VIEWPORTS,
} from './editor/shifts';

/**
 * Zero layout shift: the page never scrolls, the stage is sized by the grid
 * alone, changing numbers sit in fixed slots and states never change box
 * sizes, so nothing moves unless the user moves it. Every layout-shift entry
 * counts, including those right after input, at six viewports in both
 * themes. A phase may allow movement only inside a named container: the
 * floating place list (`.combo`), the All settings list below its fixed head
 * (`.all-list`) and the stage in theater mode (`.stage`). The export dialog
 * has its own spec (`layout-shift-export.spec.ts`).
 */

/** Font weights of `selector`'s elements (no weight changes on selection). */
function weights(page: Page, selector: string): Promise<string[]> {
  return page.evaluate(
    (sel) => [...document.querySelectorAll(sel)].map((el) => getComputedStyle(el).fontWeight),
    selector,
  );
}

/** A 3 s pointer drag across the timeline (or the phone's strip), the way a hand scrubs. */
async function dragTimeline(page: Page): Promise<void> {
  const input = page.getByRole('slider', { name: 'Position in the video' });
  const box = await input.boundingBox();
  if (box === null) throw new Error('no timeline');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 4, y);
  await page.mouse.down();
  for (let i = 0; i <= 90; i++) {
    await page.mouse.move(box.x + 4 + ((box.width - 8) * i) / 90, y);
    await page.waitForTimeout(33);
  }
  await page.mouse.up();
}

/** Opens the theme menu (the header's, or the phone's "More" menu) and picks `mode`. */
async function pickTheme(page: Page, phone: boolean, mode: 'System' | 'Dark' | 'Light') {
  await page.getByRole('button', { name: phone ? 'More' : 'Colour theme' }).click();
  await page.getByRole('menuitemradio', { name: mode }).click();
  await page.waitForTimeout(200);
}

for (const vp of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    test(`no layout shift at ${vp.name}, ${scheme}: load, playback, scrub, drag, format, theme, theater, search`, async ({
      browser,
    }) => {
      test.setTimeout(150_000);
      const { page, close } = await openRecorded(browser, vp, scheme);
      await mockGeocoders(page);
      const report: Record<string, number> = {};
      const phase = async (name: string, allowed: readonly string[] = []): Promise<Shift[]> => {
        const all = await takeShifts(page);
        report[name] = cls(all);
        return outside(all, allowed);
      };

      // Load: until 2 s after the first paint.
      await page.waitForTimeout(2000);
      expect(await phase('load'), 'load').toEqual([]);
      await page.getByRole('button', { name: 'Keep exploring' }).click();
      await page.waitForTimeout(200);
      await takeShifts(page);

      // 3 s of playback: time, playhead, part, frame counter and the picture change.
      await page.locator('body').press('Space');
      await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
      await page.waitForTimeout(3000);
      await page.locator('body').press('Space');
      expect(await phase('playback'), 'playback').toEqual([]);

      // A 91-step scrub sweep over 3 s, the way dragging the timeline sets it.
      await page.evaluate(async () => {
        const input = document.querySelector<HTMLInputElement>('.tl-input');
        if (!input) throw new Error('no timeline');
        const max = Number(input.max);
        for (let i = 0; i <= 90; i++) {
          input.value = String(Math.round((i / 90) * max));
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 33));
        }
      });
      expect(await phase('scrub'), 'scrub').toEqual([]);

      // A real 3 s pointer drag on the timeline.
      await dragTimeline(page);
      expect(await phase('drag'), 'drag').toEqual([]);

      if (!vp.phone) {
        // The format switch changes the bitmap and the overlay's viewBox only; no weight change.
        const group = page.getByRole('radiogroup', { name: 'Video format' });
        const before = await weights(page, '.tc .seg.fmt > button');
        for (const value of ['9:16', '1:1', '16:9']) {
          await group.getByRole('radio', { name: value, exact: true }).click();
          await page.waitForTimeout(250);
          expect(await weights(page, '.tc .seg.fmt > button')).toEqual(before);
        }
        expect(await phase('format'), 'format').toEqual([]);
      }

      // The theme menu: System -> Dark -> Light changes colours only.
      for (const mode of ['System', 'Dark', 'Light'] as const)
        await pickTheme(page, vp.phone, mode);
      await pickTheme(page, vp.phone, 'System');
      expect(await phase('theme'), 'theme').toEqual([]);

      if (!vp.phone) {
        // Theater mode resizes the stage by design; nothing else moves.
        await page.keyboard.press('\\');
        await page.waitForTimeout(400);
        await page.keyboard.press('\\');
        await page.waitForTimeout(400);
        expect(await phase('theater', ['.stage']), 'theater').toEqual([]);

        // A theme row and a transition row change colour, never weight.
        const themeWeights = await weights(page, '.theme .theme-name');
        await page.getByRole('radio', { name: /^Ember/ }).click();
        expect(await weights(page, '.theme .theme-name')).toEqual(themeWeights);
        const transWeights = await weights(page, '.trans-row .t1');
        await page.getByRole('radio', { name: /^Dip to dark/ }).click();
        expect(await weights(page, '.trans-row .t1')).toEqual(transWeights);
        await page.keyboard.press('Control+z');
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(200);
        // Choosing a transition re-reads the summary in place.
        expect(await phase('rows'), 'theme and transition rows').toEqual([]);
      }

      // All settings: search, clear, the Changed filter. Only the list below the head reflows.
      if (vp.phone) {
        await page
          .getByRole('tablist', { name: 'Editor sections' })
          .getByRole('tab', { name: 'All' })
          .click();
      } else {
        await page.locator('body').press('/');
      }
      const search = page.getByRole('searchbox', { name: 'Search settings' });
      await expect(search).toBeVisible();
      await takeShifts(page);
      await search.fill('glow');
      await page.waitForTimeout(300);
      await search.fill('');
      await page.waitForTimeout(300);
      await page
        .getByRole('button', { name: /^Changed/ })
        .first()
        .click();
      await page.waitForTimeout(300);
      await page
        .getByRole('button', { name: /^All \d/ })
        .first()
        .click();
      await page.waitForTimeout(300);
      expect(await phase('all-settings', ['.all-list']), 'All settings').toEqual([]);

      // Place search: type, results float over the fields, pick one.
      if (vp.phone) {
        await page
          .getByRole('tablist', { name: 'Editor sections' })
          .getByRole('tab', { name: 'Stops' })
          .click();
      } else if (vp.width >= 3000) {
        // Ultrawide: Basics is always beside the docked All settings.
      } else if (vp.width >= 1800) {
        await page.locator('.rail-i').first().click();
      } else {
        await page.getByRole('tab', { name: 'Basics' }).click();
      }
      await page.getByRole('button', { name: /^Stop 2: / }).click();
      await page.waitForTimeout(300);
      await takeShifts(page);
      const place = page.getByRole('combobox', { name: 'Search a place or paste coordinates' });
      await place.fill('Worcester');
      await expect(page.getByRole('option').first()).toBeVisible({ timeout: 10_000 });
      await page.getByRole('option').first().click();
      await page.waitForTimeout(500);
      expect(await phase('place-search', ['.combo']), 'place search').toEqual([]);

      // A phone with its keyboard down (a tall visible area): focusing a field moves nothing.
      if (vp.phone) {
        await page.getByLabel('City label').focus();
        await page.waitForTimeout(300);
        await page.getByLabel('City label').blur();
        await page.waitForTimeout(400);
        expect(await phase('focus'), 'focus a field').toEqual([]);
      }

      test.info().annotations.push({
        type: `cls-${vp.name}-${scheme}`,
        description: JSON.stringify(report),
      });
      console.log(`CLS ${vp.name} ${scheme}: ${JSON.stringify(report)}`);
      await expectNoOverflow(page);
      await close();
    });
  }
}
