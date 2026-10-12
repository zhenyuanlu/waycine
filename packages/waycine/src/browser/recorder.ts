/**
 * The last rung of the export ladder: real-time recording with
 * `MediaRecorder` on `canvas.captureStream(fps)`, for browsers without a
 * usable WebCodecs encoder. It plays the video once in real time on the main
 * thread; frames can be dropped when the page is busy or hidden.
 */
import { evenOutputSide, fpsRational, outputSize, targetBitrate } from '../core/schema/output.js';
import type { WaycineProject } from '../core/schema/types.js';
import type { ExportProgress } from './encode.js';
import { abortError, ExportFailedError, errorMessage, throwIfAborted } from './errors.js';
import type { ExportResult } from './export.js';
import { loadBundledFonts } from './fonts.js';
import { createFrameStage } from './frame-stage.js';
import { recorderContainer } from './ladder.js';
import { EncoderUnavailableError, recorderMimeType } from './probe.js';

/** Options for `recordVideo`. */
export interface RecordOptions {
  /** Output width in px (even). Default: from `project.output`. */
  width?: number;
  /** Output height in px (even). Default: from `project.output`. */
  height?: number;
  /** Video bitrate in bits per second. Default: from `output.quality` / `output.bitrateMbps`. */
  bitrate?: number;
  /** MediaRecorder MIME type. Default: `recorderMimeType()`. */
  mimeType?: string;
  /** Width in px of `ExportProgress.thumbnail` snapshots; 0 or absent for none. */
  thumbnailWidth?: number;
  /** Progress callback. */
  onProgress?(progress: ExportProgress): void;
  /** Cancels the recording; the promise then rejects with an `AbortError`. */
  signal?: AbortSignal;
}

/** Frames of wall-clock slack before a progress report (about ten per second at 30 fps). */
const PROGRESS_EVERY = 3;
/** Minimum wall-clock gap between thumbnails. */
const THUMBNAIL_INTERVAL_MS = 250;

function sleepUntil(targetMs: number): Promise<void> {
  const wait = Math.max(0, targetMs - performance.now());
  return new Promise((resolve) => setTimeout(resolve, wait));
}

/** First codec of a MIME type such as `video/mp4;codecs=avc1.640028`, else ''. */
function codecOf(mime: string): string {
  const match = /codecs="?([^",;]+)/i.exec(mime);
  return match?.[1]?.trim() ?? '';
}

/**
 * Records `project` in real time with `MediaRecorder` (MP4 when the browser
 * can record it, else WebM). Needs a `document` (a DOM canvas) and
 * MediaRecorder; throws `EncoderUnavailableError` without them. The file's
 * timing follows the wall clock, so it may drop or repeat frames.
 */
export async function recordVideo(
  project: WaycineProject,
  opts: RecordOptions = {},
): Promise<ExportResult> {
  const { signal, onProgress } = opts;
  throwIfAborted(signal);
  const mimeType = opts.mimeType ?? recorderMimeType();
  if (mimeType === null || typeof document === 'undefined') {
    throw new EncoderUnavailableError({
      ok: false,
      status: 'no-webcodecs',
      message: 'This browser can neither encode video with WebCodecs nor record a canvas.',
    });
  }
  const base = outputSize(project.output);
  const width = evenOutputSide(opts.width ?? base.width);
  const height = evenOutputSide(opts.height ?? base.height);
  const fps = fpsRational(project.output.fps);
  const bitrate = Math.max(
    1,
    Math.round(opts.bitrate ?? targetBitrate(project.output, { width, height }, fps)),
  );
  await loadBundledFonts();
  throwIfAborted(signal);

  // captureStream needs a DOM canvas: build the stage there, then copy each frame onto it.
  const stage = createFrameStage(project, width, height, { supersample: 1 });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(`Could not get a 2D context for a ${width}x${height} canvas.`);
  }
  const total = stage.total;
  const show = (frame: number): void => {
    stage.draw(frame);
    ctx.drawImage(stage.canvas, 0, 0);
  };

  const stream = canvas.captureStream(fps.num / fps.den);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });
  const stopped = new Promise<void>((resolve) => {
    recorder.addEventListener('stop', () => resolve(), { once: true });
  });
  const failed = new Promise<never>((_resolve, reject) => {
    recorder.addEventListener('error', (event) => {
      reject(
        new Error(
          `MediaRecorder failed: ${String((event as { error?: unknown }).error ?? 'unknown error')}`,
        ),
      );
    });
  });
  failed.catch(() => undefined);
  const stopAll = (): void => {
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
    for (const t of stream.getTracks()) {
      t.stop();
    }
  };

  const frameMs = (1000 * fps.den) / fps.num;
  let current: number | null = null;
  let thumbnailMs = Number.NEGATIVE_INFINITY;
  const startedMs = performance.now();
  try {
    current = 0;
    show(0);
    recorder.start(1000);
    const t0 = performance.now();
    track?.requestFrame?.();
    for (let i = 0; i < total; i += 1) {
      throwIfAborted(signal);
      if (i > 0) {
        current = i;
        show(i);
        track?.requestFrame?.();
      }
      const done = i + 1;
      if (onProgress && (done % PROGRESS_EVERY === 0 || done === total)) {
        const nowMs = performance.now();
        let thumbnail: ImageBitmap | undefined;
        if ((opts.thumbnailWidth ?? 0) > 0 && nowMs - thumbnailMs >= THUMBNAIL_INTERVAL_MS) {
          thumbnailMs = nowMs;
          const w = Math.round(opts.thumbnailWidth ?? 0);
          thumbnail = await createImageBitmap(canvas, {
            resizeWidth: w,
            resizeHeight: Math.max(1, Math.round((w * height) / width)),
            resizeQuality: 'low',
          }).catch(() => undefined);
        }
        const elapsed = nowMs - t0;
        const rate = elapsed > 0 ? (done * 1000) / elapsed : 0;
        onProgress({
          frame: done,
          total,
          fps: rate,
          etaSec: ((total - done) * frameMs) / 1000,
          file: 0,
          files: 1,
          ...(thumbnail === undefined ? {} : { thumbnail }),
        });
      }
      await Promise.race([sleepUntil(t0 + done * frameMs), failed]);
    }
    throwIfAborted(signal);
    stopAll();
    await Promise.race([stopped, failed]);
  } catch (err) {
    stopAll();
    if (signal?.aborted) {
      throw abortError();
    }
    const where = current === null ? 'before the first frame' : `at frame ${current}`;
    throw new ExportFailedError(`Recording failed ${where}: ${errorMessage(err)}`, current, {
      cause: err,
    });
  }
  const type = recorder.mimeType || mimeType;
  return {
    blob: new Blob(chunks, { type: type.split(';')[0] ?? type }),
    codec: codecOf(type),
    mimeType: type,
    container: recorderContainer(type),
    frames: total,
    width,
    height,
    supersample: 1,
    thread: 'main',
    elapsedMs: performance.now() - startedMs,
  };
}
