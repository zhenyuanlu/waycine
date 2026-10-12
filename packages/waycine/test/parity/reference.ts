import { readFileSync } from 'node:fs';
import { sceneAt } from '../../src/core/scene.js';
import type { Cam, Compiled } from '../../src/core/scene-types.js';

/**
 * Reference states recorded from the original renderer (numbers only,
 * columnar per segment), and the frame-by-frame comparison shared by the
 * landscape and portrait parity tests.
 */

/** A camera as `[cx, cy, z]`. */
export type Triple = [number, number, number];

/** One recorded segment. */
export interface RefSegment {
  kind: 'overview' | 'stop' | 'finale';
  index: number;
  n: number;
  cx: number[];
  cy: number[];
  z: number[];
  upto: number[];
  lit: number[];
  labels: number[];
  title: (number | null)[];
  /** [stop, u, anchor cx, anchor cy, anchor z] */
  card: ([number, number, number, number, number] | null)[];
  /** Raw stats progress (the original skips drawing while u <= 0). */
  stats: (number | null)[];
  blur: number[];
  flash: number[];
  pulses: [number, number][][];
}

/** A recorded reference file. */
export interface RefStates {
  width: number;
  height: number;
  fps: [number, number];
  ovCam: Triple;
  stampCams: Triple[];
  segments: RefSegment[];
}

/** Absolute tolerance on every number. */
export const TOL = 1e-9;

/** Reads a fixture from `test/fixtures/`. */
export function loadFixture<T>(name: string): T {
  const url = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

/** `list[i]`, throwing when the fixture is shorter than expected. */
export function at<T>(list: readonly T[], i: number): T {
  const v = list[i];
  if (v === undefined) {
    throw new Error(`missing reference value at ${i}`);
  }
  return v;
}

/** Collects mismatches beyond `TOL`. */
export class Mismatches {
  readonly list: string[] = [];

  near(what: string, actual: number, expected: number, tol = TOL): void {
    if (!(Math.abs(actual - expected) <= tol)) {
      this.list.push(`${what}: ${actual} vs ${expected} (diff ${actual - expected})`);
    }
  }

  cam(what: string, cam: Cam, expected: readonly number[]): void {
    this.near(`${what}.cx`, cam.cx, at(expected, 0));
    this.near(`${what}.cy`, cam.cy, at(expected, 1));
    this.near(`${what}.z`, cam.z, at(expected, 2));
  }

  push(message: string): void {
    this.list.push(message);
  }
}

/** Compares the fit and stamp cameras. */
export function cameraMismatches(c: Compiled, ref: RefStates): string[] {
  const m = new Mismatches();
  m.cam('ovCam', c.ovCam, ref.ovCam);
  ref.stampCams.forEach((cam, i) => {
    m.cam(`stampCams[${i}]`, at(c.stampCams, i), cam);
  });
  return m.list;
}

/**
 * Compares `sceneAt` for every recorded frame: segment, camera, route extent,
 * lit pins, pin labels, title, card (stop, u, anchor camera), stats progress,
 * pulses, blur and flash. Segments mode has no overlay fades, so
 * `overlayAlpha` and `card.alpha` must be 1.
 */
export function stateMismatches(c: Compiled, ref: RefStates): string[] {
  const m = new Mismatches();
  let frame = 0;
  for (const seg of ref.segments) {
    for (let k = 0; k < seg.n; k++, frame++) {
      const s = sceneAt(c, frame);
      const tag = `${seg.kind}[${seg.index}] k=${k}`;
      if (s.segment.kind !== seg.kind || s.segment.index !== seg.index || s.segment.k !== k) {
        m.push(`${tag}: segment ${JSON.stringify(s.segment)}`);
        continue;
      }
      m.cam(`${tag} cam`, s.cam, [at(seg.cx, k), at(seg.cy, k), at(seg.z, k)]);
      m.near(`${tag} upto`, s.routeUpto, at(seg.upto, k));
      m.near(`${tag} lit`, s.lit, at(seg.lit, k));
      if (s.pinLabels !== (at(seg.labels, k) === 1)) {
        m.push(`${tag} pinLabels ${s.pinLabels}`);
      }
      if (s.overlayAlpha !== 1) {
        m.push(`${tag} overlayAlpha ${s.overlayAlpha}`);
      }

      const title = seg.title[k] ?? null;
      if (title === null || s.title === null) {
        if (title !== s.title) {
          m.push(`${tag} title ${JSON.stringify(s.title)} vs ${title}`);
        }
      } else {
        m.near(`${tag} title`, s.title.alpha, title);
      }

      const card = seg.card[k] ?? null;
      if (card === null || s.card === null) {
        if (card !== s.card) {
          m.push(`${tag} card ${JSON.stringify(s.card)} vs ${JSON.stringify(card)}`);
        }
      } else {
        if (s.card.stop !== card[0] || s.card.alpha !== 1) {
          m.push(`${tag} card stop/alpha ${s.card.stop}/${s.card.alpha}`);
        }
        m.near(`${tag} card.u`, s.card.u, card[1]);
        m.cam(`${tag} card.anchor`, s.card.anchorCam, card.slice(2));
      }

      const stats = seg.stats[k] ?? null;
      if (stats !== null && stats > 0) {
        if (s.stats === null) {
          m.push(`${tag} stats missing (ref u ${stats})`);
        } else {
          m.near(`${tag} stats.u`, s.stats.u, stats);
        }
      } else if (s.stats !== null) {
        m.push(`${tag} stats ${JSON.stringify(s.stats)} vs ${stats}`);
      }

      const pulses = at(seg.pulses, k);
      if (pulses.length !== s.pulses.length) {
        m.push(`${tag} pulses ${JSON.stringify(s.pulses)} vs ${JSON.stringify(pulses)}`);
      } else {
        pulses.forEach(([index, u], j) => {
          const p = at(s.pulses, j);
          if (p.index !== index) {
            m.push(`${tag} pulse[${j}].index ${p.index} vs ${index}`);
          }
          m.near(`${tag} pulse[${j}].u`, p.u, u);
        });
      }

      m.near(`${tag} blur`, s.post.blurDu, at(seg.blur, k));
      m.near(`${tag} flash`, s.post.flash, at(seg.flash, k));
    }
  }
  if (frame !== c.timeline.totalFrames) {
    m.push(`recorded ${frame} frames, timeline has ${c.timeline.totalFrames}`);
  }
  return m.list;
}
