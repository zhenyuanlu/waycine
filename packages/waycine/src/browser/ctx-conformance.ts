/**
 * Compile-time proof that the DOM 2D contexts satisfy the engine's `Ctx2D`
 * without a cast. If `Ctx2D` drifts, this file stops compiling.
 */

import type { Ctx2D } from '../core/ctx.js';

type Satisfies<T extends Ctx2D> = T;
/** The optional members the engine sets must exist on these hosts, with compatible types. */
type HasOptional<T extends Required<Pick<Ctx2D, 'fontKerning'>>> = T;

/** `CanvasRenderingContext2D` as a `Ctx2D`. */
export type DomCtx2D = Satisfies<CanvasRenderingContext2D>;
/** `OffscreenCanvasRenderingContext2D` as a `Ctx2D`. */
export type OffscreenCtx2D = Satisfies<OffscreenCanvasRenderingContext2D>;
/** `CanvasRenderingContext2D` has `fontKerning`. */
export type DomKerning = HasOptional<CanvasRenderingContext2D>;
/** `OffscreenCanvasRenderingContext2D` has `fontKerning`. */
export type OffscreenKerning = HasOptional<OffscreenCanvasRenderingContext2D>;
