import type { Backend, Ctx2D } from '../ctx.js';
import type { Compiled, SceneState } from '../scene-types.js';
import { drawCard, drawCardBackdrop } from './card.js';
import { drawGlow } from './glow.js';
import { drawGraticule } from './graticule.js';
import { drawHud } from './hud.js';
import { drawPins } from './pins.js';
import { drawPost } from './post.js';
import { drawRouteCore, routePath } from './route.js';
import { drawStats } from './stats.js';
import { drawDescription, drawTitle } from './title.js';

/**
 * Draws one frame onto `ctx`, which must be `c.width` x `c.height` px with an
 * identity transform. Order (as the original): background, graticule and
 * labels, HUD corners, glow, route core, the card's backdrop (new), pins
 * (rings, halo, core) and pin labels, card, title, stats, description, post
 * (blur and flash). Scratch surfaces come
 * from `backend`; the context's state is restored before returning.
 */
export function drawScene(ctx: Ctx2D, c: Compiled, s: SceneState, backend: Backend): void {
  // A full clear first (the transform is the identity by contract): the frame
  // never depends on what the surface held, and @napi-rs/canvas drops the
  // drawing it recorded for the previous frame. It does so only for a full
  // clearRect with no saved state; an opaque fillRect keeps the recording, and
  // a long render on one canvas grew by about 1 MB per 1080p frame.
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  // The original laid text out unkerned (Pillow without raqm, and Bahnschrift has no legacy kern table).
  ctx.fontKerning = 'none';
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  ctx.fillStyle = c.project.theme.background;
  ctx.fillRect(0, 0, c.width, c.height);

  drawGraticule(ctx, c, s.cam);
  drawHud(ctx, c);

  if (c.project.route.show && s.overlayAlpha > 0) {
    const path = routePath(c, s.cam, s.routeUpto);
    drawGlow(ctx, c, path, s.overlayAlpha, backend);
    drawRouteCore(ctx, c, path, s.overlayAlpha);
  }

  drawCardBackdrop(ctx, c, s.card);
  drawPins(ctx, c, s);
  drawCard(ctx, c, s.card);
  drawTitle(ctx, c, s.title, s.overlayAlpha);
  drawStats(ctx, c, s.stats);
  drawDescription(ctx, c, s.description, s.overlayAlpha);
  drawPost(ctx, c, s.post, backend);
  ctx.restore();
}
