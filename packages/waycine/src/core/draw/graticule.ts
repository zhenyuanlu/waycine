import type { Ctx2D } from '../ctx.js';
import { gridStepAt } from '../math/ladder.js';
import { latFromMercY, mercY } from '../math/mercator.js';
import type { Cam, Compiled } from '../scene-types.js';
import type { LabelFormat } from '../schema/types.js';
import { drawText, fontPx, textWidth } from './text.js';
import { clamp, strokeLine } from './util.js';

/** Safety cap on lines per axis (a pathological zoom-out with a small step). */
const MAX_LINES = 4000;
/** Latitude limit for grid lines (Mercator diverges at the poles). */
const LAT_LIMIT = 89;
const DEGREE_SIGN = String.fromCharCode(0xb0);
/** Space kept between a grid label and a corner mark or another label, in Du. */
const LABEL_GAP_DU = 4;

/** Graticule step at zoom `z`: `baseStep / 2^(number of split thresholds <= z)` (the original's step switch). */
export function gridStep(c: Compiled, z: number): number {
  return gridStepAt(z, c.grid.baseStep, c.grid.splits);
}

/** Decimals needed to print multiples of `step` exactly (0 for whole degrees). */
function decimalsFor(step: number): number {
  for (let d = 0; d < 6; d++) {
    const s = step * 10 ** d;
    if (Math.abs(s - Math.round(s)) < 1e-6) return d;
  }
  return 6;
}

/** Longitude folded into (-180, 180]. */
function wrapLon(lon: number): number {
  let v = ((((lon + 180) % 360) + 360) % 360) - 180;
  if (v === -180) v = 180;
  return v;
}

/**
 * Hemisphere label for a major line: `plain` gives "72W", "41N", "0", "180";
 * `degree` adds a degree sign before the letter. The original always wrote
 * "W" and "N"; both agree for the season data.
 */
export function gridLabel(
  value: number,
  axis: 'lon' | 'lat',
  majorStep: number,
  format: LabelFormat,
): string {
  const v = axis === 'lon' ? wrapLon(value) : value;
  const d = decimalsFor(majorStep);
  const q = Math.round(v / majorStep) * majorStep;
  const mag = Math.abs(q).toFixed(d);
  const zero = Number(mag) === 0;
  const deg = format === 'degree' ? DEGREE_SIGN : '';
  if (zero) return `0${deg}`;
  if (axis === 'lon' && Number(mag) === 180) return `180${deg}`;
  const hemi = axis === 'lon' ? (q < 0 ? 'W' : 'E') : q < 0 ? 'S' : 'N';
  return `${mag}${deg}${hemi}`;
}

function isMajor(v: number, majorStep: number): boolean {
  const q = v / majorStep;
  return Math.abs(q - Math.round(q)) < 1e-6;
}

/**
 * Latitude/longitude grid and its labels (the original's graticule). Lines sit
 * at integer multiples of the step (integer indices, never accumulated floats);
 * latitude lines are placed in real degrees through the inverse Mercator.
 * Every line is stroked on its own, so crossings composite twice as in PIL.
 * Labels use `labelAlpha`, or are opaque with `text.solid` (as the original).
 * A label that would start left of the frame or end inside the right HUD
 * margin (`W - hud.cornerMargin`) is skipped instead of being drawn clipped
 * (new; the original drew such fragments and let "20E" run into the corner).
 * With `graticule.clearLabels` a label that would touch a corner mark or a
 * label already drawn is skipped too (new; the original drew them on top of
 * each other where a labelled line met a frame corner).
 */
export function drawGraticule(ctx: Ctx2D, c: Compiled, cam: Cam): void {
  const g = c.project.graticule;
  if (!g.show || !(cam.z > 0)) return;
  const { width: W, height: H, S } = c;
  const step = gridStep(c, cam.z);
  if (!(step > 0)) return;
  const major = c.grid.majorStep;
  const color = c.project.theme.grid;
  const lineW = g.lineWidth * S;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineW;
  ctx.lineCap = 'butt';

  const line = (x0: number, y0: number, x1: number, y1: number, isMaj: boolean): void => {
    ctx.globalAlpha = isMaj ? g.majorAlpha : g.minorAlpha;
    ctx.lineWidth = lineW;
    strokeLine(ctx, x0, y0, x1, y1);
  };
  const labelAlpha = c.project.text.solid ? 1 : g.labelAlpha;
  const labelRight = W - c.project.hud.cornerMargin * S;
  // Boxes a label must stay clear of: the four corner marks, then every label drawn.
  const taken: [number, number, number, number][] = [];
  const labelGap = LABEL_GAP_DU * S;
  if (g.clearLabels && c.project.hud.corners) {
    const m = c.project.hud.cornerMargin * S;
    const len = c.project.hud.cornerLen * S;
    taken.push(
      [m, m, m + len, m + len],
      [W - m - len, m, W - m, m + len],
      [m, H - m - len, m + len, H - m],
      [W - m - len, H - m - len, W - m, H - m],
    );
  }
  const labelH = c.fonts.anchorEm.body * fontPx(c, 'body', g.labelSize);
  const label = (text: string, x: number, y: number): void => {
    const w = textWidth(ctx, c, text, 'body', g.labelSize);
    if (x < 0 || x + w > labelRight) return;
    if (g.clearLabels) {
      const x1 = x + w;
      const y1 = y + labelH;
      for (const [bx0, by0, bx1, by1] of taken) {
        if (
          x < bx1 + labelGap &&
          x1 > bx0 - labelGap &&
          y < by1 + labelGap &&
          y1 > by0 - labelGap
        ) {
          return;
        }
      }
      taken.push([x, y, x1, y1]);
    }
    ctx.globalAlpha = labelAlpha;
    drawText(ctx, c, text, x, y, 'body', g.labelSize, 0);
  };

  // Longitude lines.
  const lon0 = cam.cx - W / 2 / cam.z;
  const lon1 = cam.cx + W / 2 / cam.z;
  const k0 = Math.floor(lon0 / step);
  const k1 = Math.min(Math.floor(lon1 / step), k0 + MAX_LINES);
  for (let k = k0; k <= k1; k++) {
    const lon = k * step;
    const maj = isMajor(lon, major);
    const sx = W / 2 + (lon - cam.cx) * cam.z;
    line(sx, 0, sx, H, maj);
    if (maj && g.labels) {
      const [dx, top] = g.lonLabelOffset;
      label(gridLabel(lon, 'lon', major, g.labelFormat), sx + dx * S, top * S);
    }
  }

  // Latitude lines in real degrees.
  const y0 = cam.cy - H / 2 / cam.z;
  const y1 = cam.cy + H / 2 / cam.z;
  const latLo = clamp(latFromMercY(y0), -LAT_LIMIT, LAT_LIMIT);
  const latHi = clamp(latFromMercY(y1), -LAT_LIMIT, LAT_LIMIT);
  const j0 = Math.floor(latLo / step);
  const j1 = Math.min(Math.floor(latHi / step), j0 + MAX_LINES);
  for (let j = j0; j <= j1; j++) {
    const lat = j * step;
    const maj = isMajor(lat, major);
    const sy = H / 2 - (mercY(lat) - cam.cy) * cam.z;
    line(0, sy, W, sy, maj);
    if (maj && g.labels) {
      const [left, dy] = g.latLabelOffset;
      label(gridLabel(lat, 'lat', major, g.labelFormat), left * S, sy + dy * S);
    }
  }
  ctx.globalAlpha = 1;
}
