import { basename } from 'node:path';
import {
  type Compiled,
  compile,
  createNodeBackend,
  outputSize,
  type TimelineSegment,
} from 'waycine/node';
import {
  boolFlag,
  EXIT_FAILURE,
  OUTPUT_OPTIONS,
  parseCommand,
  projectArg,
  readOutputOverrides,
} from '../args.js';
import type { Io } from '../io.js';
import { applyOverrides, formatIssue, loadProjectFile } from '../project.js';

export const INFO_HELP = `Usage: waycine info <project.json> [options]

Prints the output format and the timeline: every segment with its first frame,
length, last frame and time range. A project with errors prints them and exits
with code 1 (see "waycine validate").

Options:
  --aspect, --short, --size, --fps, --segments, --single, --font
                          As for "waycine render"
`;

// Supersampling changes nothing that info prints, so --ss is not accepted here.
const { ss: _ss, ...INFO_OUTPUT_OPTIONS } = OUTPUT_OPTIONS;
const OPTIONS = { ...INFO_OUTPUT_OPTIONS } as const;

/** `m:ss.mmm` for a frame count at `c.fps`. */
function clock(c: Compiled, frames: number): string {
  const secs = (frames * c.fps.den) / c.fps.num;
  const m = Math.floor(secs / 60);
  const s = secs - 60 * m;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

function segmentName(c: Compiled, seg: TimelineSegment): string {
  if (seg.kind !== 'stop') return seg.kind;
  const city = c.stops[seg.index]?.city ?? '';
  return `stop ${seg.index + 1} ${city}`.trim();
}

function segmentDetail(seg: TimelineSegment): string {
  const parts: string[] = [];
  if (seg.kind === 'stop') {
    parts.push(`fly ${seg.nFly} / hold ${seg.nHold} / zoom ${seg.nZoom}`);
  }
  if (seg.recoverFrames > 0) parts.push(`recover ${seg.recoverFrames}`);
  if (seg.outroFrames > 0) parts.push(`outro ${seg.outroFrames}`);
  if (seg.cardOutFrames > 0) parts.push(`card out ${seg.cardOutFrames}`);
  return parts.join(', ');
}

/** Pads every column of `rows` to its widest cell (numbers right-aligned). */
function table(rows: readonly string[][], right: ReadonlySet<number>): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows
    .map((row) =>
      row
        .map((cell, i) =>
          right.has(i) ? cell.padStart(widths[i] ?? 0) : cell.padEnd(widths[i] ?? 0),
        )
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

/** `waycine info`. */
export async function infoCommand(io: Io, args: readonly string[]): Promise<number> {
  const { values, positionals } = parseCommand(args, OPTIONS);
  if (boolFlag(values, 'help')) {
    io.stdout(INFO_HELP);
    return 0;
  }
  const file = projectArg('info', positionals);
  const overrides = readOutputOverrides(values);
  const { project, issues } = loadProjectFile(io, file);
  const errors = issues.filter((issue) => issue.level === 'error');
  if (errors.length > 0) {
    for (const e of errors) io.stderr(`${formatIssue(e)}\n`);
    io.stderr(`${file} has ${errors.length} error(s); fix them to see the timeline.\n`);
    return EXIT_FAILURE;
  }
  applyOverrides(io, project, overrides);
  const size = outputSize(project.output);
  const c = compile(project, createNodeBackend(), {
    width: size.width,
    height: size.height,
    mode: project.output.exportMode,
  });
  const total = c.timeline.totalFrames;
  const aspect = project.output.aspect === 'custom' ? 'custom size' : project.output.aspect;
  const name = project.meta.name !== '' ? project.meta.name : basename(file);
  const lines = [
    `Project  ${name}`,
    `Output   ${c.width}x${c.height} (${aspect}), ${project.output.fps} fps (${c.fps.num}/${c.fps.den}), ${c.profile} profile, ${c.mode} mode`,
    `Stops    ${c.stops.length} shown of ${project.stops.length}`,
    `Frames   ${total} (${clock(c, total)})`,
    `Issues   ${issues.length} warning(s), ${c.warnings.length} layout warning(s)${issues.length + c.warnings.length > 0 ? ' (see "waycine validate")' : ''}`,
    '',
  ];
  const rows = [['#', 'segment', 'start', 'frames', 'end', 'time', 'phases']];
  c.timeline.segments.forEach((seg, i) => {
    rows.push([
      String(i + 1),
      segmentName(c, seg),
      String(seg.start),
      String(seg.n),
      String(seg.start + seg.n - 1),
      `${clock(c, seg.start)}-${clock(c, seg.start + seg.n)}`,
      segmentDetail(seg),
    ]);
  });
  io.stdout(`${lines.join('\n')}${table(rows, new Set([0, 2, 3, 4]))}\n`);
  return 0;
}
