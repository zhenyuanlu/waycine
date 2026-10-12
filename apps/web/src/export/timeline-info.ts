/**
 * What the export dialog reads from a project's timeline before anything is
 * rendered: the frame and clip counts and the parts its progress bar shows.
 */
import { compile, createBrowserBackend, outputSize, type WaycineProject } from 'waycine/browser';
import { copy } from '../copy/en';

/** One part of the export timeline (for the per-part progress bar). */
export interface Part {
  start: number;
  end: number;
  label: string;
}

/** Frame and clip counts and the parts of the export timeline. */
export interface TimelineInfo {
  frames: number;
  clips: number;
  parts: Part[];
  stops: number;
  intro: boolean;
  finale: boolean;
}

/**
 * Frames, clips and parts of `project` (they do not depend on the frame size,
 * so a tiny compile is enough). Null when the project cannot be compiled.
 */
export function timelineInfo(project: WaycineProject): TimelineInfo | null {
  try {
    const own = outputSize(project.output);
    const scale = 180 / Math.min(own.width, own.height);
    const size = {
      width: Math.max(2, Math.round(own.width * scale)),
      height: Math.max(2, Math.round(own.height * scale)),
    };
    const backend = createBrowserBackend();
    const clips = compile(project, backend, { ...size, mode: 'segments' });
    const single = compile(project, backend, size);
    const parts = single.timeline.segments.map((seg) => ({
      start: seg.start,
      end: seg.start + seg.n,
      label:
        seg.kind === 'stop'
          ? copy.segments.current(seg.index + 1, single.stops[seg.index]?.city ?? '')
          : seg.kind === 'overview'
            ? copy.segments.intro
            : seg.kind === 'finale'
              ? copy.segments.finale
              : copy.segments.hold,
    }));
    return {
      frames: single.timeline.totalFrames,
      clips: clips.timeline.segments.length,
      parts,
      stops: single.stops.length,
      intro: single.timeline.segments.some((seg) => seg.kind === 'overview'),
      finale: single.timeline.segments.some((seg) => seg.kind === 'finale'),
    };
  } catch {
    return null;
  }
}
