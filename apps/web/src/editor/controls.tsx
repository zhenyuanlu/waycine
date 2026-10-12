import type { ComponentChildren, Ref } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { UiIcon } from '../app/icons';
import { copy } from '../copy/en';
import { isPhone } from '../state/media';

/**
 * The editor's control kit: plain numbers with a range bar and
 * drag-to-scrub, numbers with a slider, seconds steppers, Auto | Custom
 * numbers, colour + hex, segmented choices, selects, switches and dates.
 * Every control keeps one size in every state: errors are callouts laid
 * over the content below, and a changed value never changes a weight.
 */

// ---------------------------------------------------------------------------
// Numbers

/** Decimals a step needs (`0.05` -> 2). */
function decimalsOf(step: number | undefined): number {
  if (step === undefined || step >= 1) return 0;
  return Math.min(6, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));
}

/** A number rounded to the step's decimals, without trailing zeros (`2.6693`, 0.01 -> `2.67`). */
export function formatNumber(value: number, step: number | undefined): string {
  if (!Number.isFinite(value)) return '';
  return String(Number(value.toFixed(decimalsOf(step))));
}

/** Parses a typed number (`1.5`, `-3`, `2,5`), or null. */
function parseNumber(text: string): number | null {
  const t = text.trim().replace(',', '.').replace(/−/g, '-');
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number | undefined, max: number | undefined): number {
  return Math.min(
    max ?? Number.POSITIVE_INFINITY,
    Math.max(min ?? Number.NEGATIVE_INFINITY, value),
  );
}

/** Rounds to a whole number of steps from the minimum (floating error removed). */
function snapToStep(value: number, step: number | undefined, min: number | undefined): number {
  if (step === undefined || step <= 0) return value;
  const base = min ?? 0;
  const snapped = base + Math.round((value - base) / step) * step;
  return Number(snapped.toFixed(Math.max(decimalsOf(step), 0) + 2));
}

interface NumberSpec {
  /** Lower and upper limits, in the value's own units. */
  min?: number;
  max?: number;
  /** Step of the arrow keys, in the value's own units. */
  step?: number;
  /** Shown value = value x scale (fractions as percent use 100). */
  scale?: number;
}

/** Arrow-key and scrub step multiplier: Shift x10, Alt x0.1. */
function stepFactor(event: { shiftKey: boolean; altKey: boolean }): number {
  return event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
}

interface NumberFieldProps extends NumberSpec {
  value: number | null;
  set: (value: number) => void;
  /** Accessible name. */
  label: string;
  id?: string;
  describedBy?: string;
  disabled?: boolean;
  /** Unit shown inside the field, in a fixed slot (also the scrub handle). */
  unit?: string;
  /** Leading in-field axis label of a tuple element ("X", "Lat"). */
  axis?: string;
  /** Draw the 2 px range bar (numbers without a slider). */
  rangeBar?: boolean;
  placeholder?: string;
  class?: string;
  /** Turns typed text into a value in the value's own units (seconds accept `0:02.7` and `80f`). */
  parse?: (text: string) => number | null;
  /** Formats a value for the field. */
  format?: (value: number) => string;
  /** Elements (the row label, the row's unit column) that also scrub the value when dragged sideways. */
  scrubHandles?: readonly { current: HTMLElement | null }[];
  inputRef?: Ref<HTMLInputElement>;
  /** Callout text for a value past the limits (default: "Enter a number from … to …"). */
  errorText?: string;
}

/**
 * A number typed into a text field (role spinbutton): the value is
 * right-aligned in tabular numerals; Up / Down step it (Shift x10, Alt x0.1,
 * Page Up / Down x10); dragging the unit slot or the row label sideways
 * scrubs it (one step per 4 px). A value past a limit shows a callout and,
 * when the field is left, snaps to the limit.
 */
export function NumberField(props: NumberFieldProps) {
  const {
    value,
    set,
    min,
    max,
    step,
    scale = 1,
    label,
    id,
    describedBy,
    disabled = false,
    unit,
    axis,
    rangeBar = false,
    placeholder,
    parse,
    format,
    scrubHandles,
    inputRef,
    errorText,
  } = props;
  const show = (v: number): string => (format ? format(v) : formatNumber(v * scale, shownStep()));
  const shownStep = (): number | undefined => (step === undefined ? undefined : step * scale);
  const read = (text: string): number | null => {
    if (parse) return parse(text);
    const n = parseNumber(text);
    return n === null ? null : n / scale;
  };
  const [text, setText] = useState(value === null ? '' : show(value));
  const [error, setError] = useState<string | null>(null);
  // "Kept at the limit": a value past a limit snapped to it when the field was left.
  const [snapped, setSnapped] = useState<string | null>(null);
  const snapTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(snapTimer.current), []);
  const errorId = `${useId()}-error`;
  const own = useRef<HTMLInputElement | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Follow outside changes (undo, reset, scrub) unless the text already means this value.
  useEffect(() => {
    if (value === null) {
      if (text !== '') setText('');
      return;
    }
    const typed = read(text);
    if (typed === null || Math.abs(typed - value) > 1e-9) {
      setText(show(value));
      setError(null);
    }
  }, [value]);

  const limits = (): [string, string] => [
    min === undefined ? '' : show(min),
    max === undefined ? '' : show(max),
  ];
  const outOfRange = (n: number): boolean =>
    (min !== undefined && n < min - 1e-9) || (max !== undefined && n > max + 1e-9);

  const commit = (n: number): void => {
    const next = clamp(n, min, max);
    set(next);
    setText(show(next));
    setError(null);
  };

  const nudge = (direction: 1 | -1, factor: number): void => {
    if (value === null || disabled) return;
    const s = step ?? 1;
    commit(snapToStep(value + direction * s * factor, s * factor < s ? s * factor : s, min));
  };

  // Drag sideways on the unit slot or the row label: one step per 4 px.
  const startScrub = (event: PointerEvent): void => {
    if (disabled || value === null || event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    const startX = event.clientX;
    const startValue = value;
    let active = false;
    const move = (e: PointerEvent): void => {
      const dx = e.clientX - startX;
      if (!active) {
        if (Math.abs(dx) < 3) return;
        active = true;
        target.setPointerCapture(e.pointerId);
        document.documentElement.classList.add('scrubbing');
      }
      const s = (step ?? 1) * stepFactor(e);
      const steps = Math.round(dx / 4);
      const next = clamp(snapToStep(startValue + steps * s, s, min), min, max);
      if (next !== valueRef.current) {
        set(next);
        setText(show(next));
      }
      e.preventDefault();
    };
    const up = (e: PointerEvent): void => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      document.documentElement.classList.remove('scrubbing');
      if (active) {
        e.preventDefault();
        // A drag is not a click: keep the label from focusing the field afterwards.
        target.addEventListener('click', (c) => c.preventDefault(), { once: true, capture: true });
      }
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  useEffect(() => {
    const handles = (scrubHandles ?? []).map((h) => h.current).filter((h) => h !== null);
    for (const handle of handles) handle.addEventListener('pointerdown', startScrub);
    return () => {
      for (const handle of handles) handle.removeEventListener('pointerdown', startScrub);
    };
  });

  const fraction =
    rangeBar && value !== null && min !== undefined && max !== undefined && max > min
      ? Math.min(1, Math.max(0, (value - min) / (max - min)))
      : null;
  const described = [describedBy, error === null ? undefined : errorId].filter(Boolean).join(' ');
  return (
    <span
      class={`field num${disabled ? ' is-disabled' : ''}${error === null ? '' : ' is-invalid'}${
        props.class ? ` ${props.class}` : ''
      }`}
    >
      {axis !== undefined && (
        <span class="axis" aria-hidden="true">
          {axis}
        </span>
      )}
      <input
        ref={(el) => {
          own.current = el;
          if (typeof inputRef === 'function') inputRef(el);
          else if (inputRef) inputRef.current = el;
        }}
        id={id}
        type="text"
        role="spinbutton"
        inputMode="decimal"
        autocomplete="off"
        spellcheck={false}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={label}
        aria-describedby={described === '' ? undefined : described}
        aria-invalid={error !== null}
        aria-valuenow={value === null ? undefined : Number((value * scale).toFixed(6))}
        aria-valuemin={min === undefined ? undefined : min * scale}
        aria-valuemax={max === undefined ? undefined : max * scale}
        aria-valuetext={value === null ? undefined : `${show(value)}${unit ? ` ${unit}` : ''}`}
        onInput={(event) => {
          const raw = event.currentTarget.value;
          setText(raw);
          setSnapped(null);
          const n = read(raw);
          if (n === null || outOfRange(n)) {
            const [lo, hi] = limits();
            setError(errorText ?? copy.editor.invalidNumber(lo, hi));
            return;
          }
          setError(null);
          set(n);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            nudge(event.key === 'ArrowUp' ? 1 : -1, stepFactor(event));
          } else if (event.key === 'PageUp' || event.key === 'PageDown') {
            event.preventDefault();
            nudge(event.key === 'PageUp' ? 1 : -1, 10);
          } else if (event.key === 'Enter') {
            // Commits (through blur). A phone closes its keyboard; elsewhere the field keeps focus.
            event.currentTarget.blur();
            if (!isPhone.peek()) event.currentTarget.focus();
          } else if (event.key === 'Escape' && error !== null) {
            event.stopPropagation();
            setText(value === null ? '' : show(value));
            setError(null);
          }
        }}
        onBlur={() => {
          const n = read(text);
          // Past a limit: keep the limit, and say so for a few seconds. Not a number: the
          // last value comes back.
          if (n !== null && outOfRange(n)) {
            commit(n);
            const limit = clamp(n, min, max);
            setSnapped(copy.editor.snapped(`${show(limit)}${unit ? ` ${unit}` : ''}`));
            window.clearTimeout(snapTimer.current);
            snapTimer.current = window.setTimeout(() => setSnapped(null), SNAP_NOTE_MS);
          } else {
            setText(value === null ? '' : show(value));
            setError(null);
          }
        }}
      />
      {unit !== undefined && (
        <span
          class="unit"
          aria-hidden="true"
          onPointerDown={(event) => startScrub(event as unknown as PointerEvent)}
        >
          {unit}
        </span>
      )}
      {fraction !== null && (
        <i class="rb" aria-hidden="true" style={{ transform: `scaleX(${fraction})` }} />
      )}
      {error !== null && (
        <span id={errorId} class="callout" role="alert">
          {error}
        </span>
      )}
      {error === null && snapped !== null && (
        <span class="callout note" role="status">
          {snapped}
        </span>
      )}
    </span>
  );
}

/** How long "Kept at the limit" stays under a field (unless the next input comes first). */
const SNAP_NOTE_MS = 3000;

/** A number with a slider (bounded visual values in Basics): slider | field | unit. */
export function SliderNumber(
  props: NumberFieldProps & {
    min: number;
    max: number;
    sliderLabel?: string;
    /** The slider's own upper end, when the useful range is shorter than the allowed one. */
    sliderMax?: number;
  },
) {
  const { value, set, min, step, scale = 1, disabled = false } = props;
  const max = Math.min(props.max, props.sliderMax ?? props.max);
  const v = Math.min(max, value ?? min);
  const f = max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0;
  return (
    <div class={`slider-num${disabled ? ' is-disabled' : ''}`}>
      <input
        type="range"
        class="slider"
        min={min * scale}
        max={max * scale}
        step={(step ?? (max - min) / 100) * scale}
        value={v * scale}
        disabled={disabled}
        aria-label={props.sliderLabel ?? props.label}
        aria-describedby={props.describedBy}
        style={{ '--f': String(f) }}
        onInput={(event) => set(Number(event.currentTarget.value) / scale)}
      />
      <NumberField {...props} max={props.max} rangeBar={false} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seconds

/** Parses seconds typed as `2.67`, `0:02.7`, `1:05` or `80f` (frames at `fps`), or null. */
function parseSeconds(text: string, fps: number): number | null {
  const t = text.trim().toLowerCase().replace(/\s*s$/, '');
  const frames = /^(\d+)\s*f$/.exec(t);
  if (frames) return Number(frames[1]) / fps;
  const clock = /^(\d+):(\d{1,2}(?:\.\d*)?)$/.exec(t);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  return parseNumber(t);
}

/**
 * A seconds stepper: − | value s | +. The buttons move 0.1 s, rounded to
 * whole frames (Shift: one second, Alt: one frame); the field accepts
 * `2.67`, `0:02.7` and `80f`.
 */
export function SecondsStepper({
  value,
  set,
  min,
  max,
  fps,
  label,
  id,
  describedBy,
  disabled = false,
}: {
  value: number;
  set: (value: number) => void;
  min?: number;
  max?: number;
  fps: number;
  label: string;
  id?: string;
  describedBy?: string;
  disabled?: boolean;
}) {
  const stepBy = (direction: 1 | -1, event: MouseEvent): void => {
    const delta = event.shiftKey ? 1 : event.altKey ? 1 / fps : STEPPER_SECONDS;
    // Land on a whole frame, so the shown value is what the video can do.
    const frames = Math.round((value + direction * delta) * fps);
    set(clamp(Number((frames / fps).toFixed(4)), min, max));
  };
  return (
    <div class={`stepper${disabled ? ' is-disabled' : ''}`}>
      <button
        type="button"
        class="icon-btn"
        disabled={disabled || (min !== undefined && value <= min)}
        aria-label={copy.editor.stepDown(label)}
        title={copy.editor.stepDown(label)}
        onClick={(event) => stepBy(-1, event)}
      >
        <UiIcon name="minus" />
      </button>
      <NumberField
        value={value}
        set={set}
        min={min}
        max={max}
        step={0.01}
        label={label}
        id={id}
        describedBy={describedBy}
        disabled={disabled}
        unit="s"
        parse={(text) => parseSeconds(text, fps)}
        format={(v) => formatNumber(v, 0.01)}
      />
      <button
        type="button"
        class="icon-btn"
        disabled={disabled || (max !== undefined && value >= max)}
        aria-label={copy.editor.stepUp(label)}
        title={copy.editor.stepUp(label)}
        onClick={(event) => stepBy(1, event)}
      >
        <UiIcon name="plus" />
      </button>
    </div>
  );
}

/** What one click of a seconds stepper adds or removes. */
const STEPPER_SECONDS = 0.1;

// ---------------------------------------------------------------------------
// Choices

export interface SegOption<T> {
  value: T;
  label: string;
  /** Second line (export dialog tiles only). */
  sub?: string;
  disabled?: boolean;
  title?: string;
}

/**
 * Segmented choice: equal columns, the selected one tinted with a 2 px mark.
 * A radiogroup; arrow keys move the selection.
 */
export function Seg<T>({
  options,
  value,
  set,
  label,
  labelledBy,
  describedBy,
  disabled = false,
  class: className = '',
  title,
}: {
  options: readonly SegOption<T>[];
  value: T;
  set: (value: T) => void;
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  disabled?: boolean;
  class?: string;
  title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.findIndex((o) => o.value === value);
  const focusIndex =
    selected >= 0
      ? selected
      : Math.max(
          0,
          options.findIndex((o) => !o.disabled),
        );
  const move = (from: number, direction: number): void => {
    for (let k = 1; k <= options.length; k++) {
      const i = (from + direction * k + options.length) % options.length;
      const option = options[i];
      if (option !== undefined && !option.disabled) {
        set(option.value);
        ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[i]?.focus();
        return;
      }
    }
  };
  return (
    <div
      ref={ref}
      class={`seg${className ? ` ${className}` : ''}`}
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      title={title}
    >
      {options.map((option, i) => (
        // biome-ignore lint/a11y/useSemanticElements: a segmented option is a styled button with a radio role (one tab stop, arrow keys).
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={i === selected}
          tabIndex={i === focusIndex ? 0 : -1}
          disabled={disabled || option.disabled}
          title={option.title}
          onClick={() => set(option.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault();
              move(i, 1);
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault();
              move(i, -1);
            }
          }}
        >
          <span class="seg-l">{option.label}</span>
          {option.sub !== undefined && <span class="seg-s">{option.sub}</span>}
        </button>
      ))}
    </div>
  );
}

/** A native select with a chevron, in a field frame. */
export function Select<T extends string | number>({
  options,
  value,
  set,
  label,
  id,
  describedBy,
  disabled = false,
  class: className = '',
  lead,
}: {
  options: readonly SegOption<T>[];
  value: T;
  set: (value: T) => void;
  label?: string;
  id?: string;
  describedBy?: string;
  disabled?: boolean;
  class?: string;
  /** Content before the select (a medal dot). */
  lead?: ComponentChildren;
}) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <span class={`field sel${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}>
      {lead}
      <select
        id={id}
        value={String(index)}
        disabled={disabled}
        aria-label={label}
        aria-describedby={describedBy}
        onChange={(event) => {
          const next = options[Number(event.currentTarget.value)];
          if (next !== undefined) set(next.value);
        }}
      >
        {index < 0 && <option value="-1">{String(value)}</option>}
        {options.map((option, i) => (
          <option key={String(option.value)} value={String(i)} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <UiIcon name="chevronDown" />
    </span>
  );
}

/**
 * A switch (checkbox with role switch): a square-ish track that fills with
 * ink when on. With `text` the whole line is the hit area.
 */
export function Switch({
  checked,
  set,
  text,
  label,
  labelledBy,
  describedBy,
  id,
  disabled = false,
  title,
  class: className = '',
}: {
  checked: boolean;
  set: (on: boolean) => void;
  /** Visible text after the switch (what "on" means). */
  text?: string;
  /** Accessible name when there is no visible text. */
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  id?: string;
  disabled?: boolean;
  title?: string;
  class?: string;
}) {
  const onChange = (event: { currentTarget: HTMLInputElement }): void =>
    set(event.currentTarget.checked);
  if (text === undefined) {
    return (
      <input
        id={id}
        type="checkbox"
        role="switch"
        class="sw"
        checked={checked}
        aria-checked={checked}
        disabled={disabled}
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onChange={onChange}
      />
    );
  }
  return (
    <label
      class={`switch${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}
      title={title}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        class="sw"
        checked={checked}
        aria-checked={checked}
        disabled={disabled}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onChange={onChange}
      />
      <span>{text}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Colour

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;
const RGB =
  /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i;

/** A CSS colour name ("orange", "teal") as `#RRGGBB` through a scratch canvas, or null. */
function namedColour(name: string): string | null {
  if (!/^[a-z]{3,20}$/i.test(name) || typeof document === 'undefined') return null;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#000000';
  ctx.fillStyle = name;
  const first = ctx.fillStyle;
  ctx.fillStyle = '#ffffff';
  ctx.fillStyle = name;
  // An unknown name leaves the previous colour in place, so the two reads differ.
  if (ctx.fillStyle !== first || !/^#[0-9a-f]{6}$/i.test(first)) return null;
  return first.toUpperCase();
}

/** `#abc`, `abc`, `#AABBCC`, `rgb(1, 2, 3)`, `orange` -> `#AABBCC`, or null. */
function normalizeHex(text: string): string | null {
  const t = text.trim();
  const rgb = RGB.exec(t);
  if (rgb) {
    const parts = [rgb[1], rgb[2], rgb[3]].map((p) => Number(p));
    if (parts.some((p) => p > 255)) return null;
    return `#${parts.map((p) => p.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }
  const m = HEX.exec(t);
  if (!m) return namedColour(t);
  const hex = m[1] as string;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  return `#${full.toUpperCase()}`;
}

/**
 * Colour + hex: a swatch (a native colour picker lies invisibly over it)
 * and the hex text. A complete 6-digit hex applies as it is typed; other
 * forms (`#RGB`, `rgb()`) apply on Enter or when the field is left. Esc
 * puts the last colour back.
 */
export function ColorField({
  value,
  set,
  label,
  id,
  describedBy,
  disabled = false,
  class: className = '',
}: {
  value: string;
  set: (hex: string) => void;
  label: string;
  id?: string;
  describedBy?: string;
  disabled?: boolean;
  class?: string;
}) {
  const [text, setText] = useState(value);
  const [error, setError] = useState(false);
  const errorId = `${useId()}-error`;
  useEffect(() => {
    if (normalizeHex(text) !== value) {
      setText(value);
      setError(false);
    }
  }, [value]);
  const apply = (): void => {
    const hex = normalizeHex(text);
    if (hex === null) {
      setError(true);
      return;
    }
    setError(false);
    setText(hex);
    if (hex !== value) set(hex);
  };
  return (
    <span
      class={`field color${disabled ? ' is-disabled' : ''}${error ? ' is-invalid' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <span class="swatch" aria-hidden="true" style={{ background: value }} />
      <input
        type="color"
        class="cpick"
        value={value.toLowerCase()}
        disabled={disabled}
        aria-label={copy.editor.colorPicker(label)}
        tabIndex={-1}
        onInput={(event) => set(event.currentTarget.value.toUpperCase())}
      />
      <input
        id={id}
        type="text"
        class="hex"
        value={text}
        disabled={disabled}
        spellcheck={false}
        autocomplete="off"
        maxLength={24}
        aria-label={label}
        aria-describedby={
          [describedBy, error ? errorId : ''].filter(Boolean).join(' ') || undefined
        }
        aria-invalid={error}
        onInput={(event) => {
          const raw = event.currentTarget.value;
          setText(raw);
          if (/^#?[0-9a-f]{6}$/i.test(raw.trim())) {
            const hex = normalizeHex(raw);
            setError(false);
            if (hex !== null && hex !== value) set(hex);
          } else if (error) {
            setError(normalizeHex(raw) === null);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            apply();
            // A phone closes its keyboard, so the next tap lands where the user aims.
            if (isPhone.peek()) event.currentTarget.blur();
          } else if (event.key === 'Escape' && (error || normalizeHex(text) !== value)) {
            event.stopPropagation();
            setText(value);
            setError(false);
          }
        }}
        onBlur={apply}
      />
      {error && (
        <span id={errorId} class="callout" role="alert">
          {copy.editor.invalidColor}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Text and dates

export function TextField({
  value,
  set,
  label,
  labelledBy,
  id,
  describedBy,
  placeholder,
  disabled = false,
  class: className = '',
  inputRef,
}: {
  value: string;
  set: (text: string) => void;
  label?: string;
  labelledBy?: string;
  id?: string;
  describedBy?: string;
  placeholder?: string;
  disabled?: boolean;
  class?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <span class={`field${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        spellcheck={false}
        autocomplete="off"
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onInput={(event) => set(event.currentTarget.value)}
      />
    </span>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isoParts(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  return check.getUTCMonth() === mo - 1 && check.getUTCDate() === d ? [y, mo, d] : null;
}

/** `2026-06-13` -> `Jun 13, 2026` (the chrome's medium date). */
function mediumDate(iso: string): string {
  const p = isoParts(iso);
  return p === null ? iso : `${MONTHS[p[1] - 1]} ${p[2]}, ${p[0]}`;
}

/** `2026-06-13` -> `Jun 13` (lists). */
export function shortDate(iso: string): string {
  const p = isoParts(iso);
  return p === null ? iso : `${MONTHS[p[1] - 1]} ${p[2]}`;
}

/** The year a typed date without one ("Jun 13") gets when no stop has a date. */
export const FALLBACK_YEAR = 2026;

/**
 * Parses `2026-06-13`, `6/13/2026`, `Jun 13, 2026`, `Jun 13` (the year of
 * `fallbackYear`) into ISO, or null.
 */
function parseDate(text: string, fallbackYear: number): string | null {
  const t = text.trim();
  const iso = (y: number, m: number, d: number): string | null => {
    const out = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return isoParts(out) === null ? null : out;
  };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return iso(Number(m[3]), Number(m[1]), Number(m[2]));
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i.exec(t);
  if (m) {
    const month = MONTHS.findIndex((name) => name.toLowerCase() === (m?.[1] ?? '').toLowerCase());
    if (month < 0) return null;
    return iso(m[3] === undefined ? fallbackYear : Number(m[3]), month + 1, Number(m[2]));
  }
  return null;
}

/**
 * A date shown as `Jun 13, 2026` and stored as ISO. Typing accepts
 * `2026-06-13`, `6/13/2026` and `Jun 13`; the calendar button opens the
 * browser's own picker.
 */
export function DateField({
  value,
  set,
  label,
  id,
  describedBy,
  fallbackYear,
  min,
}: {
  value: string | undefined;
  set: (iso: string | undefined) => void;
  label: string;
  id?: string;
  describedBy?: string;
  fallbackYear: number;
  min?: string;
}) {
  const shown = value === undefined ? '' : mediumDate(value);
  const [text, setText] = useState(shown);
  const [error, setError] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const errorId = `${useId()}-error`;
  useEffect(() => {
    setText(shown);
    setError(false);
  }, [value]);
  const apply = (): void => {
    if (text.trim() === '') {
      setError(false);
      if (value !== undefined) set(undefined);
      return;
    }
    const iso = parseDate(text, fallbackYear);
    if (iso === null) {
      setError(true);
      return;
    }
    setError(false);
    setText(mediumDate(iso));
    if (iso !== value) set(iso);
  };
  return (
    <span class={`field date${error ? ' is-invalid' : ''}`}>
      <input
        id={id}
        type="text"
        value={text}
        spellcheck={false}
        autocomplete="off"
        placeholder={copy.stops.datePlaceholder}
        aria-label={label}
        aria-describedby={
          [describedBy, error ? errorId : ''].filter(Boolean).join(' ') || undefined
        }
        aria-invalid={error}
        title={copy.stops.dateHelp}
        onInput={(event) => {
          setText(event.currentTarget.value);
          if (error) setError(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') apply();
        }}
        onBlur={apply}
      />
      <button
        type="button"
        class="icon-btn sm"
        aria-label={copy.stops.openCalendar(label)}
        title={copy.stops.openCalendar(label)}
        onClick={() => {
          const el = picker.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
      >
        <UiIcon name="calendar" />
      </button>
      <input
        ref={picker}
        type="date"
        class="date-picker"
        tabIndex={-1}
        aria-hidden="true"
        value={value ?? ''}
        min={min}
        onInput={(event) => {
          const v = event.currentTarget.value;
          set(v === '' ? undefined : v);
        }}
      />
      {error && (
        <span id={errorId} class="callout" role="alert">
          {copy.stops.badDate}
        </span>
      )}
    </span>
  );
}
