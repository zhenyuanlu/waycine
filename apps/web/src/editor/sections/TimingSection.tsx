import { useId, useRef, useState } from 'preact/hooks';
import {
  applyTransitionStyle,
  FIELD_BY_PATH,
  fpsRational,
  TRANSITION_STYLES,
  type TransitionStyle,
  transitionStyle,
} from 'waycine';
import { UiIcon } from '../../app/icons';
import { copy } from '../../copy/en';
import { frame, pause, playSpan, seek, timeline } from '../../player/player';
import { segmentChips } from '../../player/segments';
import { isWide, reducedMotion } from '../../state/media';
import { commit, project, setValue } from '../../state/project';
import { ColorField, SecondsStepper, SliderNumber, Switch } from '../controls';
import { resetPath, useFieldValue } from '../FieldControl';
import { FormRow, MoreLink, Section } from '../Section';
import { sectionSummaries, videoLength } from '../summaries';

// ---------------------------------------------------------------------------
// 04 Timing

function useFps(): number {
  const r = fpsRational(project.value.output.fps);
  return r.num / r.den;
}

function SecondsRow({
  path,
  label,
  showPath,
}: {
  path: 'timing.overviewSec' | 'timing.stopSec' | 'timing.finaleSec';
  label: string;
  showPath?: 'timing.overview.enabled' | 'timing.finale.enabled';
}) {
  const uid = useId();
  const field = FIELD_BY_PATH.get(path);
  const { value, changed } = useFieldValue(path);
  const show = useFieldValue(showPath ?? path);
  const fps = useFps();
  const off = showPath !== undefined && show.value === false;
  return (
    <div class="frow-wrap" data-path={path}>
      <FormRow
        label={label}
        htmlFor={`${uid}-c`}
        labelId={`${uid}-l`}
        changed={changed || (showPath !== undefined && show.changed)}
        onReset={() => {
          resetPath(path);
          if (showPath !== undefined) resetPath(showPath);
        }}
      >
        <div class="frow">
          <SecondsStepper
            value={typeof value === 'number' ? value : 0}
            set={(v) => setValue(path, v)}
            min={field?.min}
            max={field?.max}
            fps={fps}
            label={label}
            id={`${uid}-c`}
            disabled={off}
          />
          {showPath !== undefined && (
            <Switch
              checked={show.value === true}
              set={(on) => setValue(showPath, on)}
              text={copy.timing.show}
              class="inline"
            />
          )}
        </div>
      </FormRow>
    </div>
  );
}

function TotalRow() {
  const length = videoLength.value;
  const p = project.value;
  const stops = p.stops.filter((s) => s.hidden !== true).length;
  const parts = [
    p.timing.overview.enabled ? copy.timing.parts.intro : null,
    copy.timing.parts.stops(stops),
    p.timing.finale.enabled ? copy.timing.parts.finale : null,
  ]
    .filter((x) => x !== null)
    .join(', ');
  return (
    <FormRow label={copy.timing.total} labelId={`${useId()}-t`}>
      <p class="total video-length">
        {length === null ? (
          <span class="muted">{copy.timing.empty}</span>
        ) : (
          <>
            <b>{length.clock}</b>
            <span class="muted">{copy.timing.totalLine(length.frames, parts)}</span>
          </>
        )}
      </p>
    </FormRow>
  );
}

/** The brightness of a transition as a small curve (flat arc, a peak, a dip). */
const CURVE_ICONS: Record<TransitionStyle, string> = {
  fly: 'M2 15 C 12 5, 28 5, 38 15',
  flashWhite: 'M2 16 H14 L20 4 L21 16 H38',
  flashColor: 'M2 16 H14 L20 4 L21 16 H38',
  dipBackground: 'M2 5 H14 L20 17 L21 5 H38',
};

/**
 * A transition's curve icon. Flash to colour is the flash's peak with a
 * square of its colour on top (data colour, like a swatch), faded while Fly
 * is chosen (no flash plays).
 */
function CurveIcon({
  style,
  swatch,
  dim = false,
}: {
  style: TransitionStyle;
  swatch?: string;
  dim?: boolean;
}) {
  const d = CURVE_ICONS[style];
  return (
    <svg class="curve-ico" viewBox="0 0 40 20" aria-hidden="true" focusable="false">
      <path class="base" d="M2 19.5 H38" />
      <path class="curve" d={d} />
      {swatch !== undefined && (
        <rect
          class="swatch"
          x="17.5"
          y="-3"
          width="6"
          height="6"
          rx="1"
          fill={swatch}
          opacity={dim ? 0.4 : 1}
        />
      )}
    </svg>
  );
}

/**
 * Sets the transition through the engine's `applyTransitionStyle`: mode,
 * `flashTo` and, for the two flash styles, the flash colour (white, or when
 * leaving white the first non-white of the theme's accent, route, glow, pin
 * and background, else black), as one undo step. Then shows it: the
 * preview plays from 0.6 s before the next cut between two stops to 0.6 s
 * after it and pauses (with reduced motion it pauses at the cut, where the
 * held flash is tagged). Only a click or a key does this, never a load or undo.
 */
function setTransition(style: TransitionStyle): void {
  commit(applyTransitionStyle(project.peek(), style));
  previewTransition();
}

function previewTransition(): void {
  const t = timeline.peek();
  const chips = segmentChips.peek();
  if (t === null) return;
  const cuts = chips
    .filter((chip, i) => chip.stop !== null && chips[i + 1]?.stop != null)
    .map((chip) => chip.end);
  const now = frame.peek();
  const cut = cuts.find((c) => c >= now) ?? cuts[0];
  if (cut === undefined) return;
  if (reducedMotion.peek()) {
    pause();
    seek(cut - 1);
    return;
  }
  const span = Math.round(TRANSITION_PREVIEW_SEC * t.fps);
  playSpan(cut - span, cut + span);
}

/** How much of the video before and after a cut the transition preview plays (seconds). */
const TRANSITION_PREVIEW_SEC = 0.6;

const STYLES: readonly TransitionStyle[] = TRANSITION_STYLES;

function TransitionChoice() {
  const current = transitionStyle(project.value);
  // The colour Flash to colour flashes: the current one, or what choosing it would take.
  const colorFlash =
    current === 'flashColor'
      ? project.value.theme.flash
      : applyTransitionStyle(project.value, 'flashColor').theme.flash;
  const ref = useRef<HTMLDivElement>(null);
  const choose = (i: number): void => {
    const style = STYLES[i];
    if (style === undefined) return;
    setTransition(style);
    ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[i]?.focus();
  };
  return (
    <div class="trans" role="radiogroup" aria-label={copy.timing.transition} ref={ref}>
      {STYLES.map((style, i) => {
        const text = copy.timing.transitions[style];
        const checked = style === current;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a transition row holds a curve, a title and a sentence; a native radio cannot.
          <button
            key={style}
            type="button"
            role="radio"
            class="trans-row"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => setTransition(style)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                event.preventDefault();
                choose((i + 1) % STYLES.length);
              } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                event.preventDefault();
                choose((i - 1 + STYLES.length) % STYLES.length);
              }
            }}
          >
            <CurveIcon
              style={style}
              swatch={style === 'flashColor' ? colorFlash : undefined}
              dim={current === 'fly'}
            />
            <span class="trans-text">
              <span class="t1">{text.title}</span>
              <span class="t2">{text.sentence}</span>
            </span>
            <span class="radio" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** Easing of the flash recovery (the engine's default fade easing, smooth in and out). */
function inOutSine(t: number): number {
  return -(Math.cos(Math.PI * Math.min(1, Math.max(0, t))) - 1) / 2;
}

/**
 * The brightness between two stops: the zoom, the flash
 * rising past "Flash starts", the cut, then the recovery fade.
 */
function FlashCurve({ style }: { style: TransitionStyle }) {
  const p = project.value;
  const t = p.timing.transition;
  const zoom = Math.max(0.05, p.timing.stop.zoomFrac * p.timing.stopSec);
  const rec = Math.max(0, t.recoverSec);
  const lead = (zoom + rec) * 0.12;
  const span = lead + zoom + rec + lead;
  const x = (s: number): number => (s / span) * 100;
  const dark = style === 'dipBackground';
  const y = (f: number): number => (dark ? 12 + f * 40 : 52 - f * 40);
  const pts: string[] = [`M0 ${y(0)}`, `L${x(lead).toFixed(2)} ${y(0)}`];
  const N = 40;
  for (let k = 1; k <= N; k++) {
    const v = k / N;
    const f =
      v <= t.whiteStart ? 0 : ((v - t.whiteStart) / Math.max(1e-6, 1 - t.whiteStart)) ** t.whiteExp;
    pts.push(`L${x(lead + v * zoom).toFixed(2)} ${y(Math.min(1, f)).toFixed(2)}`);
  }
  for (let k = 1; k <= N; k++) {
    const r = k / N;
    pts.push(`L${x(lead + zoom + r * rec).toFixed(2)} ${y(1 - inOutSine(r)).toFixed(2)}`);
  }
  pts.push(`L100 ${y(0)}`);
  const startX = x(lead + t.whiteStart * zoom);
  return (
    <figure class="flash-curve" aria-label={copy.timing.curveLabel}>
      <svg viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <line class="start" x1={startX} x2={startX} y1="4" y2="60" />
        <path class="curve" d={pts.join(' ')} style={{ d: `path("${pts.join(' ')}")` }} />
      </svg>
      <figcaption>
        <span class="cap">{copy.timing.leave}</span>
        <span class="cap">{copy.timing.arrive}</span>
      </figcaption>
    </figure>
  );
}

function FlashControls() {
  const p = project.value;
  const style = transitionStyle(p);
  const fly = style === 'fly';
  const dip = style === 'dipBackground';
  const flashId = useId();
  // Open from 1800 px, where there is room: the curve shows the flash or the dip at once.
  const [open, setOpen] = useState(isWide.peek());
  const flash = useFieldValue('theme.flash');
  const recover = useFieldValue('timing.transition.recoverSec');
  const start = useFieldValue('timing.transition.whiteStart');
  const recField = FIELD_BY_PATH.get('timing.transition.recoverSec');
  const startField = FIELD_BY_PATH.get('timing.transition.whiteStart');
  return (
    <>
      <div class="fgrid">
        <div class="frow-wrap" data-path="theme.flash">
          <FormRow
            label={copy.timing.flashColour}
            htmlFor={`${flashId}-c`}
            labelId={`${flashId}-l`}
            changed={flash.changed}
            onReset={() => resetPath('theme.flash')}
            note={copy.timing.flashNotes[style]}
          >
            {/* Dip to dark shows the colour it fades through (the background), disabled. */}
            <ColorField
              id={`${flashId}-c`}
              class="half"
              value={
                dip ? p.theme.background : typeof flash.value === 'string' ? flash.value : '#FFFFFF'
              }
              set={(hex) => setValue('theme.flash', hex)}
              label={copy.timing.flashColour}
              disabled={fly || dip}
            />
          </FormRow>
        </div>
        <div class="frow-wrap" data-path="timing.transition.recoverSec">
          <FormRow
            label={copy.timing.flashLength}
            labelId={`${flashId}-rl`}
            changed={recover.changed}
            onReset={() => resetPath('timing.transition.recoverSec')}
            note={copy.timing.flashLengthNote}
          >
            <SliderNumber
              value={typeof recover.value === 'number' ? recover.value : 0}
              set={(v) => setValue('timing.transition.recoverSec', v)}
              min={recField?.min ?? 0}
              max={recField?.max ?? 10}
              sliderMax={1}
              step={0.01}
              label={copy.timing.flashLength}
              unit="s"
              disabled={fly}
            />
          </FormRow>
        </div>
      </div>
      <button
        type="button"
        class="disclose"
        aria-expanded={open}
        aria-controls={`${flashId}-adj`}
        onClick={() => setOpen(!open)}
      >
        <span>{copy.timing.adjust}</span>
        <UiIcon name="chevronDown" />
      </button>
      <div id={`${flashId}-adj`} class="adjust" hidden={!open}>
        <FlashCurve style={style} />
        <div class="fgrid">
          <div class="frow-wrap" data-path="timing.transition.whiteStart">
            <FormRow
              label={copy.timing.flashStarts}
              labelId={`${flashId}-sl`}
              changed={start.changed}
              onReset={() => resetPath('timing.transition.whiteStart')}
              note={copy.timing.flashStartsNote}
            >
              <SliderNumber
                value={typeof start.value === 'number' ? start.value : 0}
                set={(v) => setValue('timing.transition.whiteStart', v)}
                min={startField?.min ?? 0}
                max={startField?.max ?? 0.99}
                step={0.01}
                scale={100}
                label={copy.timing.flashStarts}
                unit="%"
                disabled={fly}
              />
            </FormRow>
          </div>
        </div>
      </div>
    </>
  );
}

export function TimingSection() {
  return (
    <Section id="timing" summary={sectionSummaries.value.timing}>
      <div class="fgrid">
        <SecondsRow
          path="timing.overviewSec"
          label={copy.timing.intro}
          showPath="timing.overview.enabled"
        />
        <SecondsRow path="timing.stopSec" label={copy.timing.eachStop} />
        <SecondsRow
          path="timing.finaleSec"
          label={copy.timing.finale}
          showPath="timing.finale.enabled"
        />
        <TotalRow />
      </div>
      <p class="sub-h cap" aria-hidden="true">
        {copy.timing.transition}
      </p>
      <TransitionChoice />
      <FlashControls />
      <MoreLink section="timing" />
    </Section>
  );
}
