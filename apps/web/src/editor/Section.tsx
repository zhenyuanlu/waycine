import type { ComponentChildren } from 'preact';
import { useId, useRef } from 'preact/hooks';
import { FIELD_BY_PATH, type SectionId } from 'waycine';
import { UiIcon } from '../app/icons';
import { copy } from '../copy/en';
import { isPhone } from '../state/media';
import { activeProfile } from '../state/project';
import { collapsedSections, showAllSettings } from '../state/ui';
import { groupRows, SECTION_NUMBER, TEMPLATE_PATHS } from './catalog';
import { FieldControl, fieldLabel, resetPath, segmentable, useFieldValue } from './FieldControl';
import type { TokenHandle } from './TokenField';

function setCollapsed(id: SectionId, collapsed: boolean): void {
  const next = new Set(collapsedSections.peek());
  if (collapsed) next.add(id);
  else next.delete(id);
  collapsedSections.value = next;
}

/**
 * A numbered Basics section: a 1 px rule, a head button with the
 * number, the title and a live summary, then the body. The last line is a
 * descriptive link into All settings.
 */
export function Section({
  id,
  summary,
  summaryLead,
  children,
}: {
  id: SectionId;
  summary: string;
  /**
   * A swatch dot with the summary (Look). It follows the text, at the right end, so a new
   * summary of another length never moves it.
   */
  summaryLead?: ComponentChildren;
  children: ComponentChildren;
}) {
  const uid = useId();
  // The phone shows one section at a time, always open (its bottom bar names it).
  const open = isPhone.value || !collapsedSections.value.has(id);
  const title = copy.sections[id] ?? id;
  return (
    <section class="sec" data-section={id} aria-labelledby={`${uid}-t`}>
      <h2 class="sec-h">
        <button
          type="button"
          class="sec-head"
          aria-expanded={open}
          aria-controls={`${uid}-b`}
          aria-labelledby={`${uid}-t`}
          aria-describedby={`${uid}-s`}
          onClick={() => setCollapsed(id, open)}
        >
          <span class="sec-no" aria-hidden="true">
            {SECTION_NUMBER[id]}
          </span>
          <span class="sec-title" id={`${uid}-t`}>
            {title}
          </span>
          <span class="sec-meta" id={`${uid}-s`}>
            {summary}
            {summaryLead}
          </span>
          <UiIcon name="chevronDown" />
        </button>
      </h2>
      <div class="sec-body" id={`${uid}-b`} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/** "Date formats, separators, caps and 7 more text settings  10 →": opens All settings at the group. */
export function MoreLink({ section }: { section: SectionId }) {
  const total = groupRows(section, activeProfile.value).length;
  const entry = copy.moreLinks[section];
  if (entry === undefined) return null;
  const named = entry.named.split(',').length;
  const text =
    section === 'stats'
      ? entry.named
      : copy.editor.moreLink(entry.named, Math.max(0, total - named), entry.noun);
  return (
    <button type="button" class="more-link" onClick={() => showAllSettings(section)}>
      <span class="ml-t">{text}</span>
      <span class="num">{total}</span>
      <UiIcon name="arrow" size={14} />
    </button>
  );
}

/** The changed-value dot: a reserved slot; shown (and a reset button) when the value differs. */
function ChangedDot({
  label,
  changed,
  onReset,
}: {
  label: string;
  changed: boolean;
  onReset: () => void;
}) {
  return (
    <button
      type="button"
      class={`cdot${changed ? ' on' : ''}`}
      aria-label={copy.editor.changed(label)}
      title={copy.editor.changed(label)}
      tabIndex={changed ? 0 : -1}
      aria-hidden={changed ? undefined : true}
      onClick={onReset}
    />
  );
}

/**
 * A Basics form row: the label in an 88 px column (with the
 * changed dot that resets the value), the control, and an optional note
 * under it.
 */
export function FormRow({
  label,
  htmlFor,
  labelId,
  changed,
  onReset,
  note,
  noteId,
  children,
  class: className = '',
}: {
  label: string;
  htmlFor?: string;
  labelId: string;
  changed?: boolean;
  onReset?: () => void;
  note?: ComponentChildren;
  noteId?: string;
  children: ComponentChildren;
  class?: string;
}) {
  return (
    <>
      <div class={`flabel${className ? ` ${className}` : ''}`}>
        {htmlFor === undefined ? (
          <span id={labelId} title={label}>
            {label}
          </span>
        ) : (
          <label id={labelId} for={htmlFor} title={label}>
            {label}
          </label>
        )}
        {onReset !== undefined && (
          <ChangedDot label={label} changed={changed === true} onReset={onReset} />
        )}
      </div>
      <div class={`fctl${className ? ` ${className}` : ''}`}>
        {children}
        {note !== undefined && (
          <p class="fnote" id={noteId}>
            {note}
          </p>
        )}
      </div>
    </>
  );
}

/** A catalog setting as a Basics row: its label, changed dot and control. */
export function BasicField({
  path,
  label,
  note,
  after,
  below,
  tokenHandle,
}: {
  path: string;
  label?: string;
  note?: ComponentChildren;
  /** Content under the control (the "Shows as" line). */
  after?: ComponentChildren;
  /** A line under the row across both columns (the INSERT row). */
  below?: ComponentChildren;
  tokenHandle?: { current: TokenHandle | null };
}) {
  const uid = useId();
  const field = FIELD_BY_PATH.get(path);
  const { changed } = useFieldValue(path);
  const scrub = useRef<HTMLElement | null>(null);
  if (field === undefined) return null;
  const name = label ?? fieldLabel(field, path);
  // Groups (segmented choices, switches, number pairs, chip fields) are named by aria-labelledby.
  const grouped =
    field.kind === 'bool' ||
    field.kind === 'tuple' ||
    field.nullable === true ||
    TEMPLATE_PATHS.has(field.path) ||
    (field.kind === 'enum' && segmentable(field));
  return (
    <div class="frow-wrap" data-path={path}>
      <FormRow
        label={name}
        htmlFor={grouped ? undefined : `${uid}-c`}
        labelId={`${uid}-l`}
        changed={changed}
        onReset={() => resetPath(path)}
        note={note}
      >
        <FieldControl
          field={field}
          path={path}
          variant="basic"
          id={`${uid}-c`}
          labelId={`${uid}-l`}
          scrubHandles={[scrub]}
          tokenHandle={tokenHandle}
        />
        {after}
      </FormRow>
      {below}
    </div>
  );
}
