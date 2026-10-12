/**
 * The pieces of the export dialog that hold no dialog state: they read only
 * their arguments and the browser's capabilities. The dialog's state and its
 * fixed frame stay in ExportDialog.tsx.
 */
import type { ExportRoute, LadderResult } from 'waycine/browser';
import { exportCopy } from '../copy/export-en';
import type { ExportFailure } from './exporter';
import type { SizeOption } from './plan';
import type { Part } from './timeline-info';

/** A ladder answer together with the size that was requested when it was asked. */
export type Probed = LadderResult & { requested: number };

/** The file format of a route in plain words (`MP4 (H.264)`, `WebM (VP9)`), or null when there is none. */
export function formatName(route: ExportRoute): string | null {
  switch (route.kind) {
    case 'webcodecs':
      return exportCopy.formats[route.codec];
    case 'recorder':
      return route.container === 'mp4'
        ? exportCopy.formats.recordedMp4
        : exportCopy.formats.recordedWebm;
    default:
      return null;
  }
}

/** "Share / Save to Photos" names what a phone's share sheet offers; elsewhere "Share…". */
export const shareLabel =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
    ? exportCopy.done.shareTouch
    : exportCopy.done.share;

export function failureMessage(failure: ExportFailure): string {
  if (failure.kind === 'failed') {
    return failure.frame === null
      ? exportCopy.error.beforeStart
      : exportCopy.error.atFrame(failure.frame);
  }
  switch (failure.status) {
    case 'no-webcodecs':
      return exportCopy.error.noWebCodecs;
    case 'unsupported':
      return exportCopy.error.unsupported;
    default:
      return exportCopy.error.probeFailed;
  }
}

export function Banner({ probed, options }: { probed: Probed; options: readonly SizeOption[] }) {
  switch (probed.notice) {
    case 'smaller':
      return (
        <p class="x-banner" role="status">
          {exportCopy.banner.smaller(
            options[probed.requested]?.shortSide ?? 0,
            options[probed.chosen]?.shortSide ?? 0,
          )}
        </p>
      );
    case 'webm':
      return (
        <p class="x-banner" role="status">
          {exportCopy.banner.webm}
        </p>
      );
    case 'recorder':
      return (
        <p class="x-banner" role="status">
          {globalThis.isSecureContext === false
            ? exportCopy.banner.recorderInsecure
            : exportCopy.banner.recorder}
        </p>
      );
    case 'unavailable':
      return (
        <p class="x-banner danger" role="alert">
          {exportCopy.banner.unavailable}
        </p>
      );
    default:
      return null;
  }
}

/** A "Technical details" disclosure whose text floats over the band (it never grows the dialog). */
export function Tech({ text, class: className = '' }: { text: string; class?: string }) {
  return (
    <details class={`x-tech${className ? ` ${className}` : ''}`}>
      <summary>{exportCopy.tech.label}</summary>
      <p class="export-codec">{text}</p>
    </details>
  );
}

/** The progress bar in one piece per part: done parts ink, the current part marked. */
export function PartsBar({
  parts,
  frame,
  frozen = false,
  full = false,
}: {
  parts: Part[];
  frame: number;
  frozen?: boolean;
  full?: boolean;
}) {
  return (
    <div class={`x-bar${frozen ? ' frozen' : ''}${full ? ' full' : ''}`} aria-hidden="true">
      {parts.map((part) => {
        const fill = full
          ? 1
          : Math.min(1, Math.max(0, (frame - part.start) / Math.max(1, part.end - part.start)));
        const state = full || frame >= part.end ? 'd' : frame >= part.start ? 'a' : '';
        return (
          <i key={part.start} class={state} style={{ flexGrow: part.end - part.start }}>
            <b style={{ transform: `scaleX(${fill})` }} />
          </i>
        );
      })}
    </div>
  );
}
