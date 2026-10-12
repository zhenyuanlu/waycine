import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  type Compiled,
  compile,
  drawScene,
  FIELDS,
  type FieldDef,
  outputSize,
  type ProfileId,
  sceneAt,
  type WaycineProject,
} from '../../src/core/index.js';
import { createNodeBackend } from '../../src/node/index.js';
import { LIVENESS_FIXTURES as FIXTURES } from '../helpers/liveness-fixtures.js';

/**
 * Liveness: perturbing any FIELDS setting with `live !== false` changes at
 * least one of 8 probe frames, rendered at 270p (short side) with the Node
 * backend and compared by SHA-1. This proves mechanically that every setting
 * reaches the pixels. A setting that only matters in some
 * projects names a fixture in `liveWhen`; per-profile layout settings are
 * checked in all three profiles. Settings marked `live: false` must leave
 * the frames unchanged.
 *
 * Probe frames are timeline indices of the unperturbed project, so a timing
 * change that moves content in time counts as a change.
 */

const SHORT_SIDE = 270;
const ASPECT_OF: Record<ProfileId, '16:9' | '9:16' | '1:1'> = {
  landscape: '16:9',
  portrait: '9:16',
  square: '1:1',
};

const backend = createNodeBackend();

/** Render size: the output size scaled to a 270 px short side. */
function probeSize(project: WaycineProject): { width: number; height: number } {
  const size = outputSize(project.output);
  const k = SHORT_SIDE / Math.min(size.width, size.height);
  return { width: Math.round(size.width * k), height: Math.round(size.height * k) };
}

/**
 * An overview frame after the title fade with a pin pulse in progress (so the
 * pulse settings show): the latest such frame up to k = 40, else k = 40.
 */
function overviewProbe(c: Compiled, start: number, n: number): number {
  const first = Math.min(40, n - 1);
  for (let k = first; k >= c.frames.titleFade; k--) {
    const state = sceneAt(c, start + k);
    if (state.pulses.some((p) => p.u > 0.2 && p.u < 0.9)) return start + k;
  }
  return start + first;
}

/** Eight probe frames: overview, stop 1 (card fading in, hold, early and late zoom), stop 2 hold, finale middle, last. */
function probeFrames(c: Compiled): number[] {
  const segments = c.timeline.segments;
  const find = (kind: string, index = 0) =>
    segments.find((s) => s.kind === kind && s.index === index);
  const s0 = find('stop', 0);
  if (s0 === undefined) throw new Error('probe project without stops');
  const s1 = find('stop', 1) ?? s0;
  const ov = find('overview');
  const fin = find('finale');
  const hold = (s: typeof s0) => s.start + s.nFly + Math.floor(s.nHold * 0.6);
  const zoomStart = s0.start + s0.n - s0.nZoom;
  const frames = [
    ov ? overviewProbe(c, ov.start, ov.n) : 0,
    s0.start + Math.min(s0.n - 1, c.frames.cardDelay + Math.floor(c.frames.cardFade / 2)),
    hold(s0),
    Math.min(s0.start + s0.n - 1, zoomStart + 3),
    s0.start + s0.n - 2,
    hold(s1),
    fin ? fin.start + Math.floor(fin.n / 2) : s1.start + s1.n - 1,
    c.timeline.totalFrames - 1,
  ];
  return frames.map((f) => Math.min(Math.max(0, f), c.timeline.totalFrames - 1));
}

function frameHash(c: Compiled, frame: number): string {
  const surface = backend.createSurface(c.width, c.height);
  const ctx = surface.getContext2d();
  drawScene(ctx, c, sceneAt(c, frame), backend);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  return createHash('sha1').update(data).digest('hex');
}

function compileProbe(project: WaycineProject): Compiled {
  return compile(project, backend, probeSize(project));
}

interface Baseline {
  frames: number[];
  hashes: string[];
}

const baselines = new Map<string, Baseline>();

function fixtureProject(name: string, profile: ProfileId | null): WaycineProject {
  const make = FIXTURES[name];
  if (make === undefined) throw new Error(`unknown liveness fixture ${name}`);
  const project = make();
  if (profile !== null) {
    project.output.aspect = ASPECT_OF[profile];
    project.output.layout = 'auto';
  }
  return project;
}

function baseline(name: string, profile: ProfileId | null): Baseline {
  const key = `${name}/${profile ?? '-'}`;
  let found = baselines.get(key);
  if (found === undefined) {
    const c = compileProbe(fixtureProject(name, profile));
    const frames = probeFrames(c);
    found = { frames, hashes: frames.map((f) => frameHash(c, f)) };
    baselines.set(key, found);
  }
  return found;
}

/** Perturbations that made compile, sceneAt or drawScene throw (each must be fixed, not counted as live). */
const crashes: string[] = [];

/** True when `project` renders any probe frame differently from the baseline. */
function changesFrames(project: WaycineProject, base: Baseline, what: string): boolean {
  try {
    const c = compileProbe(project);
    // Render frames that are likely to differ first, and stop at the first change.
    return base.frames.some((frame, i) => frameHash(c, frame) !== base.hashes[i]);
  } catch (error) {
    // The setting reached the engine, but a crash is a bug: record it and fail below.
    crashes.push(`${what}: ${String(error)}`);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Perturbations

function roundTo(value: number, step: number): number {
  return step >= 1 ? Math.round(value) : Math.round(value / step) * step;
}

function clamp(value: number, field: FieldDef): number {
  return Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, value));
}

function numberCandidates(value: number, field: FieldDef): number[] {
  const min = field.min ?? value - 100;
  const max = field.max ?? value + 100;
  const span = max - min;
  const raw = [value * 0.5, value * 1.6, value + span * 0.1, value - span * 0.1, min, max];
  const out: number[] = [];
  for (const v of raw) {
    const c = clamp(roundTo(v, field.step ?? 0.01), field);
    if (Math.abs(c - value) > 1e-9 && !out.includes(c)) out.push(c);
  }
  return out;
}

/** Alternative values for a setting whose current value is `value`. */
function candidates(field: FieldDef, value: unknown): unknown[] {
  switch (field.kind) {
    case 'bool':
      return [!(value as boolean)];
    case 'color':
      return ['#FF0000', '#00FF00'].filter((c) => c !== value);
    case 'enum':
      return (field.options ?? []).filter((o) => o !== value);
    case 'text':
      return [`${String(value ?? '')} ZX`, 'ZX', ''].filter((t) => t !== value);
    case 'date':
      // Late in the year, so an end date comes after every probe start date.
      return ['2026-12-30', '2026-01-02'].filter((t) => t !== value);
    case 'tuple': {
      const list = value as number[];
      const min = field.min ?? -100;
      const max = field.max ?? 100;
      const out: number[][] = [];
      list.forEach((v, i) => {
        const delta = Math.max((field.step ?? 0.01) * 10, Math.abs(v) * 0.5, (max - min) * 0.1);
        for (const next of [v + delta, v - delta]) {
          const copy = [...list];
          copy[i] = clamp(roundTo(next, field.step ?? 0.01), field);
          if (copy[i] !== v) out.push(copy);
        }
      });
      return out;
    }
    case 'number': {
      if (value === null || value === undefined) {
        const min = field.min ?? 0;
        const max = field.max ?? 1;
        return [min + (max - min) * 0.3, min + (max - min) * 0.8, max];
      }
      const nums = numberCandidates(value as number, field);
      return field.nullable ? [...nums, null] : nums;
    }
  }
}

type Container = Record<string, unknown>;

/** Where a setting lives in `project`: the object holding it and the key, per target. */
function targets(
  project: WaycineProject,
  field: FieldDef,
  profile: ProfileId,
): [Container, string][] {
  const { path } = field;
  if (path.startsWith('stops[].results[].')) {
    const stop = project.stops[0] as unknown as Container;
    if (!Array.isArray(stop.results) || stop.results.length === 0) {
      stop.results = [{ medal: 'gold', text: 'FIRST', count: 1 }];
    }
    return [[(stop.results as Container[])[0] as Container, path.slice(18)]];
  }
  if (path.startsWith('stops[].')) {
    return [[project.stops[0] as unknown as Container, path.slice(8)]];
  }
  if (path.startsWith('stats.items[].')) {
    return project.stats.items.map((item) => [item as unknown as Container, path.slice(14)]);
  }
  const concrete = path.startsWith('layouts.*.')
    ? path.replace('layouts.*.', `layouts.${profile}.`)
    : path;
  const roles = concrete.startsWith('fonts.*.')
    ? ['display', 'body'].map((r) => concrete.replace('fonts.*.', `fonts.${r}.`))
    : [concrete];
  return roles.map((full) => {
    const keys = full.split('.');
    const last = keys.pop() as string;
    let node = project as unknown as Container;
    for (const key of keys) node = node[key] as Container;
    return [node, last];
  });
}

/**
 * Tries each alternative value of `field` in turn (a font role and each
 * stat item are perturbed separately); returns the first that changes a
 * probe frame, or null when none does.
 */
function findChange(field: FieldDef, fixture: string, profile: ProfileId | null): string | null {
  const base = baseline(fixture, profile);
  const profileOf = (p: WaycineProject): ProfileId =>
    p.output.aspect === '9:16' ? 'portrait' : p.output.aspect === '1:1' ? 'square' : 'landscape';
  const probe = fixtureProject(fixture, profile);
  const count = targets(probe, field, profileOf(probe)).length;
  for (let t = 0; t < count; t++) {
    const fresh = fixtureProject(fixture, profile);
    const [holder, key] = targets(fresh, field, profileOf(fresh))[t] as [Container, string];
    for (const candidate of candidates(field, holder[key])) {
      const project = fixtureProject(fixture, profile);
      const [h, k] = targets(project, field, profileOf(project))[t] as [Container, string];
      h[k] = candidate;
      const what = `${field.path} = ${JSON.stringify(candidate)} [${fixture}${profile ? `, ${profile}` : ''}]`;
      if (changesFrames(project, base, what)) return JSON.stringify(candidate);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------

interface Check {
  field: FieldDef;
  fixture: string;
  profile: ProfileId | null;
}

const checks: Check[] = [];
for (const field of FIELDS) {
  const fixture = field.liveWhen ?? 'default';
  if (field.perProfile === true) {
    for (const profile of ['landscape', 'portrait', 'square'] as const) {
      checks.push({ field, fixture, profile });
    }
  } else {
    checks.push({ field, fixture, profile: null });
  }
}

describe('FIELDS liveness (270p probe frames, Node backend)', () => {
  it('uses eight distinct probe frames in the default fixture', () => {
    const frames = baseline('default', null).frames;
    expect(frames).toHaveLength(8);
    expect(new Set(frames).size).toBe(8);
  });

  it('every live setting changes a probe frame; export-only settings do not', async () => {
    const dead: string[] = [];
    const wrongDead: string[] = [];
    for (const { field, fixture, profile } of checks) {
      const where = `${field.path} [${fixture}${profile ? `, ${profile}` : ''}]`;
      const change = findChange(field, fixture, profile);
      // @napi-rs/canvas frees readback pixels from the event loop: yield between checks.
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (field.live === false) {
        if (change !== null) wrongDead.push(`${where} changed with ${change}`);
      } else if (change === null) {
        dead.push(where);
      }
    }
    expect(dead, 'settings that change no probe frame').toEqual([]);
    expect(wrongDead, 'settings marked live: false that change frames').toEqual([]);
    expect(crashes, 'settings whose perturbation throws').toEqual([]);
  }, 600_000);
});
