import { effect, signal } from '@preact/signals';
import type { Compiled } from 'waycine';
import { pause, seek } from '../player/player';
import { engineState } from './engine';
import { followEdits } from './ui';

/** Stop the preview should jump to once the edited project is compiled, or null. */
const followRequest = signal<string | null>(null);

/**
 * The frame that shows stop `id` settled with its card: 60% into its hold
 * (after the flight, before the zoom-through). Null when the stop is not in
 * the video (hidden, or not placed yet).
 */
export function holdFrame(compiled: Compiled, id: string): number | null {
  const stop = compiled.stops.find((s) => s.id === id);
  if (stop === undefined) return null;
  const seg = compiled.timeline.segments.find((s) => s.kind === 'stop' && s.index === stop.index);
  if (seg === undefined) return null;
  return seg.start + seg.nFly + Math.floor(seg.nHold * 0.6);
}

/** "Follow edits": after an edit of stop `id`, show that stop in the preview. */
export function followStop(id: string): void {
  if (followEdits.peek()) followRequest.value = id;
}

/** Jumps the preview to stop `id` now, whatever "Follow edits" says (a click on its row). */
export function showStop(id: string): void {
  followRequest.value = id;
}

export function startFollowing(): void {
  effect(() => {
    const id = followRequest.value;
    const state = engineState.value;
    if (id === null || state.kind !== 'ready') return;
    followRequest.value = null;
    const frame = holdFrame(state.compiled, id);
    if (frame === null) return;
    pause();
    seek(frame);
  });
}
