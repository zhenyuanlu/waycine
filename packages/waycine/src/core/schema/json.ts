/** Small JSON-value helpers shared by the schema modules (no DOM, no structuredClone). */

/** A plain JSON-like object (not an array, not null). */
export type PlainObject = Record<string, unknown>;

/** True for non-null, non-array objects whose prototype is Object.prototype or null. */
export function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep copy of a JSON-like value: plain objects and arrays are copied,
 * primitives returned as is. Functions, class instances and cycles are not
 * expected (project data is JSON).
 */
export function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => cloneJson(item)) as T;
  }
  if (isPlainObject(value)) {
    const out: PlainObject = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = cloneJson(item);
    }
    return out as T;
  }
  return value;
}

/** Recursively freezes plain objects and arrays in place and returns the same value. */
export function deepFreeze<T>(value: T): T {
  if (Array.isArray(value) || isPlainObject(value)) {
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
    Object.freeze(value);
  }
  return value;
}
