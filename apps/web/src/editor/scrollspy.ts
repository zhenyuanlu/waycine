import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { SectionId } from 'waycine';
import { reducedMotion } from '../state/media';

/** The Basics section at the top of the Basics pane (the rail marks it). */
export const currentSection = signal<SectionId>('stops');
/** The All settings group at the top of its pane. */
export const currentGroup = signal<SectionId>('text');

/**
 * Follows which `[data-<attr>]` block sits at the top of a scroll pane and
 * reports its id. Colour-only consumers (the rail), so it never moves layout.
 * The listener is attached once per pane (a re-render of the pane never
 * re-measures every block).
 */
export function useScrollSpy(
  pane: { current: HTMLElement | null },
  attr: 'section' | 'group',
  report: (id: SectionId) => void,
): void {
  const callback = useRef(report);
  callback.current = report;
  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    let frame = 0;
    const update = (): void => {
      frame = 0;
      const top = el.getBoundingClientRect().top + 24;
      let current: string | null = null;
      for (const block of el.querySelectorAll<HTMLElement>(`[data-${attr}]`)) {
        if (block.getBoundingClientRect().top <= top) current = block.dataset[attr] ?? current;
        else break;
      }
      const first = el.querySelector<HTMLElement>(`[data-${attr}]`)?.dataset[attr];
      const id = (current ?? first) as SectionId | undefined;
      if (id !== undefined) callback.current(id);
    };
    const onScroll = (): void => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [pane, attr]);
}

/** Scrolls `target` to the top of its scroll pane (instantly with reduced motion). */
export function scrollToTop(pane: HTMLElement | null, target: HTMLElement | null): void {
  if (!pane || !target) return;
  const offset = target.getBoundingClientRect().top - pane.getBoundingClientRect().top;
  pane.scrollTo({
    top: pane.scrollTop + offset - 8,
    behavior: reducedMotion.peek() ? 'auto' : 'smooth',
  });
}
