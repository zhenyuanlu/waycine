/**
 * Port of Pillow's Gaussian blur (Pillow 12, `libImaging/BoxBlur.c`).
 *
 * `ImageFilter.GaussianBlur(sigma)` runs `ImagingGaussianBlur`, which is
 * `ImagingBoxBlur(radius = _gaussian_blur_radius(sigma, 3), passes = 3)`:
 * three extended box passes along x, then three along y, each pass rounding
 * back to 8 bits, with clamp-to-edge borders. Channels are blurred
 * independently and without premultiplying, exactly like Pillow on RGBA.
 *
 * Float steps use `Math.fround` where the C code works in `float`, so the
 * box radius and weights match Pillow bit for bit.
 *
 * Pillow's copyright and licence notice is reproduced in
 * THIRD_PARTY_NOTICES.md.
 */

const F = Math.fround;
const ONE = 1 << 24;
const HALF = 1 << 23;

/**
 * Pillow's `_gaussian_blur_radius`: the extended box radius whose `passes`
 * repetitions approximate a Gaussian of standard deviation `sigma` (px).
 * Gwosdek et al., "Theoretical foundations of Gaussian convolution by
 * extended box filtering" (2011), equations 7, 11 and 14.
 */
export function pillowBoxRadius(sigma: number, passes = 3): number {
  const radius = F(sigma);
  const sigma2 = F(F(radius * radius) / passes);
  const L = F(Math.sqrt(12 * sigma2 + 1));
  const l = F(Math.floor((L - 1) / 2));
  let a = F(F(F(2 * l) + 1) * F(F(l * F(l + 1)) - F(3 * sigma2)));
  a = F(a / F(6 * F(sigma2 - F(F(l + 1) * F(l + 1)))));
  return F(l + a);
}

/** Integer radius and 24-bit fixed-point weights of one extended box (`ImagingHorizontalBoxBlur`). */
interface BoxWeights {
  /** Integer part of the radius. */
  radius: number;
  /** Weight of each of the `2 * radius + 1` whole taps. */
  ww: number;
  /** Weight of each of the two fractional edge taps. */
  fw: number;
}

function boxWeights(floatRadius: number): BoxWeights {
  const fr = F(floatRadius);
  const radius = Math.trunc(fr);
  const ww = Math.trunc(F(ONE / F(F(fr * 2) + 1)));
  const fw = Math.max(0, Math.floor((ONE - (radius * 2 + 1) * ww) / 2));
  return { radius, ww, fw };
}

/** Scale that turns 24-bit fixed point into 8 bits (exact: a power of two). */
const INV = 1 / ONE;

/** 8-bit pixel storage, row-major, 1 or 4 interleaved channels per pixel. */
export type Pixels = Uint8Array | Uint8ClampedArray;

/** Channels per pixel the blur supports: a single plane, or RGBA. */
export type BlurChannels = 1 | 4;

/**
 * Initial accumulator of `ImagingLineBoxBlur32` for one channel: the window
 * centred on pixel -1, with the line clamped at both ends.
 */
function initAcc(src: Uint8Array, n: number, radius: number, ch: number, C: number): number {
  const edgeA = Math.min(radius + 1, n);
  let acc =
    (src[ch] as number) * (radius + 1) + (src[(n - 1) * C + ch] as number) * (radius - edgeA + 1);
  for (let x = 0; x < edgeA - 1; x++) acc += src[x * C + ch] as number;
  return acc;
}

/*
 * One extended box pass over a line (`ImagingLineBoxBlur32`). Pillow splits
 * the line into three edge regions; for every x they reduce to: subtract (and
 * use as the left fractional tap) position max(0, x - r - 1), add position
 * min(x + r, last), right fractional tap min(x + r + 1, last). The integer
 * arithmetic and the `(bulk + 2^23) >> 24` rounding are Pillow's.
 */

function line1(src: Uint8Array, dst: Uint8Array, n: number, w: BoxWeights): void {
  const { radius, ww, fw } = w;
  const last = n - 1;
  let a0 = initAcc(src, n, radius, 0, 1);
  for (let x = 0; x < n; x++) {
    const sub = x - radius - 1 > 0 ? x - radius - 1 : 0;
    const add = x + radius < last ? x + radius : last;
    const right = x + radius + 1 < last ? x + radius + 1 : last;
    const l0 = src[sub] as number;
    a0 += (src[add] as number) - l0;
    dst[x] = ((a0 * ww + (l0 + (src[right] as number)) * fw + HALF) * INV) | 0;
  }
}

function line4(src: Uint8Array, dst: Uint8Array, n: number, w: BoxWeights): void {
  const { radius, ww, fw } = w;
  const last = n - 1;
  let a0 = initAcc(src, n, radius, 0, 4);
  let a1 = initAcc(src, n, radius, 1, 4);
  let a2 = initAcc(src, n, radius, 2, 4);
  let a3 = initAcc(src, n, radius, 3, 4);
  for (let x = 0; x < n; x++) {
    const s = (x - radius - 1 > 0 ? x - radius - 1 : 0) * 4;
    const a = (x + radius < last ? x + radius : last) * 4;
    const r = (x + radius + 1 < last ? x + radius + 1 : last) * 4;
    const o = x * 4;
    const l0 = src[s] as number;
    const l1 = src[s + 1] as number;
    const l2 = src[s + 2] as number;
    const l3 = src[s + 3] as number;
    a0 += (src[a] as number) - l0;
    a1 += (src[a + 1] as number) - l1;
    a2 += (src[a + 2] as number) - l2;
    a3 += (src[a + 3] as number) - l3;
    dst[o] = ((a0 * ww + (l0 + (src[r] as number)) * fw + HALF) * INV) | 0;
    dst[o + 1] = ((a1 * ww + (l1 + (src[r + 1] as number)) * fw + HALF) * INV) | 0;
    dst[o + 2] = ((a2 * ww + (l2 + (src[r + 2] as number)) * fw + HALF) * INV) | 0;
    dst[o + 3] = ((a3 * ww + (l3 + (src[r + 3] as number)) * fw + HALF) * INV) | 0;
  }
}

/** Like `line4` for RGB only: the fourth byte of each pixel is copied unchanged. */
function line3of4(src: Uint8Array, dst: Uint8Array, n: number, w: BoxWeights): void {
  const { radius, ww, fw } = w;
  const last = n - 1;
  let a0 = initAcc(src, n, radius, 0, 4);
  let a1 = initAcc(src, n, radius, 1, 4);
  let a2 = initAcc(src, n, radius, 2, 4);
  for (let x = 0; x < n; x++) {
    const s = (x - radius - 1 > 0 ? x - radius - 1 : 0) * 4;
    const a = (x + radius < last ? x + radius : last) * 4;
    const r = (x + radius + 1 < last ? x + radius + 1 : last) * 4;
    const o = x * 4;
    const l0 = src[s] as number;
    const l1 = src[s + 1] as number;
    const l2 = src[s + 2] as number;
    a0 += (src[a] as number) - l0;
    a1 += (src[a + 1] as number) - l1;
    a2 += (src[a + 2] as number) - l2;
    dst[o] = ((a0 * ww + (l0 + (src[r] as number)) * fw + HALF) * INV) | 0;
    dst[o + 1] = ((a1 * ww + (l1 + (src[r + 1] as number)) * fw + HALF) * INV) | 0;
    dst[o + 2] = ((a2 * ww + (l2 + (src[r + 2] as number)) * fw + HALF) * INV) | 0;
    dst[o + 3] = src[o + 3] as number;
  }
}

/**
 * Reusable work buffers for `boxBlur` / `gaussianBlur` (grown on demand, so one
 * scratch per image size avoids a full-frame allocation on every call).
 */
export interface BlurScratch {
  /** Whole-image buffer: the transposed image, or the fused path's y-pass source. */
  image?: Uint8Array;
  /** First row buffer. */
  rowA?: Uint8Array;
  /** Second row buffer. */
  rowB?: Uint8Array;
}

/** A `length`-byte buffer from `scratch[key]` (grown when too small), or a fresh one. */
function scratchBuffer(
  scratch: BlurScratch | undefined,
  key: keyof BlurScratch,
  length: number,
): Uint8Array {
  const have = scratch?.[key];
  if (have !== undefined && have.length >= length) {
    return have.length === length ? have : have.subarray(0, length);
  }
  const made = new Uint8Array(length);
  if (scratch !== undefined) scratch[key] = made;
  return made;
}

/** `passes` horizontal passes over every row of `data` (`ImagingHorizontalBoxBlur` x passes). */
function rowPasses(
  data: Uint8Array,
  width: number,
  height: number,
  C: BlurChannels,
  w: BoxWeights,
  passes: number,
  keepAlpha: boolean,
  scratch: BlurScratch | undefined,
): void {
  const rowLen = width * C;
  let a = scratchBuffer(scratch, 'rowA', rowLen);
  let b = scratchBuffer(scratch, 'rowB', rowLen);
  const line = C === 1 ? line1 : keepAlpha ? line3of4 : line4;
  for (let y = 0; y < height; y++) {
    const off = y * rowLen;
    a.set(data.subarray(off, off + rowLen));
    for (let pass = 0; pass < passes; pass++) {
      line(a, b, width, w);
      const t = a;
      a = b;
      b = t;
    }
    data.set(a, off);
  }
}

/** Cache-blocked transpose of a `w` x `h` image of one-word pixels into `h` x `w`. */
function transpose(
  src: Uint8Array | Uint32Array,
  dst: Uint8Array | Uint32Array,
  w: number,
  h: number,
): void {
  const B = 32;
  for (let y0 = 0; y0 < h; y0 += B) {
    const y1 = Math.min(y0 + B, h);
    for (let x0 = 0; x0 < w; x0 += B) {
      const x1 = Math.min(x0 + B, w);
      for (let y = y0; y < y1; y++) {
        const row = y * w;
        for (let x = x0; x < x1; x++) dst[x * h + y] = src[row + x] as number;
      }
    }
  }
}

/** One-word-per-pixel view of `bytes` (4-channel: a Uint32Array over the same memory). */
function words(bytes: Uint8Array, C: BlurChannels, n: number): Uint8Array | Uint32Array {
  return C === 4 ? new Uint32Array(bytes.buffer, bytes.byteOffset, n) : bytes;
}

/**
 * Pillow's `ImagingBoxBlur` in place: `passes` extended box passes of float
 * radius `radius` (px) along x, then (on the transposed image, as Pillow)
 * along y. All `channels` of every pixel are blurred independently, without
 * premultiplying. A radius of 0 leaves the image unchanged (as Pillow).
 * `keepAlpha` (4 channels only) leaves the fourth channel untouched, which
 * equals Pillow's result on opaque frames and saves a quarter of the work.
 * `scratch` supplies reusable work buffers.
 */
export function boxBlur(
  data: Pixels,
  width: number,
  height: number,
  channels: BlurChannels,
  radius: number,
  passes = 1,
  keepAlpha = false,
  scratch?: BlurScratch,
): void {
  if (!(radius > 0) || width < 1 || height < 1 || passes < 1) return;
  const w = boxWeights(radius);
  const n = width * height;
  // Work on an aligned Uint8Array copy when the caller's memory cannot be word-viewed.
  const aligned = channels === 1 || data.byteOffset % 4 === 0;
  const img = aligned
    ? new Uint8Array(data.buffer, data.byteOffset, n * channels)
    : Uint8Array.from(data.subarray(0, n * channels));
  const keep = channels === 4 && keepAlpha;
  rowPasses(img, width, height, channels, w, passes, keep, scratch);
  const t = scratchBuffer(scratch, 'image', n * channels);
  transpose(words(img, channels, n), words(t, channels, n), width, height);
  rowPasses(t, height, width, channels, w, passes, keep, scratch);
  transpose(words(t, channels, n), words(img, channels, n), height, width);
  if (!aligned) data.set(img);
}

/** Fixed-point scale of the fused kernel's taps (16 bits: sums stay far inside int32). */
const FUSED_ONE = 1 << 16;
const FUSED_HALF = 1 << 15;

/** Taps of the fused kernel in 16-bit fixed point: centre, +-1, +-2, +-3. */
interface FusedTaps {
  k0: number;
  k1: number;
  k2: number;
  k3: number;
}

/**
 * One output byte of the fused kernel: the byte at `c0` and its neighbours
 * `m1..m3` (before) and `p1..p3` (after), all absolute indices into `a`.
 */
function tap7(
  a: Uint8Array,
  t: FusedTaps,
  c0: number,
  m1: number,
  p1: number,
  m2: number,
  p2: number,
  m3: number,
  p3: number,
): number {
  return (
    (t.k0 * (a[c0] as number) +
      t.k1 * ((a[m1] as number) + (a[p1] as number)) +
      t.k2 * ((a[m2] as number) + (a[p2] as number)) +
      t.k3 * ((a[m3] as number) + (a[p3] as number)) +
      FUSED_HALF) >>
    16
  );
}

/**
 * The fused small-radius blur: for a float box radius below 1 each of
 * Pillow's passes is the 3-tap kernel `[fw, ww, fw]`, so its three passes
 * per axis equal one 7-tap kernel, `(f, w, f)^3` expanded. One pass per axis
 * (x, then y, with clamp-to-edge borders) replaces three, with one 8-bit
 * rounding instead of three and no transposes. RGB of RGBA only; the fourth
 * byte is left untouched (opaque frames). Interior pixels stay within 2 levels
 * of Pillow's per-pass rounding (mean well below 0.1 on real frames, see the
 * unit test); pixels within 3 px of a border can differ more because the
 * clamp is applied once.
 */
function fusedSmallBlur(
  pixels: Pixels,
  width: number,
  height: number,
  w: BoxWeights,
  scratch: BlurScratch | undefined,
): void {
  const f = w.fw / ONE;
  const c = w.ww / ONE;
  // (f z^-1 + c + f z)^3 expanded; the taps sum to (c + 2f)^3 <= 1.
  const t: FusedTaps = {
    k0: Math.round((c * c * c + 6 * c * f * f) * FUSED_ONE),
    k1: Math.round((3 * c * c * f + 3 * f * f * f) * FUSED_ONE),
    k2: Math.round(3 * c * f * f * FUSED_ONE),
    k3: Math.round(f * f * f * FUSED_ONE),
  };
  // Plain byte view: stores to a Uint8ClampedArray are slower, and every result is 0..255.
  const data = new Uint8Array(pixels.buffer, pixels.byteOffset, width * height * 4);
  const rowLen = width * 4;

  // x pass: each row padded by 3 edge pixels on both sides.
  const pad = scratchBuffer(scratch, 'rowA', rowLen + 24);
  for (let y = 0; y < height; y++) {
    const off = y * rowLen;
    const lastPx = off + rowLen - 4;
    pad.set(data.subarray(off, off + rowLen), 12);
    for (let e = 0; e < 12; e += 4) {
      const r = 12 + rowLen + e;
      pad[e] = data[off] as number;
      pad[e + 1] = data[off + 1] as number;
      pad[e + 2] = data[off + 2] as number;
      pad[r] = data[lastPx] as number;
      pad[r + 1] = data[lastPx + 1] as number;
      pad[r + 2] = data[lastPx + 2] as number;
    }
    const end = 12 + rowLen;
    for (let p = 12, o = off; p < end; p += 4, o += 4) {
      data[o] = tap7(pad, t, p, p - 4, p + 4, p - 8, p + 8, p - 12, p + 12);
      data[o + 1] = tap7(pad, t, p + 1, p - 3, p + 5, p - 7, p + 9, p - 11, p + 13);
      data[o + 2] = tap7(pad, t, p + 2, p - 2, p + 6, p - 6, p + 10, p - 10, p + 14);
    }
  }

  // y pass: read seven clamped source rows from a copy, write back in place.
  const src = scratchBuffer(scratch, 'image', rowLen * height);
  src.set(data);
  const last = height - 1;
  for (let y = 0; y < height; y++) {
    const r0 = y * rowLen;
    const m1 = (y > 0 ? y - 1 : 0) * rowLen - r0;
    const p1 = (y < last ? y + 1 : last) * rowLen - r0;
    const m2 = (y > 1 ? y - 2 : 0) * rowLen - r0;
    const p2 = (y < last - 1 ? y + 2 : last) * rowLen - r0;
    const m3 = (y > 2 ? y - 3 : 0) * rowLen - r0;
    const p3 = (y < last - 2 ? y + 3 : last) * rowLen - r0;
    const end = r0 + rowLen;
    for (let i = r0; i < end; i += 4) {
      data[i] = tap7(src, t, i, i + m1, i + p1, i + m2, i + p2, i + m3, i + p3);
      const j = i + 1;
      data[j] = tap7(src, t, j, j + m1, j + p1, j + m2, j + p2, j + m3, j + p3);
      const k = i + 2;
      data[k] = tap7(src, t, k, k + m1, k + p1, k + m2, k + p2, k + m3, k + p3);
    }
  }
}

/** Extra options for `gaussianBlur`. */
export interface BlurOptions {
  /** Reusable work buffers. */
  scratch?: BlurScratch;
  /**
   * When the box radius is below 1 and the data is RGBA with `keepAlpha`, run
   * the fused 7-tap path instead of three passes per axis (faster; within a
   * level or two of Pillow instead of bit-exact).
   */
  fuseSmall?: boolean;
}

/**
 * Pillow's `GaussianBlur(sigma)` in place (`ImagingGaussianBlur`, 3 passes by
 * default): `boxBlur` with radius `pillowBoxRadius(sigma, passes)`. `sigma`
 * is in px of `data`; `channels` is 1 (a plane) or 4 (RGBA); see `boxBlur`
 * for `keepAlpha` and `BlurOptions` for the scratch buffers and the fused path.
 */
export function gaussianBlur(
  data: Pixels,
  width: number,
  height: number,
  channels: BlurChannels,
  sigma: number,
  passes = 3,
  keepAlpha = false,
  opts: BlurOptions = {},
): void {
  if (!(sigma > 0) || width < 1 || height < 1) return;
  const radius = pillowBoxRadius(sigma, passes);
  if (opts.fuseSmall === true && passes === 3 && channels === 4 && keepAlpha && radius < 1) {
    if (radius > 0) fusedSmallBlur(data, width, height, boxWeights(radius), opts.scratch);
    return;
  }
  boxBlur(data, width, height, channels, radius, passes, keepAlpha, opts.scratch);
}
