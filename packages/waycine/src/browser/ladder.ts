/**
 * The export fallback ladder, as pure logic over a capability interface (so
 * it can be tested without a browser):
 *
 * 1. H.264 in MP4 at the requested size;
 * 2. H.264 at the largest size the browser can encode;
 * 3. VP9 in WebM (requested size, else the largest that passes);
 * 4. no usable WebCodecs encoder: real-time `MediaRecorder` on a canvas stream;
 * 5. nothing: the browser cannot export video.
 */

/** Largest 2x-supersampled frame in px (4096 x 4096, about 16.7 M: Safari's canvas area limit). */
export const MAX_SUPERSAMPLE_PIXELS = 4096 * 4096;

/**
 * True when 2x supersampling fits a `width` x `height` export: the 2x frame
 * (`4 * W * H` px) must stay within `MAX_SUPERSAMPLE_PIXELS`, the same rule
 * as the CLI. 1080p and 1440p (16:9) fit; 2160p does not.
 */
export function canSupersample(width: number, height: number): boolean {
  return 4 * width * height <= MAX_SUPERSAMPLE_PIXELS;
}

/** A WebCodecs video codec the exporter writes: `avc` (H.264, MP4) or `vp9` (WebM). */
export type ExportCodec = 'avc' | 'vp9';

/** Container a route writes. */
export type ExportContainer = 'mp4' | 'webm';

/** How an export will be made. */
export type ExportRoute =
  | { kind: 'webcodecs'; codec: 'avc'; container: 'mp4' }
  | { kind: 'webcodecs'; codec: 'vp9'; container: 'webm' }
  | { kind: 'recorder'; mimeType: string; container: ExportContainer }
  | { kind: 'none' };

/** One export size to probe. */
export interface LadderCandidate {
  /** Frame width in px. */
  width: number;
  /** Frame height in px. */
  height: number;
  /** Frame rate as in `output.fps`. */
  fps: number;
  /** Target bitrate in bits per second at this size. */
  bitrate: number;
}

/** What the browser can do; `browserCapabilities()` builds the real one. */
export interface ExportCapabilities {
  /** True when `VideoEncoder` exists. */
  webCodecs: boolean;
  /** True when `codec` can be encoded at this candidate's size, frame rate and bitrate. */
  canEncode(codec: ExportCodec, candidate: LadderCandidate): Promise<boolean>;
  /** Best `MediaRecorder` MIME type for a canvas stream, or null when recording is unavailable. */
  recorderMimeType: string | null;
}

/**
 * Why the plan differs from "H.264 at the requested size": `smaller` (H.264
 * only at a smaller size), `webm` (VP9 in WebM), `recorder` (real-time
 * recording, may drop frames), `unavailable` (no way to export video).
 */
export type LadderNotice = 'none' | 'smaller' | 'webm' | 'recorder' | 'unavailable';

/** The ladder's answer. */
export interface LadderResult {
  /** The route to export with. */
  route: ExportRoute;
  /** Per candidate: true when it can be exported with `route`. */
  supported: boolean[];
  /** Candidate to export: the requested one when supported, else the largest supported; -1 for `none`. */
  chosen: number;
  /** What to tell the user. */
  notice: LadderNotice;
}

/** Container of a MediaRecorder MIME type. */
export function recorderContainer(mimeType: string): ExportContainer {
  return mimeType.toLowerCase().startsWith('video/mp4') ? 'mp4' : 'webm';
}

function largest(candidates: readonly LadderCandidate[], supported: readonly boolean[]): number {
  let best = -1;
  let bestPixels = -1;
  candidates.forEach((c, i) => {
    const pixels = c.width * c.height;
    if (supported[i] && pixels > bestPixels) {
      best = i;
      bestPixels = pixels;
    }
  });
  return best;
}

async function probeAll(
  caps: ExportCapabilities,
  codec: ExportCodec,
  candidates: readonly LadderCandidate[],
): Promise<boolean[]> {
  return Promise.all(
    candidates.map((candidate) => caps.canEncode(codec, candidate).catch(() => false)),
  );
}

/**
 * Walks the fallback ladder for `candidates` (the sizes the user can pick)
 * with `requested` the index the user asked for. Never throws: a failing
 * capability check counts as "cannot encode".
 */
export async function planExportRoute(
  candidates: readonly LadderCandidate[],
  requested: number,
  caps: ExportCapabilities,
): Promise<LadderResult> {
  const recorder = (): LadderResult =>
    caps.recorderMimeType === null
      ? {
          route: { kind: 'none' },
          supported: candidates.map(() => false),
          chosen: -1,
          notice: 'unavailable',
        }
      : {
          route: {
            kind: 'recorder',
            mimeType: caps.recorderMimeType,
            container: recorderContainer(caps.recorderMimeType),
          },
          supported: candidates.map(() => true),
          chosen: Math.min(Math.max(0, requested), candidates.length - 1),
          notice: 'recorder',
        };

  if (!caps.webCodecs || candidates.length === 0) {
    return recorder();
  }
  const avc = await probeAll(caps, 'avc', candidates);
  if (avc[requested]) {
    return {
      route: { kind: 'webcodecs', codec: 'avc', container: 'mp4' },
      supported: avc,
      chosen: requested,
      notice: 'none',
    };
  }
  const avcBest = largest(candidates, avc);
  if (avcBest >= 0) {
    return {
      route: { kind: 'webcodecs', codec: 'avc', container: 'mp4' },
      supported: avc,
      chosen: avcBest,
      notice: 'smaller',
    };
  }
  const vp9 = await probeAll(caps, 'vp9', candidates);
  const vp9Chosen = vp9[requested] ? requested : largest(candidates, vp9);
  if (vp9Chosen >= 0) {
    return {
      route: { kind: 'webcodecs', codec: 'vp9', container: 'webm' },
      supported: vp9,
      chosen: vp9Chosen,
      notice: 'webm',
    };
  }
  return recorder();
}
