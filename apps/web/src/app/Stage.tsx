import { useEffect, useRef, useState } from 'preact/hooks';
import { outputSize, pickPlace } from 'waycine';
import { copy } from '../copy/en';
import { autoQuality, restoreFullResolution } from '../player/adaptive';
import { EngineErrorPanel, flashHeld, Preview } from '../player/Preview';
import { frame } from '../player/player';
import { Transport } from '../player/Transport';
import {
  type EngineStage,
  engineState,
  noVisibleStops,
  previewBox,
  renderError,
  renderProject,
} from '../state/engine';
import { missingGlyphs } from '../state/glyphs';
import { isPhone } from '../state/media';
import { previewScale } from '../state/preview-scale';
import { activeProfile, project } from '../state/project';
import { addStop, setStopCoords } from '../state/stops';
import {
  expandedStop,
  focusSearchOf,
  keyboardOpen,
  pickTarget,
  previewCollapsed,
  safeZones,
  showSection,
  showToast,
  theater,
} from '../state/ui';
import { UiIcon } from './icons';
import { Popover } from './Menu';

/**
 * Frame boxes this small (the phone preview shrunk to its 120 px strip, by
 * "Shrink preview" or the keyboard) keep the bitmap they had: growing back
 * then needs no new compile.
 */
const MIN_MEASURED_HEIGHT = 121;
/** Wait for the box to settle before recompiling at a new size. */
const RESIZE_SETTLE_MS = 150;

/** Where the picture sits inside the frame box (contained, bottom-aligned on desktop). */
function pictureRect(
  box: { width: number; height: number },
  picture: { width: number; height: number },
  bottom: boolean,
): { left: number; top: number; width: number; height: number; scale: number } {
  const scale = Math.min(box.width / picture.width, box.height / picture.height);
  const width = picture.width * scale;
  const height = picture.height * scale;
  return {
    left: (box.width - width) / 2,
    top: bottom ? box.height - height : (box.height - height) / 2,
    width,
    height,
    scale,
  };
}

/**
 * The overlay over the picture: crop marks outside it, the
 * named safe zones, the dark plate edge and the "flash plays in playback"
 * tag. It shares the bitmap's viewBox, so a format change only changes the
 * viewBox, never a DOM box.
 */
function Overlay({ phone }: { phone: boolean }) {
  const size = outputSize(project.value.output);
  const W = size.width;
  const H = size.height;
  const box = previewBox.value;
  // Lengths in viewBox units for a fixed size on screen.
  const k =
    box === null
      ? 1
      : 1 / pictureRect({ width: box.cssWidth, height: box.cssHeight }, size, !phone).scale;
  const area = project.value.layouts[activeProfile.value].safeArea;
  const portrait = H > W * 1.2;
  const mark = 10 * k;
  const gap = 4 * k;
  const label = (x: number, y: number, text: string, end = false) => (
    <text
      x={x}
      y={y}
      class="sz-l"
      text-anchor={end ? 'end' : undefined}
      style={{ fontSize: `${10 * k}px` }}
    >
      {text.toUpperCase()}
    </text>
  );
  // TITLE SAFE sits in the box's bottom-right corner: the video's title starts at the
  // box's top-left corner, where the label would print over it.
  const titleSafeLabel = label(
    (1 - area.right) * W - 8 * k,
    (1 - area.bottom) * H - 8 * k,
    copy.preview.titleSafe,
    true,
  );
  return (
    <svg
      class="overlay"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio={phone ? 'xMidYMid meet' : 'xMidYMax meet'}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern
          id="hatch"
          width={7 * k}
          height={7 * k}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2={7 * k} class="hatch" />
        </pattern>
      </defs>
      <rect class="plate-edge" x="0" y="0" width={W} height={H} />
      {!phone && (
        <g class="crop">
          <path
            d={[
              `M${-gap - mark} 0H${-gap}M0 ${-gap - mark}V${-gap}`,
              `M${W + gap} 0H${W + gap + mark}M${W} ${-gap - mark}V${-gap}`,
              `M${-gap - mark} ${H}H${-gap}M0 ${H + gap}V${H + gap + mark}`,
              `M${W + gap} ${H}H${W + gap + mark}M${W} ${H + gap}V${H + gap + mark}`,
            ].join('')}
          />
        </g>
      )}
      {safeZones.value &&
        (portrait ? (
          <g class="sz">
            <rect x="0" y="0" width={W} height={area.top * H} fill="url(#hatch)" class="band" />
            <rect
              x="0"
              y={H - area.bottom * H}
              width={W}
              height={area.bottom * H}
              fill="url(#hatch)"
              class="band"
            />
            {label(14 * k, area.top * H - 8 * k, copy.preview.appButtons)}
            {label(14 * k, H - area.bottom * H + 18 * k, copy.preview.appButtons)}
            <rect
              class="title-safe"
              x={area.left * W}
              y={area.top * H}
              width={W * (1 - area.left - area.right)}
              height={H * (1 - area.top - area.bottom)}
            />
            {titleSafeLabel}
          </g>
        ) : (
          <g class="sz">
            <rect
              class="action-safe"
              x={W * 0.035}
              y={H * 0.035}
              width={W * 0.93}
              height={H * 0.93}
            />
            <rect
              class="title-safe"
              x={area.left * W}
              y={area.top * H}
              width={W * (1 - area.left - area.right)}
              height={H * (1 - area.top - area.bottom)}
            />
            {titleSafeLabel}
          </g>
        ))}
      {flashHeld.value && (
        <text
          x={W - 12 * k}
          y={20 * k}
          class="sz-l flash-tag"
          text-anchor="end"
          style={{ fontSize: `${10 * k}px` }}
        >
          {copy.preview.flashTag.toUpperCase()}
        </text>
      )}
    </svg>
  );
}

/** Layout warnings and missing glyphs as one overlay tag with its list in a popover. */
function FrameNotes() {
  const state = engineState.value;
  const warnings = state.kind === 'ready' ? state.compiled.warnings : [];
  const glyphs = missingGlyphs(renderProject.value);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const count = warnings.length + (glyphs.length > 0 ? 1 : 0);
  if (count === 0) return null;
  return (
    <>
      <button
        type="button"
        class="frame-tag warn"
        aria-expanded={anchor !== null}
        onClick={(event) => setAnchor(anchor === null ? event.currentTarget : null)}
      >
        <UiIcon name="warn" size={14} />
        <span>{copy.preview.notesButton(count)}</span>
      </button>
      {anchor !== null && (
        <Popover anchor={anchor} label={copy.preview.notesLabel} onClose={() => setAnchor(null)}>
          <div class="pop-note">
            {warnings.length > 0 && <p>{copy.layoutNotes.heading(warnings.length)}</p>}
            <ul class="issues">
              {warnings.map((w) => (
                <li key={`${w.path}-${w.code}`} class="issue warning">
                  <code>{w.path}</code>: {w.message}
                </li>
              ))}
              {glyphs.length > 0 && (
                <li class="issue warning">{copy.preview.glyphs(glyphs.join(' '))}</li>
              )}
            </ul>
          </div>
        </Popover>
      )}
    </>
  );
}

/** Loading, errors, the empty state, the pick banner and the half-resolution note, laid over the frame box. */
function FrameStates({ onAdd }: { onAdd: () => void }) {
  const state = engineState.value;
  const failure: { stage: EngineStage; error: unknown } | null =
    state.kind === 'error'
      ? { stage: state.stage, error: state.error }
      : renderError.value !== null
        ? { stage: 'render', error: renderError.value }
        : null;
  const target = pickTarget.value;
  const targetStop = target === null ? undefined : project.value.stops.find((s) => s.id === target);
  return (
    <>
      {state.kind === 'loading' && (
        <p class="frame-state" role="status">
          {copy.preview.loading}
        </p>
      )}
      {failure !== null && <EngineErrorPanel stage={failure.stage} error={failure.error} />}
      {noVisibleStops.value && state.kind !== 'loading' && failure === null && (
        <div class="frame-empty">
          <p>{copy.preview.empty}</p>
          <button type="button" class="btn-line" onClick={onAdd}>
            <UiIcon name="plus" />
            {copy.preview.emptyAction}
          </button>
        </div>
      )}
      {target !== null && (
        <div class="pick-banner" role="status">
          <span>{copy.preview.pickBanner(targetStop?.city || copy.preview.pickThisStop)}</span>
          <button type="button" class="t-act" onClick={() => (pickTarget.value = null)}>
            {copy.preview.pickCancel}
          </button>
        </div>
      )}
      <div class="frame-tags">
        {previewScale.value < 1 && autoQuality.value && (
          <p class="frame-tag" role="status">
            <span>{copy.preview.halfResolution}</span>
            <button type="button" class="t-act" onClick={restoreFullResolution}>
              {copy.preview.fullResolution}
            </button>
          </p>
        )}
        <FrameNotes />
      </div>
    </>
  );
}

/**
 * The stage: a fixed frame box placed by container units, the
 * canvas contained in it, the overlay, and the transport attached under the
 * 16:9 picture. Nothing here is sized by the canvas; the canvas bitmap
 * follows the box (debounced), never the other way round.
 */
export function Stage() {
  const phone = isPhone.value;
  const boxRef = useRef<HTMLDivElement>(null);
  const size = outputSize(project.value.output);
  // The on-screen keyboard and "Shrink preview" both shrink the box to its 120 px strip.
  const keyboard = phone && keyboardOpen.value;
  const shrunk = phone && (previewCollapsed.value || keyboard);

  // Measure the frame box (after it settles) so the preview draws as many pixels as it shows.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let timer = 0;
    const measure = (): void => {
      const width = box.clientWidth;
      const height = box.clientHeight;
      if (height < MIN_MEASURED_HEIGHT || width < MIN_MEASURED_HEIGHT) return;
      const dpr = window.devicePixelRatio || 1;
      const prev = previewBox.peek();
      if (
        prev !== null &&
        Math.abs(prev.cssWidth - width) < 1 &&
        Math.abs(prev.cssHeight - height) < 1 &&
        prev.dpr === dpr
      ) {
        return;
      }
      previewBox.value = { cssWidth: width, cssHeight: height, dpr };
    };
    const settle = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, RESIZE_SETTLE_MS);
    };
    measure();
    const observer = new ResizeObserver(() => {
      if (previewBox.peek() === null) measure();
      else settle();
    });
    observer.observe(box);
    window.addEventListener('resize', settle);
    // A move to a screen with another scale factor keeps the CSS size: watch the ratio itself.
    let mq: MediaQueryList | null = null;
    const onDpr = (): void => {
      arm();
      settle();
    };
    const arm = (): void => {
      mq?.removeEventListener('change', onDpr);
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mq.addEventListener('change', onDpr);
    };
    arm();
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('resize', settle);
      mq?.removeEventListener('change', onDpr);
    };
  }, []);

  useEffect(() => {
    const target = pickTarget.value;
    if (target === null) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        pickTarget.value = null;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickTarget.value]);

  // A click on the paused preview places the stop waiting for "Pick on map".
  const onClick = (event: MouseEvent): void => {
    const id = pickTarget.peek();
    const canvas = event.target;
    const state = engineState.peek();
    if (id === null || !(canvas instanceof HTMLCanvasElement) || state.kind !== 'ready') return;
    const rect = canvas.getBoundingClientRect();
    const { compiled } = state;
    const pic = pictureRect(rect, compiled, !isPhone.peek());
    const x = ((event.clientX - rect.left - pic.left) / pic.width) * compiled.width;
    const y = ((event.clientY - rect.top - pic.top) / pic.height) * compiled.height;
    if (x < 0 || y < 0 || x > compiled.width || y > compiled.height) return;
    const place = pickPlace(compiled, frame.peek(), x, y);
    setStopCoords(id, place.lat, place.lon);
    pickTarget.value = null;
    const stop = project.peek().stops.find((s) => s.id === id);
    showToast(copy.search.placed(stop?.city || copy.preview.pickThisStop));
  };

  const onAdd = (): void => {
    const id = addStop();
    if (id === null) return;
    showSection('stops');
    expandedStop.value = id;
    focusSearchOf.value = id;
  };

  return (
    <main
      class={`stage${theater.value ? ' is-theater' : ''}${keyboard ? ' is-keyboard' : ''}${shrunk ? ' is-shrunk' : ''}`}
      aria-label={copy.app.stageLabel}
      style={{ '--ar': String(size.width / size.height) }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: picking a place is a pointer action; coordinates can be typed in the stop editor. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: see above; the canvas inside is the target. */}
      <div
        class={`frame-box${pickTarget.value !== null ? ' is-picking' : ''}`}
        ref={boxRef}
        onClick={onClick}
      >
        <Preview />
        <Overlay phone={phone} />
        <FrameStates onAdd={onAdd} />
      </div>
      <Transport phone={phone} />
    </main>
  );
}
