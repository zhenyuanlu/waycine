import { useRef, useState } from 'preact/hooks';
import { type FieldDef, THEMES } from 'waycine';
import { UiIcon } from '../app/icons';
import { copy } from '../copy/en';
import {
  FontUploadError,
  localFontNames,
  missingFontRoles,
  resetToBundledFont,
  uploadFont,
} from '../state/local-fonts';
import { fontRoleOf, getPath, jsonEqual } from '../state/paths';
import { applyTheme, baseProject, project, setValue } from '../state/project';
import { showToast } from '../state/ui';
import { TEMPLATE_PATHS } from './catalog';
import {
  ColorField,
  DateField,
  FALLBACK_YEAR,
  formatNumber,
  NumberField,
  Seg,
  type SegOption,
  Select,
  SliderNumber,
  Switch,
  TextField,
} from './controls';
import { TokenField, type TokenHandle } from './TokenField';
import { templateWords } from './templates';

// ---------------------------------------------------------------------------
// Labels and formatting

/** Display label of an enum option. */
export function optionLabel(value: string | number): string {
  if (typeof value === 'number') return String(value);
  return copy.enumLabels[value] ?? value;
}

/** Display label of an enum option of `field` (video sizes read `1080p`, `4K`). */
export function fieldOptionLabel(field: FieldDef, value: string | number): string {
  if (field.path === 'output.shortSide' && typeof value === 'number') {
    return copy.editor.videoSize(value);
  }
  return optionLabel(value);
}

/** Unit shown after a number (`Du` is `px`, fractions are `%`). */
function unitLabel(field: FieldDef): string {
  return field.unit === undefined ? '' : (copy.editor.units[field.unit] ?? field.unit);
}

/**
 * Unit in an All settings row's narrow unit column: none for choices whose
 * labels carry it ("1080p", "29.97"), short forms where the full one does not fit.
 */
export function rowUnitLabel(field: FieldDef): string {
  if (field.kind === 'enum') return '';
  return field.unit === undefined ? '' : (copy.editor.rowUnits[field.unit] ?? unitLabel(field));
}

/** Settings shown as a switch although the project stores a number (`output.supersample`: 1 or 2). */
const SWITCH_PATHS: ReadonlySet<string> = new Set(['output.supersample']);
/** Numbers where 0 means "automatic", shown as Auto | Custom (`output.bitrateMbps`). */
export const AUTO_ZERO_PATHS: ReadonlySet<string> = new Set(['output.bitrateMbps']);
/** The first value a Custom bitrate starts from (Mbps). */
const CUSTOM_BITRATE_MBPS = 12;

/** Shown value = stored value x scale (fractions and opacities are percent). */
function displayScale(field: FieldDef): number {
  return field.unit === 'frac' || field.unit === 'alpha' ? 100 : 1;
}

/** Label of a field at a concrete path (font roles are named). */
export function fieldLabel(field: FieldDef, path: string): string {
  const role = fontRoleOf(path);
  return role === null ? field.label : `${copy.editor.fontRole[role]}: ${field.label}`;
}

/** A number as the help strip and tooltips show it: `2.3 ×`, `55 %`, `24 px`. */
function formatAmount(field: FieldDef, value: number): string {
  const scale = displayScale(field);
  const step = field.step === undefined ? undefined : field.step * scale;
  const unit = unitLabel(field);
  const n = formatNumber(value * scale, step);
  return unit === '' ? n : unit === '°' ? `${n}°` : `${n} ${unit}`;
}

/** A value as the help strip and the reset tooltip name it. */
export function formatValue(field: FieldDef, value: unknown): string {
  if (value === null) return copy.editor.auto;
  if (SWITCH_PATHS.has(field.path)) return value === 2 ? copy.editor.on : copy.editor.off;
  if (AUTO_ZERO_PATHS.has(field.path) && value === 0) return copy.editor.auto;
  if (typeof value === 'boolean') return value ? copy.editor.on : copy.editor.off;
  if (typeof value === 'number') {
    return field.kind === 'enum' ? fieldOptionLabel(field, value) : formatAmount(field, value);
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'number' ? formatAmount(field, v) : String(v)))
      .join(', ');
  }
  if (typeof value === 'string') {
    if (field.kind === 'enum') return optionLabel(value);
    if (TEMPLATE_PATHS.has(field.path)) return `“${templateWords(value)}”`;
    return field.kind === 'color' ? value : `“${value}”`;
  }
  return String(value);
}

function tupleKey(path: string): keyof typeof copy.editor.tupleParts {
  if (path.endsWith('nudgeDeg')) return 'nudge';
  if (path.endsWith('lonLabelOffset')) return 'lonLabel';
  if (path.endsWith('latLabelOffset')) return 'latLabel';
  if (path === 'pins.rings') return 'rings';
  if (/offsetDu|stopPin|leaderFrom|leaderTo/.test(path)) return 'offset';
  return 'default';
}

/** Short enum labels fit a segmented control (4 options or fewer, 10 characters each). */
export function segmentable(field: FieldDef): boolean {
  const options = field.options ?? [];
  if (options.length === 0 || options.length > 4) return false;
  // segmented only when every label is 10 characters or fewer; half of the
  // 416 px editor's control column cannot hold "Intro and finale", so that is a select.
  return options.every((o) => fieldOptionLabel(field, o).length <= 10);
}

// ---------------------------------------------------------------------------
// Value state

/** The value at `path`, the project's starting value, and whether it changed. */
export function useFieldValue(path: string) {
  const value = getPath(project.value, path);
  const base = getPath(baseProject.value, path);
  return { value, base, changed: !jsonEqual(value, base) };
}

/** Resets one value to the project's starting point. */
export function resetPath(path: string): void {
  setValue(path, getPath(baseProject.peek(), path), `${path}:reset`);
}

// ---------------------------------------------------------------------------
// Special controls

function ThemeSelect({ id }: { id: string }) {
  const theme = project.value.theme;
  const options: SegOption<string>[] = [
    ...THEMES.map((t) => ({ value: t.id, label: t.label })),
    { value: 'custom', label: optionLabel('custom'), disabled: true },
  ];
  return (
    <Select
      id={id}
      options={options}
      value={theme.id}
      set={(next) => {
        if (next !== 'custom') applyTheme(next);
      }}
    />
  );
}

/** A font role's source: the bundled face, or a TTF/OTF uploaded to this browser. */
function FontSourceControl({ path }: { path: string }) {
  const role = fontRoleOf(path);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (role === null) return null;
  const ref = project.value.fonts[role];
  const local = ref.source === 'local';
  const name = !local
    ? copy.look.bundledName[role]
    : missingFontRoles.value.has(role)
      ? copy.look.missingName
      : copy.look.uploadedName(localFontNames.value.get(ref.localId ?? '') ?? ref.family);
  return (
    <span class="font-src">
      <button
        type="button"
        class="btn-line sm"
        disabled={busy}
        title={`${copy.look.fontCurrent(name)}. ${copy.look.uploadHint}`}
        aria-label={`${copy.look.upload}: ${copy.editor.fontRole[role]}`}
        onClick={() => input.current?.click()}
      >
        <UiIcon name="upload" size={14} />
        <span>{local ? optionLabel('local') : optionLabel('bundled')}</span>
      </button>
      {local && (
        <button type="button" class="link sm" onClick={() => resetToBundledFont(role)}>
          {copy.look.useBundled}
        </button>
      )}
      <span class="sr">{copy.look.fontCurrent(name)}</span>
      <input
        ref={input}
        type="file"
        class="sr"
        tabIndex={-1}
        aria-hidden="true"
        accept=".ttf,.otf,font/ttf,font/otf,application/font-sfnt,application/x-font-ttf"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          setBusy(true);
          uploadFont(role, file)
            .catch((error: unknown) => {
              showToast(
                copy.look.uploadFailed(
                  error instanceof FontUploadError ? error.message : file.name,
                ),
              );
            })
            .finally(() => setBusy(false));
        }}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// The generic control

interface ControlProps {
  field: FieldDef;
  path: string;
  /** All settings row (compact, no slider) or a Basics row. */
  variant: 'row' | 'basic';
  id: string;
  /** Id of the visible label element. */
  labelId: string;
  describedBy?: string;
  /** Elements that scrub a number when dragged (the row label, the unit column). */
  scrubHandles?: readonly { current: HTMLElement | null }[];
  tokenHandle?: { current: TokenHandle | null };
  /** Show the unit inside the number field (Basics, wide rows); other rows have a unit column. */
  unitInField?: boolean;
  /** The value, when the caller already has it (All settings rows subscribe to their own path only). */
  value?: unknown;
}

/**
 * The control for one catalog entry at a concrete path: numbers, colours,
 * enums, switches, tuples, template text (chips) and plain text, each in the
 * size of its variant.
 */
export function FieldControl({
  field,
  path,
  variant,
  id,
  labelId,
  describedBy,
  scrubHandles,
  tokenHandle,
  unitInField = variant === 'basic',
  value: given,
}: ControlProps) {
  const value = given === undefined ? getPath(project.value, path) : given;
  const label = fieldLabel(field, path);
  const set = (next: unknown): void => setValue(path, next);

  if (field.path === 'theme.id') return <ThemeSelect id={id} />;
  if (field.path === 'fonts.*.source') return <FontSourceControl path={path} />;
  if (SWITCH_PATHS.has(field.path)) {
    return (
      <Switch
        id={id}
        checked={value === 2}
        set={(on) => set(on ? 2 : 1)}
        labelledBy={labelId}
        describedBy={describedBy}
      />
    );
  }
  if (AUTO_ZERO_PATHS.has(field.path)) {
    const auto = value === 0 || typeof value !== 'number';
    const unit = unitLabel(field);
    return (
      <span class="nullable">
        <Seg
          labelledBy={labelId}
          options={[
            { value: true, label: copy.editor.auto, title: copy.editor.bitrateAuto },
            { value: false, label: copy.editor.customValue },
          ]}
          value={auto}
          set={(nextAuto) => set(nextAuto ? 0 : CUSTOM_BITRATE_MBPS)}
        />
        <NumberField
          value={auto ? null : (value as number)}
          set={set}
          min={field.step ?? 0.5}
          max={field.max}
          step={field.step}
          label={label}
          id={id}
          describedBy={describedBy}
          disabled={auto}
          placeholder={copy.editor.bitrateAuto}
          unit={unitInField && unit !== '' ? unit : undefined}
          rangeBar
          scrubHandles={scrubHandles}
        />
      </span>
    );
  }

  const appliesToCustom = field.path === 'output.width' || field.path === 'output.height';
  const disabled = appliesToCustom && project.value.output.aspect !== 'custom';

  switch (field.kind) {
    case 'number': {
      const scale = displayScale(field);
      const unit = unitLabel(field);
      if (field.nullable === true) {
        const auto = value === null;
        const n =
          typeof value === 'number'
            ? value
            : (field.min ?? 0) + ((field.max ?? 1) - (field.min ?? 0)) / 2;
        return (
          <span class="nullable">
            <Seg
              labelledBy={labelId}
              options={[
                { value: true, label: copy.editor.auto, title: copy.editor.nullableAuto },
                { value: false, label: copy.editor.customValue },
              ]}
              value={auto}
              set={(nextAuto) => set(nextAuto ? null : n)}
            />
            <NumberField
              value={auto ? null : n}
              set={set}
              min={field.min}
              max={field.max}
              step={field.step}
              scale={scale}
              label={label}
              id={id}
              describedBy={describedBy}
              disabled={auto}
              placeholder={copy.editor.autoPlaceholder(copy.editor.auto.toLowerCase())}
              unit={unitInField && unit !== '' ? unit : undefined}
              rangeBar
              scrubHandles={scrubHandles}
            />
          </span>
        );
      }
      const n = typeof value === 'number' ? value : (field.min ?? 0);
      const bounded =
        field.min !== undefined &&
        field.max !== undefined &&
        field.max > field.min &&
        (field.min <= 0 || field.max / field.min < 1000);
      if (variant === 'basic' && bounded) {
        return (
          <SliderNumber
            value={n}
            set={set}
            min={field.min as number}
            max={field.max as number}
            step={field.step}
            scale={scale}
            label={label}
            id={id}
            describedBy={describedBy}
            disabled={disabled}
            unit={unit === '' ? undefined : unit}
          />
        );
      }
      return (
        <NumberField
          value={n}
          set={set}
          min={field.min}
          max={field.max}
          step={field.step}
          scale={scale}
          label={label}
          id={id}
          describedBy={describedBy}
          disabled={disabled}
          unit={unitInField && unit !== '' ? unit : undefined}
          rangeBar
          scrubHandles={scrubHandles}
        />
      );
    }
    case 'tuple': {
      const list = Array.isArray(value) ? (value as number[]) : [];
      const count = Math.max(field.length ?? 2, list.length);
      const key = tupleKey(path);
      const axes = copy.editor.tupleParts[key];
      const names = copy.editor.tupleNames[key];
      const scale = displayScale(field);
      return (
        <fieldset class="tuple" aria-labelledby={labelId}>
          {Array.from({ length: count }, (_, i) => (
            <NumberField
              key={i}
              value={list[i] ?? 0}
              set={(v) => {
                const next = [...list];
                while (next.length < count) next.push(0);
                next[i] = v;
                set(next);
              }}
              min={field.min}
              max={field.max}
              step={field.step}
              scale={scale}
              label={`${label}: ${names[i] ?? String(i + 1)}`}
              id={i === 0 ? id : undefined}
              describedBy={describedBy}
              axis={axes[i] ?? String(i + 1)}
              rangeBar
              scrubHandles={i === 0 ? scrubHandles : undefined}
            />
          ))}
        </fieldset>
      );
    }
    case 'color':
      return (
        <ColorField
          value={typeof value === 'string' ? value : '#000000'}
          set={set}
          label={label}
          id={id}
          describedBy={describedBy}
        />
      );
    case 'bool':
      return (
        <Switch
          id={id}
          checked={value === true}
          set={set}
          labelledBy={labelId}
          describedBy={describedBy}
        />
      );
    case 'enum': {
      const options = (field.options ?? []).map((o) => ({
        value: o,
        label: fieldOptionLabel(field, o),
      }));
      if (variant === 'basic' && segmentable(field)) {
        return (
          <Seg
            options={options}
            value={value as string | number}
            set={set}
            labelledBy={labelId}
            describedBy={describedBy}
          />
        );
      }
      return (
        <Select
          id={id}
          options={options}
          value={value as string | number}
          set={set}
          describedBy={describedBy}
        />
      );
    }
    case 'date':
      return (
        <DateField
          value={typeof value === 'string' ? value : undefined}
          set={set}
          label={label}
          id={id}
          describedBy={describedBy}
          fallbackYear={FALLBACK_YEAR}
        />
      );
    default: {
      const text = typeof value === 'string' ? value : '';
      if (TEMPLATE_PATHS.has(field.path)) {
        return (
          <TokenField
            value={text}
            set={set}
            labelledBy={labelId}
            id={id}
            describedBy={describedBy}
            placeholder={copy.editor.placeholders[path]}
            stopLabel={field.path === 'text.kicker'}
            handleRef={tokenHandle}
          />
        );
      }
      return (
        <TextField
          value={text}
          set={set}
          labelledBy={labelId}
          id={id}
          describedBy={describedBy}
          placeholder={copy.editor.placeholders[path]}
        />
      );
    }
  }
}
