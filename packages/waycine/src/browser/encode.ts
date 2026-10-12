/**
 * The WebCodecs encode loop shared by the main-thread exporter and the export
 * worker: draw every frame through the frame stage (`./frame-stage.js`, which
 * compiles the project and handles supersampling), feed a Mediabunny
 * `CanvasSource`, one `Output` per file. Mediabunny is passed in, so the main
 * thread can load it lazily and the worker statically.
 */
import type { SegmentKind } from '../core/scene-types.js';
import type { FpsRational } from '../core/schema/output.js';
import type { ExportMode, WaycineProject } from '../core/schema/types.js';
import type { HostCanvas } from './backend.js';
import { abortError, ExportFailedError, errorMessage, throwIfAborted } from './errors.js';
import { createFrameStage } from './frame-stage.js';
import type { ExportCodec } from './ladder.js';
import type * as MediabunnyModule from './mediabunny.js';

/** The Mediabunny subset the exporter uses (`./mediabunny.js`). */
export type Mediabunny = typeof MediabunnyModule;

/** One export as plain data: it is posted to the export worker as is. */
export interface ExportJob {
  /** The project, with `output.fps` already set to the export rate. */
  project: WaycineProject;
  /** Output width in px (even). */
  width: number;
  /** Output height in px (even). */
  height: number;
  /** Video bitrate in bits per second. */
  bitrate: number;
  /** `avc` writes MP4, `vp9` writes WebM. */
  codec: ExportCodec;
  /** Timeline mode (`segments` for clips). */
  mode: ExportMode;
  /** One file per timeline segment instead of one file. */
  clips: boolean;
  /** Supersampling in effect (already checked against `canSupersample`). */
  supersample: 1 | 2;
  /** Width of progress thumbnails in px; 0 for none. */
  thumbnailWidth: number;
}

/** Progress of an export, reported about ten times per second. */
export interface ExportProgress {
  /** Frames encoded so far (over all files). */
  frame: number;
  /** Total frames. */
  total: number;
  /** Encoding speed in frames per second (wall clock). */
  fps: number;
  /** Estimated seconds left (wall clock); Infinity before the first frame. */
  etaSec: number;
  /** Index of the file being written (0 for one video; the clip index for clips). */
  file: number;
  /** Files in this export (1 for one video). */
  files: number;
  /**
   * A small snapshot of the last frame (`createImageBitmap`, at most about
   * four per second) when thumbnails were requested. The receiver owns it and
   * should `close()` it once drawn.
   */
  thumbnail?: ImageBitmap;
}

/** One encoded file. */
export interface EncodedFile {
  /** The file bytes. */
  buffer: ArrayBuffer;
  /** Frames in the file. */
  frames: number;
  /** Timeline segment of a clip (`overview`, `stop`, `finale`, `hold`); absent for one video. */
  kind?: SegmentKind;
  /** Stop index (0-based) of a stop clip; 0 otherwise. */
  index?: number;
  /** City of a stop clip as drawn; '' otherwise. */
  city?: string;
}

/** What an encode produced. */
export interface EncodeOutcome {
  /** The files, in timeline order. */
  files: EncodedFile[];
  /** Codec string of the stream as written (for example `avc1.640032`). */
  codec: string;
  /** MIME type of the files (`video/mp4` or `video/webm`). */
  mimeType: string;
  /** Frames written over all files. */
  frames: number;
}

/** Hooks for `encodeJob`. */
export interface EncodeHooks {
  /** Cancels the encode; it then rejects with an `AbortError`. */
  signal?: AbortSignal;
  /** Called once, before the first frame, with the total frame count. */
  onStart?(total: number): void;
  /** Progress callback. */
  onProgress?(progress: ExportProgress): void;
}

/**
 * Colour description written to the file: BT.709 primaries, transfer and
 * matrix with limited range, as the original's final encode tagged its video.
 * Browser encoders report an sRGB transfer for canvas frames; the RGB to YUV
 * conversion itself is already BT.709 limited range.
 */
const BT709: VideoColorSpaceInit = {
  primaries: 'bt709',
  transfer: 'bt709',
  matrix: 'bt709',
  fullRange: false,
};

/** Seconds between key frames. */
export const KEY_FRAME_INTERVAL_SEC = 2;
/** Frames rendered between yields to the event loop (input, paint, cancel messages). */
const YIELD_EVERY = 8;
/** Minimum wall-clock gap between progress reports (about ten per second). */
const PROGRESS_INTERVAL_MS = 100;
/** Minimum wall-clock gap between thumbnails. */
const THUMBNAIL_INTERVAL_MS = 250;

function hex2(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

/**
 * `avc1.PPCCLL` from an `AVCDecoderConfigurationRecord` (bytes 1..3 are the
 * profile, constraint flags and level), or '' when it is too short.
 */
export function avcCodecString(description: AllowSharedBufferSource): string {
  const bytes = ArrayBuffer.isView(description)
    ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
    : new Uint8Array(description);
  if (bytes.length < 4) {
    return '';
  }
  return `avc1.${hex2(bytes[1] ?? 0)}${hex2(bytes[2] ?? 0)}${hex2(bytes[3] ?? 0)}`;
}

/** Codec strings seen while encoding: the requested one and the one the stream carries. */
export interface CodecTracker {
  /** Codec string of the encoder configuration Mediabunny built. */
  requested: string;
  /** Codec string of the written stream (from the avcC for H.264). */
  stream: string;
}

/**
 * The `CanvasSource` configuration every export uses. `onEncodedPacket` tags
 * the stream BT.709 (Mediabunny hands this same metadata to the writer right
 * after the callback) and records the real codec string in `codecs`.
 */
export function sourceConfig(
  mb: Mediabunny,
  codec: ExportCodec,
  bitrate: number,
  codecs: CodecTracker,
): ConstructorParameters<Mediabunny['CanvasSource']>[1] {
  return {
    codec,
    quality: new mb.Quality({ bitrate }),
    keyFrameInterval: KEY_FRAME_INTERVAL_SEC,
    latencyMode: 'quality',
    onEncoderConfig: (config) => {
      codecs.requested = config.codec;
    },
    onEncodedPacket: (_packet, meta) => {
      const config = meta?.decoderConfig;
      if (config === undefined) {
        return;
      }
      config.colorSpace = { ...BT709 };
      if (codec === 'avc') {
        if (config.description !== undefined) {
          codecs.stream = avcCodecString(config.description) || codecs.stream;
        }
      } else if (config.codec) {
        codecs.stream = config.codec;
      }
    },
  };
}

/** A new Mediabunny output for `codec`: MP4 (fast start) for `avc`, WebM for `vp9`. */
export function outputFormat(
  mb: Mediabunny,
  codec: ExportCodec,
): MediabunnyModule.Mp4OutputFormat | MediabunnyModule.WebMOutputFormat {
  return codec === 'avc'
    ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' })
    : new mb.WebMOutputFormat();
}

/** MIME type of the files a codec produces. */
export function codecMimeType(codec: ExportCodec): string {
  return codec === 'avc' ? 'video/mp4' : 'video/webm';
}

/**
 * Resolves on the next task via a `MessageChannel`, so the page can paint and
 * handle input (or a worker can receive a cancel message) between frames.
 * Timers would be throttled in background tabs.
 */
function nextTask(channel: MessageChannel): Promise<void> {
  return new Promise((resolve) => {
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });
}

function timestampSec(frame: number, fps: FpsRational): number {
  return (frame * fps.den) / fps.num;
}

async function thumbnailOf(canvas: HostCanvas, width: number): Promise<ImageBitmap | undefined> {
  if (typeof createImageBitmap !== 'function') {
    return undefined;
  }
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round((width * canvas.height) / canvas.width));
  try {
    // createImageBitmap copies; transferToImageBitmap would clear the encoder canvas.
    return await createImageBitmap(canvas, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: 'low',
    });
  } catch {
    return undefined;
  }
}

/**
 * Renders and encodes `job` on the calling thread (window or worker) with
 * `mb`. Call after the fonts have loaded. Errors after the start are wrapped
 * in `ExportFailedError` with the frame being written; a fired signal
 * rejects with an `AbortError`.
 */
export async function encodeJob(
  mb: Mediabunny,
  job: ExportJob,
  hooks: EncodeHooks = {},
): Promise<EncodeOutcome> {
  const { signal, onProgress } = hooks;
  throwIfAborted(signal);
  const stage = createFrameStage(job.project, job.width, job.height, {
    mode: job.mode,
    supersample: job.supersample,
  });
  const { fps, total } = stage;
  const ranges = stage.ranges(job.clips);
  const codecs: CodecTracker = { requested: '', stream: '' };
  const files: EncodedFile[] = [];
  const channel = new MessageChannel();
  let output: MediabunnyModule.Output | null = null;
  const onAbort = (): void => {
    output?.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  let current: number | null = null;
  let done = 0;
  hooks.onStart?.(total);
  const startedMs = performance.now();
  let reportedMs = Number.NEGATIVE_INFINITY;
  let thumbnailMs = Number.NEGATIVE_INFINITY;
  const frameDurationSec = fps.den / fps.num;
  try {
    for (const [fileIndex, range] of ranges.entries()) {
      const target = new mb.BufferTarget();
      const out = new mb.Output({ format: outputFormat(mb, job.codec), target });
      output = out;
      const source = new mb.CanvasSource(
        stage.canvas,
        sourceConfig(mb, job.codec, job.bitrate, codecs),
      );
      // The exact rational (30000/1001, not 29.97) so the timescale is exact.
      out.addVideoTrack(source, { frameRate: fps.num / fps.den });
      await out.start();
      for (let k = 0; k < range.n; k += 1) {
        throwIfAborted(signal);
        const frame = range.start + k;
        current = frame;
        stage.draw(frame);
        await source.add(timestampSec(k, fps), frameDurationSec);
        done += 1;
        if (done % YIELD_EVERY === 0) {
          await nextTask(channel);
        }
        const nowMs = performance.now();
        if (onProgress && (nowMs - reportedMs >= PROGRESS_INTERVAL_MS || done === total)) {
          reportedMs = nowMs;
          let thumbnail: ImageBitmap | undefined;
          if (job.thumbnailWidth > 0 && nowMs - thumbnailMs >= THUMBNAIL_INTERVAL_MS) {
            thumbnailMs = nowMs;
            thumbnail = await thumbnailOf(stage.canvas, job.thumbnailWidth);
          }
          const elapsed = nowMs - startedMs;
          const rate = elapsed > 0 ? (done * 1000) / elapsed : 0;
          onProgress({
            frame: done,
            total,
            fps: rate,
            etaSec: rate > 0 ? (total - done) / rate : Number.POSITIVE_INFINITY,
            file: fileIndex,
            files: ranges.length,
            ...(thumbnail === undefined ? {} : { thumbnail }),
          });
        }
      }
      throwIfAborted(signal);
      await out.finalize();
      const buffer = target.buffer;
      if (!buffer) {
        throw new Error('The video writer finished without producing a file.');
      }
      files.push({
        buffer,
        frames: range.n,
        ...(range.kind === undefined
          ? {}
          : { kind: range.kind, index: range.index ?? 0, city: range.city ?? '' }),
      });
    }
    return {
      files,
      codec: codecs.stream || codecs.requested,
      mimeType: codecMimeType(job.codec),
      frames: done,
    };
  } catch (err) {
    // Release the encoder; cancel() is a no-op once canceled or finalized.
    if (output && output.state !== 'canceled' && output.state !== 'finalized') {
      await output.cancel().catch(() => undefined);
    }
    if (signal?.aborted) {
      throw abortError();
    }
    if (err instanceof ExportFailedError) {
      throw err;
    }
    const where = current === null ? 'before the first frame' : `at frame ${current}`;
    throw new ExportFailedError(`Encoding failed ${where}: ${errorMessage(err)}`, current, {
      cause: err,
    });
  } finally {
    signal?.removeEventListener('abort', onAbort);
    channel.port1.close();
    channel.port2.close();
  }
}
