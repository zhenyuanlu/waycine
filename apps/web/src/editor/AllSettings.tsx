import { useComputed, useSignalEffect } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { memo } from 'preact/compat';
import { useEffect, useId, useRef } from 'preact/hooks';
import type { FieldDef, SectionId } from 'waycine';
import { UiIcon } from '../app/icons';
import { copy } from '../copy/en';
import { isCoarse, isPhone, isWide } from '../state/media';
import { fontRoleOf, getPath, jsonEqual, setPath } from '../state/paths';
import { activeProfile, baseProject, commit, project, undo } from '../state/project';
import {
  changedOnly,
  dialog,
  focusSettingsSearch,
  groupOpen,
  helpOpen,
  helpPath,
  jsonView,
  revealGroup,
  settingsQuery,
  showToast,
} from '../state/ui';
import {
  allRows,
  GROUPS,
  groupRows,
  matchesQuery,
  SECTION_NUMBER,
  type SettingRow,
  TEMPLATE_PATHS,
} from './catalog';
import {
  AUTO_ZERO_PATHS,
  FieldControl,
  fieldLabel,
  formatValue,
  resetPath,
  rowUnitLabel,
} from './FieldControl';
import { projectJson } from './ProjectFile';
import { currentGroup, scrollToTop, useScrollSpy } from './scrollspy';
import { activeTokenField, InsertRow, type TokenHandle } from './TokenField';

/**
 * Rows without a unit column: text, colours and the font source take the
 * control and unit columns together (their label column matches the other
 * rows); Auto | Custom numbers and long tuples also take part of the label
 * column ("roomy"); chip fields put the label above a full-width field
 * ("stack"), so a subtitle's chips fit.
 */
function rowLayout(field: FieldDef): '' | 'wide' | 'wide roomy' | 'wide stack' {
  if (TEMPLATE_PATHS.has(field.path)) return 'wide stack';
  if (
    field.nullable === true ||
    AUTO_ZERO_PATHS.has(field.path) ||
    (field.kind === 'tuple' && (field.length ?? 2) >= 3)
  ) {
    return 'wide roomy';
  }
  return field.kind === 'text' || field.kind === 'color' || field.path === 'fonts.*.source'
    ? 'wide'
    : '';
}

/** The first sentence of a help text (the inline help line). */
function firstSentence(help: string): string {
  const m = /^.*?[.!?](\s|$)/.exec(help);
  return (m ? m[0] : help).trim();
}

/** Underlines the words of `query` found in `text` (ink underline, no colour). */
function Highlight({ text, query }: { text: string; query: string }): ComponentChildren {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return text;
  const lower = text.toLowerCase();
  const marks = new Array<boolean>(text.length).fill(false);
  for (const w of words) {
    let at = lower.indexOf(w);
    while (at >= 0) {
      for (let i = at; i < at + w.length; i++) marks[i] = true;
      at = lower.indexOf(w, at + w.length);
    }
  }
  const out: ComponentChildren[] = [];
  let i = 0;
  while (i < text.length) {
    const on = marks[i];
    let j = i;
    while (j < text.length && marks[j] === on) j++;
    out.push(on ? <u key={i}>{text.slice(i, j)}</u> : text.slice(i, j));
    i = j;
  }
  return out;
}

/**
 * One setting. It subscribes to its own value only (a computed of its path),
 * so an edit re-renders the row that changed, not every row.
 */
function Row({ row, query }: { row: SettingRow; query: string }) {
  const uid = useId();
  const labelRef = useRef<HTMLLabelElement>(null);
  const unitRef = useRef<HTMLSpanElement>(null);
  const tokenHandle = useRef<TokenHandle | null>(null);
  const { field, path } = row;
  const value = useComputed(() => getPath(project.value, path)).value;
  const base = useComputed(() => getPath(baseProject.value, path)).value;
  const changed = !jsonEqual(value, base);
  const label = fieldLabel(field, path);
  // Under a "Display font" / "Body font" sub-head the role is said once, by the sub-head.
  const role = fontRoleOf(path);
  const shortLabel = role === null ? label : field.label;
  const layout = rowLayout(field);
  const wide = layout !== '';
  const unit = rowUnitLabel(field);
  const profile = activeProfile.value;
  const tag = field.perProfile === true ? copy.editor.profileTag[profile] : undefined;
  // Labels of single inputs click through to them; groups are named by aria-labelledby.
  const forId =
    field.kind === 'bool' ||
    field.kind === 'tuple' ||
    field.nullable === true ||
    TEMPLATE_PATHS.has(field.path)
      ? undefined
      : `${uid}-c`;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover and focus only choose what the help strip describes.
    <div
      class={`row${layout === '' ? '' : ` ${layout}`}${changed ? ' is-changed' : ''}`}
      data-path={path}
      onMouseEnter={() => {
        // Phones have no hover: a tap that moves the layout (the keyboard opening) must not
        // re-point the strip at whatever row slid under the finger. Focus decides there.
        if (!isPhone.peek()) helpPath.value = path;
      }}
      onFocusIn={() => (helpPath.value = path)}
    >
      <span class="dot" aria-hidden="true" />
      <span class="row-label">
        <label
          ref={labelRef}
          id={`${uid}-l`}
          for={forId}
          class={field.kind === 'number' ? 'scrubs' : undefined}
          title={label}
        >
          {role !== null && <span class="sr">{copy.editor.fontRole[role]}: </span>}
          <Highlight text={shortLabel} query={query} />
        </label>
        {tag !== undefined && (
          <span class="ptag" title={copy.editor.profileTagHint(tag)}>
            {tag}
          </span>
        )}
      </span>
      {/* Inline help (QHD and ultrawide): a second line across the label and control columns. */}
      <span class="row-help" aria-hidden="true">
        {firstSentence(field.help)}
      </span>
      <span class="ctl">
        <FieldControl
          field={field}
          path={path}
          variant="row"
          id={`${uid}-c`}
          labelId={`${uid}-l`}
          scrubHandles={[labelRef, unitRef]}
          tokenHandle={tokenHandle}
          unitInField={wide}
          value={value}
        />
      </span>
      {!wide && (
        <span
          class={`u${field.kind === 'number' ? ' scrubs' : ''}`}
          ref={unitRef}
          aria-hidden="true"
        >
          {unit}
        </span>
      )}
      <button
        type="button"
        class="reset icon-btn sm"
        aria-label={copy.editor.changed(label)}
        title={copy.editor.resetTo(formatValue(field, base))}
        tabIndex={changed ? 0 : -1}
        aria-hidden={changed ? undefined : true}
        onClick={() => resetPath(path)}
      >
        <UiIcon name="reset" size={14} />
      </button>
    </div>
  );
}

/**
 * A group 02-12. Memoised: an edit re-renders a group only when its changed
 * count moves (a computed number), and each row only when its own value does.
 */
const Group = memo(function Group({
  id,
  rows,
  query,
  forceOpen,
  matchCount,
}: {
  id: SectionId;
  rows: readonly SettingRow[];
  query: string;
  forceOpen: boolean;
  matchCount: number | null;
}) {
  const uid = useId();
  const explicit = groupOpen.value[id];
  const open = forceOpen || (explicit ?? (isWide.value && !isPhone.value));
  const total = allRows(activeProfile.value).get(id)?.length ?? 0;
  const changed = useComputed(() => {
    const p = project.value;
    const base = baseProject.value;
    return (allRows(activeProfile.value).get(id) ?? []).filter(
      (r) => !jsonEqual(getPath(p, r.path), getPath(base, r.path)),
    ).length;
  }).value;
  const name = copy.sections[id] ?? id;
  const basics = rows.filter((r) => r.basic);
  const more = rows.filter((r) => !r.basic);
  let lastSub: string | null = null;
  return (
    <div class="grp" data-group={id}>
      <div class="grp-head">
        <h3 class="grp-h">
          <button
            type="button"
            class="grp-toggle"
            aria-expanded={open}
            aria-controls={`${uid}-b`}
            aria-labelledby={`${uid}-t`}
            aria-describedby={`${uid}-m`}
            onClick={() => (groupOpen.value = { ...groupOpen.peek(), [id]: !open })}
          >
            <span class="sec-no" aria-hidden="true">
              {SECTION_NUMBER[id]}
            </span>
            <span class="grp-title" id={`${uid}-t`}>
              {name}
            </span>
            <span class="grp-meta" id={`${uid}-m`}>
              {matchCount !== null ? (
                copy.all.matches(matchCount)
              ) : (
                <>
                  <span class={changed > 0 ? 'chg' : 'chg none'}>
                    {changed > 0 ? `${copy.editor.groupChanged(changed)} · ` : ''}
                  </span>
                  {total}
                </>
              )}
            </span>
            <UiIcon name="chevronDown" />
          </button>
        </h3>
        <button
          type="button"
          class="link sm grp-reset"
          style={{ visibility: changed > 0 ? 'visible' : 'hidden' }}
          tabIndex={changed > 0 ? 0 : -1}
          aria-hidden={changed > 0 ? undefined : true}
          title={copy.all.resetGroupHint(name.toLowerCase())}
          onClick={() => resetGroup(id)}
        >
          {copy.all.resetGroup}
        </button>
      </div>
      {open && (
        <div class="grp-body" id={`${uid}-b`}>
          {basics.length > 0 && (
            <p class="cap sub" aria-hidden="true">
              {copy.all.alsoInBasics}
            </p>
          )}
          {basics.map((row) => (
            <Row key={row.path} row={row} query={query} />
          ))}
          {more.length > 0 && basics.length > 0 && (
            <p class="cap sub" aria-hidden="true">
              {copy.all.more}
            </p>
          )}
          {more.map((row) => {
            const heading =
              row.sub !== null && row.sub !== lastSub ? copy.all.subgroups[row.sub] : undefined;
            lastSub = row.sub;
            return (
              <div key={row.path} class="row-wrap">
                {heading !== undefined && (
                  <p class="cap sub sub2" aria-hidden="true">
                    {heading}
                  </p>
                )}
                <Row row={row} query={query} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

/** The fixed help strip: what the hovered or focused setting does. */
function HelpStrip({ rows }: { rows: Map<SectionId, SettingRow[]> }) {
  const path = helpPath.value;
  const row = path === null ? undefined : [...rows.values()].flat().find((r) => r.path === path);
  const token = activeTokenField.value;
  const phone = isPhone.value;
  const expanded = helpOpen.value;
  if (row === undefined) {
    return (
      <div class={`all-help${expanded ? ' is-open' : ''}`}>
        <p class="h2 idle">{isCoarse.value ? copy.all.helpIdleTouch : copy.all.helpIdle}</p>
      </div>
    );
  }
  const { field } = row;
  const value = getPath(project.value, row.path);
  const base = getPath(baseProject.value, row.path);
  const changed = !jsonEqual(value, base);
  const meta = [
    copy.all.defaultIs(formatValue(field, base)),
    field.min !== undefined &&
    field.max !== undefined &&
    (field.kind === 'number' || field.kind === 'tuple')
      ? copy.all.rangeIs(formatValue(field, field.min), formatValue(field, field.max))
      : null,
    changed ? copy.all.changedWord : null,
    field.unit === 'Du' ? copy.editor.unitNotes.Du : null,
  ]
    .filter((x) => x !== null)
    .join(' · ');
  const tokens = token !== null && TEMPLATE_PATHS.has(field.path);
  return (
    <div class={`all-help${expanded ? ' is-open' : ''}`}>
      <div class="h1">
        {/* New nodes per setting: a path of another length is a new line, not a moved one. */}
        <b key={`l-${row.path}`}>{fieldLabel(field, row.path)}</b>
        <code key={`p-${row.path}`} class="path">
          {row.path}
        </code>
        {phone && (
          <button
            type="button"
            class="icon-btn sm help-toggle"
            aria-expanded={expanded}
            aria-label={copy.all.helpToggle}
            // Keep focus (and the phone keyboard) in the field being explained; moving focus
            // would fold the keyboard, move the strip and let the tap miss the button.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => (helpOpen.value = !expanded)}
          >
            <UiIcon name={expanded ? 'chevronDown' : 'help'} size={14} />
          </button>
        )}
      </div>
      {tokens ? (
        <InsertRow
          class="h2"
          stopLabel={token.stopLabel}
          insert={(t) => activeTokenField.peek()?.insert(t)}
        />
      ) : (
        <p class="h2">{field.help}</p>
      )}
      <p class="h3">{meta}</p>
    </div>
  );
}

function JsonView() {
  return (
    <div class="json-wrap">
      <div class="json-tools">
        <button
          type="button"
          class="btn-line sm"
          onClick={() => (dialog.value = { kind: 'project-json' })}
        >
          {copy.all.editJson}
        </button>
      </div>
      <pre class="json-view">{projectJson.value}</pre>
    </div>
  );
}

/** The last "/" request the search field answered. */
let handledSearchRequest = 0;

/** Every concrete path of an All settings group (the active profile). */
function groupPaths(section: SectionId): string[] {
  return groupRows(section, activeProfile.peek()).map((r) => r.path);
}

/**
 * Puts every setting of `section` back to the project's starting point as
 * one undo step (the finale's stat list and the theme too), with an Undo toast.
 */
function resetGroup(section: SectionId): void {
  let next = project.peek();
  const base = baseProject.peek();
  for (const path of groupPaths(section)) {
    const value = getPath(base, path);
    if (!jsonEqual(getPath(next, path), value)) next = setPath(next, path, value);
  }
  if (section === 'stats' && !jsonEqual(next.stats.items, base.stats.items)) {
    next = { ...next, stats: { ...next.stats, items: base.stats.items } };
  }
  if (section === 'look' && !jsonEqual(next.theme, base.theme)) {
    next = { ...next, theme: base.theme };
  }
  if (next === project.peek()) return;
  commit(next);
  const name = copy.sections[section] ?? section;
  showToast(copy.all.resetGroupDone(name), { label: copy.stops.undo, run: undo });
}

/** Resets every changed setting of All settings (one undo step) and offers Undo. */
function resetChanged(paths: string[]): void {
  let next = project.peek();
  const base = baseProject.peek();
  for (const path of paths) next = setPath(next, path, getPath(base, path));
  commit(next);
  showToast(copy.all.resetChangedDone(paths.length), { label: copy.stops.undo, run: undo });
}

/**
 * All settings: a fixed head (search, filters, tools), the
 * groups 02-12 with one row per setting, and a fixed help strip. Docked as
 * its own column on ultrawide screens.
 */
export function AllSettings({ docked = false }: { docked?: boolean }) {
  const searchId = useId();
  const search = useRef<HTMLInputElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const profile = activeProfile.value;
  const rows = allRows(profile);
  const query = settingsQuery.value.trim();
  const onlyChanged = changedOnly.value;
  const p = project.value;
  const base = baseProject.value;
  const allPaths = [...rows.values()].flat();
  const changedPaths = allPaths
    .filter((r) => !jsonEqual(getPath(p, r.path), getPath(base, r.path)))
    .map((r) => r.path);
  const changedSet = new Set(changedPaths);
  const total = allPaths.length;
  const filtered = new Map<SectionId, SettingRow[]>();
  let shown = 0;
  const filtering = query !== '' || onlyChanged;
  for (const g of GROUPS) {
    const all = rows.get(g) ?? [];
    // Unfiltered groups get the cached list itself, so the memoised group skips re-rendering.
    const list = filtering
      ? all.filter(
          (r) =>
            (!onlyChanged || changedSet.has(r.path)) &&
            (query === '' || matchesQuery(r.field, r.path, query)),
        )
      : all;
    filtered.set(g, list);
    shown += list.length;
  }

  useScrollSpy(pane, 'group', (id) => {
    if (currentGroup.peek() !== id) currentGroup.value = id;
  });

  // "/" asks for the search field (each request is handled once).
  useSignalEffect(() => {
    const request = focusSettingsSearch.value;
    if (request > handledSearchRequest) {
      handledSearchRequest = request;
      requestAnimationFrame(() => search.current?.focus());
    }
  });

  // A deep link or the rail asks for a group: open it and bring it to the top.
  useSignalEffect(() => {
    const id = revealGroup.value;
    if (id === null) return;
    requestAnimationFrame(() => {
      const target = pane.current?.querySelector<HTMLElement>(`[data-group="${id}"]`) ?? null;
      scrollToTop(pane.current, target);
      revealGroup.value = null;
    });
  });

  useEffect(
    () => () => {
      helpPath.value = null;
    },
    [],
  );

  return (
    <section class={`all${docked ? ' docked' : ''}`} aria-label={copy.editor.allSettings}>
      <div class="all-head">
        <h2 class="sr">{copy.editor.allSettings}</h2>
        <span class="field has-icon search">
          <UiIcon name="search" />
          <input
            ref={search}
            id={searchId}
            type="search"
            value={settingsQuery.value}
            placeholder={copy.all.searchPlaceholder(total)}
            aria-label={copy.all.searchLabel}
            aria-keyshortcuts="/"
            onInput={(event) => (settingsQuery.value = event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && settingsQuery.peek() !== '') {
                event.stopPropagation();
                event.preventDefault();
                settingsQuery.value = '';
              }
            }}
          />
          {/* While searching, the match count takes the "/" hint's place, inside the field. */}
          {query !== '' ? (
            <span class="all-count" aria-hidden="true">
              {copy.all.matches(shown)}
            </span>
          ) : (
            <kbd class="kbd" title={copy.all.slashHint}>
              /
            </kbd>
          )}
        </span>
        <span class="sr" role="status">
          {query !== '' ? copy.all.matches(shown) : ''}
        </span>
        <button
          type="button"
          class="btn sm json-toggle"
          aria-pressed={jsonView.value}
          onClick={() => (jsonView.value = !jsonView.peek())}
        >
          {jsonView.value ? copy.all.viewList : copy.all.viewJson}
        </button>
        {/* One tools line: the filters (All, Changed) and Reset changed. The collapsed group
            heads below are the index (the rail on wide screens). */}
        <div class="all-tools">
          <fieldset class="chips" aria-label={copy.all.filters}>
            <button
              type="button"
              class="chip"
              aria-pressed={!onlyChanged}
              onClick={() => (changedOnly.value = false)}
            >
              {copy.all.all} <span class="num">{total}</span>
            </button>
            <button
              type="button"
              class="chip"
              aria-pressed={onlyChanged}
              onClick={() => (changedOnly.value = !onlyChanged)}
            >
              {copy.all.changed} <span class="num">{changedPaths.length}</span>
            </button>
          </fieldset>
          <button
            type="button"
            class="btn sm"
            disabled={changedPaths.length === 0}
            onClick={() => resetChanged(changedPaths)}
          >
            {copy.all.resetChanged(changedPaths.length)}
          </button>
        </div>
      </div>
      <div class="scroll all-list" ref={pane}>
        {jsonView.value ? (
          <JsonView />
        ) : shown === 0 ? (
          <p class="no-match">
            {onlyChanged && query === '' ? copy.all.noChanged : copy.all.noMatch(query)}
          </p>
        ) : (
          GROUPS.map((g) => {
            const list = filtered.get(g) ?? [];
            if (filtering && list.length === 0) return null;
            return (
              <Group
                key={g}
                id={g}
                rows={list}
                query={query}
                forceOpen={filtering}
                matchCount={query !== '' ? list.length : null}
              />
            );
          })
        )}
      </div>
      <HelpStrip rows={rows} />
    </section>
  );
}
