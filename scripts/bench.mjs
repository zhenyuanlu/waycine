#!/usr/bin/env node
// Frame-time bench for the Node backend (`npm run bench`).
//
// Renders frames spread over the reference season (200 by default; one of the
// engine's test projects) and the Europe preset (60) at a 1080 px short side
// with @napi-rs/canvas, and prints per-frame-type timings (median and p95)
// against the Node budget: 1080p frame <= 30 ms, zoom-through frame <= 70 ms,
// CLI pipeline >= 25 fps. "frame" is draw plus the pixel readback an export
// needs (Skia rasterizes lazily, so the readback carries most of the raster
// cost); "draw" is the drawing calls alone.
//
// Method: one frame of every type is rendered first (warm-up, so the first
// zoom-through frame does not pay for its blur buffers); every sampled frame
// is then timed 3 times and its median kept, which damps machine load. A
// separate "pipeline" pass times what the CLI does per frame (draw, readback
// and a copy of the pixels into a Buffer, one pass, no repeats) and prints
// frames per second against the 25 fps CLI target. Stage times (draw, glow,
// post) are not split out.
//
// Memory: @napi-rs/canvas 1.0.9 frees the pixels of every readback only in
// finalizers that Node runs from the event loop, so the bench, like the CLI,
// yields to the event loop after every frame (outside the timings). A loop
// that never yields grows by one frame of memory per readback. The last lines
// print the process's RSS and its peak.
//
// Drift: one season frame is timed before and after the run. On a hybrid CPU
// Windows may move a busy background process to efficiency cores after a few
// seconds, which doubles every frame time (measured on a hybrid desktop CPU: 14-15 ms
// on performance cores, 30-31 ms on efficiency cores for the same frame); the
// bench then prints a warning, since its numbers mix both. Pin the run to
// performance cores to measure the engine (for example Start-Process with
// ProcessorAffinity in PowerShell).
//
// Needs the built packages (`npm run build` or `npx tsc -b`). Exits 0 unless
// `--check` is given: then it exits 1 when any frame type or the pipeline is
// over budget, or 2 ("INCONCLUSIVE") when it is over budget and the drift
// check moved by more than x1.3 (either way), since the machine and not the
// engine then decided the result.
//
//   node scripts/bench.mjs [--frames N] [--europe-frames N] [--check]

import { existsSync, readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const PRESETS = new URL('packages/waycine/presets/', ROOT);
/** The reference season the budget was set on lives with the engine's test projects. */
const TEST_PROJECTS = new URL('packages/waycine/test/fixtures/projects/', ROOT);
const BUDGET_MS = { frame: 30, zoom: 70 };
const CLI_FPS_TARGET = 25;
/** `--check`: over budget with a drift beyond this ratio (or its inverse) exits 2, inconclusive. */
const DRIFT_INCONCLUSIVE = 1.3;
/** Any run: a drift beyond this ratio (or its inverse) prints the mixed-cores warning. */
const DRIFT_WARNING = 1.4;
const REPEATS = 3;

let peakRss = process.memoryUsage().rss;

/** One event-loop turn (lets napi free the readbacks), then an RSS sample. */
async function settle() {
  await nextTurn();
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
}

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  const n = Number(process.argv[i + 1]);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`${name} needs a whole number >= 1`);
    process.exit(2);
  }
  return n;
}

let engine;
try {
  engine = await import('waycine/node');
} catch (error) {
  console.error(
    `Cannot load waycine/node (${error.message}). Build first: npm run build (or npx tsc -b).`,
  );
  process.exit(1);
}
const { compile, createNodeBackend, outputSize, renderFrame, sceneAt, validateProject } = engine;

/** Frame type for the report. */
function frameType(c, frame) {
  const s = sceneAt(c, frame);
  const seg = c.timeline.segments.find(
    (x) => x.kind === s.segment.kind && x.index === s.segment.index,
  );
  if (s.segment.kind !== 'stop' || seg === undefined) return s.segment.kind;
  const k = s.segment.k;
  if (k >= seg.nFly + seg.nHold) return 'zoom-through';
  return k >= seg.nFly ? 'stop hold' : 'stop fly';
}

function quantile(sorted, q) {
  if (sorted.length === 0) return Number.NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

function median(values) {
  return quantile(
    [...values].sort((a, b) => a - b),
    0.5,
  );
}

function loadProject(name, dir = PRESETS) {
  const url = new URL(`${name}.waycine.json`, dir);
  if (!existsSync(url)) return undefined;
  const { project, issues } = validateProject(JSON.parse(readFileSync(url, 'utf8')));
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length > 0) {
    console.error(`${name}: ${errors.length} validation error(s); skipped`);
    return undefined;
  }
  // 1080 px short side at 1x, keeping the project's aspect; a custom size falls back to 16:9.
  if (project.output.aspect === 'custom') {
    project.output.aspect = '16:9';
  }
  project.output.shortSide = 1080;
  project.output.supersample = 1;
  return project;
}

/** Draw plus readback of one frame: [draw ms, frame ms]. */
function timeFrame(ctx, c, frame, backend) {
  const t0 = performance.now();
  renderFrame(ctx, c, frame, backend);
  const t1 = performance.now();
  ctx.getImageData(0, 0, c.width, c.height);
  const t2 = performance.now();
  return [t1 - t0, t2 - t0];
}

async function bench(name, project, count, backend) {
  const size = outputSize(project.output);
  const c = compile(project, backend, { width: size.width, height: size.height });
  const total = c.timeline.totalFrames;
  const n = Math.min(count, total);
  const frames = Array.from({ length: n }, (_, i) => Math.floor((i * total) / n));
  const types = frames.map((f) => frameType(c, f));
  const surface = backend.createSurface(c.width, c.height);
  const ctx = surface.getContext2d();

  // Warm-up: one frame of each type.
  const warmed = new Set();
  for (const [i, f] of frames.entries()) {
    if (warmed.has(types[i])) continue;
    warmed.add(types[i]);
    timeFrame(ctx, c, f, backend);
    await settle();
  }

  const byType = new Map();
  for (const [i, f] of frames.entries()) {
    const draws = [];
    const totals = [];
    for (let r = 0; r < REPEATS; r++) {
      const [draw, frame] = timeFrame(ctx, c, f, backend);
      draws.push(draw);
      totals.push(frame);
      await settle();
    }
    const entry = byType.get(types[i]) ?? { draw: [], frame: [] };
    entry.draw.push(median(draws));
    entry.frame.push(median(totals));
    byType.set(types[i], entry);
  }

  // Pipeline: what the CLI pays per frame before ffmpeg (one pass, in order,
  // one event-loop turn per frame as in the CLI).
  const p0 = performance.now();
  for (const f of frames) {
    renderFrame(ctx, c, f, backend);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    Buffer.from(data);
    await settle();
  }
  const pipelineMs = (performance.now() - p0) / n;
  const pipelineFps = 1000 / pipelineMs;

  console.log(
    `\n${name}: ${n} of ${total} frames at ${c.width}x${c.height}, ${c.profile} profile, ${c.mode} mode (median of ${REPEATS} per frame)`,
  );
  console.log(
    `  ${'type'.padEnd(13)} ${'n'.padStart(4)}  ${'draw med'.padStart(9)} ${'draw p95'.padStart(9)}  ${'frame med'.padStart(10)} ${'frame p95'.padStart(10)}  budget`,
  );
  const order = ['overview', 'stop fly', 'stop hold', 'zoom-through', 'finale', 'hold'];
  const over = [];
  let sum = 0;
  for (const type of order) {
    const entry = byType.get(type);
    if (entry === undefined) continue;
    const draw = [...entry.draw].sort((a, b) => a - b);
    const frame = [...entry.frame].sort((a, b) => a - b);
    sum += frame.reduce((a, b) => a + b, 0);
    const budget = type === 'zoom-through' ? BUDGET_MS.zoom : BUDGET_MS.frame;
    const med = quantile(frame, 0.5);
    const p95 = quantile(frame, 0.95);
    console.log(
      `  ${type.padEnd(13)} ${String(frame.length).padStart(4)}  ${quantile(draw, 0.5).toFixed(1).padStart(9)} ${quantile(draw, 0.95).toFixed(1).padStart(9)}  ${med.toFixed(1).padStart(10)} ${p95.toFixed(1).padStart(10)}  <= ${budget} ms`,
    );
    if (med > budget || p95 > budget) {
      const which = med > budget ? `median ${med.toFixed(1)} ms` : `p95 ${p95.toFixed(1)} ms`;
      over.push(`OVER BUDGET: ${name} ${type}: ${which} > ${budget} ms`);
    }
  }
  console.log(
    `  all ${n} frames: ${(sum / n).toFixed(1)} ms/frame mean, ${(1000 / (sum / n)).toFixed(1)} fps`,
  );
  console.log(
    `  pipeline (draw + readback + Buffer copy, one pass): ${pipelineMs.toFixed(1)} ms/frame, ${pipelineFps.toFixed(1)} fps (CLI target >= ${CLI_FPS_TARGET} fps)`,
  );
  if (pipelineFps < CLI_FPS_TARGET) {
    over.push(
      `OVER BUDGET: ${name} pipeline: ${pipelineFps.toFixed(1)} fps < ${CLI_FPS_TARGET} fps`,
    );
  }
  for (const line of over) console.log(line);
  return over.length;
}

const check = process.argv.includes('--check');
const seasonFrames = argValue('--frames', 200);
const europeFrames = argValue('--europe-frames', 60);
const cpu = cpus()[0]?.model?.trim() ?? 'unknown CPU';
console.log(`waycine bench: Node ${process.versions.node}, ${process.platform}, ${cpu}`);
console.log(
  `budget: 1080p frame <= ${BUDGET_MS.frame} ms, zoom-through frame <= ${BUDGET_MS.zoom} ms, CLI pipeline >= ${CLI_FPS_TARGET} fps`,
);

/** Median time of one season frame (draw + readback), to detect machine drift. */
async function calibrate(project, backend) {
  const size = outputSize(project.output);
  const c = compile(project, backend, { width: size.width, height: size.height });
  const ctx = backend.createSurface(c.width, c.height).getContext2d();
  const frame = Math.floor(c.timeline.totalFrames / 2);
  const times = [];
  for (let i = 0; i < 7; i++) {
    times.push(timeFrame(ctx, c, frame, backend)[1]);
    await settle();
  }
  return { frame, ms: median(times) };
}

const backend = createNodeBackend();
let overCount = 0;
const season = loadProject('season-2026', TEST_PROJECTS);
const before = season === undefined ? undefined : await calibrate(season, backend);
if (season === undefined) {
  console.error(`season-2026 not found under ${fileURLToPath(TEST_PROJECTS)}`);
} else {
  overCount += await bench('season-2026', season, seasonFrames, backend);
}
const europe = loadProject('europe-trip');
if (europe === undefined) {
  console.log('\neurope-trip: preset not found; skipped');
} else {
  overCount += await bench('europe-trip', europe, europeFrames, backend);
}
let drifted = false;
if (season !== undefined && before !== undefined) {
  const after = await calibrate(season, backend);
  const ratio = after.ms / before.ms;
  // The --check gate: a drift this large makes an over-budget verdict unreliable.
  drifted = ratio > DRIFT_INCONCLUSIVE || ratio < 1 / DRIFT_INCONCLUSIVE;
  console.log(
    `\nDrift: season frame ${before.frame} took ${before.ms.toFixed(1)} ms before the run and ${after.ms.toFixed(1)} ms after (x${ratio.toFixed(2)}).`,
  );
  if (ratio > DRIFT_WARNING || ratio < 1 / DRIFT_WARNING) {
    console.log(
      'WARNING: the same frame changed speed during the run, so these numbers mix fast and slow ' +
        'cores or a busy machine. On a hybrid CPU pin the bench to performance cores and run it again.',
    );
  }
}
const mb = (bytes) => Math.round(bytes / 1048576);
console.log(
  `\nMemory: RSS ${mb(process.memoryUsage().rss)} MB at the end, peak ${mb(peakRss)} MB.`,
);
console.log(
  overCount === 0 ? 'All frame types within budget.' : `${overCount} item(s) over budget.`,
);
if (check && overCount > 0) {
  if (drifted) {
    // The machine changed speed during the run (efficiency cores, a busy machine), not the engine.
    console.log('INCONCLUSIVE: rerun pinned to performance cores');
    process.exitCode = 2;
  } else {
    process.exitCode = 1;
  }
}
