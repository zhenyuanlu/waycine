import { describe, expect, it } from 'vitest';
import {
  canSupersample,
  type ExportCapabilities,
  type ExportCodec,
  type LadderCandidate,
  planExportRoute,
  recorderContainer,
} from '../../src/browser/ladder.js';

const FPS = 29.97;

/** 16:9 candidates at 720p, 1080p, 1440p and 2160p. */
const CANDIDATES: LadderCandidate[] = [
  { width: 1280, height: 720, fps: FPS, bitrate: 5_000_000 },
  { width: 1920, height: 1080, fps: FPS, bitrate: 12_000_000 },
  { width: 2560, height: 1440, fps: FPS, bitrate: 22_000_000 },
  { width: 3840, height: 2160, fps: FPS, bitrate: 50_000_000 },
];

/** Mock capabilities: `limits[codec]` is the largest short side that codec encodes (0 = none). */
function caps(
  limits: Partial<Record<ExportCodec, number>>,
  opts: { webCodecs?: boolean; recorder?: string | null; throws?: boolean } = {},
): ExportCapabilities & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    webCodecs: opts.webCodecs ?? true,
    recorderMimeType: opts.recorder === undefined ? 'video/mp4;codecs=avc1' : opts.recorder,
    async canEncode(codec, candidate) {
      calls.push(`${codec}@${candidate.height}`);
      if (opts.throws) {
        throw new Error('probe exploded');
      }
      return Math.min(candidate.width, candidate.height) <= (limits[codec] ?? 0);
    },
  };
}

describe('export fallback ladder', () => {
  it('uses H.264 at the requested size when it passes', async () => {
    const result = await planExportRoute(CANDIDATES, 1, caps({ avc: 2160 }));
    expect(result.route).toEqual({ kind: 'webcodecs', codec: 'avc', container: 'mp4' });
    expect(result.chosen).toBe(1);
    expect(result.notice).toBe('none');
    expect(result.supported).toEqual([true, true, true, true]);
  });

  it('disables the sizes that fail and keeps a passing request', async () => {
    const result = await planExportRoute(CANDIDATES, 1, caps({ avc: 1440 }));
    expect(result.supported).toEqual([true, true, true, false]);
    expect(result.chosen).toBe(1);
    expect(result.notice).toBe('none');
  });

  it('suggests the largest H.264 size that passes when the request fails', async () => {
    const result = await planExportRoute(CANDIDATES, 3, caps({ avc: 1440, vp9: 2160 }));
    expect(result.route).toEqual({ kind: 'webcodecs', codec: 'avc', container: 'mp4' });
    expect(result.chosen).toBe(2);
    expect(result.notice).toBe('smaller');
    // VP9 is not probed while some H.264 size works.
    expect(result.supported).toEqual([true, true, true, false]);
  });

  it('picks the largest by pixels, not by list order', async () => {
    const shuffled = [
      CANDIDATES[2],
      CANDIDATES[0],
      CANDIDATES[3],
      CANDIDATES[1],
    ] as LadderCandidate[];
    const result = await planExportRoute(shuffled, 2, caps({ avc: 1440 }));
    expect(result.chosen).toBe(0);
  });

  it('falls back to VP9 in WebM when no H.264 size passes', async () => {
    const mock = caps({ vp9: 2160 });
    const result = await planExportRoute(CANDIDATES, 1, mock);
    expect(result.route).toEqual({ kind: 'webcodecs', codec: 'vp9', container: 'webm' });
    expect(result.chosen).toBe(1);
    expect(result.notice).toBe('webm');
    expect(mock.calls.filter((c) => c.startsWith('avc'))).toHaveLength(4);
    expect(mock.calls.filter((c) => c.startsWith('vp9'))).toHaveLength(4);
  });

  it('uses the largest VP9 size when VP9 also fails at the requested size', async () => {
    const result = await planExportRoute(CANDIDATES, 3, caps({ vp9: 1080 }));
    expect(result.route.kind).toBe('webcodecs');
    expect(result.chosen).toBe(1);
    expect(result.supported).toEqual([true, true, false, false]);
    expect(result.notice).toBe('webm');
  });

  it('records in real time when WebCodecs is missing', async () => {
    const mock = caps({ avc: 2160 }, { webCodecs: false, recorder: 'video/webm;codecs=vp9' });
    const result = await planExportRoute(CANDIDATES, 1, mock);
    expect(result.route).toEqual({
      kind: 'recorder',
      mimeType: 'video/webm;codecs=vp9',
      container: 'webm',
    });
    expect(result.notice).toBe('recorder');
    expect(result.chosen).toBe(1);
    expect(result.supported).toEqual([true, true, true, true]);
    expect(mock.calls).toEqual([]);
  });

  it('records in real time when WebCodecs encodes neither codec', async () => {
    const result = await planExportRoute(CANDIDATES, 0, caps({}));
    expect(result.route).toEqual({
      kind: 'recorder',
      mimeType: 'video/mp4;codecs=avc1',
      container: 'mp4',
    });
    expect(result.notice).toBe('recorder');
  });

  it('reports unavailable with no encoder and no recorder', async () => {
    const result = await planExportRoute(CANDIDATES, 1, caps({}, { recorder: null }));
    expect(result.route).toEqual({ kind: 'none' });
    expect(result.chosen).toBe(-1);
    expect(result.supported).toEqual([false, false, false, false]);
    expect(result.notice).toBe('unavailable');
  });

  it('treats a throwing capability check as unsupported', async () => {
    const result = await planExportRoute(CANDIDATES, 1, caps({}, { throws: true }));
    expect(result.notice).toBe('recorder');
  });

  it('names recorder containers by MIME type', () => {
    expect(recorderContainer('video/mp4;codecs=avc1')).toBe('mp4');
    expect(recorderContainer('VIDEO/MP4')).toBe('mp4');
    expect(recorderContainer('video/webm;codecs=vp9')).toBe('webm');
  });
});

describe('supersampling limit', () => {
  it('allows 2x while the 2x frame fits 4096 x 4096 pixels', () => {
    expect(canSupersample(1280, 720)).toBe(true);
    expect(canSupersample(1920, 1080)).toBe(true);
    expect(canSupersample(1080, 1920)).toBe(true);
    expect(canSupersample(2560, 1440)).toBe(true);
    expect(canSupersample(2048, 2048)).toBe(true);
    expect(canSupersample(2050, 2048)).toBe(false);
    expect(canSupersample(3840, 2160)).toBe(false);
  });
});
