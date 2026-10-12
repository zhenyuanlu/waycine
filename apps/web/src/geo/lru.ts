/** Minimal key-value storage (localStorage, or a stand-in in tests). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * A least-recently-used cache: `get` and `set` make an entry the newest, and
 * adding beyond `capacity` drops the oldest. With a storage and a key it is
 * also persistent: it loads once at construction and saves on `set` and
 * `clear` (a `get` reorders the memory copy only, so a cache hit never
 * rewrites the whole cache; the new order is saved with the next `set`).
 * Failures such as a full storage are ignored; the memory copy keeps working.
 */
export class LruCache<V> {
  readonly capacity: number;
  private readonly entries = new Map<string, V>();
  private readonly storage: KeyValueStorage | null;
  private readonly storageKey: string;

  constructor(capacity: number, storage: KeyValueStorage | null = null, storageKey = '') {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.storage = storage;
    this.storageKey = storageKey;
    this.load();
  }

  /** Number of entries. */
  get size(): number {
    return this.entries.size;
  }

  /** Keys from oldest to newest. */
  keys(): string[] {
    return [...this.entries.keys()];
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** The value for `key` (and marks it as the newest, in memory), or undefined. */
  get(key: string): V | undefined {
    if (!this.entries.has(key)) return undefined;
    const value = this.entries.get(key) as V;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  /** Stores `value` as the newest entry, dropping the oldest ones above capacity. */
  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
    this.save();
  }

  clear(): void {
    this.entries.clear();
    this.save();
  }

  private load(): void {
    if (this.storage === null) return;
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (raw === null) return;
      const list = JSON.parse(raw) as unknown;
      if (!Array.isArray(list)) return;
      for (const item of list) {
        if (Array.isArray(item) && item.length === 2 && typeof item[0] === 'string') {
          this.entries.set(item[0], item[1] as V);
        }
      }
      while (this.entries.size > this.capacity) {
        this.entries.delete(this.entries.keys().next().value as string);
      }
    } catch {
      // A corrupt or unreadable cache starts empty.
      this.entries.clear();
    }
  }

  private save(): void {
    if (this.storage === null) return;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify([...this.entries]));
    } catch {
      // Storage full or blocked: keep the memory copy only.
    }
  }
}
