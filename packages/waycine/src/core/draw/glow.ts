import type { Backend, Ctx2D, Surface } from '../ctx.js';
import type { Compiled } from '../scene-types.js';
import type { Vec2 } from '../schema/types.js';
import { gaussianBlur } from './blur.js';
import { tracePath } from './route.js';
import { cached, hexRgb, UPSCALE_SMOOTHING } from './util.js';

/** Glow mask resolution: 1 mask px = 4 Du, so the mask is ~480 x 270 at any 16:9 output size. */
const DU_PER_MASK_PX = 4;

/** Scratch surface for the glow mask, reused across frames of one compile. */
interface GlowScratch {
  surface: Surface;
  /** Mask px per output px. */
  scale: number;
  /** Blur plane (the mask alpha), one byte per mask px. */
  plane: Uint8Array;
}

function glowScratch(c: Compiled, backend: Backend): GlowScratch {
  const scale = 1 / (DU_PER_MASK_PX * c.S);
  const w = Math.max(1, Math.ceil(c.width * scale));
  const h = Math.max(1, Math.ceil(c.height * scale));
  return cached(c, `draw.glow.${backend.name}.${w}x${h}`, () => ({
    surface: backend.createSurface(w, h, { willReadFrequently: true }),
    scale,
    plane: new Uint8Array(w * h),
  }));
}

/**
 * Route glow (the original glow layer). The original strokes the route opaque in
 * `theme.glow` at `glowWidth`, blurs the RGBA layer channel by channel with
 * Pillow's GaussianBlur(`glowBlur`), then pastes it with its own alpha as the
 * mask: `out = dst * (1 - B) + P * B^2`.
 *
 * Here the mask is stroked on a low-resolution surface (1 px = 4 Du), its
 * alpha blurred with the Pillow box-blur port at sigma `glowBlur / 4` px,
 * written back as straight RGBA `(P * B, B)` and drawn upscaled with
 * source-over (smoothing `UPSCALE_SMOOTHING`), which gives the same
 * `dst * (1 - B) + P * B^2`. The mask surface is cleared in full (outside any
 * `save()`) before it is stroked, which also lets `@napi-rs/canvas` drop the
 * previous frame's recorded drawing and `putImageData` pixels.
 * `glowOpacity * alpha` fades the whole glow linearly (as a global alpha).
 */
export function drawGlow(
  ctx: Ctx2D,
  c: Compiled,
  path: readonly Vec2[],
  alpha: number,
  backend: Backend,
): void {
  const route = c.project.route;
  const opacity = route.glowOpacity * alpha;
  if (path.length < 2 || !(opacity > 0) || !(route.glowWidth > 0)) return;
  const scratch = glowScratch(c, backend);
  const { surface, scale, plane } = scratch;
  const w = surface.width;
  const h = surface.height;
  const g = surface.getContext2d();

  // Cleared outside save(): the mask context is only changed inside save/restore,
  // so its transform is the identity here, and napi drops its recording only on a
  // full clear with no saved state.
  g.clearRect(0, 0, w, h);
  g.save();
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = route.glowWidth * c.S;
  g.lineJoin = 'round';
  g.lineCap = 'butt';
  tracePath(g, path);
  g.stroke();
  g.restore();

  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;
  for (let i = 0; i < n; i++) plane[i] = d[i * 4 + 3] as number;
  gaussianBlur(plane, w, h, 1, route.glowBlur * c.S * scale);
  const [pr, pg, pb] = hexRgb(c.project.theme.glow);
  for (let i = 0; i < n; i++) {
    const b = plane[i] as number;
    const o = i * 4;
    d[o] = Math.round((pr * b) / 255);
    d[o + 1] = Math.round((pg * b) / 255);
    d[o + 2] = Math.round((pb * b) / 255);
    d[o + 3] = b;
  }
  g.putImageData(img, 0, 0);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.min(1, opacity);
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = UPSCALE_SMOOTHING;
  ctx.drawImage(surface.source, 0, 0, w, h, 0, 0, w / scale, h / scale);
  ctx.restore();
}
