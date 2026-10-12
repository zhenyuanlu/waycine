/** Clock and timer used by `RateQueue` (real ones in the app, fakes in tests). */
export interface QueueClock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

function abortError(): DOMException {
  return new DOMException('The request was canceled.', 'AbortError');
}

/** `performance.now()` and `setTimeout`, cancellable. */
export const realClock: QueueClock = {
  now: () => performance.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(abortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    }),
};

/**
 * Runs tasks one at a time with at least `spacingMs` between the starts of
 * consecutive tasks (a usage-policy rate limit: Nominatim 1 request per
 * second, CSV import lookups likewise). A task whose signal aborts while it
 * waits is dropped with an AbortError and does not use a slot.
 */
export class RateQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private lastStart = Number.NEGATIVE_INFINITY;

  constructor(
    readonly spacingMs: number,
    private readonly clock: QueueClock = realClock,
  ) {}

  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const next = this.tail.then(async () => {
      if (signal?.aborted) throw abortError();
      const wait = this.lastStart + this.spacingMs - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait, signal);
      if (signal?.aborted) throw abortError();
      this.lastStart = this.clock.now();
      return task();
    });
    // Later tasks wait for this one to settle, whatever its outcome.
    this.tail = next.catch(() => undefined);
    return next;
  }
}
