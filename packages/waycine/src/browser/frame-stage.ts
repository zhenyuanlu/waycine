/**
 * The frame renderer shared by every browser output (the WebCodecs export, the
 * PNG still and the MediaRecorder recording): compiles a project for an output
 * size and draws timeline frames onto one canvas (at 2x and downscaled when
 * supersampling).
 */
import { compile } from '../core/compile.js';
import type { Ctx2D } from '../core/ctx.js';
import { renderFrame } from '../core/render.js';
import type { SegmentKind } from '../core/scene-types.js';
import type { FpsRational } from '../core/schema/output.js';
import type { ExportMode, WaycineProject } from '../core/schema/types.js';
import {
  context2d,
  createBrowserBackend,
  createHostCanvas,
  type HostCanvas,
  offscreen2dAvailable,
} from './backend.js';

/** Frames of one output file: the whole timeline, or one segment for clips. */
export interface FileRange {
  /** First timeline frame. */
  start: number;
  /** Frame count. */
  n: number;
  /** Segment kind of a clip. */
  kind?: SegmentKind;
  /** Stop index of a stop clip; 0 otherwise. */
  index?: number;
  /** City of a stop clip; '' otherwise. */
  city?: string;
}

/** A 2D context of a host canvas, for the supersampling downscale. */
function nativeContext(
  canvas: HostCanvas,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) {
    throw new Error(
      `Could not get a 2D context for a ${canvas.width}x${canvas.height} canvas; the browser may be out of canvas memory.`,
    );
  }
  return ctx;
}

/** The frame renderer of an export: draws timeline frame i onto `canvas` (the encoded surface). */
export interface FrameStage {
  /** Canvas the encoder reads (output size). */
  canvas: HostCanvas;
  /** Draws timeline frame `frame` onto `canvas`. */
  draw(frame: number): void;
  /** Frames in the timeline. */
  total: number;
  /** Exact frame rate. */
  fps: FpsRational;
  /** The compiled timeline segments with the city of each stop. */
  ranges(clips: boolean): FileRange[];
}

/**
 * Compiles `project` for a `width` x `height` export (at 2x when
 * `supersample` is 2) and returns a frame stage. Call after the fonts have
 * loaded. With supersampling the frame is drawn at 2W x 2H and scaled down
 * with bilinear filtering, which at exactly half size is the 2x2 mean.
 */
export function createFrameStage(
  project: WaycineProject,
  width: number,
  height: number,
  opts: { mode?: ExportMode; supersample: 1 | 2 },
): FrameStage {
  const k = opts.supersample;
  const backend = createBrowserBackend();
  const compiled = compile(project, backend, {
    width: width * k,
    height: height * k,
    ...(opts.mode === undefined ? {} : { mode: opts.mode }),
  });
  const offscreen = offscreen2dAvailable();
  const frameCanvas = createHostCanvas(width * k, height * k, offscreen);
  const frameCtx: Ctx2D = context2d(frameCanvas);
  let outCanvas = frameCanvas;
  let downscale: (() => void) | null = null;
  if (k === 2) {
    outCanvas = createHostCanvas(width, height, offscreen);
    const outCtx = nativeContext(outCanvas);
    downscale = () => {
      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'low';
      outCtx.drawImage(frameCanvas, 0, 0, width, height);
    };
  }
  return {
    canvas: outCanvas,
    total: compiled.timeline.totalFrames,
    fps: compiled.fps,
    draw(frame: number): void {
      renderFrame(frameCtx, compiled, frame, backend);
      downscale?.();
    },
    ranges(clips: boolean): FileRange[] {
      if (!clips) {
        return [{ start: 0, n: compiled.timeline.totalFrames }];
      }
      return compiled.timeline.segments.map((seg) => ({
        start: seg.start,
        n: seg.n,
        kind: seg.kind,
        index: seg.kind === 'stop' ? seg.index : 0,
        city: seg.kind === 'stop' ? (compiled.stops[seg.index]?.city ?? '') : '',
      }));
    },
  };
}
