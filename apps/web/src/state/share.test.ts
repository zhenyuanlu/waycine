import { describe, expect, it } from 'vitest';
import { validateProject } from 'waycine';
import { compactProject } from './compact';
import { PRESETS, presetById } from './presets';
import {
  decodeShare,
  encodeShare,
  fromBase64Url,
  SHARE_MAX_CHARS,
  SHARE_MAX_ENCODED,
  ShareTooLargeError,
  shareFromHash,
  shareUrl,
  toBase64Url,
} from './share';

describe('share links', () => {
  it('base64url round-trips every byte value without padding or unsafe characters', () => {
    const bytes = Uint8Array.from({ length: 256 * 3 + 1 }, (_, i) => (i * 37) % 256);
    const text = toBase64Url(bytes);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(text)).toEqual(bytes);
    expect(() => fromBase64Url('abc$')).toThrow();
  });

  it('round-trips the presets exactly (deflate-raw, compact JSON)', async () => {
    for (const { source } of PRESETS) {
      const project = validateProject(source).project;
      const encoded = await encodeShare(project);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
      const decoded = await decodeShare(encoded);
      expect(decoded).toEqual(compactProject(project));
      // The link leaves out only the schema address.
      const { $schema: _schema, ...rest } = project;
      expect(validateProject(decoded).project).toEqual(rest);
      // Every demo fits comfortably in a link.
      expect(shareUrl('https://example.org/waycine/', encoded).length).toBeLessThan(
        SHARE_MAX_CHARS,
      );
    }
  });

  it('keeps edits, unicode and whitespace', async () => {
    const { $schema: _schema, ...project } = validateProject(
      presetById('race-season').source,
    ).project;
    project.text.title = 'Caf\u00e9  CR\u00c8ME / 2026';
    project.theme.route = '#123456';
    project.stops[0] = {
      ...(project.stops[0] as (typeof project.stops)[number]),
      city: 'S\u00e3o Paulo',
    };
    const back = validateProject(await decodeShare(await encodeShare(project))).project;
    expect(back).toEqual(project);
  });

  it('reads the hash and builds links without the old hash', () => {
    expect(shareFromHash('#p=abc')).toBe('abc');
    expect(shareFromHash('#other')).toBeNull();
    expect(shareUrl('http://127.0.0.1:25180/?x=1#p=old', 'new')).toBe(
      'http://127.0.0.1:25180/?x=1#p=new',
    );
  });

  it('rejects damaged links', async () => {
    await expect(decodeShare('AAAA')).rejects.toBeDefined();
  });

  it('rejects a short link that inflates to more than a project (5 MB of spaces)', async () => {
    const spaces = new TextEncoder().encode(' '.repeat(5 * 1024 * 1024));
    const body = new Blob([spaces]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const packed = new Uint8Array(await new Response(body).arrayBuffer());
    const encoded = toBase64Url(packed);
    expect(encoded.length).toBeLessThan(SHARE_MAX_ENCODED);
    await expect(decodeShare(encoded)).rejects.toBeInstanceOf(ShareTooLargeError);
  });

  it('rejects links longer than 65,536 characters before decoding them', async () => {
    await expect(decodeShare('A'.repeat(80_000))).rejects.toThrow(
      'The link holds more data than a Waycine project.',
    );
  });
});
