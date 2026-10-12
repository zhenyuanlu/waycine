import { computed, effect, signal } from '@preact/signals';
import { engineState } from '../state/engine';

/** Current timeline frame shown in the preview (integer). */
export const frame = signal(0);
/** True while the preview plays. */
export const playing = signal(false);
/** Restart from the first frame at the end (the transport's Loop toggle and L; off by default). */
export const loop = signal(false);

/** Frame count and frame rate of the compiled preview, or null while it is not ready. */
export const timeline = computed<{ total: number; fps: number } | null>(() => {
  const state = engineState.value;
  if (state.kind !== 'ready') {
    return null;
  }
  const { compiled } = state;
  return { total: compiled.timeline.totalFrames, fps: compiled.fps.num / compiled.fps.den };
});

// Playback clock: frame = anchorFrame + floor(seconds since anchorMs * fps).
let anchorFrame = 0;
let anchorMs = 0;
let rafId = 0;
/** Last frame of a short preview span (`playSpan`); playback pauses there. */
let stopAt: number | null = null;

function clampFrame(value: number, total: number): number {
  return Math.min(Math.max(0, Math.round(value)), Math.max(0, total - 1));
}

function tick(nowMs: number): void {
  if (!playing.peek()) {
    return;
  }
  const t = timeline.peek();
  if (!t) {
    pause();
    return;
  }
  let next = anchorFrame + Math.floor((Math.max(0, nowMs - anchorMs) / 1000) * t.fps);
  if (stopAt !== null && next >= stopAt) {
    frame.value = Math.min(stopAt, t.total - 1);
    pause();
    return;
  }
  if (next >= t.total) {
    if (!loop.peek()) {
      frame.value = t.total - 1;
      pause();
      return;
    }
    next %= t.total;
    anchorFrame = next;
    anchorMs = nowMs;
  }
  frame.value = next;
  rafId = requestAnimationFrame(tick);
}

export function play(): void {
  stopAt = null;
  start();
}

/** Plays frames `from` to `to` once and pauses on `to` (a preview of one moment). */
export function playSpan(from: number, to: number): void {
  const t = timeline.peek();
  if (!t) return;
  const last = t.total - 1;
  const a = clampFrame(from, t.total);
  stopAt = Math.min(last, Math.max(a, Math.round(to)));
  frame.value = a;
  start();
}

function start(): void {
  const t = timeline.peek();
  if (!t) {
    return;
  }
  if (stopAt === null && frame.peek() >= t.total - 1) {
    frame.value = 0;
  }
  anchorFrame = frame.peek();
  anchorMs = performance.now();
  playing.value = true;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
}

export function pause(): void {
  stopAt = null;
  playing.value = false;
  cancelAnimationFrame(rafId);
}

export function togglePlay(): void {
  if (playing.peek()) {
    pause();
  } else {
    play();
  }
}

/** Shows `target` (clamped); playback, if running, continues from there. */
export function seek(target: number): void {
  stopAt = null;
  const total = timeline.peek()?.total ?? 1;
  const next = clampFrame(target, total);
  frame.value = next;
  anchorFrame = next;
  anchorMs = performance.now();
}

/** Pauses and moves by `delta` frames. */
export function step(delta: number): void {
  pause();
  seek(frame.peek() + delta);
}

/** Pauses and moves by `seconds` of video. */
export function stepSeconds(seconds: number): void {
  const fps = timeline.peek()?.fps ?? 30;
  step(Math.round(seconds * fps));
}

export function seekToEnd(): void {
  pause();
  seek((timeline.peek()?.total ?? 1) - 1);
}

// Keep the frame inside the timeline when the project changes length, and
// at 0 while there is nothing to draw (no visible stop), so the readout never
// says "0:02.0 / 0:00.0".
effect(() => {
  const t = timeline.value;
  if (t && frame.peek() > t.total - 1) {
    seek(t.total - 1);
  } else if (engineState.value.kind === 'empty' && frame.peek() !== 0) {
    pause();
    frame.value = 0;
    anchorFrame = 0;
  }
});
