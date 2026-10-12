import { beforeEach, describe, expect, it } from 'vitest';
import { previewScale, previewSharp } from '../state/preview-scale';
import {
  autoQuality,
  recordFrameTime,
  resetFrameTimes,
  restoreFullResolution,
  SLOW_FRAME_COUNT,
} from './adaptive';

describe('adaptive preview', () => {
  beforeEach(() => {
    previewScale.value = 1;
    previewSharp.value = true;
    autoQuality.value = true;
    resetFrameTimes();
  });

  it('steps down after ten slow frames, not before: the video size first, then half', () => {
    for (let i = 1; i < SLOW_FRAME_COUNT; i++) expect(recordFrameTime(60)).toBe(false);
    expect(previewSharp.value).toBe(true);
    expect(recordFrameTime(60)).toBe(true);
    expect(previewSharp.value).toBe(false);
    expect(previewScale.value).toBe(1);
    for (let i = 1; i < SLOW_FRAME_COUNT; i++) expect(recordFrameTime(60)).toBe(false);
    expect(recordFrameTime(60)).toBe(true);
    expect(previewScale.value).toBe(0.5);
  });

  it('keeps full resolution while frames stay under 40 ms on average and rarely stutter', () => {
    // One slow frame in five or ten (two in the window at most) is not a stutter pattern.
    for (let i = 0; i < 50; i++) recordFrameTime(i % 5 === 0 ? 45 : 25);
    for (let i = 0; i < 50; i++) recordFrameTime(i % 10 === 0 ? 70 : 20);
    expect(previewSharp.value).toBe(true);
    expect(previewScale.value).toBe(1);
  });

  it('steps down when three of the last ten frames stutter (over 50 ms)', () => {
    for (let i = 0; i < 7; i++) recordFrameTime(16);
    recordFrameTime(70);
    recordFrameTime(16);
    expect(recordFrameTime(16)).toBe(false);
    expect(recordFrameTime(66)).toBe(false);
    expect(recordFrameTime(83)).toBe(true);
    expect(previewSharp.value).toBe(false);
  });

  it('stays at full resolution once the viewer asks for it', () => {
    for (let i = 0; i < 2 * SLOW_FRAME_COUNT; i++) recordFrameTime(80);
    expect(previewScale.value).toBe(0.5);
    restoreFullResolution();
    expect(previewScale.value).toBe(1);
    expect(previewSharp.value).toBe(true);
    for (let i = 0; i < 3 * SLOW_FRAME_COUNT; i++) recordFrameTime(80);
    expect(previewScale.value).toBe(1);
  });
});
