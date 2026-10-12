/**
 * Errors shared by the browser exporters (main thread and worker).
 */

/**
 * Thrown by `exportVideo`, `exportClips` and `recordVideo` when rendering or
 * encoding fails part-way. `frame` is the timeline frame (0-based) that was
 * being written, or null when the failure came before the first frame.
 */
export class ExportFailedError extends Error {
  /** Timeline frame (0-based) being written when the export failed, or null. */
  readonly frame: number | null;

  constructor(message: string, frame: number | null, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ExportFailedError';
    this.frame = frame;
  }
}

/** The `AbortError` every exporter rejects with when its signal fires. */
export function abortError(): DOMException {
  return new DOMException('The export was canceled.', 'AbortError');
}

/** True for the `AbortError` of a canceled export. */
export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException || err instanceof Error) &&
    (err as { name?: unknown }).name === 'AbortError'
  );
}

/** Throws the export `AbortError` when `signal` has fired. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

/** The message of any thrown value. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
