import type { Ctx2D } from '../ctx.js';
import type { Compiled, StatsState } from '../scene-types.js';
import { drawText, textWidth, trackedWidth } from './text.js';
import { fade } from './util.js';

/** Minimum gap between a number and its label, in Du (overflow rule). */
const LABEL_GAP = 12;
/** Minimum gap between row items, in Du (overflow rule). */
const ITEM_GAP = 60;

/** One laid-out finale stat, positions in output px (PIL "la" anchors). */
export interface StatPlacement {
  /** Number as drawn. */
  value: string;
  /** Label as drawn. */
  label: string;
  /** Number anchor x. */
  x: number;
  /** Number anchor y. */
  y: number;
  /** Label anchor x. */
  labelX: number;
  /** Label anchor y. */
  labelY: number;
  /** Eased item alpha `fadeEasing(u * statsRate - j * statsStagger)`, 0..1. */
  eased: number;
}

/** Height in Du a stats column may reach below the safe-area top (overflow rule). */
const COLUMN_SPAN = 480;

/**
 * Finale stats geometry (the original's landscape row and portrait column):
 * item j's number sits at the item origin and its label at `(labelDx,
 * labelDy)` from it; rows advance by `pitch`, columns by `pitch`. Overflow
 * rules (new, inactive for the season): `labelDx >= numberWidth + 12`, row
 * pitch `>= itemWidth + 60`, a row wraps one `numberSize` down when the
 * next item would pass `W - x`, and a column wraps into a new column (at the
 * widest item of the previous one + 60, from `y` again) when an item's number
 * would end below `safeArea.top * H + 480` Du, so extra items never run into
 * the route area. `ctx` measures the texts.
 */
export function statsLayout(ctx: Ctx2D, c: Compiled, u: number): StatPlacement[] {
  const P = c.project.stats;
  const L = c.layout.stats;
  const F = c.project.timing.finale;
  const S = c.S;
  const rightDu = c.width / S - L.x;
  const columnEnd = (c.layout.safeArea.top * c.height) / S + COLUMN_SPAN;
  const out: StatPlacement[] = [];
  let x = L.x;
  let y = L.y;
  let rowStart = true;
  let columnW = 0;
  for (let j = 0; j < c.stats.length; j++) {
    const item = c.stats[j];
    if (item === undefined) continue;
    const numW = textWidth(ctx, c, item.value, 'display', L.numberSize) / S;
    const labelDx = Math.max(L.labelDx, numW + LABEL_GAP);
    const labelW = trackedWidth(ctx, c, item.label, 'display', P.labelSize, P.labelTracking) / S;
    const itemW = labelDx + labelW;
    if (L.direction === 'row' && !rowStart && x + itemW > rightDu) {
      x = L.x;
      y += L.numberSize;
    }
    if (L.direction === 'column' && !rowStart && y + L.numberSize > columnEnd) {
      x += columnW + ITEM_GAP;
      y = L.y;
      columnW = 0;
    }
    columnW = Math.max(columnW, itemW);
    out.push({
      value: item.value,
      label: item.label,
      x: x * S,
      y: y * S,
      labelX: (x + labelDx) * S,
      labelY: (y + L.labelDy) * S,
      eased: fade(c, u * F.statsRate - j * F.statsStagger),
    });
    rowStart = false;
    if (L.direction === 'row') {
      x += Math.max(L.pitch, itemW + ITEM_GAP);
    } else {
      y += L.pitch;
    }
  }
  return out;
}

/**
 * Finale stats: draws `statsLayout`. Item alpha is its eased alpha, or, with
 * `text.solid`, the item pops in opaque once `floor(255 * alpha) >= 1` (the
 * original's text ignored its alpha and skipped items whose 8-bit alpha was
 * 0). Numbers use the display font and `theme.text` without tracking; labels
 * the display font, `theme.accent` and `labelTracking`.
 */
export function drawStats(ctx: Ctx2D, c: Compiled, stats: StatsState | null): void {
  const P = c.project.stats;
  if (stats === null || !P.show || !(stats.u > 0)) return;
  const L = c.layout.stats;
  const theme = c.project.theme;
  for (const item of statsLayout(ctx, c, stats.u)) {
    const a = c.project.text.solid ? (Math.floor(255 * item.eased) > 0 ? 1 : 0) : item.eased;
    if (!(a > 0)) continue;
    ctx.globalAlpha = a;
    ctx.fillStyle = theme.text;
    drawText(ctx, c, item.value, item.x, item.y, 'display', L.numberSize, 0);
    ctx.fillStyle = theme.accent;
    drawText(ctx, c, item.label, item.labelX, item.labelY, 'display', P.labelSize, P.labelTracking);
  }
  ctx.globalAlpha = 1;
}
