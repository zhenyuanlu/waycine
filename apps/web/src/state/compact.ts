import { DEFAULTS, type WaycineProject } from 'waycine';
import { jsonEqual } from './paths';

type Tree = Record<string, unknown>;

function isTree(value: unknown): value is Tree {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function diff(value: unknown, def: unknown): unknown {
  if (isTree(value) && isTree(def)) {
    const out: Tree = {};
    for (const [key, child] of Object.entries(value)) {
      if (!Object.hasOwn(def, key)) {
        out[key] = child;
        continue;
      }
      const d = diff(child, def[key]);
      if (d !== undefined) out[key] = d;
    }
    return Object.keys(out).length === 0 ? undefined : out;
  }
  return jsonEqual(value, def) ? undefined : value;
}

/**
 * The project as a small file: only what differs from the engine defaults,
 * plus `version`, `meta` and `stops` (always kept, even when empty or equal).
 * `validateProject` deep-merges it back onto the defaults, so
 * `validateProject(compactProject(p)).project` equals `p`.
 */
export function compactProject(project: WaycineProject): Tree {
  const rest = (diff(project, DEFAULTS) ?? {}) as Tree;
  const { version: _version, meta: _meta, stops: _stops, $schema: _schema, ...others } = rest;
  return {
    version: project.version,
    meta: project.meta,
    stops: project.stops,
    ...others,
  };
}
