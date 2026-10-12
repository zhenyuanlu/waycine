/**
 * localStorage access that never throws: private windows, blocked site data
 * and full storage all degrade to "nothing stored". Keys are versioned
 * (`waycine:v1:*`).
 */

export const STORAGE_KEYS = {
  autosave: 'waycine:v1:autosave',
  recent: 'waycine:v1:recent',
  prefs: 'waycine:v1:prefs',
} as const;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The stored text for `key`, or null. */
export function readText(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Parsed JSON for `key`, or null when missing or unreadable. */
export function readJson(key: string): unknown {
  const text = readText(key);
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Outcome of a write: `full` when the browser's storage quota is used up. */
export type WriteResult = 'ok' | 'full' | 'unavailable';

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22)
  );
}

/** Writes `value` as JSON under `key`. */
export function writeJson(key: string, value: unknown): WriteResult {
  const target = storage();
  if (target === null) return 'unavailable';
  try {
    target.setItem(key, JSON.stringify(value));
    return 'ok';
  } catch (error) {
    return isQuotaError(error) ? 'full' : 'unavailable';
  }
}
