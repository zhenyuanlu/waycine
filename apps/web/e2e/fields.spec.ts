import { expect, type Locator, test } from '@playwright/test';
import { FIELDS } from 'waycine';
import { openAllSettings, openApp } from './editor/helpers';

test.use({ reducedMotion: 'reduce' });

/**
 * Everything editable in the project file is editable in the UI: every
 * FIELDS entry has exactly one control in All settings (per-profile entries
 * for the active format, per-role font entries for both roles), and the
 * per-stop and per-stat entries have their control in the stop editor and
 * the finale stats table.
 */

/** Concrete paths of the All settings rows for the landscape profile. */
function expectedRows(): string[] {
  const out: string[] = [];
  for (const f of FIELDS) {
    if (f.path.startsWith('stops[].') || f.path.startsWith('stats.items[].')) continue;
    if (f.path.startsWith('layouts.*.'))
      out.push(f.path.replace('layouts.*.', 'layouts.landscape.'));
    else if (f.path.startsWith('fonts.*.')) {
      out.push(
        f.path.replace('fonts.*.', 'fonts.display.'),
        f.path.replace('fonts.*.', 'fonts.body.'),
      );
    } else out.push(f.path);
  }
  return out.sort();
}

test('every FIELDS entry renders exactly one control reachable in the UI', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Keep exploring' }).click();

  // All settings: open every group, then one row per concrete path.
  await openAllSettings(page);
  const closed = page.locator('.grp-toggle[aria-expanded="false"]');
  while ((await closed.count()) > 0) await closed.first().click();
  const rows = await page
    .locator('.all .row[data-path]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-path') ?? ''));
  expect([...rows].sort()).toEqual(expectedRows());
  expect(new Set(rows).size).toBe(rows.length);
  // Each row holds one working control (an input, a select, a chip field or a choice).
  const empty = await page
    .locator('.all .row[data-path]')
    .evaluateAll((els) =>
      els
        .filter(
          (el) =>
            el.querySelector(
              '.ctl input, .ctl select, .ctl [role="textbox"], .ctl [role="radio"], .ctl button',
            ) === null,
        )
        .map((el) => el.getAttribute('data-path')),
    );
  expect(empty).toEqual([]);
  // The total in the tab is computed from FIELDS.
  await expect(page.getByRole('tab', { name: /^All settings/ })).toContainText(
    String(expectedRows().length),
  );

  // Per-stop entries: the open stop editor, with "More for this stop".
  await page.getByRole('tab', { name: 'Basics' }).click();
  await page.getByRole('button', { name: /^Stop 1: CHICAGO/ }).click();
  await page.getByRole('button', { name: /^More for this stop/ }).click();
  const stop = page.locator('.stop-row').first();
  for (const f of FIELDS.filter((x) => x.path.startsWith('stops[].'))) {
    const count = await stop.locator(`[data-field="${f.path}"]`).count();
    // Results repeat per result (Chicago has two); everything else exactly once.
    if (f.path.startsWith('stops[].results[].')) expect(count, f.path).toBe(2);
    else expect(count, f.path).toBe(1);
  }

  // Per-stat entries: the finale stats table and its "More" line.
  await page.getByRole('button', { name: 'More for stat 1' }).click();
  const stats = page.locator('[data-section="stats"] .stats-item').first();
  for (const f of FIELDS.filter((x) => x.path.startsWith('stats.items[].'))) {
    expect(await stats.locator(`[data-field="${f.path}"]`).count(), f.path).toBe(1);
  }
});

/** Groups 02-12 as their heads name them. */
const GROUP_TITLES = [
  'Titles & text',
  'Look',
  'Timing',
  'Finale stats',
  'Video',
  'Camera',
  'Route',
  'Pins',
  'Stop card',
  'Map grid & HUD',
  'Layout',
];

/** Rows that cannot be edited by a plain gesture here: a file chooser, and the custom size (only for a custom format). */
const NOT_OPERATED = new Set([
  'fonts.display.source',
  'fonts.body.source',
  'output.width',
  'output.height',
]);

/** True once `row` shows as changed (the render after an edit may take a moment under load). */
function isChanged(row: Locator, timeout: number): Promise<boolean> {
  return expect(row)
    .toHaveClass(/\bis-changed\b/, { timeout })
    .then(() => true)
    .catch(() => false);
}

test('operating each All settings control changes its own setting', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByRole('button', { name: 'Keep exploring' }).click();
  await openAllSettings(page);
  const unchanged: string[] = [];
  for (const title of GROUP_TITLES) {
    const toggle = page.locator('.grp-toggle', {
      has: page.locator('.grp-title', { hasText: title }),
    });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    const group = page.locator('.grp', { has: toggle });
    const paths = await group
      .locator('.row[data-path]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-path') ?? ''));
    for (const path of paths) {
      if (NOT_OPERATED.has(path)) continue;
      const row = group.locator(`.row[data-path="${path}"]`);
      const ctl = row.locator('.ctl');
      // One gesture suited to the control.
      const spin = ctl.getByRole('spinbutton');
      const sw = ctl.getByRole('switch');
      const select = ctl.locator('select');
      const hex = ctl.locator('input.hex');
      const chips = ctl.getByRole('textbox');
      const text = ctl.locator('input[type="text"]:not([role])');
      const radios = ctl.getByRole('radio');
      if ((await radios.count()) > 0 && (await spin.count()) > 0) {
        // Auto | Custom: the other choice.
        await radios.and(page.locator('[aria-checked="false"]')).first().click();
      } else if ((await hex.count()) > 0) {
        await hex.fill('#123456');
        await hex.press('Enter');
      } else if ((await sw.count()) > 0) {
        await sw.first().click();
      } else if ((await select.count()) > 0) {
        const index = await select.evaluate((el: HTMLSelectElement) => el.selectedIndex);
        const count = await select.evaluate((el: HTMLSelectElement) => el.options.length);
        await select.selectOption({ index: index + 1 < count ? index + 1 : 0 });
      } else if ((await spin.count()) > 0) {
        await spin.first().focus();
        await spin.first().press('ArrowUp');
        if (!(await isChanged(row, 1000))) {
          await spin.first().press('ArrowDown');
          await spin.first().press('ArrowDown');
        }
      } else if ((await radios.count()) > 0) {
        await radios.and(page.locator('[aria-checked="false"]')).first().click();
      } else if ((await chips.count()) > 0) {
        // Focus, not a click: a click on a chip opens its editor instead.
        await chips.first().focus();
        await page.keyboard.press('End');
        await page.keyboard.type('x');
      } else if ((await text.count()) > 0) {
        await text.first().click();
        await text.first().press('End');
        await page.keyboard.type('x');
      }
      if (!(await isChanged(row, 3000))) unchanged.push(path);
    }
    // Back to the start for the next group (one undo step).
    const reset = page.getByRole('button', { name: /^Reset changed \(\d+\)$/ });
    if (await reset.isEnabled()) await reset.click();
    await expect(page.getByRole('button', { name: 'Reset changed (0)' })).toBeVisible();
  }
  expect(unchanged).toEqual([]);
});

test('operating each per-stop and per-stat control changes the project', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);
  await page.getByRole('button', { name: 'Keep exploring' }).click();
  await page.getByRole('button', { name: /^Stop 1: CHICAGO/ }).click();
  await page.getByRole('button', { name: /^More for this stop/ }).click();
  await page.getByRole('button', { name: 'More for stat 1' }).click();
  const undo = page.locator('header').getByRole('button', { name: 'Undo', exact: true });
  await expect(undo).toBeDisabled();
  const stop = page.locator('.stop-row').first();
  const stats = page.locator('[data-section="stats"] .stats-item').first();
  const unchanged: string[] = [];
  const paths = FIELDS.map((f) => f.path).filter(
    (p) => (p.startsWith('stops[].') || p.startsWith('stats.items[].')) && p !== 'stops[].id',
  );
  for (const path of paths) {
    const scope = path.startsWith('stops[].') ? stop : stats;
    let el = scope.locator(`[data-field="${path}"]`).first();
    // "End date" is a button until it is asked for.
    if (path === 'stops[].endDate' && (await el.evaluate((e) => e.tagName === 'BUTTON'))) {
      await el.click();
      el = scope.locator(`[data-field="${path}"]`).first();
    }
    const spin = el.getByRole('spinbutton');
    const radios = el.getByRole('radio');
    const sw = el.getByRole('switch');
    const select = el.locator('select');
    const input = el.locator('input[type="text"]:not([role])');
    if ((await radios.count()) > 0) {
      await radios.and(page.locator('[aria-checked="false"]')).first().click();
    } else if ((await sw.count()) > 0) {
      await sw.first().click();
    } else if ((await select.count()) > 0) {
      const index = await select.evaluate((s: HTMLSelectElement) => s.selectedIndex);
      const count = await select.evaluate((s: HTMLSelectElement) => s.options.length);
      await select.selectOption({ index: index + 1 < count ? index + 1 : 0 });
    } else if ((await spin.count()) > 0) {
      await spin.first().focus();
      await spin.first().press('ArrowUp');
    } else if (path.endsWith('date') || path.endsWith('Date')) {
      await input.first().fill(path.endsWith('endDate') ? 'Jun 15, 2026' : 'Jun 12, 2026');
      await input.first().press('Enter');
    } else {
      await input.first().click();
      await input.first().press('End');
      await page.keyboard.type('5');
    }
    const changed = await expect(undo)
      .toBeEnabled({ timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (!changed) {
      unchanged.push(path);
      continue;
    }
    await page.keyboard.press('Control+z');
    await expect(undo).toBeDisabled();
  }
  expect(unchanged).toEqual([]);
});
