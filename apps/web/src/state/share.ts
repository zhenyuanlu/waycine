import type { WaycineProject } from 'waycine';
import { compactProject } from './compact';

/**
 * Share links: `#p=` + base64url(deflate-raw(JSON of the compact project)).
 * The project lives in the URL hash, which browsers never send to a server.
 */

/** Hash prefix of a share link. */
export const SHARE_PREFIX = '#p=';
/** Above this many characters a link is unwieldy; the app suggests a file instead. */
export const SHARE_MAX_CHARS = 8000;
/** Longest encoded project a link may carry (far above any real project). */
export const SHARE_MAX_ENCODED = 65_536;
/** Most bytes a link may inflate to (a 99-stop project with every setting is far smaller). */
export const SHARE_MAX_JSON_BYTES = 2 * 1024 * 1024;

/** A share link that is too long, or inflates to more than a project could hold. */
export class ShareTooLargeError extends Error {
  constructor() {
    super('The link holds more data than a Waycine project.');
    this.name = 'ShareTooLargeError';
  }
}

async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const body = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

/** RFC 4648 base64url without padding. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Bytes of a base64url (or base64) string; throws on invalid characters. */
export function fromBase64Url(text: string): Uint8Array {
  const clean = text.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    throw new Error('The link contains characters that are not base64url.');
  }
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** The encoded project (the part after `#p=`). */
export async function encodeShare(project: WaycineProject): Promise<string> {
  const json = JSON.stringify(compactProject(project));
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  return toBase64Url(packed);
}

/**
 * Inflates `bytes`, reading at most `limit` bytes of output: a tiny link can
 * inflate to gigabytes, so the stream is cancelled as soon as it passes the
 * limit instead of being read to the end.
 */
async function inflateLimited(bytes: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new ShareTooLargeError();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

/**
 * The project JSON (not yet validated) from the part after `#p=`; throws
 * when it is damaged, longer than SHARE_MAX_ENCODED characters or inflates
 * to more than SHARE_MAX_JSON_BYTES.
 */
export async function decodeShare(encoded: string): Promise<unknown> {
  if (encoded.length > SHARE_MAX_ENCODED) throw new ShareTooLargeError();
  const bytes = fromBase64Url(encoded);
  const json = await inflateLimited(bytes, SHARE_MAX_JSON_BYTES);
  return JSON.parse(new TextDecoder().decode(json)) as unknown;
}

/** The encoded project in a URL hash, or null when the hash is not a share link. */
export function shareFromHash(hash: string): string | null {
  return hash.startsWith(SHARE_PREFIX) ? hash.slice(SHARE_PREFIX.length) : null;
}

/** A full share link for `encoded`, based on the current page address without its hash. */
export function shareUrl(pageUrl: string, encoded: string): string {
  const base = pageUrl.split('#')[0] ?? pageUrl;
  return `${base}${SHARE_PREFIX}${encoded}`;
}
