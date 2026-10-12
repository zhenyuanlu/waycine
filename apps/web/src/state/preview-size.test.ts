import { describe, expect, it } from 'vitest';
import { fitPreview } from './preview-size';

describe('fitPreview', () => {
  it('draws as many pixels as the box shows, in the output aspect', () => {
    expect(fitPreview({ width: 1920, height: 1080 }, 842, 1)).toEqual({ width: 842, height: 474 });
    expect(fitPreview({ width: 1920, height: 1080 }, 1207, 1)).toEqual({
      width: 1207,
      height: 679,
    });
    expect(fitPreview({ width: 1080, height: 1920 }, 300, 2)).toEqual({ width: 600, height: 1067 });
  });

  it('may exceed the video up to 2560 px while sharp, and never collapses to zero', () => {
    // A 3440 x 1440 ultrawide box (2142 px) is drawn at its own size, not upscaled from 1080p.
    expect(fitPreview({ width: 1920, height: 1080 }, 2142, 1)).toEqual({
      width: 2142,
      height: 1205,
    });
    expect(fitPreview({ width: 1920, height: 1080 }, 3041, 1)).toEqual({
      width: 2560,
      height: 1440,
    });
    expect(fitPreview({ width: 1280, height: 720 }, 5000, 1)).toEqual({
      width: 2560,
      height: 1440,
    });
    expect(fitPreview({ width: 1920, height: 1080 }, 0, 1)).toEqual({ width: 16, height: 9 });
  });

  it('stays within the video and 1920 x 1080 when not sharp', () => {
    expect(fitPreview({ width: 1920, height: 1080 }, 2142, 1, false)).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(fitPreview({ width: 3840, height: 2160 }, 5000, 2, false)).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(fitPreview({ width: 1280, height: 720 }, 5000, 1, false)).toEqual({
      width: 1280,
      height: 720,
    });
  });
});
