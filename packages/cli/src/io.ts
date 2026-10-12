/**
 * The CLI's view of the outside world: output streams, the working directory
 * and the environment. Commands write output and read the working directory,
 * environment and interrupts only through `Io`, so tests can run them
 * in-process and capture what they print.
 */
export interface Io {
  /** Writes to standard output (results: tables, JSON, file content). */
  stdout(text: string): void;
  /** Writes to standard error (progress, warnings, errors). */
  stderr(text: string): void;
  /** True when standard error is an interactive terminal (progress redraws in place). */
  readonly stderrIsTTY: boolean;
  /** Directory relative paths resolve against. */
  readonly cwd: string;
  /** Environment variables (`WAYCINE_FFMPEG`, `PATH`, `WAYCINE_DEBUG`). */
  readonly env: Readonly<Record<string, string | undefined>>;
  /**
   * Calls `listener` on Ctrl+C (SIGINT) or SIGTERM until the returned function
   * is called. Absent in tests: nothing interrupts an in-process run.
   */
  onInterrupt?(listener: () => void): () => void;
}

/** The real process streams, working directory and environment. */
export function processIo(): Io {
  return {
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
    stderrIsTTY: process.stderr.isTTY === true,
    cwd: process.cwd(),
    env: process.env,
    onInterrupt: (listener) => {
      process.on('SIGINT', listener);
      process.on('SIGTERM', listener);
      return () => {
        process.off('SIGINT', listener);
        process.off('SIGTERM', listener);
      };
    },
  };
}

/** A progress reporter for frame loops. */
export interface Progress {
  /** Reports `done` of `total` frames finished. */
  tick(done: number): void;
  /** Clears the progress line (TTY) before the final summary. */
  done(): void;
}

/** Minimum time between two progress updates, in ms. */
const PROGRESS_INTERVAL_MS = 250;

/**
 * Frame progress on standard error: redrawn in place on a terminal (at most
 * four times a second), one line per 10 % otherwise, nothing when `quiet`.
 */
export function createProgress(io: Io, label: string, total: number, quiet: boolean): Progress {
  if (quiet || total <= 0) {
    return { tick: () => {}, done: () => {} };
  }
  const t0 = performance.now();
  let lastDraw = -Infinity;
  let lastDecile = -1;
  const line = (done: number): string => {
    const elapsed = (performance.now() - t0) / 1000;
    const fps = elapsed > 0 ? done / elapsed : 0;
    const eta = fps > 0 ? (total - done) / fps : 0;
    const pct = Math.floor((100 * done) / total);
    return `${label}: frame ${done}/${total} (${pct}%), ${fps.toFixed(1)} fps, ETA ${eta.toFixed(0)} s`;
  };
  return {
    tick(done: number): void {
      if (io.stderrIsTTY) {
        const now = performance.now();
        if (now - lastDraw >= PROGRESS_INTERVAL_MS || done === total) {
          lastDraw = now;
          io.stderr(`\r${line(done)}\u001b[K`);
        }
        return;
      }
      const decile = Math.floor((10 * done) / total);
      if (decile > lastDecile) {
        lastDecile = decile;
        io.stderr(`${line(done)}\n`);
      }
    },
    done(): void {
      if (io.stderrIsTTY) io.stderr('\r\u001b[K');
    },
  };
}
