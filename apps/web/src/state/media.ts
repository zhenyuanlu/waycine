import { type Signal, signal } from '@preact/signals';

/**
 * Layout classes of the window, as signals. They mirror the stylesheet's
 * media queries: the CSS does the sizing, these decide what is rendered
 * (one All settings list, in the editor or in the docked column; the phone
 * shell's one-section-at-a-time editor).
 */

function watch(query: string): Signal<boolean> {
  const list = typeof window === 'undefined' ? null : window.matchMedia(query);
  const out = signal(list?.matches ?? false);
  list?.addEventListener('change', (event) => {
    out.value = event.matches;
  });
  return out;
}

/** Phone and small-tablet shell: one column, bottom section bar. */
export const isPhone = watch('(max-width: 1023px)');
/** FHD and wider: the contents rail replaces the editor tabs. */
export const isWide = watch('(min-width: 1800px) and (min-height: 860px)');
/** Ultrawide: All settings is docked as its own column. */
export const isUltrawide = watch('(min-width: 3000px) and (min-aspect-ratio: 2/1)');
/** A touch screen: 44 px targets, no hover. */
export const isCoarse = watch('(pointer: coarse)');
/** The viewer asked for less motion. */
export const reducedMotion = watch('(prefers-reduced-motion: reduce)');
