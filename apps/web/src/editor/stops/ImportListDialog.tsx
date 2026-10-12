import { useEffect, useId, useRef, useState } from 'preact/hooks';
import type { Stop } from 'waycine';
import { Dialog } from '../../app/Dialog';
import { copy } from '../../copy/en';
import { GeocoderError, lookupForImport } from '../../geo/geocoder';
import { type ImportRow, limitRows, parseStopList } from '../../state/csv';
import { commit, project } from '../../state/project';
import { newStopId, stopRoom } from '../../state/stops';
import { checkLocationStops, closeDialog, dialog, showToast, withItem } from '../../state/ui';
import { Attribution, isAbort } from './PlaceSearch';

/** Rows shown in the preview table. */
const PREVIEW_ROWS = 200;

function toStop(row: ImportRow, id: string, lat: number, lon: number): Stop {
  const stop: Stop = { id, city: row.city, lat, lon };
  if (row.date !== undefined) stop.date = row.date;
  if (row.event !== undefined) stop.event = row.event;
  if (row.partner !== undefined) stop.partner = row.partner;
  if (row.region !== undefined) stop.region = row.region;
  return stop;
}

function status(row: ImportRow): string {
  if (row.problems.length > 0) {
    return row.problems.map((p) => copy.importList.problems[p] ?? p).join('; ');
  }
  return row.lookup ? copy.importList.lookup : copy.importList.ready;
}

/**
 * "Import list...": paste or upload CSV/TSV, preview every row with its
 * problems, then add the good rows. Rows without coordinates are looked up
 * with Photon one per second (cancellable) and flagged "Check location".
 */
export function ImportListDialog() {
  const state = dialog.value;
  const open = state.kind === 'import-list';
  const textId = useId();
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notFound, setNotFound] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setText(state.kind === 'import-list' ? (state.text ?? '') : '');
      setProgress(null);
      setNotFound([]);
    }
  }, [open]);

  const parsed = parseStopList(text);
  // A video holds at most 99 stops: rows past the room left are marked, not imported.
  const room = stopRoom(replace ? 0 : project.value.stops.length);
  const rows = limitRows(parsed.rows, room);
  const usable = rows.filter((r) => r.problems.length === 0);
  const lookups = usable.filter((r) => r.lookup);
  const overLimit = rows.some((r) => r.problems.includes('over-limit'));

  const close = (): void => {
    controller.current?.abort();
    closeDialog();
  };

  const run = async (): Promise<void> => {
    const own = new AbortController();
    controller.current = own;
    const taken: Stop[] = replace ? [] : [...project.peek().stops];
    const created: Stop[] = [];
    const checkIds: string[] = [];
    const missing: string[] = [];
    let done = 0;
    setProgress({ done, total: lookups.length });
    try {
      for (const row of usable) {
        const id = newStopId([...taken, ...created]);
        if (!row.lookup && row.lat !== undefined && row.lon !== undefined) {
          created.push(toStop(row, id, row.lat, row.lon));
          continue;
        }
        let place: Awaited<ReturnType<typeof lookupForImport>>;
        try {
          place = await lookupForImport(row.city, own.signal);
        } catch (error) {
          // One failed lookup (a 503, a dropped connection) costs that row only.
          if (!(error instanceof GeocoderError)) throw error;
          place = null;
        }
        done += 1;
        setProgress({ done, total: lookups.length });
        if (place === null) {
          missing.push(row.city);
          continue;
        }
        const stop = toStop(row, id, place.lat, place.lon);
        if (row.region === undefined && place.region !== undefined) stop.region = place.region;
        if (place.regionCode !== undefined) stop.regionCode = place.regionCode;
        if (place.country !== undefined) stop.country = place.country;
        created.push(stop);
        checkIds.push(id);
      }
    } catch (error) {
      setProgress(null);
      if (isAbort(error)) {
        showToast(copy.importList.canceled);
      } else {
        showToast(copy.importList.lookupFailed);
      }
      return;
    } finally {
      controller.current = null;
    }
    const p = project.peek();
    commit({ ...p, stops: [...(replace ? [] : p.stops), ...created] });
    let check = checkLocationStops.peek();
    for (const id of checkIds) check = withItem(check, id, true);
    checkLocationStops.value = check;
    setProgress(null);
    setNotFound(missing);
    showToast(copy.importList.done(created.length, checkIds.length));
    if (missing.length === 0) closeDialog();
  };

  const running = progress !== null;
  return (
    <Dialog open={open} title={copy.importList.title} onClose={close} wide>
      <p class="fnote">{copy.importList.help}</p>
      <label class="dlg-label" for={textId}>
        {copy.importList.textLabel}
      </label>
      <textarea
        id={textId}
        class="json-text import-text"
        rows={7}
        spellcheck={false}
        value={text}
        disabled={running}
        placeholder={copy.importList.placeholder}
        onInput={(event) => setText(event.currentTarget.value)}
      />
      <div class="dlg-row">
        <button
          type="button"
          class="btn-line sm"
          disabled={running}
          onClick={() => fileInput.current?.click()}
        >
          {copy.importList.choose}
        </button>
        <input
          ref={fileInput}
          type="file"
          class="sr"
          tabIndex={-1}
          aria-hidden="true"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void file.text().then(setText);
          }}
        />
        <label class="check">
          <input
            type="checkbox"
            class="cb"
            checked={replace}
            disabled={running}
            onChange={(e) => setReplace(e.currentTarget.checked)}
          />
          <span>{copy.importList.replace}</span>
        </label>
      </div>
      {parsed.rows.length > 0 && (
        <>
          <p role="status">{copy.importList.preview(usable.length, parsed.rows.length)}</p>
          {(overLimit || room === 0) && <p class="fnote warn">{copy.importList.limit(room)}</p>}
          <div class="table-wrap">
            <table class="import-table">
              <thead>
                <tr>
                  {copy.importList.columns.map((c) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, PREVIEW_ROWS).map((row) => (
                  <tr
                    key={row.line}
                    class={row.problems.length > 0 ? 'row-error' : row.lookup ? 'row-lookup' : ''}
                  >
                    <td>{row.line}</td>
                    <td>{row.city}</td>
                    <td>{row.lat ?? ''}</td>
                    <td>{row.lon ?? ''}</td>
                    <td>{row.date ?? ''}</td>
                    <td>{row.event ?? ''}</td>
                    <td>{status(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {notFound.length > 0 && (
        <ul class="issues">
          {notFound.map((city) => (
            <li key={city} class="issue warning">
              {copy.importList.notFound(city)}
            </li>
          ))}
        </ul>
      )}
      {lookups.length > 0 && <Attribution />}
      {running && (
        <p role="status" class="import-progress">
          {copy.importList.looking(progress.done, progress.total)}
        </p>
      )}
      <div class="dialog-actions">
        {running ? (
          <button type="button" class="btn-line" onClick={() => controller.current?.abort()}>
            {copy.importList.stop}
          </button>
        ) : (
          <>
            <button type="button" class="btn-line" onClick={close}>
              {copy.importList.cancel}
            </button>
            <button
              type="button"
              class="btn-primary"
              disabled={usable.length === 0}
              onClick={() => void run()}
            >
              {copy.importList.import(usable.length)}
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}
