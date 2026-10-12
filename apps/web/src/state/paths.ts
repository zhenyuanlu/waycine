import type { FieldDef, ProfileId } from 'waycine';

/** Font roles of `fonts.*.` catalog paths. */
export const FONT_ROLES = ['display', 'body'] as const;
/** A font role. */
export type FontRole = (typeof FONT_ROLES)[number];

type Tree = Record<string, unknown>;

function isTree(value: unknown): value is Tree {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The value at dotted `path` (`timing.stop.flyFrac`), or undefined. */
export function getPath(root: unknown, path: string): unknown {
  let node: unknown = root;
  for (const key of path.split('.')) {
    if (!isTree(node)) return undefined;
    node = node[key];
  }
  return node;
}

/**
 * A copy of `root` with `value` at dotted `path`: every object on the path is
 * copied, everything else is shared (structural sharing, so unchanged parts
 * keep their identity). `undefined` removes the key.
 */
export function setPath<T>(root: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const write = (node: unknown, i: number): unknown => {
    const copy: Tree = isTree(node) ? { ...node } : {};
    const key = keys[i] as string;
    if (i === keys.length - 1) {
      if (value === undefined) delete copy[key];
      else copy[key] = value;
    } else {
      copy[key] = write(copy[key], i + 1);
    }
    return copy;
  };
  return write(root, 0) as T;
}

/**
 * Concrete project paths of a catalog entry: `layouts.*.` resolves to the
 * active profile, `fonts.*.` to both roles. Per-stop and per-stat entries
 * have no single path and return an empty list.
 */
export function concretePaths(field: FieldDef, profile: ProfileId): string[] {
  if (field.path.startsWith('stops[].') || field.path.startsWith('stats.items[].')) return [];
  if (field.path.startsWith('layouts.*.')) {
    return [field.path.replace('layouts.*.', `layouts.${profile}.`)];
  }
  if (field.path.startsWith('fonts.*.')) {
    return FONT_ROLES.map((role) => field.path.replace('fonts.*.', `fonts.${role}.`));
  }
  return [field.path];
}

/** Font role of a concrete `fonts.<role>.` path, or null. */
export function fontRoleOf(path: string): FontRole | null {
  const role = path.split('.')[1];
  return path.startsWith('fonts.') && (role === 'display' || role === 'body') ? role : null;
}

/** Deep equality for JSON values. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]));
  }
  const ka = Object.keys(a as Tree);
  const kb = Object.keys(b as Tree);
  return (
    ka.length === kb.length &&
    ka.every((k) => Object.hasOwn(b as Tree, k) && jsonEqual((a as Tree)[k], (b as Tree)[k]))
  );
}
