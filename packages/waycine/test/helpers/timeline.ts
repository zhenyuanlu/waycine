import { sceneAt } from '../../src/core/scene.js';
import type { Compiled, SceneState } from '../../src/core/scene-types.js';

/** The scene state of every frame of the compiled timeline, in order. */
export function allStates(c: Compiled): SceneState[] {
  return Array.from({ length: c.timeline.totalFrames }, (_, f) => sceneAt(c, f));
}

/** True when every number in `value`, at any depth, is finite. */
export function finiteDeep(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteDeep);
  if (value !== null && typeof value === 'object') return Object.values(value).every(finiteDeep);
  return true;
}

/** The timeline segment of `kind` with `index`; throws when there is none. */
export function segment(c: Compiled, kind: string, index = 0) {
  const seg = c.timeline.segments.find((s) => s.kind === kind && s.index === index);
  if (seg === undefined) throw new Error(`no ${kind}[${index}]`);
  return seg;
}
