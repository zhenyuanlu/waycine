import { type FrameSize, outputSize, type SegmentKind, type WaycineProject } from 'waycine';
import { copy } from '../copy/en';
import { namedAspect } from './plan';

const FALLBACK_SLUG = 'journey';
const MAX_SLUG_LENGTH = 60;
const MAX_CITY_SLUG_LENGTH = 40;

function asciiSlug(name: string, maxLength: number): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, '');
}

/** Lowercase ASCII slug: `2026 Dragon Boat Season` -> `2026-dragon-boat-season`. */
export function slugify(name: string): string {
  const slug = asciiSlug(name, MAX_SLUG_LENGTH);
  return slug === '' ? FALLBACK_SLUG : slug;
}

/** `{stops|STOP|STOPS}`, `{n:02}`, ...: the token syntax of titles. */
const TOKEN = /\{[^{}]*\}/g;

/**
 * The name files are named after: the project name, or the title (without
 * its tokens) while the project still has the default name, so a video of
 * "IBERIA TO PARIS 2026" is not saved as "my-journey".
 */
export function fileBaseName(project: WaycineProject): string {
  const name = project.meta.name.trim();
  if (name === '' || name === copy.app.defaultProjectName) {
    const title = project.text.title.replace(TOKEN, ' ').trim();
    if (asciiSlug(title, MAX_SLUG_LENGTH) !== '') return title;
  }
  return name;
}

/** `16x9-1080p` for a named aspect, else `<width>x<height>`. */
function sizeTag(size: FrameSize): string {
  const ratio = namedAspect(size.width, size.height);
  return ratio === null
    ? `${size.width}x${size.height}`
    : `${ratio[0]}x${ratio[1]}-${Math.min(size.width, size.height)}p`;
}

/** Options for `exportFileName`. */
export interface FileNameOptions {
  /** Export width in px. Default: the project's output size. */
  width?: number;
  /** Export height in px. Default: the project's output size. */
  height?: number;
  /** File extension without the dot. Default `mp4`. */
  ext?: string;
}

/**
 * Download name for an export, `waycine-<slug>-<16x9>-<1080>p.mp4` (or
 * `.webm`, `.zip`); the slug comes from `fileBaseName`. A custom size with a named aspect is named the same way
 * (`9x16-540p` for 540 x 960); any other size uses `<width>x<height>`.
 */
export function exportFileName(project: WaycineProject, opts: FileNameOptions = {}): string {
  const own = outputSize(project.output);
  const size = { width: opts.width ?? own.width, height: opts.height ?? own.height };
  return `waycine-${slugify(fileBaseName(project))}-${sizeTag(size)}.${opts.ext ?? 'mp4'}`;
}

/** Download name of a PNG still: `waycine-<slug>-16x9-1080p-frame-0220.png`. */
export function stillFileName(project: WaycineProject, size: FrameSize, frame: number): string {
  const base = exportFileName(project, { ...size, ext: 'png' }).slice(0, -'.png'.length);
  return `${base}-frame-${String(frame).padStart(4, '0')}.png`;
}

/**
 * Name of a clip inside the clips ZIP, as the CLI names segment files:
 * `01-overview.mp4`, `02-stop-01-boston.mp4`, ..., `09-finale.mp4`.
 */
export function clipFileName(
  clip: { kind: SegmentKind; index: number; city: string },
  position: number,
  count: number,
  ext: string,
): string {
  const pad = Math.max(2, String(count).length);
  const num = String(position + 1).padStart(pad, '0');
  if (clip.kind !== 'stop') {
    return `${num}-${clip.kind}.${ext}`;
  }
  const city = asciiSlug(clip.city, MAX_CITY_SLUG_LENGTH);
  const stop = String(clip.index + 1).padStart(2, '0');
  return `${num}-stop-${stop}${city === '' ? '' : `-${city}`}.${ext}`;
}
