import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { FIELD_BY_PATH, MAX_LAT, MAX_STOPS, MEDALS, type Medal, type Stop } from 'waycine';
import { UiIcon } from '../../app/icons';
import { copy } from '../../copy/en';
import { followStop, showStop } from '../../state/follow';
import { project } from '../../state/project';
import {
  addResult,
  deleteStop,
  duplicateStop,
  moveStop,
  removeResult,
  restoreStop,
  setStopCoords,
  setStopField,
  stopsFull,
  toggleHidden,
  updateResult,
} from '../../state/stops';
import { expandedStop, focusCityOf, focusSearchOf, showToast, unplacedStops } from '../../state/ui';
import { DateField, FALLBACK_YEAR, NumberField, Seg, Select, Switch, TextField } from '../controls';
import { optionLabel } from '../FieldControl';
import { FormRow } from '../Section';
import { PlaceSearch } from './PlaceSearch';

/** Medal colours as the chrome shows them (data, not decoration). */
export const MEDAL_DOT: Readonly<Record<string, string>> = {
  gold: '#D9AE3F',
  silver: '#B9BFC8',
  bronze: '#C07F50',
};

type TextKey = 'city' | 'event' | 'partner' | 'dateText' | 'region' | 'regionCode' | 'country';

/** A text field bound to one stop field; empty optional fields are removed from the stop. */
function StopText({
  stop,
  field,
  label,
  placeholder,
  inputRef,
}: {
  stop: Stop;
  field: TextKey;
  label: string;
  placeholder?: string;
  inputRef?: { current: HTMLInputElement | null };
}) {
  const id = useId();
  return (
    <FormRow label={label} htmlFor={id} labelId={`${id}-l`}>
      <span data-field={`stops[].${field}`}>
        <TextField
          id={id}
          value={stop[field] ?? ''}
          placeholder={placeholder}
          inputRef={inputRef}
          set={(text) => {
            setStopField(stop.id, field, text);
            followStop(stop.id);
          }}
        />
      </span>
    </FormRow>
  );
}

function fallbackYear(stop: Stop): number {
  const year = Number(
    (stop.date ?? project.peek().stops.find((s) => s.date)?.date ?? '').slice(0, 4),
  );
  return Number.isFinite(year) && year > 1000 ? year : FALLBACK_YEAR;
}

/** Date, with "End date" added on request (a range). */
function StopDates({ stop }: { stop: Stop }) {
  const id = useId();
  const [withEnd, setWithEnd] = useState(stop.endDate !== undefined);
  const year = fallbackYear(stop);
  return (
    <FormRow label={copy.stops.date} labelId={`${id}-l`}>
      <span class="frow dates">
        <span data-field="stops[].date">
          <DateField
            id={id}
            value={stop.date}
            label={copy.stops.date}
            fallbackYear={year}
            set={(iso) => {
              setStopField(stop.id, 'date', iso);
              followStop(stop.id);
            }}
          />
        </span>
        {withEnd || stop.endDate !== undefined ? (
          <span class="frow" data-field="stops[].endDate">
            <DateField
              value={stop.endDate}
              label={copy.stops.endDate}
              fallbackYear={year}
              min={stop.date}
              set={(iso) => {
                setStopField(stop.id, 'endDate', iso);
                followStop(stop.id);
              }}
            />
            <button
              type="button"
              class="icon-btn sm"
              aria-label={copy.stops.removeEndDate}
              title={copy.stops.removeEndDate}
              onClick={() => {
                setWithEnd(false);
                setStopField(stop.id, 'endDate', undefined);
              }}
            >
              <UiIcon name="close" size={14} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            class="btn sm"
            data-field="stops[].endDate"
            onClick={() => setWithEnd(true)}
          >
            <UiIcon name="plus" size={14} />
            {copy.stops.addEndDate}
          </button>
        )}
      </span>
    </FormRow>
  );
}

function Results({ stop }: { stop: Stop }) {
  const results = stop.results ?? [];
  const medalOptions = MEDALS.map((m) => ({ value: m, label: optionLabel(m) }));
  return (
    <>
      <p class="sub-h cap span-2" aria-hidden="true">
        {copy.stops.results}
      </p>
      <fieldset class="res-list span-2" aria-label={copy.stops.results}>
        {results.map((result, i) => (
          <div key={i} class="res-row">
            <span data-field="stops[].results[].medal">
              <Select
                class="medal"
                options={medalOptions}
                value={result.medal}
                label={`${copy.stops.medal} ${i + 1}`}
                lead={
                  <i
                    class={`mdot ${result.medal}`}
                    aria-hidden="true"
                    style={
                      MEDAL_DOT[result.medal] ? { background: MEDAL_DOT[result.medal] } : undefined
                    }
                  />
                }
                set={(medal: Medal) => {
                  updateResult(stop.id, i, { medal });
                  followStop(stop.id);
                }}
              />
            </span>
            <span data-field="stops[].results[].text">
              <TextField
                value={result.text}
                label={`${copy.stops.resultText} ${i + 1}`}
                placeholder={copy.stops.resultPlaceholder}
                set={(text) => {
                  updateResult(stop.id, i, { text });
                  followStop(stop.id);
                }}
              />
            </span>
            <span data-field="stops[].results[].count" title={copy.stops.countHint}>
              <NumberField
                class="count"
                value={result.count ?? 1}
                min={1}
                max={5}
                step={1}
                axis="×"
                label={`${copy.stops.dots} ${i + 1}`}
                set={(n) => updateResult(stop.id, i, { count: Math.round(n) })}
              />
            </span>
            <button
              type="button"
              class="icon-btn sm"
              aria-label={copy.stops.removeResult(i + 1)}
              title={copy.stops.removeResult(i + 1)}
              onClick={() => removeResult(stop.id, i)}
            >
              <UiIcon name="close" size={14} />
            </button>
          </div>
        ))}
        <button type="button" class="btn sm add-res" onClick={() => addResult(stop.id)}>
          <UiIcon name="plus" size={14} />
          {copy.stops.addResult}
        </button>
      </fieldset>
    </>
  );
}

/** Coordinates as a Lat / Lon pair; valid values apply at once, the range is said in words. */
function Coordinates({
  stop,
  latRef,
}: {
  stop: Stop;
  latRef: { current: HTMLInputElement | null };
}) {
  const id = useId();
  return (
    <FormRow label={copy.stops.coordinates} labelId={`${id}-l`}>
      <fieldset class="tuple" aria-labelledby={`${id}-l`}>
        <span data-field="stops[].lat">
          <NumberField
            value={stop.lat}
            min={-MAX_LAT}
            max={MAX_LAT}
            step={FIELD_BY_PATH.get('stops[].lat')?.step ?? 0.0001}
            axis={copy.stops.latShort}
            label={copy.stops.lat}
            errorText={copy.stops.latError}
            inputRef={latRef}
            rangeBar={false}
            set={(lat) => {
              setStopCoords(stop.id, lat, stop.lon);
              followStop(stop.id);
            }}
          />
        </span>
        <span data-field="stops[].lon">
          <NumberField
            value={stop.lon}
            min={-180}
            max={180}
            step={FIELD_BY_PATH.get('stops[].lon')?.step ?? 0.0001}
            axis={copy.stops.lonShort}
            unit="°"
            label={copy.stops.lon}
            errorText={copy.stops.lonError}
            rangeBar={false}
            set={(lon) => {
              setStopCoords(stop.id, stop.lat, lon);
              followStop(stop.id);
            }}
          />
        </span>
      </fieldset>
    </FormRow>
  );
}

/** Own length: Auto (the Timing section's stop length) or a number of seconds. */
function OwnLength({ stop }: { stop: Stop }) {
  const id = useId();
  const field = FIELD_BY_PATH.get('stops[].durationSec');
  const auto = stop.durationSec === undefined;
  const fallback = project.value.timing.stopSec;
  return (
    <FormRow label={copy.stops.ownLength} labelId={`${id}-l`} note={copy.stops.ownLengthHint}>
      <span class="nullable" data-field="stops[].durationSec">
        <Seg
          labelledBy={`${id}-l`}
          options={[
            { value: true, label: copy.editor.auto },
            { value: false, label: copy.editor.customValue },
          ]}
          value={auto}
          set={(nextAuto) => setStopField(stop.id, 'durationSec', nextAuto ? undefined : fallback)}
        />
        <NumberField
          value={auto ? null : (stop.durationSec ?? fallback)}
          min={field?.min ?? 0.1}
          max={field?.max ?? 60}
          step={field?.step ?? 0.1}
          unit="s"
          label={copy.stops.ownLength}
          disabled={auto}
          placeholder={copy.editor.autoPlaceholder(String(fallback.toFixed(2)))}
          rangeBar={false}
          set={(n) => setStopField(stop.id, 'durationSec', n)}
        />
      </span>
    </FormRow>
  );
}

/** Compact actions: move, duplicate, hide and delete, with the stop's place and length. */
function ActionRow({ stop, index, count }: { stop: Stop; index: number; count: number }) {
  const full = stopsFull.value;
  const seconds = (stop.durationSec ?? project.value.timing.stopSec).toFixed(2);
  const city = stop.city.trim() === '' ? copy.stops.noName : stop.city;
  const focusRow = (id: string): void => {
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-stop-id="${CSS.escape(id)}"] .stop-main`)?.focus();
    });
  };
  return (
    <fieldset class="stop-foot span-2" aria-label={copy.stops.actionsLabel(index + 1)}>
      <span class="stop-pos">{copy.stops.position(index + 1, count, seconds)}</span>
      <span class="grow" />
      <button
        type="button"
        class="icon-btn"
        aria-label={copy.stops.showInPreview}
        title={copy.stops.showInPreview}
        disabled={stop.hidden === true}
        onClick={() => showStop(stop.id)}
      >
        <UiIcon name="locate" />
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label={copy.stops.moveUp}
        title={copy.stops.moveUp}
        disabled={index === 0}
        onClick={() => {
          moveStop(stop.id, -1);
          followStop(stop.id);
        }}
      >
        <UiIcon name="up" />
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label={copy.stops.moveDown}
        title={copy.stops.moveDown}
        disabled={index === count - 1}
        onClick={() => {
          moveStop(stop.id, 1);
          followStop(stop.id);
        }}
      >
        <UiIcon name="down" />
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label={copy.stops.duplicate}
        title={full ? copy.stops.limit(MAX_STOPS) : copy.stops.duplicate}
        disabled={full}
        onClick={() => duplicateStop(stop.id)}
      >
        <UiIcon name="duplicate" />
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label={copy.stops.hidden}
        title={copy.stops.hidden}
        aria-pressed={stop.hidden === true}
        onClick={() => toggleHidden(stop.id)}
      >
        <UiIcon name={stop.hidden === true ? 'eyeOff' : 'eye'} />
      </button>
      <button
        type="button"
        class="icon-btn danger"
        aria-label={copy.stops.delete}
        title={copy.stops.delete}
        onClick={() => {
          const removed = deleteStop(stop.id);
          if (removed === null) return;
          expandedStop.value = null;
          const next = project.peek().stops[Math.min(index, project.peek().stops.length - 1)];
          if (next !== undefined) focusRow(next.id);
          showToast(copy.stops.deleted(city), {
            label: copy.stops.undo,
            run: () => restoreStop(removed.stop, removed.index),
          });
        }}
      >
        <UiIcon name="trash" />
      </button>
    </fieldset>
  );
}

/** The expanded editor of one stop. */
export function StopEditor({ stop, index, count }: { stop: Stop; index: number; count: number }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const latInput = useRef<HTMLInputElement | null>(null);
  const cityInput = useRef<HTMLInputElement | null>(null);
  const moreId = useId();
  const autoFocus = focusSearchOf.value === stop.id;
  useEffect(() => {
    if (autoFocus) focusSearchOf.value = null;
  }, [autoFocus]);
  const unplaced = unplacedStops.value.has(stop.id);
  const open = moreOpen || unplaced;

  // The City label takes focus when asked (placed by coordinates, "Go to stop N").
  const focusCity = focusCityOf.value === stop.id;
  useEffect(() => {
    if (!focusCity) return;
    focusCityOf.value = null;
    requestAnimationFrame(() => {
      cityInput.current?.focus();
      cityInput.current?.scrollIntoView({ block: 'center' });
    });
  }, [focusCity]);

  // Place search is down: open "More for this stop" and take the user to Latitude.
  const enterCoordinates = (): void => {
    setMoreOpen(true);
    requestAnimationFrame(() => {
      latInput.current?.focus();
      latInput.current?.scrollIntoView({ block: 'center' });
    });
  };
  const id = useId();
  return (
    <div class="stop-detail fgrid">
      <FormRow label={copy.stops.place} labelId={`${id}-place`}>
        <PlaceSearch
          stopId={stop.id}
          initial={stop.city}
          autoFocus={autoFocus}
          onGeocoderDown={() => setMoreOpen(true)}
          onEnterCoordinates={enterCoordinates}
        />
      </FormRow>
      <StopText stop={stop} field="city" label={copy.stops.city} inputRef={cityInput} />
      <StopText stop={stop} field="event" label={copy.stops.event} />
      <StopDates stop={stop} />
      <StopText
        stop={stop}
        field="partner"
        label={copy.stops.partner}
        placeholder={copy.stops.partnerPlaceholder}
      />
      <Results stop={stop} />
      <button
        type="button"
        class="disclose span-2"
        aria-expanded={open}
        aria-controls={moreId}
        onClick={() => setMoreOpen(!open)}
      >
        <span>{copy.stops.more}</span>
        <span class="muted">{copy.stops.moreSummary}</span>
        <UiIcon name="chevronDown" />
      </button>
      <div id={moreId} class="more-body span-2 fgrid" hidden={!open}>
        <Coordinates stop={stop} latRef={latInput} />
        <StopText stop={stop} field="region" label={copy.stops.region} />
        <StopText stop={stop} field="regionCode" label={copy.stops.regionCode} />
        <StopText stop={stop} field="country" label={copy.stops.country} />
        <StopText
          stop={stop}
          field="dateText"
          label={copy.stops.dateText}
          placeholder={copy.stops.dateTextPlaceholder}
        />
        <OwnLength stop={stop} />
        <FormRow label="" labelId={`${id}-hide`}>
          <span data-field="stops[].hidden">
            <Switch
              checked={stop.hidden === true}
              set={(on) => setStopField(stop.id, 'hidden', on ? true : undefined)}
              text={copy.stops.hidden}
            />
          </span>
        </FormRow>
        <FormRow label={copy.stops.stopId} labelId={`${id}-sid`}>
          <span class="readonly" data-field="stops[].id">
            {stop.id}
          </span>
        </FormRow>
      </div>
      <ActionRow stop={stop} index={index} count={count} />
    </div>
  );
}
