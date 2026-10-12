import { computed, signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { type ValidationIssue, validateProject, type WaycineProject } from 'waycine';
import { Dialog } from '../app/Dialog';
import { UiIcon } from '../app/icons';
import { LICENSES_URL, SOURCE_URL } from '../app/links';
import { copy } from '../copy/en';
import { compactProject } from '../state/compact';
import { commit, project, undo } from '../state/project';
import { closeDialog, dialog, showToast } from '../state/ui';

/** Issues shown before "…and N more". */
const MAX_ISSUES_SHOWN = 50;

/** Outcome of the last Apply, shown in the project-file dialog. */
type ApplyOutcome =
  | { kind: 'none' }
  | { kind: 'syntax'; message: string }
  /** `project`: the project the Apply made; the list is stale (hidden) once the project changes. */
  | { kind: 'applied'; issues: ValidationIssue[]; project: WaycineProject };

/** The current project as the dialog shows it (settings equal to the defaults are left out). */
export const projectJson = computed(
  () => `${JSON.stringify(compactProject(project.value), null, 2)}\n`,
);

/** Unapplied text typed into the dialog, or null when it shows the project as is. */
const jsonDraft = signal<string | null>(null);

const applyOutcome = signal<ApplyOutcome>({ kind: 'none' });

/** Top-level parts of a project a draft may leave out (they then go back to the defaults). */
const SECTION_KEYS = [
  'meta',
  'text',
  'theme',
  'fonts',
  'timing',
  'camera',
  'route',
  'pins',
  'card',
  'graticule',
  'hud',
  'stats',
  'output',
  'layouts',
] as const;

/**
 * What an Apply of `raw` would throw away: parts of the current project that
 * differ from the defaults but that the draft does not mention, and whether
 * stops disappear.
 */
function applyLosses(
  raw: unknown,
  current: WaycineProject,
  next: WaycineProject,
): { stops: [number, number]; sections: string[] } | null {
  const mentioned =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? new Set(Object.keys(raw))
      : new Set<string>();
  const kept = compactProject(current) as Record<string, unknown>;
  const sections = SECTION_KEYS.filter((key) => key in kept && !mentioned.has(key));
  const stops: [number, number] = [current.stops.length, next.stops.length];
  if (sections.length === 0 && stops[1] >= stops[0]) return null;
  return { stops, sections };
}

function commitApplied(next: WaycineProject, issues: ValidationIssue[]): void {
  commit(next);
  jsonDraft.value = null;
  applyOutcome.value = { kind: 'applied', issues, project: project.peek() };
  showToast(copy.json.applied, { label: copy.stops.undo, run: undo });
  // Repairs are listed in the dialog; a clean Apply closes it.
  if (issues.length > 0) dialog.value = { kind: 'project-json' };
  else closeDialog();
}

/**
 * Validates the draft and makes the repaired project current (one undo step,
 * with an Undo toast). A draft that would drop stops, or reset parts of the
 * project it does not mention, asks first.
 */
function applyJsonDraft(): void {
  const text = jsonDraft.peek() ?? projectJson.peek();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    applyOutcome.value = {
      kind: 'syntax',
      message: err instanceof Error ? err.message : String(err),
    };
    return;
  }
  const result = validateProject(parsed);
  const losses = applyLosses(parsed, project.peek(), result.project);
  if (losses === null) {
    commitApplied(result.project, result.issues);
    return;
  }
  dialog.value = {
    kind: 'confirm-json',
    stops: losses.stops,
    sections: losses.sections.map((key) => copy.jsonParts[key] ?? key),
    apply: () => commitApplied(result.project, result.issues),
  };
}

function Outcome() {
  const outcome = applyOutcome.value;
  const first = useRef<HTMLLIElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, [outcome]);
  if (outcome.kind === 'none') return null;
  if (outcome.kind === 'syntax') {
    return (
      <p class="json-outcome err" role="alert">
        {copy.json.syntaxError(outcome.message)}
      </p>
    );
  }
  // After an undo or any other edit the list describes a project that is gone.
  if (outcome.project !== project.value || outcome.issues.length === 0) return null;
  const shown = outcome.issues.slice(0, MAX_ISSUES_SHOWN);
  return (
    <div class="json-outcome" role="status">
      <p>{copy.json.appliedIssues(outcome.issues.length)}</p>
      <ul class="issues">
        {shown.map((issue, i) => (
          <li
            key={`${issue.path}-${issue.code}-${i}`}
            ref={i === 0 ? first : undefined}
            tabIndex={i === 0 ? -1 : undefined}
            class={`issue ${issue.level}`}
          >
            <code>{issue.path === '' ? copy.json.projectRoot : issue.path}</code>: {issue.message}
          </li>
        ))}
      </ul>
      {outcome.issues.length > shown.length && (
        <p class="fnote">{copy.json.moreIssues(outcome.issues.length - shown.length)}</p>
      )}
    </div>
  );
}

/** "Project file (.waycine.json)": a monospace editor of the whole project, with Apply. */
export function ProjectJsonDialog() {
  const open = dialog.value.kind === 'project-json';
  useEffect(() => {
    if (!open) return;
    // A fresh look each time: the text follows the project until the user types.
    if (applyOutcome.peek().kind === 'syntax') applyOutcome.value = { kind: 'none' };
  }, [open]);
  const text = jsonDraft.value ?? projectJson.value;
  const lines = text.split('\n').length;
  return (
    <Dialog
      open={open}
      title={copy.json.title}
      kicker={copy.json.kicker}
      onClose={() => {
        jsonDraft.value = null;
        closeDialog();
      }}
      class="json-dialog"
    >
      <p class="fnote" id="json-help">
        {copy.json.help}
      </p>
      <div class="json-edit">
        <pre class="json-lines" aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => `${i + 1}`).join('\n')}
        </pre>
        <textarea
          class="json-text"
          value={text}
          onInput={(event) => {
            jsonDraft.value = event.currentTarget.value;
          }}
          onScroll={(event) => {
            const gutter = event.currentTarget.previousElementSibling;
            if (gutter instanceof HTMLElement) gutter.scrollTop = event.currentTarget.scrollTop;
          }}
          spellcheck={false}
          autocomplete="off"
          wrap="off"
          aria-label={copy.json.textareaLabel}
          aria-describedby="json-help"
        />
      </div>
      <Outcome />
      <div class="dialog-actions">
        <button
          type="button"
          class="btn-line"
          onClick={() => {
            jsonDraft.value = null;
            closeDialog();
          }}
        >
          {copy.json.cancel}
        </button>
        <button type="button" class="btn-primary" onClick={applyJsonDraft}>
          {copy.json.apply}
        </button>
      </div>
    </Dialog>
  );
}

/** The end of the editor: the project file row and the privacy line. */
export function ProjectFileBlock() {
  return (
    <div class="pf">
      <button
        type="button"
        class="pf-row"
        onClick={() => (dialog.value = { kind: 'project-json' })}
      >
        <b>{copy.projectFile.title}</b>
        <span class="pf-link">
          {copy.projectFile.view}
          <UiIcon name="arrow" size={14} />
        </span>
      </button>
      <p class="fnote">{copy.projectFile.reassurance}</p>
      <p class="fnote pf-about">
        {copy.projectFile.about}{' '}
        <a
          class="link"
          href={LICENSES_URL}
          target="_blank"
          rel="noopener"
          title={copy.projectFile.licensesHint}
        >
          {copy.projectFile.licenses}
        </a>
        {' · '}
        <a
          class="link"
          href={SOURCE_URL}
          target="_blank"
          rel="noopener"
          title={copy.projectFile.sourceHint}
        >
          {copy.projectFile.source}
        </a>
      </p>
    </div>
  );
}
