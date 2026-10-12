/**
 * Undo/redo over immutable snapshots. `record` is called with the state
 * BEFORE an edit; consecutive edits with the same coalescing key within
 * `coalesceMs` of each other share one undo step (a slider drag or a typed
 * word is one step). Edits without a key never coalesce. At most `limit`
 * undo steps are kept.
 */
export class History<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];
  private lastKey: string | null = null;
  private lastTime = Number.NEGATIVE_INFINITY;

  constructor(
    readonly limit = 100,
    readonly coalesceMs = 500,
  ) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Number of undo steps. */
  get depth(): number {
    return this.undoStack.length;
  }

  /**
   * Records `before`, the state an edit at time `now` (ms) replaces. Returns
   * true when a new undo step was added, false when it joined the previous one.
   */
  record(before: T, now: number, key?: string): boolean {
    this.redoStack = [];
    const joins =
      key !== undefined &&
      key === this.lastKey &&
      now - this.lastTime < this.coalesceMs &&
      this.undoStack.length > 0;
    this.lastKey = key ?? null;
    this.lastTime = now;
    if (joins) return false;
    this.undoStack.push(before);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    return true;
  }

  /** The state to restore for undo, given the current one (which becomes redoable); null when empty. */
  undo(current: T): T | null {
    const previous = this.undoStack.pop();
    if (previous === undefined) return null;
    this.redoStack.push(current);
    this.breakCoalescing();
    return previous;
  }

  /** The state to restore for redo, given the current one; null when empty. */
  redo(current: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(current);
    this.breakCoalescing();
    return next;
  }

  /** Forgets everything (a different project was loaded). */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.breakCoalescing();
  }

  /** The next edit starts a new step even with the same key. */
  breakCoalescing(): void {
    this.lastKey = null;
    this.lastTime = Number.NEGATIVE_INFINITY;
  }
}
