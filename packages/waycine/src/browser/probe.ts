import type { VideoCodec } from 'mediabunny';
import { fpsRational } from '../core/schema/output.js';
import { context2d, createHostCanvas, offscreen2dAvailable } from './backend.js';
import { type CodecTracker, outputFormat, sourceConfig } from './encode.js';
import { errorMessage } from './errors.js';
import type { ExportCapabilities, ExportCodec } from './ladder.js';

/**
 * Why a probe passed or failed. `no-webcodecs`: the browser has no
 * `VideoEncoder` at all; `unsupported`: WebCodecs exists but refuses this
 * codec at this size, frame rate or bitrate; `probe-failed`: the check itself
 * threw (for example Mediabunny failed to load).
 */
export type EncodeProbeStatus = 'supported' | 'no-webcodecs' | 'unsupported' | 'probe-failed';

/** What to probe. */
export interface EncodeProbeOptions {
  /** Frame width in px. */
  width: number;
  /** Frame height in px. */
  height: number;
  /** Frame rate as in `output.fps` (29.97 is probed as 30000/1001). */
  fps?: number;
  /** Target bitrate in bits per second. */
  bitrate?: number;
}

/** Result of `canEncodeVideo`. */
export interface EncodeProbeResult {
  /** True when an export with these settings should work. */
  ok: boolean;
  /** Machine-readable reason, for apps that show their own copy. */
  status: EncodeProbeStatus;
  /** Plain-English explanation for logs and developer tools. */
  message: string;
}

/** Thrown by `exportVideo` when the browser cannot encode the requested video. */
export class EncoderUnavailableError extends Error {
  /** The failed probe. */
  readonly probe: EncodeProbeResult;

  constructor(probe: EncodeProbeResult) {
    super(probe.message);
    this.name = 'EncoderUnavailableError';
    this.probe = probe;
  }
}

/**
 * Checks whether this browser can encode `codec` at the given size, frame
 * rate and bitrate with WebCodecs (through Mediabunny, lazy-loaded). Never
 * throws; the result says what failed in plain words.
 */
export async function canEncodeVideo(
  codec: VideoCodec,
  opts: EncodeProbeOptions,
): Promise<EncodeProbeResult> {
  const what = `${codec} video at ${opts.width}x${opts.height}`;
  if (typeof VideoEncoder === 'undefined') {
    return {
      ok: false,
      status: 'no-webcodecs',
      message:
        'This browser has no WebCodecs video encoder, so it cannot export video. Try a recent Chrome, Edge or Safari.',
    };
  }
  try {
    const mb = await import('./mediabunny.js');
    const fps = opts.fps === undefined ? undefined : fpsRational(opts.fps);
    const ok = await mb.canEncodeVideo(codec, {
      width: opts.width,
      height: opts.height,
      quality: opts.bitrate === undefined ? undefined : new mb.Quality({ bitrate: opts.bitrate }),
      frameRate: fps === undefined ? undefined : fps.num / fps.den,
    });
    return ok
      ? { ok: true, status: 'supported', message: `This browser can encode ${what}.` }
      : {
          ok: false,
          status: 'unsupported',
          message: `This browser cannot encode ${what}. Try a smaller video size.`,
        };
  } catch (err) {
    const detail = errorMessage(err);
    return {
      ok: false,
      status: 'probe-failed',
      message: `Could not check whether this browser can encode ${what}: ${detail}`,
    };
  }
}

/**
 * The codec string an export at this size, frame rate and bitrate would
 * write (for example `avc1.640032`): encodes one blank frame with the same
 * Mediabunny configuration as the exporter and reads the stream's decoder
 * configuration. Resolves null when WebCodecs cannot encode it. Costs one
 * encoder start-up and one frame, so callers should cache the answer.
 */
export async function probeCodecString(
  codec: ExportCodec,
  opts: EncodeProbeOptions,
): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined') {
    return null;
  }
  try {
    const mb = await import('./mediabunny.js');
    const fps = fpsRational(opts.fps ?? 30);
    const canvas = createHostCanvas(opts.width, opts.height, offscreen2dAvailable());
    const ctx = context2d(canvas);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, opts.width, opts.height);
    const codecs: CodecTracker = { requested: '', stream: '' };
    const output = new mb.Output({ format: outputFormat(mb, codec), target: new mb.NullTarget() });
    const bitrate =
      opts.bitrate ?? Math.round(0.2 * opts.width * opts.height * (fps.num / fps.den));
    const source = new mb.CanvasSource(canvas, sourceConfig(mb, codec, bitrate, codecs));
    output.addVideoTrack(source, { frameRate: fps.num / fps.den });
    try {
      await output.start();
      await source.add(0, fps.den / fps.num);
      await output.finalize();
    } finally {
      if (output.state !== 'finalized' && output.state !== 'canceled') {
        await output.cancel().catch(() => undefined);
      }
    }
    return codecs.stream || codecs.requested || null;
  } catch {
    return null;
  }
}

/** MediaRecorder types tried for a canvas stream, best first. */
const RECORDER_TYPES = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

/**
 * The best `MediaRecorder` MIME type for recording a canvas stream (MP4 when
 * `isTypeSupported` says so, else WebM), or null when this browser cannot
 * record a canvas at all.
 */
export function recorderMimeType(): string | null {
  if (
    typeof MediaRecorder === 'undefined' ||
    typeof HTMLCanvasElement === 'undefined' ||
    typeof HTMLCanvasElement.prototype.captureStream !== 'function'
  ) {
    return null;
  }
  return RECORDER_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

/**
 * This browser's export capabilities for `planExportRoute`: WebCodecs,
 * `canEncodeVideo` per codec and size, and the MediaRecorder fallback.
 */
export function browserCapabilities(): ExportCapabilities {
  return {
    webCodecs: typeof VideoEncoder !== 'undefined',
    canEncode: async (codec, candidate) =>
      (
        await canEncodeVideo(codec, {
          width: candidate.width,
          height: candidate.height,
          fps: candidate.fps,
          bitrate: candidate.bitrate,
        })
      ).ok,
    recorderMimeType: recorderMimeType(),
  };
}
