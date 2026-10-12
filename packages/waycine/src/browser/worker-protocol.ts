/**
 * Messages between `exportVideo` / `exportClips` (page) and the export worker.
 */
import type { EncodeOutcome, ExportJob, ExportProgress } from './encode.js';

/** A font face the worker registers before compiling. */
export interface WorkerFontFace {
  /** CSS family name used in the project's fonts. */
  family: string;
  /** Font file bytes (TTF, OTF, WOFF or WOFF2). */
  data: ArrayBuffer;
  /** Optional FontFace descriptors (weight, style, ...). */
  descriptors?: FontFaceDescriptors;
}

/** Page -> worker: start an export. */
export interface StartMessage {
  type: 'start';
  /** The export. */
  job: ExportJob;
  /** Bytes for the bundled alias faces (`WaycineDisplay`, `WaycineBody`). */
  fonts: { display?: ArrayBuffer; body?: ArrayBuffer };
  /** Further faces the project uses. */
  faces: WorkerFontFace[];
}

/** Page -> worker: cancel the running export. */
export interface CancelMessage {
  type: 'cancel';
}

/** Messages the worker receives. */
export type ToWorker = StartMessage | CancelMessage;

/** Messages the worker sends. */
export type FromWorker =
  /** The worker cannot export here (for example no OffscreenCanvas 2D or VideoEncoder); the page falls back. */
  | { type: 'unavailable'; reason: string }
  /** Fonts are loaded and the project compiled; frames follow. */
  | { type: 'started'; total: number }
  | { type: 'progress'; progress: ExportProgress }
  | { type: 'done'; outcome: EncodeOutcome }
  | { type: 'canceled' }
  | { type: 'error'; name: string; message: string; stack?: string; frame: number | null };
