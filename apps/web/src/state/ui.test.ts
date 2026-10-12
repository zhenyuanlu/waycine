import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissToast, holdToast, showToast, TOAST_MS, toasts } from './ui';

describe('showToast', () => {
  afterEach(() => {
    holdToast(false);
    for (const t of toasts.peek()) dismissToast(t.id);
    vi.useRealTimers();
  });

  it('shows one toast at a time: a newer one replaces the older one', () => {
    vi.useFakeTimers();
    const undo = { label: 'Undo', run: () => undefined };
    showToast('Placed LISBON.');
    showToast('Deleted BOSTON.', undo);
    expect(toasts.peek().map((t) => t.message)).toEqual(['Deleted BOSTON.']);
    showToast('Placed PARIS.');
    expect(toasts.peek().map((t) => t.message)).toEqual(['Placed PARIS.']);
  });

  it('removes the toast after five seconds', () => {
    vi.useFakeTimers();
    showToast('Saved trip.waycine.json.');
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(toasts.peek()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts.peek()).toHaveLength(0);
  });

  it('stays while hovered or focused, then gets its full time again', () => {
    vi.useFakeTimers();
    showToast('Deleted SALEM.', { label: 'Undo', run: () => undefined });
    vi.advanceTimersByTime(TOAST_MS - 100);
    holdToast(true);
    vi.advanceTimersByTime(TOAST_MS * 3);
    expect(toasts.peek()).toHaveLength(1);
    holdToast(false);
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(toasts.peek()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts.peek()).toHaveLength(0);
  });
});
