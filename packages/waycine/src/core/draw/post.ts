import type { Backend, Ctx2D, ImageDataLike, Surface } from '../ctx.js';
import type { Compiled, PostState } from '../scene-types.js';
import { type BlurScratch, gaussianBlur } from './blur.js';
import { cached, UPSCALE_SMOOTHING } from './util.js';

/**
 * Smallest zoom-through blur (sigma in output px) that is drawn. Below it the
 * blur is invisible and skipped (the flash blend still applies). At 1080p the
 * zoom-through frames of a stop have sigma 0.09, 0.38, 0.84, 1.5, 2.3, 3.4 and 4.6 px: the first two are skipped, the
 * rest blur a 2x2-mean half-resolution copy at sigma / 2 (where the fused
 * small-radius path applies to box radii below 1).
 */
export const MIN_BLUR_SIGMA_PX = 0.5;

/** A scratch surface for blurring, with its reusable buffers. */
interface PostScratch {
  surface: Surface;
  blur: BlurScratch;
  /** Reused pixel block for the direct half-resolution path (alpha preset to 255). */
  image: ImageDataLike | null;
}

function postScratch(c: Compiled, backend: Backend, w: number, h: number): PostScratch {
  return cached(c, `draw.post.${backend.name}.${w}x${h}`, () => ({
    surface: backend.createSurface(w, h, { willReadFrequently: true }),
    blur: {},
    image: null,
  }));
}

/** 2x2 box mean of the RGB of `src` (W x H) into `dst` (ceil(W/2) x ceil(H/2)), edges clamped. */
function halveInto(src: Uint8ClampedArray, W: number, H: number, dst: ImageDataLike): void {
  const d = dst.data;
  const hw = dst.width;
  const hh = dst.height;
  for (let y = 0; y < hh; y++) {
    const y0 = 2 * y;
    const y1 = Math.min(y0 + 1, H - 1);
    for (let x = 0; x < hw; x++) {
      const x0 = 2 * x;
      const x1 = Math.min(x0 + 1, W - 1);
      const a = (y0 * W + x0) * 4;
      const b = (y0 * W + x1) * 4;
      const e = (y1 * W + x0) * 4;
      const f = (y1 * W + x1) * 4;
      const o = (y * hw + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        d[o + ch] =
          ((src[a + ch] as number) +
            (src[b + ch] as number) +
            (src[e + ch] as number) +
            (src[f + ch] as number) +
            2) >>
          2;
      }
    }
  }
}

/**
 * Blurs the whole frame with the Pillow Gaussian-blur port (the original blurs
 * the final output frame): colour channels only, since the frame is opaque.
 * The blur runs on a 2x2-mean half-resolution copy at sigma / 2 (fused path
 * for box radii below 1), which is drawn back over the whole frame with
 * `UPSCALE_SMOOTHING`.
 *
 * With `backend.frameReadback` `'copy'` (browsers) the frame is first drawn
 * onto a `willReadFrequently` scratch surface (bilinear at exactly half size
 * is the 2x2 mean), so the frame canvas itself is never read with
 * `getImageData` and stays on the GPU. With `'direct'` (`@napi-rs/canvas`,
 * where drawing a canvas replays its drawing) the frame's pixels are read
 * directly and halved here; the scratch surface is cleared before each
 * `putImageData`, so napi's recording never holds more than one blurred copy.
 */
function blurFrame(ctx: Ctx2D, c: Compiled, sigmaPx: number, backend: Backend): void {
  const W = c.width;
  const H = c.height;
  const w = Math.ceil(W / 2);
  const h = Math.ceil(H / 2);
  const scratch = postScratch(c, backend, w, h);
  const sctx = scratch.surface.getContext2d();

  let img: ImageDataLike;
  if (backend.frameReadback === 'direct') {
    const frame = ctx.getImageData(0, 0, W, H);
    if (scratch.image === null) {
      scratch.image = sctx.createImageData(w, h);
      scratch.image.data.fill(255);
    }
    img = scratch.image;
    halveInto(frame.data, W, H, img);
  } else {
    sctx.save();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = 'copy';
    sctx.imageSmoothingEnabled = true;
    // Bilinear at exactly half size samples between four pixels: their mean.
    sctx.imageSmoothingQuality = 'low';
    sctx.drawImage(ctx.canvas, 0, 0, W, H, 0, 0, w, h);
    sctx.restore();
    img = sctx.getImageData(0, 0, w, h);
  }
  gaussianBlur(img.data, w, h, 4, sigmaPx / 2, 3, true, { scratch: scratch.blur, fuseSmall: true });
  sctx.clearRect(0, 0, w, h);
  sctx.putImageData(img, 0, 0);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'copy';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = UPSCALE_SMOOTHING;
  ctx.drawImage(scratch.surface.source, 0, 0, w, h, 0, 0, W, H);
  ctx.restore();
}

/**
 * The colour a zoom-through blends into and the recovery fades back from:
 * `theme.flash`, or `theme.background` when `timing.transition.flashTo` is
 * `background` (a dip to dark that follows the background colour).
 */
export function flashColor(c: Compiled): string {
  return c.project.timing.transition.flashTo === 'background'
    ? c.project.theme.background
    : c.project.theme.flash;
}

/**
 * Post-processing at output resolution (the original's zoom-through): blur by
 * `blurDu * S` px (skipped below `MIN_BLUR_SIGMA_PX`), then blend toward
 * `flashColor(c)` by `flash` (`Image.blend(blurred, flash, alpha)` = a
 * flash-coloured fill at that alpha).
 */
export function drawPost(ctx: Ctx2D, c: Compiled, post: PostState, backend: Backend): void {
  const sigma = post.blurDu * c.S;
  if (sigma >= MIN_BLUR_SIGMA_PX && post.flash < 1) blurFrame(ctx, c, sigma, backend);
  if (post.flash > 0) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, post.flash);
    ctx.fillStyle = flashColor(c);
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
  }
}
