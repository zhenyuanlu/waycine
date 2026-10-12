import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { zipStored } from './zip';

describe('clips ZIP', () => {
  it('stores the files uncompressed and in order', () => {
    const a = new Uint8Array(4096).map((_, i) => i % 7);
    const b = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
    const zip = zipStored([
      { name: '01-overview.mp4', data: a },
      { name: '02-stop-01-boston.mp4', data: b },
    ]);
    // Store-only: the archive is the payload plus headers, even for compressible data.
    expect(zip.length).toBeGreaterThan(a.length + b.length);
    // Local file header of the first entry: signature, then compression method 0 (stored) at offset 8.
    expect(Array.from(zip.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(zip[8]).toBe(0);
    expect(zip[9]).toBe(0);
    const files = unzipSync(zip);
    expect(Object.keys(files)).toEqual(['01-overview.mp4', '02-stop-01-boston.mp4']);
    expect(files['01-overview.mp4']).toEqual(a);
    expect(files['02-stop-01-boston.mp4']).toEqual(b);
  });
});
