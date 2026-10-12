import { computed, effect, signal } from '@preact/signals';
import {
  type EncodeProbeStatus,
  EncoderUnavailableError,
  ExportFailedError,
  type ExportProgress,
  type ExportRoute,
  exportClips,
  exportVideo,
  isAbortError,
  recordVideo,
  renderStill,
  type WaycineProject,
} from 'waycine/browser';
import { errorDetail } from '../app/errors';
import { pause } from '../player/player';
import { project as currentProject } from '../state/project';
import { clipFileName, exportFileName, stillFileName } from './filename';
import { holdWakeLock } from './wake-lock';
import { zipBlobs } from './zip';

/** One video, or one file per timeline segment in a ZIP. */
export type ExportKind = 'video' | 'clips';

/** Everything the dialog decided. */
export interface ExportRequest {
  /** The project to export. */
  project: WaycineProject;
  /** Frame width in px. */
  width: number;
  /** Frame height in px. */
  height: number;
  /** Short side in px (the "1080" of 1080p). */
  shortSide: number;
  /** Video bitrate in bits per second. */
  bitrate: number;
  /** How to encode (from the fallback ladder); never `none`. */
  route: Exclude<ExportRoute, { kind: 'none' }>;
  /** One video or clips. */
  kind: ExportKind;
  /** Supersampling (already checked against `canSupersample`). */
  supersample: 1 | 2;
  /** Timeline frames, for the progress bar before the first report. */
  frames: number;
}

/** Why an export failed. */
export type ExportFailure =
  | { kind: 'unavailable'; status: EncodeProbeStatus }
  | { kind: 'failed'; frame: number | null };

export type ExportState =
  | { phase: 'idle' }
  | {
      phase: 'running';
      request: ExportRequest;
      frame: number;
      total: number;
      etaSec: number | null;
      file: number;
      files: number;
    }
  | {
      phase: 'done';
      request: ExportRequest;
      blob: Blob;
      url: string;
      fileName: string;
      bytes: number;
      codec: string;
      width: number;
      height: number;
      frames: number;
      thread: 'worker' | 'main';
      elapsedMs: number;
    }
  | { phase: 'canceled'; request: ExportRequest }
  | { phase: 'error'; request: ExportRequest; failure: ExportFailure; detail: string };

export const exportState = signal<ExportState>({ phase: 'idle' });

/** True while an export renders; playback is disabled meanwhile so it does not compete with the encoder. */
export const exporting = computed<boolean>(() => exportState.value.phase === 'running');

/** Width of the live thumbnail in CSS px (drawn at twice that for sharp screens). */
export const THUMBNAIL_WIDTH = 320;

let controller: AbortController | null = null;
let lastUrl: string | null = null;
let thumbnailCanvas: HTMLCanvasElement | null = null;

/** The canvas the live thumbnail is drawn into while an export runs (null to stop drawing). */
export function setThumbnailCanvas(canvas: HTMLCanvasElement | null): void {
  thumbnailCanvas = canvas;
}

function drawThumbnail(bitmap: ImageBitmap): void {
  const canvas = thumbnailCanvas;
  try {
    if (canvas) {
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
      }
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    }
  } finally {
    bitmap.close();
  }
}

function revokeLast(): void {
  if (lastUrl) {
    URL.revokeObjectURL(lastUrl);
    lastUrl = null;
  }
}

/** Back to the settings: forgets a finished, canceled or failed export and frees its file. */
export function resetExport(): void {
  if (exportState.peek().phase === 'running') {
    return;
  }
  revokeLast();
  exportState.value = { phase: 'idle' };
}

// A finished export describes the project it was made from: once the project
// changes, its summary and link go away.
effect(() => {
  void currentProject.value;
  if (exportState.peek().phase === 'done') {
    resetExport();
  }
});

/** Starts the browser download of `url` as `fileName`. */
function download(url: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
}

function failureOf(err: unknown): ExportFailure {
  if (err instanceof EncoderUnavailableError) {
    return { kind: 'unavailable', status: err.probe.status };
  }
  if (err instanceof ExportFailedError) {
    return { kind: 'failed', frame: err.frame };
  }
  return { kind: 'failed', frame: null };
}

interface Finished {
  blob: Blob;
  fileName: string;
  codec: string;
  frames: number;
  width: number;
  height: number;
  thread: 'worker' | 'main';
  elapsedMs: number;
}

async function run(request: ExportRequest, signal: AbortSignal): Promise<Finished> {
  const { project, route } = request;
  const onProgress = (p: ExportProgress): void => {
    if (p.thumbnail) {
      drawThumbnail(p.thumbnail);
    }
    if (signal.aborted) {
      return;
    }
    exportState.value = {
      phase: 'running',
      request,
      frame: p.frame,
      total: p.total,
      etaSec: Number.isFinite(p.etaSec) ? p.etaSec : null,
      file: p.file,
      files: p.files,
    };
  };
  const common = {
    width: request.width,
    height: request.height,
    bitrate: request.bitrate,
    signal,
    thumbnailWidth: THUMBNAIL_WIDTH * 2,
    onProgress,
  };
  const size = { width: request.width, height: request.height };
  if (route.kind === 'recorder') {
    const result = await recordVideo(project, { ...common, mimeType: route.mimeType });
    return {
      ...result,
      fileName: exportFileName(project, { ...size, ext: route.container }),
    };
  }
  const opts = { ...common, codec: route.codec, supersample: request.supersample };
  if (request.kind === 'clips') {
    const result = await exportClips(project, opts);
    const blob = await zipBlobs(
      result.clips.map((clip, i) => ({
        name: clipFileName(clip, i, result.clips.length, route.container),
        blob: clip.blob,
      })),
    );
    return { ...result, blob, fileName: exportFileName(project, { ...size, ext: 'zip' }) };
  }
  const result = await exportVideo(project, opts);
  return { ...result, fileName: exportFileName(project, { ...size, ext: route.container }) };
}

/** Renders and encodes `request`, then downloads the file. One export at a time. */
export async function startExport(request: ExportRequest): Promise<void> {
  if (controller) {
    return;
  }
  pause();
  revokeLast();
  const own = new AbortController();
  controller = own;
  const release = holdWakeLock();
  exportState.value = {
    phase: 'running',
    request,
    frame: 0,
    total: request.frames,
    etaSec: null,
    file: 0,
    files: 1,
  };
  try {
    const done = await run(request, own.signal);
    const url = URL.createObjectURL(done.blob);
    lastUrl = url;
    exportState.value = {
      phase: 'done',
      request,
      blob: done.blob,
      url,
      fileName: done.fileName,
      bytes: done.blob.size,
      codec: done.codec,
      // The size the export actually used, not a recomputation from the project.
      width: done.width,
      height: done.height,
      frames: done.frames,
      thread: done.thread,
      elapsedMs: done.elapsedMs,
    };
    download(url, done.fileName);
  } catch (err) {
    if (own.signal.aborted || isAbortError(err)) {
      exportState.value = { phase: 'canceled', request };
    } else {
      console.error('Waycine export failed:', err);
      exportState.value = {
        phase: 'error',
        request,
        failure: failureOf(err),
        detail: errorDetail(err),
      };
    }
  } finally {
    release();
    controller = null;
  }
}

/** Cancels the running export (its encoder is released; the dialog shows its Stopped state). */
export function cancelExport(): void {
  controller?.abort();
}

export type StillState =
  | { phase: 'idle' }
  | { phase: 'working'; frame: number }
  | { phase: 'done'; frame: number; fileName: string }
  | { phase: 'error'; frame: number; detail: string };

/** State of the "Save current frame as PNG" action. */
export const stillState = signal<StillState>({ phase: 'idle' });

/** Renders timeline frame `frame` at the chosen size and downloads it as a PNG. */
export async function saveStill(
  project: WaycineProject,
  frame: number,
  size: { width: number; height: number },
  supersample: 1 | 2,
): Promise<void> {
  if (stillState.peek().phase === 'working') {
    return;
  }
  stillState.value = { phase: 'working', frame };
  try {
    const blob = await renderStill(project, frame, { ...size, supersample });
    const fileName = stillFileName(project, size, frame);
    const url = URL.createObjectURL(blob);
    download(url, fileName);
    // The click above has started the download; free the URL once it had time to read it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    stillState.value = { phase: 'done', frame, fileName };
  } catch (err) {
    console.error('Waycine still failed:', err);
    stillState.value = { phase: 'error', frame, detail: errorDetail(err) };
  }
}

/** Clears the still status line. */
export function resetStill(): void {
  if (stillState.peek().phase !== 'working') {
    stillState.value = { phase: 'idle' };
  }
}
