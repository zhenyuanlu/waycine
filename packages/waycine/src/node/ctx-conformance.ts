/**
 * Compile-time proof that `@napi-rs/canvas`'s `SKRSContext2D` satisfies the
 * engine's `Ctx2D` without a cast. If `Ctx2D` drifts, this file stops compiling.
 */

import type { SKRSContext2D } from '@napi-rs/canvas';
import type { Ctx2D } from '../core/ctx.js';

type Satisfies<T extends Ctx2D> = T;
/** The optional members the engine sets must exist on this host, with compatible types. */
type HasOptional<T extends Required<Pick<Ctx2D, 'fontKerning'>>> = T;

/** `SKRSContext2D` as a `Ctx2D`. */
export type NapiCtx2D = Satisfies<SKRSContext2D>;
/** `SKRSContext2D` has `fontKerning`. */
export type NapiKerning = HasOptional<SKRSContext2D>;
