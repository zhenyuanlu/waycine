/**
 * Frame rendering in Node: compile a project for its output size, draw a
 * frame with `@napi-rs/canvas`, and hand back RGBA pixels or a PNG; encode a
 * frame range through ffmpeg.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { type Canvas, createCanvas, type ImageData, type SKRSContext2D } from '@napi-rs/canvas';
import {
  type Backend,
  type Compiled,
  compile,
  createNodeBackend,
  outputSize,
  renderFrame,
  type TimelineSegment,
  type WaycineProject,
} from 'waycine/node';
import { CliError, EXIT_INTERRUPTED } from './args.js';
import { type EncodeSettings, startEncoder } from './ffmpeg.js';

/**
 * Largest supersampled frame in px (4096 x 4096 = 16.7 M): `output.supersample: 2`
 * applies only when `4 * W * H` fits, otherwise the frame renders at 1x.
 * The same limit as `canSupersample` in `waycine/browser`.
 */
export const MAX_SUPERSAMPLE_PIXELS = 4096 * 4096;

/** The supersampling factor that applies to a W x H output for the requested factor. */
export function effectiveSupersample(requested: number, width: number, height: number): 1 | 2 {
  return requested === 2 && 4 * width * height <= MAX_SUPERSAMPLE_PIXELS ? 2 : 1;
}

/**
 * Lets the event loop run once. `@napi-rs/canvas` frees the pixels returned by
 * `getImageData` only in finalizers that Node runs from the event loop after a
 * garbage collection, so a frame loop that never yields keeps every frame it
 * read (about 8 MB per 1080p frame, so several gigabytes over a full video).
 * Every frame loop awaits this after each frame; it costs microseconds.
 */
export function releaseFrameMemory(): Promise<void> {
  return nextTurn();
}

/** 2x2 mean of an opaque RGBA frame of 2W x 2H into W x H (alpha 255). */
export function downsample2x(
  src: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const srcRow = width * 8;
  for (let y = 0; y < height; y++) {
    const r0 = 2 * y * srcRow;
    const r1 = r0 + srcRow;
    let o = y * width * 4;
    for (let x = 0; x < width; x++, o += 4) {
      const a = r0 + x * 8;
      const b = r1 + x * 8;
      for (let ch = 0; ch < 3; ch++) {
        out[o + ch] =
          ((src[a + ch] as number) +
            (src[a + 4 + ch] as number) +
            (src[b + ch] as number) +
            (src[b + 4 + ch] as number) +
            2) >>
          2;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Renders frames of one compiled project. */
export class FrameRenderer {
  /** The compiled project (at the render size: output size x supersample). */
  readonly compiled: Compiled;
  /** Output frame width in px. */
  readonly width: number;
  /** Output frame height in px. */
  readonly height: number;
  /** Supersampling factor in use (1 or 2). */
  readonly supersample: 1 | 2;
  private readonly backend: Backend;
  private readonly canvas: Canvas;
  private readonly ctx: SKRSContext2D;
  private outCanvas: Canvas | undefined;
  private outImage: ImageData | undefined;

  /**
   * Compiles `project` at its output size (`project.output`) in its
   * `output.exportMode`. `backend` defaults to `createNodeBackend()`, which
   * registers the bundled fonts.
   */
  constructor(project: WaycineProject, backend: Backend = createNodeBackend()) {
    const size = outputSize(project.output);
    this.width = size.width;
    this.height = size.height;
    this.supersample = effectiveSupersample(project.output.supersample, size.width, size.height);
    this.backend = backend;
    const k = this.supersample;
    this.compiled = compile(project, backend, {
      width: size.width * k,
      height: size.height * k,
      mode: project.output.exportMode,
    });
    this.canvas = createCanvas(size.width * k, size.height * k);
    this.ctx = this.canvas.getContext('2d');
  }

  /** Frames in the timeline. */
  get totalFrames(): number {
    return this.compiled.timeline.totalFrames;
  }

  /** Timeline segments. */
  get segments(): readonly TimelineSegment[] {
    return this.compiled.timeline.segments;
  }

  /** Draws `frame` and returns its RGBA pixels (width x height x 4, opaque). */
  rgba(frame: number): Uint8ClampedArray {
    this.draw(frame);
    const k = this.supersample;
    const data = this.ctx.getImageData(0, 0, this.width * k, this.height * k).data;
    return k === 2 ? downsample2x(data, this.width, this.height) : data;
  }

  /** Draws `frame` and returns it as a PNG file. */
  async png(frame: number): Promise<Buffer> {
    if (this.supersample === 1) {
      this.draw(frame);
      return this.canvas.encode('png');
    }
    return this.encodePng(this.rgba(frame));
  }

  /** Encodes RGBA pixels from `rgba()` as a PNG file. */
  async encodePng(pixels: Uint8ClampedArray): Promise<Buffer> {
    this.outCanvas ??= createCanvas(this.width, this.height);
    const ctx = this.outCanvas.getContext('2d');
    // One pixel block for every frame; the clear drops the previous put from napi's recording.
    this.outImage ??= ctx.createImageData(this.width, this.height);
    this.outImage.data.set(pixels);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.putImageData(this.outImage, 0, 0);
    return this.outCanvas.encode('png');
  }

  private draw(frame: number): void {
    if (!Number.isInteger(frame) || frame < 0 || frame >= this.totalFrames) {
      throw new RangeError(`frame ${frame} is outside 0..${this.totalFrames - 1}`);
    }
    renderFrame(this.ctx, this.compiled, frame, this.backend);
  }
}

/** Options for `encodeRange`. */
export interface EncodeOptions {
  /** ffmpeg executable (see `findFfmpeg`). */
  ffmpeg: string;
  /** MP4 file to write. */
  out: string;
  /** First frame (inclusive). Default 0. */
  from?: number;
  /** Last frame (inclusive). Default the last frame. */
  to?: number;
  /** x264 CRF. Default 16. */
  crf?: number;
  /** Called after each frame with the count done and the total. */
  onFrame?: (done: number, total: number) => void;
  /** Stops the encode (Ctrl+C): ffmpeg is killed and `encodeRange` rejects with exit code 130. */
  signal?: AbortSignal;
}

/** The error an interrupted encode rejects with. */
export function interruptedError(): CliError {
  return new CliError('Interrupted.', EXIT_INTERRUPTED);
}

/**
 * Encodes frames `from..to` of `renderer` into one MP4 with ffmpeg.
 * `onPixels` also receives every frame's pixels (the CLI writes PNGs with it).
 * On any failure ffmpeg is stopped and the error is rethrown; the caller owns
 * the output file (the CLI encodes to a temporary name and renames it).
 */
export async function encodeRange(
  renderer: FrameRenderer,
  opts: EncodeOptions,
  onPixels?: (frame: number, pixels: Uint8ClampedArray) => Promise<void>,
): Promise<void> {
  const from = opts.from ?? 0;
  const to = opts.to ?? renderer.totalFrames - 1;
  const settings: EncodeSettings = {
    width: renderer.width,
    height: renderer.height,
    fps: renderer.compiled.fps,
    crf: opts.crf ?? 16,
    out: opts.out,
  };
  mkdirSync(dirname(opts.out), { recursive: true });
  const signal = opts.signal;
  // A function, so the checks below are not narrowed away (the flag changes while awaiting).
  const aborted = (): boolean => signal?.aborted === true;
  if (aborted()) throw interruptedError();
  const encoder = startEncoder(opts.ffmpeg, settings);
  const stop = (): void => {
    void encoder.abort();
  };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    for (let f = from; f <= to; f++) {
      if (aborted()) throw interruptedError();
      const pixels = renderer.rgba(f);
      await encoder.write(pixels);
      await onPixels?.(f, pixels);
      opts.onFrame?.(f - from + 1, to - from + 1);
      await releaseFrameMemory();
    }
    await encoder.finish();
  } catch (error) {
    await encoder.abort();
    throw aborted() ? interruptedError() : error;
  } finally {
    signal?.removeEventListener('abort', stop);
  }
}
