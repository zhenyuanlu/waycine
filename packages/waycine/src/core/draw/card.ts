import type { Ctx2D } from '../ctx.js';
import type { CardState, Compiled } from '../scene-types.js';
import type { Medal } from '../schema/types.js';
import { drawMedal } from './pin-labels.js';
import { drawText, type FontRole, fontPx, trackedWidth } from './text.js';
import { fade, fillSoftRect, type Pt, pinPoint, strokeLine } from './util.js';

/** One text of a laid-out overlay: anchor in output px (PIL "la": x left, y top of the ascent line). */
export interface PlacedText {
  /** Text as drawn. */
  text: string;
  /** Left edge in px. */
  x: number;
  /** Ascender-anchor y in px. */
  y: number;
  /** Size in Du. */
  size: number;
  /** Tracking in Du. */
  tracking: number;
  /** Font role. */
  role: FontRole;
  /** Theme colour key. */
  color: 'text' | 'accent';
  /** Alpha 0..1 of the fading model (slot alpha times the shape alpha); `text.solid` overrides it when drawing. */
  alpha: number;
}

/** One result row of a card: medal and text. */
export interface PlacedResult {
  /** Medal kind. */
  medal: Medal;
  /** Medal centre x in px. */
  medalX: number;
  /** Medal centre y in px. */
  medalY: number;
  /** Medal radius in Du. */
  medalR: number;
  /** Result text. */
  text: PlacedText;
}

/** Card geometry for one frame: everything `drawCard` draws, in output px. */
export interface CardLayout {
  /** Shape alpha `fadeEasing(u) * card.alpha` (leader, bar, medals). */
  alpha: number;
  /** Pin centre on the anchor camera. */
  pin: Pt;
  /** Card origin x (after the slide). */
  lx: number;
  /** Card origin y. */
  ly: number;
  /** Leader line `[x0, y0, x1, y1]`, or null when disabled. */
  leader: [number, number, number, number] | null;
  /** Accent bar `[x, y, w, h]`. */
  bar: [number, number, number, number];
  /** Kicker, city, event, date and partner lines in draw order (hidden or empty ones omitted). */
  texts: PlacedText[];
  /** Result rows in draw order. */
  results: PlacedResult[];
}

/**
 * Card geometry (the original's landscape `rightOfPin` card and portrait
 * `belowPin` card), positioned from `card.anchorCam` (the stop's end camera)
 * in every phase. `e = fadeEasing(u)`, shape alpha `a = e * card.alpha`, slide
 * `(1 - e) * card.slide` Du. Origin: `rightOfPin` `(x + layout.x + slide,
 * y + layout.dy)`; `belowPin` `(layout.x + slide, y + layout.dy)`. The leader
 * runs from the pin + `leaderFrom` to `diagonal`: origin + `leaderTo`, or
 * `vertical`: (pin x, origin y) + `leaderTo`. Bar height `base + (partner ?
 * barPartner : 0) + (resultsBarPerRow ? perResult * results : perResult)`.
 * Partner lines stack by `partnerLineH`; results run inline (advance `textDx +
 * getlength + tracking * len + inlineGap`) or stacked (`resultRowH`). `ctx` is
 * only used to measure inline results. Returns null when there is no card.
 */
export function cardLayout(ctx: Ctx2D, c: Compiled, card: CardState | null): CardLayout | null {
  const K = c.project.card;
  if (card === null || !K.show) return null;
  const stop = c.stops[card.stop];
  if (stop === undefined) return null;
  const S = c.S;
  const lay = c.layout.card;
  const e = fade(c, card.u);
  const a = e * card.alpha;
  const p = pinPoint(c, card.stop, card.anchorCam);
  const slide = (1 - e) * K.slide;
  const lx = lay.placement === 'rightOfPin' ? p.x + (lay.x + slide) * S : (lay.x + slide) * S;
  const ly = p.y + lay.dy * S;

  let leader: CardLayout['leader'] = null;
  if (K.leaderWidth > 0 && K.leaderAlpha > 0) {
    const [fx, fy] = lay.leaderFrom;
    const [tx, ty] = lay.leaderTo;
    const endX = lay.leader === 'diagonal' ? lx + tx * S : p.x + tx * S;
    leader = [p.x + fx * S, p.y + fy * S, endX, ly + ty * S];
  }

  const partner = K.showPartner ? stop.partnerLines.filter((l) => l !== '') : [];
  const results = K.showResults ? stop.results : [];
  let bar = K.bar.base;
  if (partner.length > 0) bar += lay.barPartner;
  if (results.length > 0)
    bar += lay.resultsBarPerRow ? K.bar.perResult * results.length : K.bar.perResult;

  const texts: PlacedText[] = [];
  const place = (
    text: string,
    slot: { dx: number; dy: number; tracking: number; alpha: number },
    size: number,
    role: FontRole,
    color: PlacedText['color'],
  ): void => {
    texts.push({
      text,
      x: lx + slot.dx * S,
      y: ly + slot.dy * S,
      size,
      tracking: slot.tracking,
      role,
      color,
      alpha: a * slot.alpha,
    });
  };
  if (K.showKicker && stop.kicker !== '') {
    place(stop.kicker, K.kicker, K.kicker.size, 'body', 'accent');
  }
  place(stop.city, K.city, stop.citySize, 'display', 'text');
  if (K.showEvent && stop.event !== '') place(stop.event, K.event, stop.eventSize, 'body', 'text');
  if (K.showDate && stop.cardDate !== '') {
    place(stop.cardDate, K.date, K.date.size, 'body', 'accent');
  }

  const line = K.line;
  let yy = ly + K.rowsY * S;
  for (const text of partner) {
    texts.push({
      text,
      x: lx + line.dx * S,
      y: yy,
      size: line.size,
      tracking: line.tracking,
      role: 'body',
      color: 'text',
      alpha: a * line.alpha,
    });
    yy += line.partnerLineH * S;
  }

  const placed: PlacedResult[] = [];
  let xx = lx + line.dx * S;
  for (const res of results) {
    placed.push({
      medal: res.medal,
      medalX: xx + line.medalDx * S,
      medalY: yy + line.medalDy * S,
      medalR: line.medalR,
      text: {
        text: res.text,
        x: xx + line.textDx * S,
        y: yy,
        size: line.size,
        tracking: line.tracking,
        role: 'body',
        color: 'text',
        alpha: a * line.alpha,
      },
    });
    if (lay.results === 'inline') {
      // The original's inline advance: 26 + getlength(text) + tracking * len(text) + 26 (len, not len - 1).
      const w = trackedWidth(ctx, c, res.text, 'body', line.size, line.tracking);
      xx += (line.textDx + line.inlineGap) * S + w;
    } else {
      yy += line.resultRowH * S;
    }
  }

  return {
    alpha: a,
    pin: p,
    lx,
    ly,
    leader,
    bar: [lx + K.barDx * S, ly, K.barWidth * S, bar * S],
    texts,
    results: placed,
  };
}

/** Space around the card's contents that the backdrop covers at full strength, in Du: [x, y]. */
const BACKDROP_PAD_DU = [22, 18] as const;
/** Width of the backdrop's soft edge in Du, and the number of steps it is drawn in. */
const BACKDROP_FEATHER_DU = 32;
const BACKDROP_STEPS = 8;
/** Room below a baseline for descenders, as a fraction of the font size. */
const DESCENT_EM = 0.24;

/**
 * Card backdrop (new; the original had none, so an earlier leg of the route
 * could run through the card's text): a soft-edged plate in the background
 * colour under everything the card draws but its leader, at `card.backdrop`
 * times the card's shape alpha. Drawn after the route and before the pins, so
 * it dims the route, its glow and the grid, and leaves pins and rings alone.
 */
export function drawCardBackdrop(ctx: Ctx2D, c: Compiled, card: CardState | null): void {
  const strength = Math.min(1, c.project.card.backdrop);
  if (!(strength > 0)) return;
  const L = cardLayout(ctx, c, card);
  if (L === null || !(L.alpha > 0)) return;
  const S = c.S;
  let x0 = L.bar[0];
  let y0 = L.bar[1];
  let x1 = L.bar[0] + L.bar[2];
  let y1 = L.bar[1] + L.bar[3];
  const cover = (t: PlacedText): void => {
    const px = fontPx(c, t.role, t.size);
    x0 = Math.min(x0, t.x);
    y0 = Math.min(y0, t.y);
    x1 = Math.max(x1, t.x + trackedWidth(ctx, c, t.text, t.role, t.size, t.tracking));
    y1 = Math.max(y1, t.y + (c.fonts.anchorEm[t.role] + DESCENT_EM) * px);
  };
  for (const t of L.texts) cover(t);
  for (const r of L.results) {
    cover(r.text);
    x0 = Math.min(x0, r.medalX - r.medalR * S);
    y0 = Math.min(y0, r.medalY - r.medalR * S);
    y1 = Math.max(y1, r.medalY + r.medalR * S);
  }
  const [padX, padY] = BACKDROP_PAD_DU;
  x0 -= padX * S;
  x1 += padX * S;
  y0 -= padY * S;
  y1 += padY * S;
  ctx.fillStyle = c.project.theme.background;
  fillSoftRect(ctx, x0, y0, x1, y1, BACKDROP_FEATHER_DU * S, BACKDROP_STEPS, strength * L.alpha);
  ctx.globalAlpha = 1;
}

/**
 * Stop card: draws `cardLayout`. Shapes (leader, accent bar, medals) use the
 * shape alpha; text uses its slot alpha times the shape alpha, or, with
 * `text.solid`, just `card.alpha`: opaque from the first card frame while it
 * slides in, as the original drew it.
 */
export function drawCard(ctx: Ctx2D, c: Compiled, card: CardState | null): void {
  const L = cardLayout(ctx, c, card);
  if (L === null || card === null) return;
  const solid = c.project.text.solid;
  const a = L.alpha;
  if (!(solid ? card.alpha > 0 : a > 0)) return;
  const K = c.project.card;
  const theme = c.project.theme;
  const textAlpha = (t: PlacedText): number => (solid ? card.alpha : t.alpha);

  // Leader line (white in the original; follows theme.text).
  if (a > 0 && L.leader !== null) {
    ctx.globalAlpha = a * K.leaderAlpha;
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = K.leaderWidth * c.S;
    ctx.lineCap = 'butt';
    strokeLine(ctx, ...L.leader);
  }
  if (a > 0) {
    ctx.globalAlpha = a;
    ctx.fillStyle = theme.accent;
    ctx.fillRect(...L.bar);
  }
  for (const t of L.texts) {
    ctx.globalAlpha = textAlpha(t);
    ctx.fillStyle = theme[t.color];
    drawText(ctx, c, t.text, t.x, t.y, t.role, t.size, t.tracking);
  }
  for (const r of L.results) {
    drawMedal(ctx, c, r.medalX, r.medalY, r.medal, r.medalR, a);
    ctx.globalAlpha = textAlpha(r.text);
    ctx.fillStyle = theme.text;
    drawText(ctx, c, r.text.text, r.text.x, r.text.y, 'body', r.text.size, r.text.tracking);
  }
  ctx.globalAlpha = 1;
}
