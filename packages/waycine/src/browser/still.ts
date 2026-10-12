/**
 * One frame of a project as a PNG, in the browser.
 */
import { evenOutputSide, outputSize } from '../core/schema/output.js';
import type { ExportMode, Supersample, WaycineProject } from '../core/schema/types.js';
import type { HostCanvas } from './backend.js';
import { loadBundledFonts } from './fonts.js';
import { createFrameStage } from './frame-stage.js';
import { canSupersample } from './ladder.js';

/** Options for `renderStill`. */
export interface StillOptions {
  /** Output width in px (even). Default: from `project.output`. */
  width?: number;
  /** Output height in px (even). Default: from `project.output`. */
  height?: number;
  /** 2 draws at twice the size and scales down, when `canSupersample(W, H)`. Default: `project.output.supersample`. */
  supersample?: Supersample;
  /** Timeline mode. Default: `project.output.exportMode` (as the preview). */
  mode?: ExportMode;
}

function toPng(canvas: HostCanvas): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/png' });
  }
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('The browser could not encode the frame as PNG.'));
      }
    }, 'image/png');
  });
}

/**
 * Renders timeline frame `frame` (0-based) of `project` at the export size
 * and returns it as a PNG. Loads the bundled fonts first if needed; throws a
 * `RangeError` for a frame outside the timeline.
 */
export async function renderStill(
  project: WaycineProject,
  frame: number,
  opts: StillOptions = {},
): Promise<Blob> {
  const base = outputSize(project.output);
  const width = evenOutputSide(opts.width ?? base.width);
  const height = evenOutputSide(opts.height ?? base.height);
  const requested = opts.supersample ?? project.output.supersample;
  await loadBundledFonts();
  const stage = createFrameStage(project, width, height, {
    ...(opts.mode === undefined ? {} : { mode: opts.mode }),
    supersample: requested === 2 && canSupersample(width, height) ? 2 : 1,
  });
  if (!Number.isInteger(frame) || frame < 0 || frame >= stage.total) {
    throw new RangeError(`renderStill: frame ${frame} is outside 0..${stage.total - 1}.`);
  }
  stage.draw(frame);
  return toPng(stage.canvas);
}
