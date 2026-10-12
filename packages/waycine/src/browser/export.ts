/**
 * In-browser export with WebCodecs and Mediabunny: one video (`exportVideo`)
 * or one file per timeline segment (`exportClips`), in a worker when the
 * browser can, else on the calling thread.
 *
 * Worker resolution: the worker is created with the literal
 * `new Worker(new URL('./export-worker.js', import.meta.url), {type: 'module'})`,
 * which Vite, webpack 5 and Parcel bundle as a worker entry, and which
 * unbundled ES modules load next to this file. Pass `workerUrl` when a
 * bundler cannot follow it (Vite's dependency pre-bundling loses it: add
 * `waycine` to `optimizeDeps.exclude`). Whenever the worker cannot start or
 * lacks OffscreenCanvas 2D, `VideoEncoder`, `self.fonts` or an encoder for the
 * job, the export runs on the main thread instead; `worker: 'never'` forces that.
 */
import type { SegmentKind } from '../core/scene-types.js';
import {
  evenOutputSide,
  type FrameSize,
  fpsRational,
  outputSize,
  targetBitrate,
} from '../core/schema/output.js';
import {
  type ExportMode,
  FPS_VALUES,
  type Fps,
  type Supersample,
  type WaycineProject,
} from '../core/schema/types.js';
import { offscreen2dAvailable } from './backend.js';
import { type EncodeOutcome, type ExportJob, type ExportProgress, encodeJob } from './encode.js';
import { abortError, ExportFailedError, isAbortError, throwIfAborted } from './errors.js';
import { fetchBundledFontBytes, loadBundledFonts } from './fonts.js';
import { canSupersample, type ExportCodec, type ExportContainer } from './ladder.js';
import { canEncodeVideo, EncoderUnavailableError } from './probe.js';
import type { FromWorker, StartMessage, WorkerFontFace } from './worker-protocol.js';

/** A font face the export worker registers (for projects that use fonts other than the bundled ones). */
export interface ExportFontFace {
  /** CSS family name used in the project's fonts. */
  family: string;
  /** Font file bytes. */
  data: BufferSource;
  /** Optional FontFace descriptors. */
  descriptors?: FontFaceDescriptors;
}

/** Options for `exportVideo` and `exportClips`. */
export interface ExportOptions {
  /** Output width in px (even). Default: from `project.output`. */
  width?: number;
  /** Output height in px (even). Default: from `project.output`. */
  height?: number;
  /** Frame rate as in `output.fps` (29.97 muxes as 30000/1001). Default: `project.output.fps`. */
  fps?: number;
  /** Video bitrate in bits per second. Default: from `output.quality` / `output.bitrateMbps`. */
  bitrate?: number;
  /** `avc` (H.264 in MP4, default) or `vp9` (VP9 in WebM). */
  codec?: ExportCodec;
  /** Timeline mode of `exportVideo`. Default: `project.output.exportMode`. `exportClips` always uses `segments`. */
  mode?: ExportMode;
  /**
   * 2 renders every frame at twice the size and scales it down (smoother
   * edges, about four times the work); applies only when `canSupersample(W, H)`.
   * Default: `project.output.supersample`.
   */
  supersample?: Supersample;
  /** `auto` (default) exports in a worker when possible; `never` stays on the calling thread. */
  worker?: 'auto' | 'never';
  /** URL of `export-worker.js`, for bundlers that cannot resolve it (see the module notes). */
  workerUrl?: string | URL;
  /**
   * Bytes for the bundled alias faces in the worker. Default: the bundled
   * TTFs, fetched by this page. The main-thread path uses the faces already
   * registered on the page (`loadBundledFonts`).
   */
  fonts?: { display?: BufferSource; body?: BufferSource };
  /**
   * Further faces for the worker. A project whose fonts use `source: 'local'`
   * exports on the main thread unless every such family is listed here.
   */
  fontFaces?: readonly ExportFontFace[];
  /** Width in px of `ExportProgress.thumbnail` snapshots; 0 or absent for none. */
  thumbnailWidth?: number;
  /** Progress callback. */
  onProgress?(progress: ExportProgress): void;
  /** Cancels the export; the promise then rejects with an `AbortError`. */
  signal?: AbortSignal;
}

/** What every export reports besides its files. */
export interface ExportInfo {
  /**
   * Codec string of the stream as written (for example `avc1.640032`, High
   * profile level 5.0): read from the encoder's decoder configuration, so it
   * reflects the level the browser chose rather than the one requested.
   */
  codec: string;
  /** MIME type of the file(s): `video/mp4` or `video/webm`. */
  mimeType: string;
  /** Container of the file(s). */
  container: ExportContainer;
  /** Frames written. */
  frames: number;
  /** Frame width in px. */
  width: number;
  /** Frame height in px. */
  height: number;
  /** Supersampling that was applied. */
  supersample: 1 | 2;
  /** Where the frames were rendered and encoded. */
  thread: 'worker' | 'main';
  /** Wall-clock time of the export in ms. */
  elapsedMs: number;
}

/** A finished `exportVideo`. */
export interface ExportResult extends ExportInfo {
  /** The video file. */
  blob: Blob;
}

/** One clip of `exportClips`: a timeline segment as its own file. */
export interface ExportClip {
  /** The clip file. */
  blob: Blob;
  /** Frames in the clip. */
  frames: number;
  /** Segment kind: `overview`, `stop`, `finale` or `hold`. */
  kind: SegmentKind;
  /** Stop index (0-based) of a stop clip; 0 otherwise. */
  index: number;
  /** City of a stop clip as drawn; '' otherwise. */
  city: string;
}

/** A finished `exportClips`. */
export interface ExportClipsResult extends ExportInfo {
  /** The clips in timeline order. */
  clips: ExportClip[];
}

/** Export frame size: explicit options win, then `project.output`; both sides even, 320..4096. */
function exportSize(project: WaycineProject, opts: ExportOptions): FrameSize {
  const base = outputSize(project.output);
  return {
    width: evenOutputSide(opts.width ?? base.width),
    height: evenOutputSide(opts.height ?? base.height),
  };
}

/** The export frame rate: `opts.fps` when given (one of `FPS_VALUES`), else `project.output.fps`. */
function exportFps(project: WaycineProject, fps: number | undefined): Fps {
  if (fps === undefined) {
    return project.output.fps;
  }
  const match = FPS_VALUES.find((value) => value === fps);
  if (match === undefined) {
    throw new RangeError(`exportVideo: fps must be one of ${FPS_VALUES.join(', ')}; got ${fps}.`);
  }
  return match;
}

/** Resolves the options into the plain job both threads run. */
function buildJob(project: WaycineProject, opts: ExportOptions, clips: boolean): ExportJob {
  const size = exportSize(project, opts);
  const fpsValue = exportFps(project, opts.fps);
  // Durations become frames at the export rate, so compile with that rate.
  const exportProject =
    fpsValue === project.output.fps
      ? project
      : { ...project, output: { ...project.output, fps: fpsValue } };
  const bitrate = Math.max(
    1,
    Math.round(opts.bitrate ?? targetBitrate(project.output, size, fpsRational(fpsValue))),
  );
  const requested = opts.supersample ?? project.output.supersample;
  return {
    project: exportProject,
    width: size.width,
    height: size.height,
    bitrate,
    codec: opts.codec ?? 'avc',
    mode: clips ? 'segments' : (opts.mode ?? project.output.exportMode),
    clips,
    supersample: requested === 2 && canSupersample(size.width, size.height) ? 2 : 1,
    thumbnailWidth: Math.max(0, Math.round(opts.thumbnailWidth ?? 0)),
  };
}

/** A copy of `data` as a standalone ArrayBuffer (transferring it never detaches the caller's bytes). */
function copyBytes(data: BufferSource): ArrayBuffer {
  const view = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
  return view.slice().buffer;
}

/** True when the worker can render this project's fonts. */
function workerHasFonts(project: WaycineProject, faces: readonly ExportFontFace[]): boolean {
  const families = new Set(faces.map((face) => face.family));
  return [project.fonts.display, project.fonts.body].every(
    (font) => font.source !== 'local' || families.has(font.family),
  );
}

/** How long a canceled worker gets to release its encoder before it is terminated. */
const CANCEL_GRACE_MS = 2000;
/**
 * How long a new worker may stay silent before the export falls back to the
 * calling thread (a module import that never resolves, a stuck font load or
 * encoder check).
 */
const WORKER_START_TIMEOUT_MS = 20_000;

async function workerFonts(opts: ExportOptions): Promise<StartMessage['fonts']> {
  const given = opts.fonts ?? {};
  if (given.display && given.body) {
    return { display: copyBytes(given.display), body: copyBytes(given.body) };
  }
  const fetched = await fetchBundledFontBytes();
  return {
    display: given.display ? copyBytes(given.display) : fetched.display,
    body: given.body ? copyBytes(given.body) : fetched.body,
  };
}

/**
 * Runs `job` in the export worker. Resolves null when the worker is not
 * usable here (it failed to start, or it lacks a feature or an encoder for
 * the job), so the caller falls back to the main thread.
 */
async function runInWorker(job: ExportJob, opts: ExportOptions): Promise<EncodeOutcome | null> {
  if (typeof Worker === 'undefined' || !offscreen2dAvailable()) {
    return null;
  }
  const { signal } = opts;
  let fonts: StartMessage['fonts'];
  try {
    fonts = await workerFonts(opts);
  } catch {
    return null;
  }
  throwIfAborted(signal);
  const faces: WorkerFontFace[] = (opts.fontFaces ?? []).map((face) => ({
    family: face.family,
    data: copyBytes(face.data),
    ...(face.descriptors === undefined ? {} : { descriptors: face.descriptors }),
  }));

  let worker: Worker;
  try {
    worker =
      opts.workerUrl === undefined
        ? new Worker(new URL('./export-worker.js', import.meta.url), { type: 'module' })
        : new Worker(opts.workerUrl, { type: 'module' });
  } catch {
    return null;
  }

  return new Promise<EncodeOutcome | null>((resolve, reject) => {
    let started = false;
    let settled = false;
    let terminated = false;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    const stopStartTimer = (): void => {
      if (startTimer !== undefined) {
        clearTimeout(startTimer);
        startTimer = undefined;
      }
    };
    const terminate = (): void => {
      if (!terminated) {
        terminated = true;
        worker.terminate();
      }
    };
    const settle = (finish: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      stopStartTimer();
      signal?.removeEventListener('abort', onAbort);
      finish();
    };
    function onAbort(): void {
      worker.postMessage({ type: 'cancel' });
      // Let the worker cancel its encoder, then end it either way.
      setTimeout(terminate, CANCEL_GRACE_MS);
      settle(() => reject(abortError()));
    }
    const fail = (message: string, frame: number | null, cause?: unknown): void => {
      terminate();
      settle(() =>
        reject(new ExportFailedError(message, frame, cause === undefined ? undefined : { cause })),
      );
    };

    worker.addEventListener('message', (event: MessageEvent<FromWorker>) => {
      stopStartTimer();
      const msg = event.data;
      switch (msg.type) {
        case 'unavailable':
          terminate();
          settle(() => resolve(null));
          break;
        case 'started':
          started = true;
          break;
        case 'progress':
          if (settled) {
            msg.progress.thumbnail?.close();
          } else {
            opts.onProgress?.(msg.progress);
          }
          break;
        case 'done':
          terminate();
          settle(() => resolve(msg.outcome));
          break;
        case 'canceled':
          terminate();
          settle(() => reject(abortError()));
          break;
        case 'error': {
          const cause = new Error(msg.message);
          cause.name = msg.name;
          if (msg.stack !== undefined) {
            cause.stack = msg.stack;
          }
          fail(msg.message, msg.frame, cause);
          break;
        }
      }
    });
    worker.addEventListener('error', (event: ErrorEvent) => {
      event.preventDefault();
      if (started) {
        fail(`The export worker failed: ${event.message || 'unknown error'}`, null);
      } else {
        // The worker script did not load or run: export on the main thread instead.
        terminate();
        settle(() => resolve(null));
      }
    });
    worker.addEventListener('messageerror', () => {
      fail('The export worker sent a message that could not be read.', null);
    });
    signal?.addEventListener('abort', onAbort, { once: true });

    const start: StartMessage = { type: 'start', job, fonts, faces };
    const transfer: Transferable[] = [
      ...(fonts.display ? [fonts.display] : []),
      ...(fonts.body ? [fonts.body] : []),
      ...faces.map((face) => face.data),
    ];
    worker.postMessage(start, transfer);
    // A worker that never answers: export on the calling thread instead.
    startTimer = setTimeout(() => {
      startTimer = undefined;
      if (!started) {
        terminate();
        settle(() => resolve(null));
      }
    }, WORKER_START_TIMEOUT_MS);
  });
}

/** Runs `job` on the calling thread. */
async function runOnThisThread(job: ExportJob, opts: ExportOptions): Promise<EncodeOutcome> {
  const { signal } = opts;
  const probe = await canEncodeVideo(job.codec, {
    width: job.width,
    height: job.height,
    fps: job.project.output.fps,
    bitrate: job.bitrate,
  });
  if (!probe.ok) {
    throw new EncoderUnavailableError(probe);
  }
  await loadBundledFonts();
  throwIfAborted(signal);
  const mb = await import('./mediabunny.js');
  throwIfAborted(signal);
  return encodeJob(mb, job, {
    ...(signal === undefined ? {} : { signal }),
    ...(opts.onProgress === undefined ? {} : { onProgress: opts.onProgress }),
  });
}

async function runExport(
  project: WaycineProject,
  opts: ExportOptions,
  clips: boolean,
): Promise<{ outcome: EncodeOutcome; info: ExportInfo }> {
  throwIfAborted(opts.signal);
  const job = buildJob(project, opts, clips);
  const startedMs = performance.now();
  let outcome: EncodeOutcome | null = null;
  let thread: ExportInfo['thread'] = 'main';
  if (opts.worker !== 'never' && workerHasFonts(project, opts.fontFaces ?? [])) {
    try {
      outcome = await runInWorker(job, opts);
    } catch (err) {
      if (opts.signal?.aborted || isAbortError(err)) {
        throw abortError();
      }
      throw err;
    }
    thread = outcome === null ? 'main' : 'worker';
  }
  outcome ??= await runOnThisThread(job, opts);
  const info: ExportInfo = {
    codec: outcome.codec,
    mimeType: outcome.mimeType,
    container: job.codec === 'avc' ? 'mp4' : 'webm',
    frames: outcome.frames,
    width: job.width,
    height: job.height,
    supersample: job.supersample,
    thread,
    elapsedMs: performance.now() - startedMs,
  };
  return { outcome, info };
}

/**
 * Renders every frame of `project` and encodes one video in the browser:
 * H.264 in MP4 (default) or VP9 in WebM, with Mediabunny. Runs in a worker
 * when the browser allows (see the module notes), else on the calling
 * thread, where it yields to the event loop every few frames. Throws
 * `EncoderUnavailableError` when the browser cannot encode this codec and
 * size, and `ExportFailedError` (with the frame) when encoding fails part-way.
 * Frame timestamps come from the integer frame index (`i * den / num`); the
 * file is tagged BT.709 (primaries, transfer, matrix; limited range).
 */
export async function exportVideo(
  project: WaycineProject,
  opts: ExportOptions = {},
): Promise<ExportResult> {
  const { outcome, info } = await runExport(project, opts, false);
  const file = outcome.files[0];
  if (!file) {
    throw new ExportFailedError('The export produced no file.', null);
  }
  return { ...info, blob: new Blob([file.buffer], { type: outcome.mimeType }) };
}

/**
 * Exports every timeline segment of `project` in `segments` mode (overview,
 * each stop, finale, end hold) as its own file, each starting and ending on
 * its own (without the fades that join them in one video); otherwise as
 * `exportVideo`.
 */
export async function exportClips(
  project: WaycineProject,
  opts: ExportOptions = {},
): Promise<ExportClipsResult> {
  const { outcome, info } = await runExport(project, opts, true);
  return {
    ...info,
    clips: outcome.files.map((file) => ({
      blob: new Blob([file.buffer], { type: outcome.mimeType }),
      frames: file.frames,
      kind: file.kind ?? 'overview',
      index: file.index ?? 0,
      city: file.city ?? '',
    })),
  };
}
