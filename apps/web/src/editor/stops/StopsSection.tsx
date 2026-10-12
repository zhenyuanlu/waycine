import { useRef, useState } from 'preact/hooks';
import { MAX_STOPS, type Stop } from 'waycine';
import { UiIcon } from '../../app/icons';
import { copy } from '../../copy/en';
import { followStop, showStop } from '../../state/follow';
import { isPhone } from '../../state/media';
import { project } from '../../state/project';
import { addStop, moveStop, moveStopTo, sortByDate, stopsFull } from '../../state/stops';
import {
  checkLocationStops,
  dialog,
  expandedStop,
  focusSearchOf,
  followEdits,
  unplacedStops,
} from '../../state/ui';
import { Switch, shortDate } from '../controls';
import { MoreLink, Section } from '../Section';
import { sectionSummaries } from '../summaries';
import { MEDAL_DOT, StopEditor } from './StopEditor';

/** The region code column: `MA` from `US-MA`, or a short region name. */
function regionShort(stop: Stop): string {
  const code = stop.regionCode?.split('-')[1];
  if (code !== undefined && code !== '') return code;
  const region = stop.region ?? '';
  return region.length <= 4 ? region : '';
}

/** Medal dots shown at most before "+N". */
const MAX_DOTS = 5;

/** Stop date as the row shows it: `Jun 13`, `Jun 13–15`, or the stop's own date text. */
function rowDate(stop: Stop): string {
  if (stop.dateText !== undefined && stop.dateText !== '') return stop.dateText;
  if (stop.date === undefined) return '';
  if (stop.endDate === undefined || stop.endDate === stop.date) return shortDate(stop.date);
  const a = shortDate(stop.date);
  const b = shortDate(stop.endDate);
  return a.slice(0, 3) === b.slice(0, 3) ? `${a}–${b.slice(4)}` : `${a}–${b}`;
}

function MedalDots({ stop }: { stop: Stop }) {
  const dots = (stop.results ?? [])
    .filter((r) => r.medal !== 'none')
    .flatMap((r) => Array.from({ length: Math.max(1, Math.min(5, r.count ?? 1)) }, () => r.medal));
  if (dots.length === 0) {
    return (
      <span class="stop-res" role="img" aria-label={copy.stops.noMedals}>
        –
      </span>
    );
  }
  const names = [...new Set(dots)].map((m) => copy.enumLabels[m] ?? m).join(', ');
  return (
    <span class="stop-res" role="img" aria-label={copy.stops.medalsLabel(names)}>
      {dots.slice(0, MAX_DOTS).map((medal, i) => (
        <i
          key={i}
          class={`mdot ${medal}`}
          style={MEDAL_DOT[medal] ? { background: MEDAL_DOT[medal] } : undefined}
        />
      ))}
      {dots.length > MAX_DOTS && (
        <span class="more-dots">{copy.stops.moreDots(dots.length - MAX_DOTS)}</span>
      )}
    </span>
  );
}

function Tags({ stop }: { stop: Stop }) {
  const tags: [string, string][] = [];
  if (unplacedStops.value.has(stop.id)) tags.push(['warn', copy.stops.chipNotPlaced]);
  else if (stop.hidden === true) tags.push(['muted', copy.stops.chipHidden]);
  if (stop.city.trim() === '' && stop.hidden !== true) tags.push(['warn', copy.stops.chipNoName]);
  if (checkLocationStops.value.has(stop.id)) tags.push(['warn', copy.stops.chipCheck]);
  return (
    <>
      {tags.map(([kind, text]) => (
        <span key={text} class={`tag status-chip ${kind}`}>
          {text}
        </span>
      ))}
    </>
  );
}

interface Drag {
  id: string;
  pointerId: number;
  startY: number;
  dy: number;
  /** Midpoints (client y) of the other rows, in order. */
  mids: number[];
  from: number;
  target: number;
  /** Height of the dragged row: the rows it passes move by this much. */
  height: number;
}

/** Rows of a pasted spreadsheet selection (tab-separated, or several comma-separated lines). */
function looksLikeRows(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  return text.includes('\t') || (lines.length > 1 && lines.every((l) => l.includes(',')));
}

/**
 * 01 Stops: a tools line, a table of stop rows (number, place,
 * region code, date, medal dots) and one expanded stop at a time.
 */
export function StopsSection() {
  const p = project.value;
  const stops = p.stops;
  const expanded = expandedStop.value;
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const full = stopsFull.value;
  // Phones reorder with the action row's Move up / Move down; the number is not a handle there.
  const phone = isPhone.value;

  const toggle = (stop: Stop): void => {
    if (expandedStop.peek() === stop.id) {
      expandedStop.value = null;
      return;
    }
    expandedStop.value = stop.id;
    if (followEdits.peek()) showStop(stop.id);
  };

  const onAdd = (): void => {
    const id = addStop();
    if (id === null) return;
    expandedStop.value = id;
    focusSearchOf.value = id;
  };

  const onKeyDown = (event: KeyboardEvent, stop: Stop, index: number): void => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const delta = event.key === 'ArrowUp' ? -1 : 1;
    const target = index + delta;
    if (target < 0 || target >= stops.length) return;
    moveStop(stop.id, delta);
    followStop(stop.id);
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-stop-id="${CSS.escape(stop.id)}"] .stop-main`)
        ?.focus();
    });
  };

  const startDrag = (event: PointerEvent, stop: Stop, index: number): void => {
    if (event.button !== 0) return;
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>(':scope > .stop-row') ?? [])];
    const mids = rows
      .filter((_, i) => i !== index)
      .map((row) => {
        const r = row.getBoundingClientRect();
        return r.top + r.height / 2;
      });
    const height = rows[index]?.getBoundingClientRect().height ?? 0;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({
      id: stop.id,
      pointerId: event.pointerId,
      startY: event.clientY,
      dy: 0,
      mids,
      from: index,
      target: index,
      height,
    });
    event.preventDefault();
  };

  const moveDrag = (event: PointerEvent): void => {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const y = event.clientY;
    const target = drag.mids.filter((m) => m < y).length;
    setDrag({ ...drag, dy: y - drag.startY, target });
  };

  const endDrag = (event: PointerEvent): void => {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    setDrag(null);
    if (drag.target !== drag.from) {
      moveStopTo(drag.id, drag.target);
      followStop(drag.id);
    }
  };

  const onPaste = (event: ClipboardEvent): void => {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!looksLikeRows(text)) return;
    event.preventDefault();
    dialog.value = { kind: 'import-list', text };
  };

  return (
    <Section id="stops" summary={sectionSummaries.value.stops}>
      <div class="st-tools" onPaste={onPaste}>
        <Switch
          checked={followEdits.value}
          set={(on) => (followEdits.value = on)}
          text={copy.stops.followEdits}
          title={copy.stops.followEditsHint}
        />
        <span class="grow" />
        <button type="button" class="btn sm" disabled={stops.length < 2} onClick={sortByDate}>
          {copy.stops.sortByDate}
        </button>
        <button
          type="button"
          class="btn sm"
          onClick={() => (dialog.value = { kind: 'import-list' })}
        >
          {copy.stops.importList}
        </button>
      </div>
      {stops.length > 0 && (
        <div class="st-head cap" aria-hidden="true">
          <span class="h-no">{copy.stops.head.number}</span>
          <span>{copy.stops.head.place}</span>
          <span class="h-rc" />
          <span class="r">{copy.stops.head.date}</span>
          <span class="r h-res">{copy.stops.head.results}</span>
          <span />
        </div>
      )}
      <ol class="stop-list" ref={listRef} aria-label={copy.stops.listLabel} onPaste={onPaste}>
        {stops.map((stop, index) => {
          const open = expanded === stop.id;
          const dragging = drag?.id === stop.id;
          const city = stop.city.trim() === '' ? copy.stops.noName : stop.city;
          let shift = 0;
          if (drag !== null && !dragging) {
            // Rows between the old and new place make room for the dragged one.
            if (drag.from < index && index <= drag.target) shift = -1;
            else if (drag.target <= index && index < drag.from) shift = 1;
          }
          const number = String(index + 1).padStart(2, '0');
          return (
            <li
              key={stop.id}
              class={`stop-row${open ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}${
                stop.hidden === true ? ' is-hidden' : ''
              }`}
              data-stop-id={stop.id}
              style={
                dragging
                  ? { transform: `translateY(${drag?.dy ?? 0}px)` }
                  : shift !== 0
                    ? { transform: `translateY(${shift * (drag?.height ?? 0)}px)` }
                    : undefined
              }
              onKeyDown={(event) => onKeyDown(event, stop, index)}
            >
              {phone ? (
                <span class="grip" aria-hidden="true">
                  <span class="stop-no">{number}</span>
                </span>
              ) : (
                <button
                  type="button"
                  class="grip"
                  aria-label={copy.stops.dragHandle(index + 1)}
                  title={copy.stops.reorderHint}
                  onPointerDown={(event) => startDrag(event, stop, index)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={() => setDrag(null)}
                >
                  <span class="stop-no">{number}</span>
                  <UiIcon name="grip" size={14} />
                </button>
              )}
              <button
                type="button"
                class="stop-main"
                aria-expanded={open}
                aria-label={copy.stops.expand(index + 1, city)}
                onClick={() => toggle(stop)}
              >
                <span class="stop-place">
                  <span class="stop-l1">
                    <span class={`stop-city${stop.city.trim() === '' ? ' none' : ''}`}>{city}</span>
                    <Tags stop={stop} />
                  </span>
                  <span class="stop-event">{stop.event ?? ''}</span>
                </span>
                <span class="stop-rc">{regionShort(stop)}</span>
                <span class="stop-date">{rowDate(stop)}</span>
                <MedalDots stop={stop} />
                <UiIcon name="chevronDown" />
              </button>
              {open && <StopEditor stop={stop} index={index} count={stops.length} />}
            </li>
          );
        })}
      </ol>
      {stops.length === 0 && <p class="fnote empty">{copy.stops.empty}</p>}
      <div class="sec-actions">
        <button
          type="button"
          class="btn-line"
          disabled={full}
          aria-describedby={full ? 'stops-limit' : undefined}
          onClick={onAdd}
        >
          <UiIcon name="plus" />
          {copy.stops.add}
        </button>
        <span class="hint">{copy.stops.pasteHint}</span>
      </div>
      {full && (
        <p id="stops-limit" class="fnote warn" role="status">
          {copy.stops.limit(MAX_STOPS)}
        </p>
      )}
      <MoreLink section="stops" />
    </Section>
  );
}
