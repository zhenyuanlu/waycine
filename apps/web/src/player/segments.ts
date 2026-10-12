import { computed } from '@preact/signals';
import type { Compiled, TimelineSegment } from 'waycine/browser';
import { copy } from '../copy/en';
import { engineState } from '../state/engine';
import { frame } from './player';

/** One chip of the segment strip. */
export interface SegmentChip {
  /** Stable key, for example `stop-3`. */
  key: string;
  /** Visible label, for example `1 BOSTON`. */
  label: string;
  /** First frame of the segment. */
  start: number;
  /** One past the last frame. */
  end: number;
  /** The stop this part shows (1-based number and city), or null (intro, finale, end). */
  stop: { n: number; city: string } | null;
}

function chipLabel(segment: TimelineSegment, compiled: Compiled): string {
  switch (segment.kind) {
    case 'overview':
      return copy.segments.intro;
    case 'finale':
      return copy.segments.finale;
    case 'hold':
      return copy.segments.hold;
    case 'stop':
      return copy.segments.stop(segment.index + 1, compiled.stops[segment.index]?.city ?? '');
  }
}

/** Chips for the current timeline, in order. */
export const segmentChips = computed<SegmentChip[]>(() => {
  const state = engineState.value;
  if (state.kind !== 'ready') {
    return [];
  }
  const { compiled } = state;
  return compiled.timeline.segments.map((segment) => ({
    key: `${segment.kind}-${segment.index}`,
    label: chipLabel(segment, compiled),
    start: segment.start,
    end: segment.start + segment.n,
    stop:
      segment.kind === 'stop'
        ? { n: segment.index + 1, city: compiled.stops[segment.index]?.city ?? '' }
        : null,
  }));
});

/** Index of the chip that contains the current frame, or -1. */
export const activeChipIndex = computed<number>(() => {
  const f = frame.value;
  return segmentChips.value.findIndex((chip) => f >= chip.start && f < chip.end);
});

/** Label of the segment on screen, or null while nothing is compiled. */
export const activeSegmentLabel = computed<string | null>(() => {
  const chip = segmentChips.value[activeChipIndex.value];
  return chip ? chip.label : null;
});
