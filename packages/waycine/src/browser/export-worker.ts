/**
 * The export worker: `exportVideo` / `exportClips` start it as a module worker
 * with `new Worker(new URL('./export-worker.js', import.meta.url), {type:
 * 'module'})`. It renders on an `OffscreenCanvas` with the fonts it received
 * as bytes (registered in `self.fonts`), encodes with Mediabunny and
 * transfers the finished file buffers back. When this realm lacks a 2D
 * `OffscreenCanvas`, `VideoEncoder`, `self.fonts` or an encoder for the job,
 * it answers `unavailable` and the page exports on the main thread instead.
 *
 * The message handler is installed only inside a worker, so importing this
 * module elsewhere does nothing.
 */
import { fpsRational } from '../core/schema/output.js';
import { offscreen2dAvailable } from './backend.js';
import { encodeJob } from './encode.js';
import { ExportFailedError, errorMessage, isAbortError } from './errors.js';
import { loadBundledFonts } from './fonts.js';
import * as mb from './mediabunny.js';
import type { FromWorker, StartMessage, ToWorker, WorkerFontFace } from './worker-protocol.js';

/** The parts of `DedicatedWorkerGlobalScope` this worker uses (the package compiles with the DOM lib). */
interface WorkerScope {
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<ToWorker>) => void): void;
  fonts?: FontFaceSet;
}

function inWorker(): boolean {
  const scope = (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope;
  return typeof scope === 'function' && globalThis instanceof (scope as typeof Object);
}

/** Features this worker needs that the realm lacks. */
function missingFeatures(scope: WorkerScope): string[] {
  const missing: string[] = [];
  if (!offscreen2dAvailable()) {
    missing.push('a 2D OffscreenCanvas');
  }
  if (typeof VideoEncoder === 'undefined') {
    missing.push('VideoEncoder');
  }
  if (!scope.fonts) {
    missing.push('self.fonts');
  }
  return missing;
}

async function registerFaces(scope: WorkerScope, faces: readonly WorkerFontFace[]): Promise<void> {
  const set = scope.fonts;
  if (!set) {
    return;
  }
  const loaded = await Promise.all(
    faces.map((face) => new FontFace(face.family, face.data, face.descriptors).load()),
  );
  for (const face of loaded) {
    set.add(face);
  }
}

async function run(scope: WorkerScope, msg: StartMessage, signal: AbortSignal): Promise<void> {
  const post = (message: FromWorker, transfer: Transferable[] = []): void => {
    scope.postMessage(message, transfer);
  };
  const missing = missingFeatures(scope);
  if (missing.length > 0) {
    post({ type: 'unavailable', reason: `This worker has no ${missing.join(', ')}.` });
    return;
  }
  const { job } = msg;
  try {
    await loadBundledFonts({ data: msg.fonts });
    await registerFaces(scope, msg.faces);
    const fps = fpsRational(job.project.output.fps);
    const ok = await mb.canEncodeVideo(job.codec, {
      width: job.width,
      height: job.height,
      quality: new mb.Quality({ bitrate: job.bitrate }),
      frameRate: fps.num / fps.den,
    });
    if (!ok) {
      post({
        type: 'unavailable',
        reason: `This worker cannot encode ${job.codec} at ${job.width}x${job.height}.`,
      });
      return;
    }
  } catch (err) {
    post({ type: 'unavailable', reason: `Worker setup failed: ${errorMessage(err)}` });
    return;
  }
  try {
    const outcome = await encodeJob(mb, job, {
      signal,
      onStart: (total) => post({ type: 'started', total }),
      onProgress: (progress) =>
        post({ type: 'progress', progress }, progress.thumbnail ? [progress.thumbnail] : []),
    });
    post(
      { type: 'done', outcome },
      outcome.files.map((file) => file.buffer),
    );
  } catch (err) {
    if (signal.aborted || isAbortError(err)) {
      post({ type: 'canceled' });
      return;
    }
    const error = err instanceof Error ? err : new Error(String(err));
    post({
      type: 'error',
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
      frame: err instanceof ExportFailedError ? err.frame : null,
    });
  }
}

/** Handles one export per worker; a second start while one runs is ignored. */
function listen(scope: WorkerScope): void {
  let controller: AbortController | null = null;
  scope.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'cancel') {
      controller?.abort();
      return;
    }
    if (msg.type === 'start' && controller === null) {
      const own = new AbortController();
      controller = own;
      void run(scope, msg, own.signal);
    }
  });
}

if (inWorker()) {
  listen(globalThis as unknown as WorkerScope);
}
