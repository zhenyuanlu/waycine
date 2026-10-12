import { type Browser, expect, type Page } from '@playwright/test';

/**
 * Layout-shift recording for the zero-layout-shift specs. Every
 * `layout-shift` entry is kept, including those right after input; each
 * source says which named container (if any) it sits in, so a phase can
 * allow movement only where the design allows it (the floating place list,
 * the All settings list below its head, the stage in theater mode).
 */

export const VIEWPORTS = [
  { name: '1280x720', width: 1280, height: 720, phone: false },
  { name: '1440x900', width: 1440, height: 900, phone: false },
  { name: '1920x1080', width: 1920, height: 1080, phone: false },
  { name: '2560x1440', width: 2560, height: 1440, phone: false },
  { name: '3440x1440', width: 3440, height: 1440, phone: false },
  { name: '390x844', width: 390, height: 844, phone: true },
] as const;
export type Viewport = (typeof VIEWPORTS)[number];

export const SCHEMES = ['light', 'dark'] as const;

/** Containers a phase may allow to move. */
const CONTAINERS = ['.combo', '.all-list', '.stage', '.xdlg'] as const;

export interface Shift {
  value: number;
  hadRecentInput: boolean;
  sources: { node: string; inside: string[] }[];
}

declare global {
  interface Window {
    __shifts: Shift[];
  }
}

/** Opens the app in its own context with the shift recorder installed. */
export async function openRecorded(
  browser: Browser,
  vp: Viewport,
  scheme: (typeof SCHEMES)[number],
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    reducedMotion: 'reduce',
    colorScheme: scheme,
    hasTouch: vp.phone,
    isMobile: vp.phone,
  });
  await context.addInitScript((containers: readonly string[]) => {
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
        sources?: { node?: Node | null }[];
      })[]) {
        window.__shifts.push({
          value: entry.value,
          hadRecentInput: entry.hadRecentInput,
          sources: (entry.sources ?? []).map((s) => {
            const node = s.node ?? null;
            const el = node instanceof Element ? node : (node?.parentElement ?? null);
            return {
              node:
                node instanceof Element
                  ? `${node.tagName}.${String(node.className)}`
                  : `#text in ${el === null ? '?' : `${el.tagName}.${String(el.className)}`}`,
              inside: el === null ? [] : containers.filter((c) => el.closest(c) !== null),
            };
          }),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  }, CONTAINERS);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('canvas.preview')).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
  await expect(page.locator('html')).toHaveClass(/\bready\b/);
  return { page, close: () => context.close() };
}

/** Layout shifts recorded since the last call (and clears them). */
export function takeShifts(page: Page): Promise<Shift[]> {
  return page.evaluate(() => {
    const out = window.__shifts;
    window.__shifts = [];
    return out;
  });
}

/** The shifts with a source outside every allowed container (all of them when none is allowed). */
export function outside(shifts: Shift[], allowed: readonly string[] = []): Shift[] {
  return shifts.filter((s) =>
    s.sources.some((src) => !src.inside.some((c) => allowed.includes(c))),
  );
}

export function cls(shifts: Shift[]): number {
  return shifts.reduce((sum, s) => sum + s.value, 0);
}

/** The page itself never scrolls and never overflows sideways. */
export async function expectNoOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow).toEqual({ x: 0, y: 0 });
}
