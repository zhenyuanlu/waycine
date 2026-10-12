import {
  browserCapabilities,
  type ExportCodec,
  type LadderCandidate,
  type LadderResult,
  planExportRoute,
  probeCodecString,
} from 'waycine/browser';

/** Codec strings by codec and candidate: one test encode per size and bitrate per page load. */
const codecStrings = new Map<string, Promise<string | null>>();

/**
 * The codec string an export would write for `codec` at this candidate, for
 * example `avc1.640032` (null when the browser cannot encode it).
 */
export function streamCodec(
  codec: ExportCodec,
  candidate: LadderCandidate,
): Promise<string | null> {
  const key = `${codec}|${candidate.width}x${candidate.height}|${candidate.fps}|${candidate.bitrate}`;
  let pending = codecStrings.get(key);
  if (!pending) {
    pending = probeCodecString(codec, {
      width: candidate.width,
      height: candidate.height,
      fps: candidate.fps,
      bitrate: candidate.bitrate,
    });
    codecStrings.set(key, pending);
  }
  return pending;
}

/** Walks the export fallback ladder for the dialog's size choices. */
export function planRoute(
  candidates: readonly LadderCandidate[],
  requested: number,
): Promise<LadderResult> {
  return planExportRoute(candidates, requested, browserCapabilities());
}

/** The codec part of a MediaRecorder type (`video/mp4;codecs=avc1` -> `avc1`), else the container. */
export function recorderCodec(mimeType: string): string {
  const match = /codecs="?([^",;]+)/i.exec(mimeType);
  return match?.[1]?.trim() ?? mimeType.split(';')[0] ?? mimeType;
}
