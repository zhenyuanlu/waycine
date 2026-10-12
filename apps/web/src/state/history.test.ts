import { describe, expect, it } from 'vitest';
import { History } from './history';

describe('History', () => {
  it('coalesces edits with the same key within 500 ms into one step', () => {
    const h = new History<string>(100, 500);
    // Typing "abc" into the title: three edits, 200 ms apart.
    expect(h.record('', 0, 'title')).toBe(true);
    expect(h.record('a', 200, 'title')).toBe(false);
    expect(h.record('ab', 400, 'title')).toBe(false);
    expect(h.depth).toBe(1);
    expect(h.undo('abc')).toBe('');
    expect(h.redo('')).toBe('abc');
  });

  it('starts a new step after a pause, for another key, or without a key', () => {
    const h = new History<number>(100, 500);
    h.record(0, 0, 'a');
    h.record(1, 600, 'a'); // pause of 600 ms
    h.record(2, 700, 'b'); // other key
    h.record(3, 800); // structural edit
    h.record(4, 900); // never coalesces
    expect(h.depth).toBe(5);
  });

  it('measures the window from the last edit, so a long slider drag is one step', () => {
    const h = new History<number>(100, 500);
    for (let t = 0; t <= 5000; t += 100) h.record(t, t, 'slider');
    expect(h.depth).toBe(1);
  });

  it('does not join an edit to one made before an undo', () => {
    const h = new History<string>(100, 500);
    h.record('x', 0, 'k');
    expect(h.undo('xy')).toBe('x');
    expect(h.record('x', 100, 'k')).toBe(true);
    expect(h.canRedo).toBe(false);
  });

  it('keeps at most `limit` steps, dropping the oldest', () => {
    const h = new History<number>(100, 500);
    for (let i = 0; i < 150; i++) h.record(i, i * 1000);
    expect(h.depth).toBe(100);
    let state = 150;
    let steps = 0;
    for (;;) {
      const prev = h.undo(state);
      if (prev === null) break;
      state = prev;
      steps++;
    }
    expect(steps).toBe(100);
    expect(state).toBe(50);
  });

  it('clears redo on a new edit and on clear()', () => {
    const h = new History<number>(100, 500);
    h.record(1, 0);
    h.undo(2);
    expect(h.canRedo).toBe(true);
    h.record(1, 1000);
    expect(h.canRedo).toBe(false);
    h.clear();
    expect(h.canUndo).toBe(false);
  });
});
