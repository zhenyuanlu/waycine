import type { Backend, Ctx2D } from './ctx.js';
import { drawScene } from './draw/index.js';
import { sceneAt } from './scene.js';
import type { Compiled } from './scene-types.js';

/** Renders timeline frame `frame` of `c` onto `ctx`: `drawScene(ctx, c, sceneAt(c, frame), backend)`. */
export function renderFrame(ctx: Ctx2D, c: Compiled, frame: number, backend: Backend): void {
  drawScene(ctx, c, sceneAt(c, frame), backend);
}
