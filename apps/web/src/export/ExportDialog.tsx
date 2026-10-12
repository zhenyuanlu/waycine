import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ASPECTS,
  type Aspect,
  canSupersample,
  fpsRational,
  type LadderCandidate,
  QUALITIES,
  type Quality,
  type WaycineProject,
} from 'waycine/browser';
import { UiIcon } from '../app/icons';
import { copy } from '../copy/en';
import { exportCopy } from '../copy/export-en';
import { Seg, Switch } from '../editor/controls';
import { formatBytes, formatClock, formatEta } from '../player/time';
import { isPhone } from '../state/media';
import { setValue } from '../state/project';
import { planRoute, recorderCodec, streamCodec } from './capabilities';
import {
  Banner,
  failureMessage,
  formatName,
  PartsBar,
  type Probed,
  shareLabel,
  Tech,
} from './dialog-parts';
import {
  cancelExport,
  type ExportKind,
  type ExportRequest,
  exportState,
  resetExport,
  resetStill,
  saveStill,
  setThumbnailCanvas,
  startExport,
  stillState,
  THUMBNAIL_WIDTH,
} from './exporter';
import { exportFileName } from './filename';
import {
  aspectLabel,
  bitrateFor,
  durationSec,
  estimateBytes,
  fixedBitrateMbps,
  formatEstimate,
  formatFps,
  index720,
  percentStep,
  profileOf,
  projectSizeIndex,
  realtimeFactor,
  sizeOptions,
} from './plan';
import { timelineInfo } from './timeline-info';
import './export.css';

export interface ExportDialogProps {
  /** The project to export. */
  project: WaycineProject;
  /** Shows the dialog (modal) while true. */
  open: boolean;
  /** Called when the dialog asks to close (Close, Escape when idle). */
  onClose(): void;
  /** Timeline frame shown in the player, for "Save frame as PNG". Default 0. */
  currentFrame?: number;
}

/** Formats offered by the dialog's Format row (custom sizes are set in All settings). */
const FORMATS: readonly Aspect[] = ASPECTS.filter((a) => a !== 'custom');

/** Above this estimate the dialog warns that the file is held in memory while it is made. */
const LARGE_EXPORT_BYTES = 1e9;

/**
 * The export dialog: one fixed-height frame for every state
 * (setup, progress, done, stopped, failed, unsupported). The thumbnail and
 * the spec table stay in place; only the top, the status band and the
 * footer change, so the switch from progress to done moves nothing.
 */
export function ExportDialog({
  project,
  open,
  onClose,
  currentFrame = 0,
}: ExportDialogProps): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const thumbRef = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  const state = exportState.value;
  const still = stillState.value;
  const phone = isPhone.value;
  const busy = state.phase === 'running';

  const output = project.output;
  const fps = output.fps;
  const fpsR = useMemo(() => fpsRational(fps), [fps]);
  const options = useMemo(() => sizeOptions(output), [output]);
  const info = useMemo(() => (open ? timelineInfo(project) : null), [open, project]);

  const [sizeIndex, setSizeIndex] = useState(() => projectSizeIndex(options, output));
  const [quality, setQuality] = useState<Quality>(output.quality);
  const [kind, setKind] = useState<ExportKind>(
    output.exportMode === 'segments' ? 'clips' : 'video',
  );
  const [smooth, setSmooth] = useState(output.supersample === 2);
  const [probed, setProbed] = useState<Probed | null>(null);
  const [codecString, setCodecString] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [lastPercent, setLastPercent] = useState(0);
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  const openRef = useRef(open);
  openRef.current = open;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const sizeRef = useRef(sizeIndex);
  sizeRef.current = sizeIndex;

  // Fresh choices from the project each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const initial = projectSizeIndex(options, output);
    // The ladder effect below runs in this same commit and reads the ref.
    sizeRef.current = initial;
    setSizeIndex(initial);
    setQuality(output.quality);
    setKind(output.exportMode === 'segments' ? 'clips' : 'video');
    setSmooth(output.supersample === 2);
    setPlaying(false);
    setNote(null);
    resetStill();
    // Only on opening: later project edits keep the user's choices.
  }, [open]);

  // Show or hide the native modal dialog; focus goes back to the opener (Export video).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const candidates = useMemo<LadderCandidate[]>(
    () =>
      options.map((o) => ({
        width: o.width,
        height: o.height,
        fps,
        bitrate: bitrateFor(output, o, fpsR, quality),
      })),
    [options, output, fps, fpsR, quality],
  );

  // Walk the fallback ladder when the dialog opens and when the bitrates change.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setProbed(null);
    const requested = Math.min(sizeRef.current, candidates.length - 1);
    void planRoute(candidates, requested).then((result) => {
      if (!live) return;
      setProbed({ ...result, requested });
      if (result.chosen >= 0 && !result.supported[sizeRef.current]) {
        setSizeIndex(result.chosen);
      }
    });
    return () => {
      live = false;
    };
  }, [open, candidates]);

  const size = options[sizeIndex] ?? options[0] ?? { width: 1920, height: 1080, shortSide: 1080 };
  const candidate = candidates[sizeIndex];
  const route = probed?.route ?? null;
  const sizeSupported = probed?.supported[sizeIndex] === true;

  // The real codec string for the chosen size (one test encode, cached per size and bitrate).
  useEffect(() => {
    if (!open || !probed || !candidate) {
      setCodecString(null);
      return;
    }
    const r = probed.route;
    if (r.kind === 'recorder') {
      setCodecString(recorderCodec(r.mimeType));
      return;
    }
    if (r.kind !== 'webcodecs' || !probed.supported[sizeIndex]) {
      setCodecString(null);
      return;
    }
    let live = true;
    setCodecString(null);
    void streamCodec(r.codec, candidate).then((codec) => {
      if (live) setCodecString(codec ?? r.codec);
    });
    return () => {
      live = false;
    };
  }, [open, probed, candidate, sizeIndex]);

  // The thumbnail: the frame on screen in setup, the frame being encoded while it runs.
  useEffect(() => {
    setThumbnailCanvas(busy && open ? thumbRef.current : null);
    return () => setThumbnailCanvas(null);
  }, [busy, open]);
  useEffect(() => {
    if (!open || busy || state.phase === 'done') return;
    const thumb = thumbRef.current;
    const source = document.querySelector<HTMLCanvasElement>('canvas.preview');
    if (!thumb || !source || source.width === 0) return;
    thumb.width = source.width;
    thumb.height = source.height;
    thumb.getContext('2d')?.drawImage(source, 0, 0);
    // A format chosen in the dialog redraws it (the preview has already drawn the new format).
  }, [open, state.phase, output.aspect, output.width, output.height]);

  // Elapsed time while it runs; the last percentage for the stopped state.
  useEffect(() => {
    if (!busy) return;
    startedAt.current = performance.now();
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(performance.now() - startedAt.current), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (state.phase === 'running' && state.total > 0) {
      setLastPercent(Math.floor((100 * state.frame) / state.total));
    }
  }, [state]);

  // During an export, leaving the page asks first.
  useEffect(() => {
    if (!busy) return;
    const onLeave = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [busy]);

  // Move focus to the main control of each step.
  useEffect(() => {
    if (!open) return;
    const target =
      state.phase === 'running'
        ? cancelRef.current
        : state.phase === 'done'
          ? downloadRef.current
          : state.phase === 'error'
            ? (retryRef.current ?? closeRef.current)
            : state.phase === 'canceled'
              ? startRef.current
              : null;
    target?.focus();
  }, [open, state.phase]);

  const frames = info?.frames ?? 0;
  const ssFits = canSupersample(size.width, size.height);
  const webcodecs = route?.kind === 'webcodecs';
  const smoothAllowed = ssFits && route?.kind !== 'recorder';
  const clipsAllowed = route === null || webcodecs;
  const effectiveKind: ExportKind = clipsAllowed ? kind : 'video';
  const fixedMbps = fixedBitrateMbps(output);
  const unavailable = probed !== null && probed.route.kind === 'none';
  const container =
    route?.kind === 'webcodecs' || route?.kind === 'recorder' ? route.container : 'mp4';
  const shortFormat = exportCopy.containers[container];

  const estimate = estimateBytes(candidate?.bitrate ?? 0, frames, fpsR);
  const duration = formatClock(durationSec(frames, fpsR));
  const profileName = exportCopy.profiles[profileOf(output, size)];
  const aspect = aspectLabel(size.width, size.height);
  const summary = exportCopy.summary({
    profile: profileName,
    aspect,
    width: size.width,
    height: size.height,
    fps: formatFps(fps),
    duration,
    size: formatEstimate(estimate),
    // The plain format once the encoder answered; the exact codec string is in "Technical details".
    format: codecString === null || route === null ? null : formatName(route),
  });
  const partsLine =
    info === null
      ? ''
      : [
          info.intro ? exportCopy.parts.intro : null,
          exportCopy.parts.stops(info.stops),
          info.finale ? exportCopy.parts.finale : null,
        ]
          .filter((x) => x !== null)
          .join(', ');

  const requestFor = (index: number): ExportRequest | null => {
    const option = options[index];
    const c = candidates[index];
    if (!probed || !option || !c || info === null) return null;
    const r = probed.route;
    if (r.kind === 'none' || !probed.supported[index]) return null;
    return {
      project,
      width: option.width,
      height: option.height,
      shortSide: option.shortSide,
      bitrate: c.bitrate,
      route: r,
      kind: r.kind === 'webcodecs' ? kind : 'video',
      supersample:
        smooth && r.kind === 'webcodecs' && canSupersample(option.width, option.height) ? 2 : 1,
      frames: info.frames,
    };
  };

  const startAt = (index: number): void => {
    const request = requestFor(index);
    if (request) {
      setPlaying(false);
      setNote(null);
      void startExport(request);
    }
  };

  const onDialogClose = (): void => {
    setPlaying(false);
    if (!busyRef.current) resetExport();
    if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
    if (openRef.current) onClose();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    // The player's shortcuts stay off while the dialog is open.
    event.stopPropagation();
    if (event.key === 'Escape' && busyRef.current) event.preventDefault();
  };

  const clampedFrame = Math.min(Math.max(0, Math.round(currentFrame)), Math.max(0, frames - 1));

  const doneFile = useMemo(() => {
    if (state.phase !== 'done' || typeof navigator.canShare !== 'function') return null;
    const file = new File([state.blob], state.fileName, { type: state.blob.type });
    try {
      return navigator.canShare({ files: [file] }) ? file : null;
    } catch {
      return null;
    }
  }, [state]);

  const phase =
    state.phase === 'running'
      ? 'progress'
      : state.phase === 'done'
        ? 'done'
        : state.phase === 'canceled'
          ? 'stopped'
          : state.phase === 'error'
            ? 'failed'
            : unavailable
              ? 'unsupported'
              : 'setup';
  const editable = phase === 'setup' || phase === 'unsupported';
  const request = state.phase === 'idle' ? null : state.request;
  const shownFrame =
    state.phase === 'running' ? state.frame : state.phase === 'done' ? frames : clampedFrame;
  const totalStr = String(Math.max(frames, 0));
  const caption = exportCopy.frameCaption(
    String(Math.min(shownFrame, frames)).padStart(totalStr.length, '0'),
    totalStr,
  );

  const title =
    phase === 'progress'
      ? exportCopy.progressTitle
      : phase === 'done' && state.phase === 'done'
        ? state.fileName.endsWith('.zip')
          ? exportCopy.done.titleClips
          : exportCopy.done.title
        : phase === 'stopped'
          ? exportCopy.stoppedTitle
          : phase === 'failed'
            ? exportCopy.failedTitle
            : exportCopy.title;
  const kicker =
    phase === 'progress'
      ? exportCopy.kicker.progress
      : phase === 'done'
        ? exportCopy.kicker.done
        : phase === 'stopped'
          ? exportCopy.kicker.stopped
          : phase === 'failed'
            ? exportCopy.kicker.failed
            : exportCopy.kicker.setup;

  // ----- the spec table: the same controls in every state, locked after setup,
  // so no row changes height when the export starts or finishes

  const locked = !editable;
  const shownSize =
    request === null
      ? size
      : { width: request.width, height: request.height, shortSide: request.shortSide };
  const fileName =
    state.phase === 'done'
      ? state.fileName
      : exportFileName(project, {
          width: shownSize.width,
          height: shownSize.height,
          ext: effectiveKind === 'clips' && webcodecs ? 'zip' : container,
        });
  const shownKind: ExportKind =
    request === null ? effectiveKind : request.kind === 'clips' ? 'clips' : 'video';
  const smoothOn = request === null ? smooth && smoothAllowed : request.supersample === 2;
  // One sentence for every size this browser cannot encode: the tile's title and its hidden text.
  const unsupportedSize = exportCopy.size.unsupported(
    route?.kind === 'webcodecs' ? exportCopy.size.codecName[route.codec] : exportCopy.size.anyCodec,
  );

  const specTable = (
    <dl class={`dl x-spec${locked ? ' is-locked' : ''}`}>
      <dt>{exportCopy.rows.length}</dt>
      <dd>{exportCopy.lengthLine(duration, partsLine)}</dd>
      <dt id="x-fmt-l">{exportCopy.rows.format}</dt>
      <dd>
        <Seg
          class="x-fmt"
          labelledBy="x-fmt-l"
          disabled={locked}
          options={FORMATS.map((f) => ({
            value: f,
            label: f,
            title: copy.formats.hint[f],
          }))}
          value={output.aspect}
          set={(aspect) => setValue('output.aspect', aspect)}
        />
        <span class="aside">{exportCopy.formatNote(profileName, formatFps(fps))}</span>
      </dd>
      <dt id="x-size-l">{exportCopy.rows.size}</dt>
      <dd>
        <Seg
          class="tiles"
          labelledBy="x-size-l"
          disabled={locked}
          options={options.map((o, i) => {
            const unsupported = probed !== null && probed.supported[i] !== true;
            return {
              value: i,
              label: exportCopy.size.option(o.shortSide),
              sub: exportCopy.size.pixels(o.width, o.height),
              disabled: unsupported,
              title: unsupported ? unsupportedSize : undefined,
            };
          })}
          value={sizeIndex}
          set={setSizeIndex}
        />
        {probed !== null &&
          options.map((o, i) =>
            probed.supported[i] !== true ? (
              <span key={`${o.width}x${o.height}`} class="sr">
                {unsupportedSize}
              </span>
            ) : null,
          )}
      </dd>
      <dt id="x-q-l">{exportCopy.rows.quality}</dt>
      <dd>
        <Seg
          class="tiles"
          labelledBy="x-q-l"
          disabled={locked || fixedMbps !== null}
          options={QUALITIES.map((q) => {
            const bytes = estimateBytes(bitrateFor(output, size, fpsR, q), frames, fpsR);
            return {
              value: q,
              label: exportCopy.quality.names[q],
              sub: exportCopy.quality.estimate(formatEstimate(bytes)),
            };
          })}
          value={quality}
          set={setQuality}
        />
        {fixedMbps !== null && <p class="x-note">{exportCopy.quality.fixed(fixedMbps)}</p>}
      </dd>
      <dt id="x-out-l">{exportCopy.rows.output}</dt>
      <dd>
        <div
          class="opts"
          role="radiogroup"
          aria-labelledby="x-out-l"
          aria-disabled={locked || undefined}
        >
          <label class={`opt${locked ? ' is-locked' : ''}`}>
            <input
              type="radio"
              name="export-kind"
              checked={shownKind === 'video'}
              disabled={locked}
              onChange={() => setKind('video')}
            />
            <span>
              <b>{exportCopy.output.video}</b>
              <span class="muted">{exportCopy.output.videoHint(shortFormat)}</span>
            </span>
          </label>
          <label class={`opt${clipsAllowed ? '' : ' is-disabled'}${locked ? ' is-locked' : ''}`}>
            <input
              type="radio"
              name="export-kind"
              checked={shownKind === 'clips'}
              disabled={locked || !clipsAllowed}
              onChange={() => setKind('clips')}
            />
            <span>
              <b>{exportCopy.output.clips}</b>
              <span class="muted">
                {clipsAllowed
                  ? exportCopy.output.clipsHint(info?.clips ?? 0, shortFormat)
                  : globalThis.isSecureContext === false
                    ? exportCopy.output.clipsInsecure
                    : exportCopy.output.clipsUnavailable}
              </span>
            </span>
          </label>
        </div>
      </dd>
      <dt>{exportCopy.rows.smooth}</dt>
      <dd>
        <Switch
          checked={smoothOn}
          set={setSmooth}
          disabled={locked || !smoothAllowed}
          label={exportCopy.smooth.label}
          describedBy="x-smooth-n"
        />
        <span class="aside" id="x-smooth-n">
          {!ssFits
            ? exportCopy.smooth.tooLarge(size.shortSide)
            : route?.kind === 'recorder'
              ? exportCopy.smooth.recorder
              : exportCopy.smooth.hint}
        </span>
      </dd>
      <dt>{exportCopy.rows.file}</dt>
      <dd>
        <span class="x-file">{fileName}</span>
        {/* A fixed slot whose text starts at one x: the estimate becomes the real size in place. */}
        <span class="x-size">
          {state.phase === 'done'
            ? formatBytes(state.bytes)
            : exportCopy.fileLine(formatEstimate(estimate))}
        </span>
      </dd>
    </dl>
  );

  // ----- status band and footer per state

  let band: JSX.Element;
  let footLeft: JSX.Element | null = null;
  let buttons: JSX.Element;

  if (state.phase === 'running') {
    const { frame, total, etaSec, file, files } = state;
    const started = frame > 0;
    const percent = Math.floor((100 * frame) / Math.max(1, total));
    const part = info?.parts.find((p) => frame >= p.start && frame < p.end);
    band = (
      <div class="x-band is-run" key="run">
        <div class="x-head x-prog">
          <span class="x-pct">
            {/* One fixed cell per digit: a new digit repaints in place, nothing slides. */}
            <span class="n" aria-hidden="true">
              {String(percent)
                .padStart(3, ' ')
                .split('')
                .map((c, i) => (
                  <i key={i}>{c === ' ' ? '\u00a0' : c}</i>
                ))}
            </span>
            <span class="sr">{percent}</span>
            <small>%</small>
          </span>
          <span class="x-lines">
            <span>
              {started
                ? exportCopy.running.frameLine(frame, total, files > 1 ? '' : (part?.label ?? ''))
                : exportCopy.running.preparing}
            </span>
            {files > 1 && <span class="muted">{exportCopy.running.clip(file + 1, files)}</span>}
            {state.request.route.kind === 'recorder' && (
              <span class="muted">{exportCopy.running.recording}</span>
            )}
          </span>
        </div>
        <PartsBar parts={info?.parts ?? []} frame={frame} />
        <progress
          class="sr"
          max={Math.max(1, total)}
          value={frame}
          aria-label={exportCopy.running.progressLabel}
        />
        <div class="x-meta">
          <span>{exportCopy.running.elapsed(formatEta(elapsed / 1000))}</span>
          <span class="x-left">
            {etaSec === null ? '' : exportCopy.running.left(formatEta(etaSec))}
          </span>
        </div>
        {/* Announced only when the text changes, that is every 10%. */}
        <p class="sr" aria-live="polite">
          {started ? exportCopy.running.announce(percentStep(frame, total)) : ''}
        </p>
      </div>
    );
    footLeft = <p class="x-foot-note">{exportCopy.keepOpen}</p>;
    buttons = (
      <button ref={cancelRef} type="button" class="btn-line" onClick={cancelExport}>
        {exportCopy.running.cancel}
      </button>
    );
  } else if (state.phase === 'done') {
    const done = state;
    const speed = realtimeFactor(
      done.frames,
      fpsRational(done.request.project.output.fps),
      done.elapsedMs,
    );
    band = (
      <div class="x-band is-run export-done" key="done" data-thread={done.thread} role="status">
        <p class="x-head x-done-file">
          <b>{done.fileName}</b>
          {exportCopy.done.file(formatBytes(done.bytes), duration)}
        </p>
        <PartsBar parts={info?.parts ?? []} frame={frames} full />
        <div class="x-meta">
          <span>
            {exportCopy.done.finished(formatEta(done.elapsedMs / 1000))} · {exportCopy.done.saved}
          </span>
          <span class="x-format">
            {exportCopy.done.details(
              formatName(done.request.route) ?? exportCopy.formats.avc,
              done.width,
              done.height,
            )}
          </span>
          <Tech
            text={exportCopy.done.tech(
              done.codec,
              (done.elapsedMs / 1000).toFixed(1),
              speed.toFixed(1),
            )}
          />
        </div>
      </div>
    );
    footLeft = (
      <span class="x-links">
        <button type="button" class="link" onClick={resetExport}>
          {exportCopy.done.another}
        </button>
        {doneFile !== null && (
          <button
            type="button"
            class="link"
            onClick={() => {
              navigator.share({ files: [doneFile], title: done.fileName }).catch((err) => {
                if (!(err instanceof DOMException && err.name === 'AbortError')) {
                  setNote(exportCopy.done.shareFailed);
                }
              });
            }}
          >
            {shareLabel}
          </button>
        )}
      </span>
    );
    buttons = (
      <>
        <a ref={downloadRef} class="btn-line" href={done.url} download={done.fileName}>
          {exportCopy.done.downloadAgain}
        </a>
        <button type="button" class="btn-primary" onClick={() => dialogRef.current?.close()}>
          {exportCopy.done.done}
        </button>
      </>
    );
  } else if (state.phase === 'canceled') {
    band = (
      <div class="x-band is-run" key="stopped" role="status">
        <p class="x-head">{exportCopy.stopped.line(lastPercent)}</p>
        <PartsBar parts={info?.parts ?? []} frame={(lastPercent / 100) * frames} frozen />
      </div>
    );
    buttons = (
      <>
        <button
          ref={closeRef}
          type="button"
          class="btn-line"
          onClick={() => dialogRef.current?.close()}
        >
          {exportCopy.stopped.close}
        </button>
        <button
          ref={startRef}
          type="button"
          class="btn-primary"
          disabled={requestFor(sizeIndex) === null}
          onClick={() => startAt(sizeIndex)}
        >
          {exportCopy.stopped.again}
        </button>
      </>
    );
  } else if (state.phase === 'error') {
    const failed = state;
    const at720 = index720(options);
    const retryIndex = failed.request.shortSide !== 720 && at720 >= 0 ? at720 : -1;
    band = (
      <div class="x-band is-run" key="failed">
        <p class="x-head x-err" role="alert">
          {failureMessage(failed.failure)}
        </p>
        <div class="x-bar failed" aria-hidden="true" />
        <div class="x-meta x-failed">
          <span>{exportCopy.error.hint}</span>
          <Tech text={failed.detail} class="wide" />
        </div>
      </div>
    );
    footLeft = (
      <button
        type="button"
        class="link"
        onClick={() => {
          navigator.clipboard.writeText(failed.detail).then(
            () => setNote(exportCopy.error.copied),
            () => setNote(exportCopy.error.copyFailed),
          );
        }}
      >
        {exportCopy.error.copy}
      </button>
    );
    buttons = (
      <>
        <button
          ref={closeRef}
          type="button"
          class="btn-line"
          onClick={() => dialogRef.current?.close()}
        >
          {exportCopy.error.close}
        </button>
        <button
          ref={retryRef}
          type="button"
          class="btn-primary"
          disabled={
            retryIndex >= 0 ? requestFor(retryIndex) === null : requestFor(sizeIndex) === null
          }
          onClick={() => {
            if (retryIndex >= 0) {
              setSizeIndex(retryIndex);
              startAt(retryIndex);
            } else {
              startAt(sizeIndex);
            }
          }}
        >
          {retryIndex >= 0 ? exportCopy.error.retry720 : exportCopy.error.retry}
        </button>
      </>
    );
  } else {
    band = (
      <div class="x-band" key="setup">
        <div class="x-sum">
          <p class="export-summary">{summary}</p>
          <Tech
            text={
              codecString === null ? exportCopy.tech.checking : exportCopy.tech.codec(codecString)
            }
          />
        </div>
        {/* One slot is always reserved, so the band does not jump when the check ends. */}
        <div class="x-msg">
          {probed === null ? (
            <p class="muted" role="status">
              {exportCopy.checking}
            </p>
          ) : still.phase !== 'idle' ? (
            <p class={still.phase === 'error' ? 'x-err' : 'muted'} role="status">
              {still.phase === 'working'
                ? exportCopy.still.working(still.frame)
                : still.phase === 'done'
                  ? exportCopy.still.done(still.frame, still.fileName)
                  : exportCopy.still.failed}
            </p>
          ) : probed.notice !== 'none' ? (
            <Banner probed={probed} options={options} />
          ) : estimate >= LARGE_EXPORT_BYTES ? (
            <p class="x-banner" role="status">
              {exportCopy.banner.large(formatEstimate(estimate))}
            </p>
          ) : null}
        </div>
      </div>
    );
    const stillButton = (
      <button
        type="button"
        class="btn x-still"
        disabled={still.phase === 'working' || info === null}
        onClick={() => {
          void saveStill(
            project,
            clampedFrame,
            { width: size.width, height: size.height },
            smooth && ssFits ? 2 : 1,
          );
        }}
      >
        {exportCopy.still.button}
      </button>
    );
    // On a phone the still is a link above the two main buttons, which then fill the width.
    footLeft = (
      <>
        <p class="x-foot-note">{exportCopy.privacy}</p>
        {phone && stillButton}
      </>
    );
    buttons = (
      <>
        {!phone && stillButton}
        <button type="button" class="btn-line" onClick={() => dialogRef.current?.close()}>
          {exportCopy.cancel}
        </button>
        <button
          ref={startRef}
          type="button"
          class="btn-primary"
          disabled={requestFor(sizeIndex) === null || !sizeSupported}
          onClick={() => startAt(sizeIndex)}
        >
          {exportCopy.start}
        </button>
      </>
    );
  }

  const thumbAspect = shownSize.width / shownSize.height;
  // The thumbnail box follows the format down to 4:5 (a 9:16 picture is pillarboxed in a
  // 4:5 box, so it is not a sliver); a phone keeps a 16:9 box. The picture has its own edge.
  const boxAspect = phone ? 16 / 9 : Math.min(2.4, Math.max(0.8, thumbAspect));
  const picW = thumbAspect >= boxAspect ? 100 : (100 * thumbAspect) / boxAspect;
  const picH = thumbAspect >= boxAspect ? (100 * boxAspect) / thumbAspect : 100;
  const picStyle = {
    width: `${picW}%`,
    height: `${picH}%`,
    left: `${(100 - picW) / 2}%`,
    top: `${(100 - picH) / 2}%`,
  };
  return (
    <dialog
      ref={dialogRef}
      class="xdlg"
      data-state={phase}
      aria-labelledby="export-dialog-title"
      onCancel={(event) => {
        if (busyRef.current) event.preventDefault();
      }}
      onClose={onDialogClose}
      onKeyDown={onKeyDown}
    >
      {open && (
        <div class="x-body">
          <div class="dlg-top">
            <div>
              <p class="cap kicker" aria-hidden="true">
                {kicker}
              </p>
              <h2 id="export-dialog-title" class="dlg-title">
                {title}
              </h2>
            </div>
            <button
              ref={phase === 'setup' || phase === 'unsupported' ? closeRef : undefined}
              type="button"
              class="icon-btn"
              aria-label={exportCopy.close}
              title={exportCopy.close}
              style={{ visibility: busy ? 'hidden' : 'visible' }}
              disabled={busy}
              onClick={() => dialogRef.current?.close()}
            >
              <UiIcon name="close" />
            </button>
          </div>
          <div class="dlg-rule" aria-hidden="true" />
          <div class="x-main">
            <figure class="x-prev">
              <div class="x-thumb" style={{ aspectRatio: String(boxAspect) }}>
                {playing && state.phase === 'done' && !state.fileName.endsWith('.zip') ? (
                  <video
                    style={picStyle}
                    class="export-video"
                    src={state.url}
                    controls
                    autoPlay
                    muted
                    playsInline
                    aria-label={exportCopy.done.videoLabel}
                  />
                ) : (
                  <canvas
                    style={picStyle}
                    ref={thumbRef}
                    width={THUMBNAIL_WIDTH * 2}
                    height={Math.max(1, Math.round((THUMBNAIL_WIDTH * 2) / thumbAspect))}
                    role="img"
                    aria-label={exportCopy.running.thumbnailLabel}
                  />
                )}
              </div>
              {/* "Play it" shares the caption's line; its slot is always there (hidden before the
                  video exists), so nothing moves when it appears. */}
              <div class="x-cap">
                <figcaption class="cap">{caption}</figcaption>
                {(() => {
                  const canPlay = state.phase === 'done' && !state.fileName.endsWith('.zip');
                  return (
                    <button
                      type="button"
                      class="btn sm x-play"
                      style={{ visibility: canPlay ? 'visible' : 'hidden' }}
                      disabled={!canPlay}
                      aria-hidden={canPlay ? undefined : true}
                      tabIndex={canPlay ? 0 : -1}
                      onClick={() => setPlaying((p) => !p)}
                    >
                      <UiIcon name={playing ? 'close' : 'play'} size={14} />
                      {playing ? exportCopy.done.hideVideo : exportCopy.done.play}
                    </button>
                  );
                })()}
              </div>
            </figure>
            {specTable}
          </div>
          {band}
          {/* Keyed by state: each state's footer is new, so nothing in it moves. */}
          <div class="x-foot">
            <div class="x-foot-l" key={`l-${phase}`}>
              {footLeft}
              {note !== null && (
                <p class="x-foot-note" role="status">
                  {note}
                </p>
              )}
            </div>
            <div class="x-foot-r" key={`r-${phase}`}>
              {buttons}
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
