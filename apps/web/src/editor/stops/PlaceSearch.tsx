import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { UiIcon } from '../../app/icons';
import { copy } from '../../copy/en';
import { type CoordinateParse, formatCoordinates, parseCoordinates } from '../../geo/coords';
import {
  searchNominatim,
  searchPhoton,
  TYPEAHEAD_DEBOUNCE_MS,
  TYPEAHEAD_MIN_CHARS,
} from '../../geo/geocoder';
import type { Place } from '../../geo/places';
import { pause } from '../../player/player';
import { followStop, showStop } from '../../state/follow';
import { isPhone } from '../../state/media';
import { project, undo } from '../../state/project';
import { setStopCoords, setStopPlace } from '../../state/stops';
import { focusCityOf, pickTarget, showToast } from '../../state/ui';

type Status = 'idle' | 'searching' | 'done' | 'down';

/** One entry of the result list: a place, or the typed coordinates. */
type Option = { kind: 'place'; place: Place } | { kind: 'coords'; lat: number; lon: number };

/** Results shown at most (up to 5). */
const MAX_RESULTS = 5;

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * "Search data © OpenStreetMap contributors (ODbL) · Photon by komoot", always visible.
 * `children` follow on the same line (the place search adds "Pick on map").
 */
export function Attribution({ children }: { children?: ComponentChildren }) {
  return (
    <p class="attribution">
      {copy.search.attributionPrefix}{' '}
      <a class="link" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">
        {copy.search.attributionLink}
      </a>{' '}
      {copy.search.attributionSuffix}
      {children}
    </p>
  );
}

function hemi(value: number, pos: string, neg: string): string {
  return `${Math.abs(value).toFixed(2)}° ${value >= 0 ? pos : neg}`;
}

/** `42.36° N 71.06° W` */
function coordsLabel(lat: number, lon: number): string {
  return `${hemi(lat, 'N', 'S')} ${hemi(lon, 'E', 'W')}`;
}

/** The line under a place name: the rest of its label ("Massachusetts, United States"). */
function placeSub(place: Place): string {
  if (!place.label.startsWith(place.name)) return place.label;
  return place.label.slice(place.name.length).replace(/^,\s*/, '');
}

/**
 * Place search: a combobox whose results float over the fields
 * below it and never push them. Photon typeahead after 3 characters and a
 * 350 ms pause (each keystroke aborts the previous request); Enter picks the
 * highlighted result; "Search more precisely" asks Nominatim through its
 * rate-limited queue; coordinates, DMS and map links are parsed here and
 * never sent anywhere.
 *
 * Results belong to the text they were found for: while the text changes,
 * the old rows stay dimmed and cannot be picked, and Enter before the new
 * results arrive searches at once (one request) and picks the first one.
 */
export function PlaceSearch({
  stopId,
  initial,
  autoFocus,
  onGeocoderDown,
  onEnterCoordinates,
}: {
  stopId: string;
  /** The chosen place's name, shown until the user types. */
  initial: string;
  autoFocus: boolean;
  onGeocoderDown: () => void;
  /** Moves the user to the latitude and longitude fields (place search is down). */
  onEnterCoordinates: () => void;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initial);
  const [chosen, setChosen] = useState(initial);
  const [places, setPlaces] = useState<Place[]>([]);
  /** The (trimmed) text the shown places were found for. */
  const [resultsFor, setResultsFor] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<number>(0);
  const inFlightFor = useRef<string | null>(null);
  const pickOnArrival = useRef(false);

  const trimmed = query.trim();
  const coords: CoordinateParse | null = parseCoordinates(query);
  const fresh = resultsFor === trimmed;
  const shownPlaces = places.slice(0, MAX_RESULTS);
  const options: Option[] =
    coords?.kind === 'coords'
      ? [{ kind: 'coords', lat: coords.lat, lon: coords.lon }]
      : fresh
        ? shownPlaces.map((place) => ({ kind: 'place', place }))
        : [];

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  // A place picked elsewhere (the map, undo) shows its name when the field is idle.
  useEffect(() => {
    if (document.activeElement !== input.current && query === chosen) {
      setQuery(initial);
      setChosen(initial);
    }
  }, [initial]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      controller.current?.abort();
    },
    [],
  );

  const cancelPending = (): void => {
    window.clearTimeout(timer.current);
    controller.current?.abort();
    controller.current = null;
    inFlightFor.current = null;
  };

  const pick = (option: Option): void => {
    cancelPending();
    pickOnArrival.current = false;
    if (option.kind === 'coords') {
      setStopCoords(stopId, option.lat, option.lon);
      const city =
        project
          .peek()
          .stops.find((s) => s.id === stopId)
          ?.city.trim() ?? '';
      const where = formatCoordinates(option.lat, option.lon);
      if (city === '') {
        // No name yet: say where it went and take the user to the City label.
        showToast(copy.search.placedCoords(where), { label: copy.stops.undo, run: undo });
        focusCityOf.value = stopId;
      } else {
        showToast(copy.search.movedTo(city, where), { label: copy.stops.undo, run: undo });
      }
      setQuery(where);
      setChosen(where);
    } else {
      setStopPlace(stopId, option.place);
      // "Show" puts the paused preview on the new stop (Follow edits is off by default).
      showToast(copy.search.placed(option.place.name.toUpperCase()), [
        { label: copy.search.show, run: () => showStop(stopId) },
        { label: copy.stops.undo, run: undo },
      ]);
      setQuery(option.place.name);
      setChosen(option.place.name);
    }
    followStop(stopId);
    setPlaces([]);
    setResultsFor('');
    setOpen(false);
    setStatus('idle');
  };

  const run = (search: (q: string, signal: AbortSignal) => Promise<Place[]>, q: string): void => {
    cancelPending();
    const own = new AbortController();
    controller.current = own;
    const key = q.trim();
    inFlightFor.current = key;
    setStatus('searching');
    setOpen(true);
    search(q, own.signal).then(
      (found) => {
        if (own.signal.aborted) return;
        inFlightFor.current = null;
        setPlaces(found);
        setResultsFor(key);
        setHighlight(0);
        setStatus('done');
        const first = found[0];
        if (pickOnArrival.current && first !== undefined) {
          pick({ kind: 'place', place: first });
          return;
        }
        pickOnArrival.current = false;
        setOpen(true);
      },
      (error: unknown) => {
        if (isAbort(error) || own.signal.aborted) return;
        inFlightFor.current = null;
        pickOnArrival.current = false;
        setPlaces([]);
        setResultsFor('');
        setStatus('down');
        setOpen(true);
        onGeocoderDown();
      },
    );
  };

  const onInput = (text: string): void => {
    setQuery(text);
    setHighlight(0);
    cancelPending();
    pickOnArrival.current = false;
    const parsed = parseCoordinates(text);
    if (parsed !== null) {
      // Coordinates and links stay on this device.
      setStatus('idle');
      setOpen(true);
      return;
    }
    if (text.trim().length < TYPEAHEAD_MIN_CHARS) {
      setStatus('idle');
      setOpen(false);
      return;
    }
    setOpen(true);
    setStatus('searching');
    timer.current = window.setTimeout(() => run(searchPhoton, text), TYPEAHEAD_DEBOUNCE_MS);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(options.length - 1, h + 1));
    } else if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (event.key === 'Enter' || (event.key === 'Tab' && open && options.length > 0)) {
      const option = options[highlight] ?? options[0];
      if (event.key === 'Enter') event.preventDefault();
      if (option !== undefined) {
        if (event.key === 'Tab') event.preventDefault();
        pick(option);
        // A phone closes its keyboard after the pick, so the next tap lands where it aims.
        if (event.key === 'Enter' && isPhone.peek()) (event.currentTarget as HTMLElement).blur();
      } else if (
        event.key === 'Enter' &&
        coords === null &&
        trimmed.length >= TYPEAHEAD_MIN_CHARS
      ) {
        // The shown results (if any) are for older text: search now, pick on arrival.
        pickOnArrival.current = true;
        if (inFlightFor.current !== trimmed) run(searchPhoton, query);
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  const typed = trimmed.length >= TYPEAHEAD_MIN_CHARS || coords !== null;
  const coordsError =
    coords?.kind === 'error' ? (copy.search.coordsError[coords.error] ?? null) : null;
  const showList = open && typed;
  const stale = status === 'searching' && !fresh;
  // While new results load, the old rows stay (dimmed) so the list does not collapse.
  const rows: Option[] =
    options.length > 0
      ? options
      : stale
        ? shownPlaces.map((place) => ({ kind: 'place', place }))
        : [];
  const optionId = (i: number): string => `${id}-opt-${i}`;
  // Announced for screen readers; states and errors also show as rows of the list (role status).
  let message = '';
  if (status === 'searching') message = copy.search.searching;
  else if (status === 'done' && fresh && places.length > 0)
    message = copy.search.found(shownPlaces.length);

  return (
    <div class="place" ref={root}>
      <div class="combo">
        <span class={`field has-icon${showList ? ' is-open' : ''}`}>
          <UiIcon name="search" />
          <input
            ref={input}
            id={`${id}-input`}
            type="text"
            role="combobox"
            autocomplete="off"
            spellcheck={false}
            placeholder={copy.search.placeholder}
            aria-label={copy.search.label}
            aria-autocomplete="list"
            aria-expanded={showList && rows.length > 0}
            aria-controls={listId}
            aria-activedescendant={showList && options.length > 0 ? optionId(highlight) : undefined}
            aria-describedby={`${id}-status`}
            value={query}
            onInput={(event) => onInput(event.currentTarget.value)}
            onKeyDown={onKeyDown}
            onFocus={(event) => {
              event.currentTarget.select();
              if (options.length > 0 || status === 'down') setOpen(true);
            }}
            onBlur={(event) => {
              // Keep the list while focus moves within the search (to its buttons).
              const next = event.relatedTarget;
              if (!(next instanceof Node && root.current?.contains(next))) setOpen(false);
            }}
          />
          <span class="slot">
            {status === 'searching' ? (
              <span class="spin" aria-hidden="true" />
            ) : query !== '' ? (
              <button
                type="button"
                class="icon-btn sm"
                aria-label={copy.search.clear}
                title={copy.search.clear}
                onClick={() => {
                  onInput('');
                  input.current?.focus();
                }}
              >
                <UiIcon name="close" size={14} />
              </button>
            ) : null}
          </span>
        </span>
        <div class="combo-pop" hidden={!showList}>
          <div
            id={listId}
            class={`combo-list${stale ? ' is-stale' : ''}`}
            role="listbox"
            aria-label={copy.search.resultsLabel}
          >
            {rows.map((option, i) => {
              const active = i === highlight && options.length > 0;
              if (option.kind === 'coords') {
                return (
                  // Keyboard selection happens in the combobox (aria-activedescendant); options take clicks only.
                  // biome-ignore lint/a11y/useKeyWithClickEvents: see above.
                  <div
                    key="coords"
                    id={optionId(i)}
                    role="option"
                    tabIndex={-1}
                    aria-selected={active}
                    class={`opt${active ? ' is-active' : ''}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(option)}
                  >
                    <UiIcon name="pin" size={14} />
                    <span class="opt-name">
                      {copy.search.useCoords(formatCoordinates(option.lat, option.lon))}
                    </span>
                  </div>
                );
              }
              const { place } = option;
              const isChosen = place.name === chosen;
              return (
                // biome-ignore lint/a11y/useKeyWithClickEvents: see above.
                <div
                  key={`${place.lat},${place.lon},${i}`}
                  id={optionId(i)}
                  role="option"
                  tabIndex={-1}
                  aria-selected={active}
                  aria-label={place.label}
                  class={`opt${active ? ' is-active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (options.length > 0) pick(option);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                >
                  <UiIcon name={isChosen ? 'check' : 'pin'} size={14} />
                  <span class="opt-name">{place.name}</span>
                  <span class="opt-sub">{placeSub(place)}</span>
                  <span class="opt-co">{coordsLabel(place.lat, place.lon)}</span>
                </div>
              );
            })}
          </div>
          {rows.length === 0 && (
            <div class="combo-state" role="status">
              {status === 'down' ? (
                <>
                  <p>{copy.search.down}</p>
                  <button type="button" class="btn-line sm" onClick={onEnterCoordinates}>
                    {copy.search.enterCoords}
                  </button>
                </>
              ) : coordsError !== null ? (
                <p>{coordsError}</p>
              ) : status === 'done' && fresh ? (
                <p>{copy.search.noResults}</p>
              ) : (
                <p class="muted">{copy.search.searching}</p>
              )}
            </div>
          )}
          {coords === null && <p class="combo-paste">{copy.search.orPaste}</p>}
          <div class="combo-foot">
            <span>{fresh && status === 'done' ? copy.search.count(shownPlaces.length) : ''}</span>
            <button
              type="button"
              class="link sm"
              disabled={
                trimmed.length < TYPEAHEAD_MIN_CHARS || coords !== null || status === 'searching'
              }
              title={copy.search.preciseHint}
              onClick={() => run(searchNominatim, trimmed)}
            >
              {copy.search.precise}
            </button>
          </div>
        </div>
      </div>
      <Attribution>
        {' · '}
        <button
          type="button"
          class="link"
          title={copy.search.pickOnMapHint}
          onClick={() => {
            pause();
            pickTarget.value = stopId;
          }}
        >
          {copy.search.pickOnMap}
        </button>
      </Attribution>
      <p id={`${id}-status`} class="sr" role="status">
        {message}
      </p>
    </div>
  );
}
