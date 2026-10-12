import { describe, expect, it } from 'vitest';
import { createDefaultProject, fpsRational, type OutputSettings } from 'waycine';
import {
  aspectLabel,
  bitrateFor,
  durationSec,
  estimateBytes,
  fixedBitrateMbps,
  formatEstimate,
  formatFps,
  index720,
  percentStep,
  profileOf,
  projectSizeIndex,
  realtimeFactor,
  sizeOptions,
} from './plan';

const NTSC = fpsRational(29.97);

function output(patch: Partial<OutputSettings> = {}): OutputSettings {
  return { ...createDefaultProject().output, ...patch };
}

describe('export size estimate', () => {
  it('is bitrate x duration / 8: the season at 1080p high is about 23 MB', () => {
    const out = output({ quality: 'high' });
    const bitrate = bitrateFor(out, { width: 1920, height: 1080 }, NTSC, 'high');
    // 0.20 bits per pixel x 1920 x 1080 x 29.97 fps.
    expect(bitrate).toBe(Math.round(0.2 * 1920 * 1080 * (30000 / 1001)));
    expect(durationSec(440, NTSC)).toBeCloseTo(14.681333, 6);
    const bytes = estimateBytes(bitrate, 440, NTSC);
    expect(bytes).toBe(Math.round((bitrate * 440 * 1001) / 30000 / 8));
    expect(formatEstimate(bytes)).toBe('23 MB');
  });

  it('scales with quality and size', () => {
    const out = output();
    const size = { width: 1920, height: 1080 };
    const standard = bitrateFor(out, size, NTSC, 'standard');
    const max = bitrateFor(out, size, NTSC, 'max');
    expect(standard).toBe(Math.round(0.13 * 1920 * 1080 * (30000 / 1001)));
    expect(max).toBe(Math.round(0.32 * 1920 * 1080 * (30000 / 1001)));
    expect(formatEstimate(estimateBytes(standard, 440, NTSC))).toBe('15 MB');
    expect(formatEstimate(estimateBytes(max, 440, NTSC))).toBe('36 MB');
    const small = bitrateFor(out, { width: 1280, height: 720 }, NTSC, 'high');
    expect(formatEstimate(estimateBytes(small, 440, NTSC))).toBe('10 MB');
  });

  it('uses the project bitrate when it is set', () => {
    const out = output({ bitrateMbps: 8 });
    expect(fixedBitrateMbps(out)).toBe(8);
    expect(fixedBitrateMbps(output())).toBeNull();
    expect(bitrateFor(out, { width: 3840, height: 2160 }, NTSC, 'max')).toBe(8_000_000);
    // 8 Mbps for 14.68 s.
    expect(formatEstimate(estimateBytes(8_000_000, 440, NTSC))).toBe('15 MB');
  });

  it('formats small, medium and huge estimates', () => {
    expect(formatEstimate(0)).toBe('1 KB');
    expect(formatEstimate(850_400)).toBe('850 KB');
    expect(formatEstimate(4_240_000)).toBe('4.2 MB');
    expect(formatEstimate(9_960_000)).toBe('10.0 MB');
    expect(formatEstimate(22_800_000)).toBe('23 MB');
    expect(formatEstimate(1_420_000_000)).toBe('1.4 GB');
  });
});

describe('export size choices', () => {
  it('offers 720p to 2160p at a named aspect', () => {
    const options = sizeOptions(output());
    expect(options).toEqual([
      { width: 1280, height: 720, shortSide: 720 },
      { width: 1920, height: 1080, shortSide: 1080 },
      { width: 2560, height: 1440, shortSide: 1440 },
      { width: 3840, height: 2160, shortSide: 2160 },
    ]);
    expect(projectSizeIndex(options, output())).toBe(1);
    expect(index720(options)).toBe(0);
  });

  it('keeps portrait sizes portrait', () => {
    const options = sizeOptions(output({ aspect: '9:16', shortSide: 720 }));
    expect(options.map((o) => `${o.width}x${o.height}`)).toEqual([
      '720x1280',
      '1080x1920',
      '1440x2560',
      '2160x3840',
    ]);
    expect(projectSizeIndex(options, output({ aspect: '9:16', shortSide: 720 }))).toBe(0);
  });

  it('scales a custom size and offers the custom size itself', () => {
    const custom = output({ aspect: 'custom', width: 540, height: 960 });
    const options = sizeOptions(custom);
    expect(options.map((o) => `${o.width}x${o.height}`)).toEqual([
      '540x960',
      '720x1280',
      '1080x1920',
      '1440x2560',
      '2160x3840',
    ]);
    expect(projectSizeIndex(options, custom)).toBe(0);
  });

  it('leaves out scaled sizes past 4096 px', () => {
    const wide = output({ aspect: 'custom', width: 2000, height: 800 });
    const options = sizeOptions(wide);
    expect(options.map((o) => `${o.width}x${o.height}`)).toEqual([
      '1800x720',
      '2000x800',
      '2700x1080',
      '3600x1440',
    ]);
    expect(options.every((o) => Math.max(o.width, o.height) <= 4096)).toBe(true);
  });
});

describe('export summary pieces', () => {
  it('names aspects and profiles', () => {
    expect(aspectLabel(1920, 1080)).toBe('16:9');
    expect(aspectLabel(1080, 1920)).toBe('9:16');
    expect(aspectLabel(720, 720)).toBe('1:1');
    expect(aspectLabel(1080, 1350)).toBe('4:5');
    expect(aspectLabel(1000, 600)).toBeNull();
    expect(profileOf(output(), { width: 1920, height: 1080 })).toBe('landscape');
    expect(profileOf(output(), { width: 1080, height: 1920 })).toBe('portrait');
    expect(profileOf(output(), { width: 1080, height: 1080 })).toBe('square');
  });

  it('formats frame rates as people write them', () => {
    expect(formatFps(29.97)).toBe('29.97');
    expect(formatFps(30)).toBe('30');
    expect(formatFps(23.976)).toBe('23.976');
    expect(formatFps(59.94)).toBe('59.94');
  });

  it('computes the real-time factor and the 10% announcement steps', () => {
    // 14.68 s of video in 4.89 s.
    expect(realtimeFactor(440, NTSC, 4893.8)).toBeCloseTo(3.0, 2);
    expect(realtimeFactor(440, NTSC, 0)).toBe(0);
    expect(percentStep(0, 440)).toBe(0);
    expect(percentStep(43, 440)).toBe(0);
    expect(percentStep(44, 440)).toBe(10);
    expect(percentStep(312, 440)).toBe(70);
    expect(percentStep(440, 440)).toBe(100);
    expect(percentStep(5, 0)).toBe(0);
  });
});
