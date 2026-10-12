import { signal } from '@preact/signals';

/**
 * Resolution factor of the preview: 1, or 0.5 while the adaptive preview draws
 * at half resolution because frames took too long while playing
 * (`player/adaptive.ts`). Exports never use it.
 */
export const previewScale = signal(1);

/**
 * True while the preview may draw more pixels than the video has (up to its
 * box on a large or high-density screen). The adaptive preview's first step
 * back when frames are slow is to clear it: the video's own size, as sharp as
 * the export; half resolution comes only after that.
 */
export const previewSharp = signal(true);
