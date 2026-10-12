import { useEffect, useId, useMemo, useState } from 'preact/hooks';
import { copy } from '../copy/en';
import { ProjectJsonDialog } from '../editor/ProjectFile';
import { ImportListDialog } from '../editor/stops/ImportListDialog';
import { ExportDialog } from '../export/ExportDialog';
import { frame } from '../player/player';
import {
  createShareLink,
  replacingLosesEdits,
  type StartChoice,
  saveProjectFile,
  startFrom,
} from '../state/actions';
import { renderProject } from '../state/engine';
import { issueLine } from '../state/issues';
import { recentProjects, removeRecent } from '../state/persist';
import { PRESETS } from '../state/presets';
import { project } from '../state/project';
import { closeDialog, dialog, expandedStop, focusCityOf, showSection } from '../state/ui';
import { Dialog } from './Dialog';
import { UiIcon } from './icons';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * "Start from...": presets, own stops, blank, and Recent; asks before replacing an edited
 * project. The demo picker opens it at that question.
 */
function StartFromDialog() {
  const state = dialog.value;
  const open = state.kind === 'start';
  // The demo picker opens the dialog straight at the question, for its demo.
  const asked = state.kind === 'start' ? state.confirmPreset : undefined;
  const fromPicker: StartChoice | null = asked === undefined ? null : { kind: 'preset', id: asked };
  const [picked, setPicked] = useState<StartChoice | null>(null);
  useEffect(() => {
    if (open) setPicked(null);
  }, [open]);
  const pending = picked ?? fromPicker;
  const choose = (choice: StartChoice): void => {
    if (replacingLosesEdits() && pending === null) {
      setPicked(choice);
      return;
    }
    startFrom(choice);
    closeDialog();
    if (choice.kind === 'own-stops') showSection('stops');
  };
  const recent = recentProjects.value;
  return (
    <Dialog
      open={open}
      title={pending === null ? copy.start.title : copy.start.confirmTitle}
      onClose={closeDialog}
    >
      {pending !== null ? (
        <>
          <p>{copy.start.confirmBody}</p>
          <div class="dialog-actions">
            <button
              type="button"
              class="btn-line"
              onClick={() => (fromPicker === null ? setPicked(null) : closeDialog())}
            >
              {copy.start.cancel}
            </button>
            <button
              type="button"
              class="btn-primary"
              // biome-ignore lint/a11y/noAutofocus: the first action of a modal dialog takes focus.
              autoFocus
              onClick={() => {
                startFrom(pending);
                closeDialog();
              }}
            >
              {copy.start.replace}
            </button>
          </div>
        </>
      ) : (
        <>
          <ul class="choice-list">
            <li>
              <button type="button" class="choice" onClick={() => choose({ kind: 'own-stops' })}>
                <span class="choice-title">{copy.start.ownStops}</span>
                <span class="choice-hint">{copy.start.ownStopsHint}</span>
              </button>
            </li>
            {PRESETS.map((preset) => (
              <li key={preset.id}>
                <button
                  type="button"
                  class="choice"
                  onClick={() => choose({ kind: 'preset', id: preset.id })}
                >
                  <span class="choice-title">{preset.label}</span>
                  <span class="choice-hint">{preset.hint}</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" class="choice" onClick={() => choose({ kind: 'blank' })}>
                <span class="choice-title">{copy.start.blank}</span>
                <span class="choice-hint">{copy.start.blankHint}</span>
              </button>
            </li>
          </ul>
          <h3 class="cap dlg-sub">{copy.start.recent}</h3>
          {recent.length === 0 ? (
            <p class="fnote">{copy.start.recentEmpty}</p>
          ) : (
            <ul class="choice-list recent-list">
              {recent.map((entry) => (
                <li key={entry.id} class="recent-item">
                  <button
                    type="button"
                    class="choice"
                    onClick={() => choose({ kind: 'recent', entry })}
                  >
                    <span class="choice-title">{entry.name}</span>
                    <span class="choice-hint">
                      {copy.start.recentLine(entry.stops, formatDate(entry.savedAt))}
                    </span>
                  </button>
                  <button
                    type="button"
                    class="icon-btn"
                    aria-label={copy.start.removeRecent(entry.name)}
                    title={copy.start.removeRecent(entry.name)}
                    onClick={() => removeRecent(entry.id)}
                  >
                    <UiIcon name="close" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Dialog>
  );
}

/** Share: the link (copied on request), or a file suggestion when the link is too long. */
function ShareDialog() {
  const open = dialog.value.kind === 'share';
  const linkId = useId();
  const [link, setLink] = useState<{ url: string; tooLong: boolean } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showLong, setShowLong] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLink(null);
    setNote(null);
    setShowLong(false);
    let alive = true;
    void createShareLink().then((made) => {
      if (alive) setLink(made);
    });
    return () => {
      alive = false;
    };
  }, [open]);
  const copyLink = async (): Promise<void> => {
    if (link === null) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setNote(copy.share.copied);
    } catch {
      setNote(copy.share.copyFailed);
    }
  };
  const local =
    project.value.fonts.display.source === 'local' || project.value.fonts.body.source === 'local';
  return (
    <Dialog open={open} title={copy.share.title} onClose={closeDialog}>
      {link === null ? (
        <p role="status">{copy.share.making}</p>
      ) : link.tooLong && !showLong ? (
        <>
          <p>{copy.share.tooLong(link.url.length)}</p>
          <div class="dialog-actions">
            <button type="button" class="btn-line" onClick={() => setShowLong(true)}>
              {copy.share.copyAnyway}
            </button>
            <button
              type="button"
              class="btn-primary"
              onClick={() => {
                saveProjectFile();
                closeDialog();
              }}
            >
              {copy.share.saveFile}
            </button>
          </div>
        </>
      ) : (
        <>
          <p class="fnote">{copy.share.intro}</p>
          {local && <p class="fnote">{copy.share.fontNote}</p>}
          <label class="dlg-label" for={linkId}>
            {copy.share.linkLabel}
          </label>
          <span class="field">
            <input
              id={linkId}
              type="text"
              class="share-link"
              readOnly
              value={link.url}
              onFocus={(event) => event.currentTarget.select()}
            />
          </span>
          {/* Always one line tall, so "Link copied." does not push the buttons down. */}
          <p class="fnote share-note" role="status">
            {note ?? ''}
          </p>
          <div class="dialog-actions">
            <button type="button" class="btn-line" onClick={closeDialog}>
              {copy.share.close}
            </button>
            <button
              type="button"
              class="btn-primary"
              // biome-ignore lint/a11y/noAutofocus: the first action of a modal dialog takes focus.
              autoFocus
              onClick={() => void copyLink()}
            >
              {copy.share.copy}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** A file with problems (load with defaults?) or one that is not JSON at all. */
function OpenDialogs() {
  const state = dialog.value;
  if (state.kind === 'open-issues') {
    const shown = state.issues.slice(0, 10);
    return (
      <Dialog open title={copy.open.issuesTitle(state.fileName)} onClose={closeDialog}>
        <p>{copy.open.issuesIntro}</p>
        <ul class="issues">
          {shown.map((issue, i) => (
            <li key={`${issue.path}-${i}`} class={`issue ${issue.level}`}>
              {issueLine(issue)}
            </li>
          ))}
        </ul>
        {state.issues.length > shown.length && (
          <p class="fnote">{copy.open.moreIssues(state.issues.length - shown.length)}</p>
        )}
        <details class="tech-details">
          <summary>{copy.open.detailsLabel}</summary>
          <pre class="error-detail">
            {state.issues
              .map(
                (issue) =>
                  `${issue.level} ${issue.path || copy.open.rootPath} [${issue.code}] ${issue.message}`,
              )
              .join('\n')}
          </pre>
        </details>
        <div class="dialog-actions">
          <button type="button" class="btn-line" onClick={closeDialog}>
            {copy.open.cancel}
          </button>
          <button type="button" class="btn-primary" onClick={state.load}>
            {copy.open.loadAnyway}
          </button>
        </div>
      </Dialog>
    );
  }
  if (state.kind === 'open-error') {
    return (
      <Dialog open title={copy.open.errorTitle(state.fileName)} onClose={closeDialog}>
        <p>{copy.open.errorBody}</p>
        <details class="tech-details">
          <summary>{copy.open.detailsLabel}</summary>
          <pre class="error-detail">{state.message}</pre>
        </details>
        <div class="dialog-actions">
          <button
            type="button"
            class="btn-primary"
            // biome-ignore lint/a11y/noAutofocus: the first action of a modal dialog takes focus.
            autoFocus
            onClick={closeDialog}
          >
            {copy.open.ok}
          </button>
        </div>
      </Dialog>
    );
  }
  if (state.kind === 'share-error') {
    return (
      <Dialog open title={copy.share.brokenTitle} onClose={closeDialog}>
        <p>{copy.share.brokenBody}</p>
        <pre class="error-detail">{state.message}</pre>
        <div class="dialog-actions">
          <button type="button" class="btn-primary" onClick={closeDialog}>
            {copy.open.ok}
          </button>
        </div>
      </Dialog>
    );
  }
  return null;
}

/** Export needs every visible stop to have a name. */
function ExportBlockedDialog() {
  const state = dialog.value;
  if (state.kind !== 'export-blocked') return null;
  return (
    <Dialog open title={copy.exportBlocked.title} onClose={closeDialog}>
      <p>
        {state.reason === 'no-stops'
          ? copy.exportBlocked.noStops
          : copy.exportBlocked.noName(state.number)}
      </p>
      <div class="dialog-actions">
        <button type="button" class="btn-line" onClick={closeDialog}>
          {copy.exportBlocked.close}
        </button>
        {state.reason === 'no-name' && (
          <button
            type="button"
            class="btn-primary"
            // biome-ignore lint/a11y/noAutofocus: the first action of a modal dialog takes focus.
            autoFocus
            onClick={() => {
              closeDialog();
              showSection('stops');
              expandedStop.value = state.stopId;
              // After the dialog has closed and handed focus back, move it to the empty City label.
              requestAnimationFrame(() => {
                focusCityOf.value = state.stopId;
              });
            }}
          >
            {copy.exportBlocked.goTo(state.number)}
          </button>
        )}
      </div>
    </Dialog>
  );
}

/** Project JSON: an Apply that would drop stops or reset parts the draft leaves out asks first. */
function ConfirmJsonDialog() {
  const state = dialog.value;
  if (state.kind !== 'confirm-json') return null;
  const [before, after] = state.stops;
  return (
    <Dialog open title={copy.json.confirmTitle} onClose={closeDialog}>
      {after < before && <p>{copy.json.confirmStops(before, after)}</p>}
      {state.sections.length > 0 && <p>{copy.json.confirmSections(state.sections.join(', '))}</p>}
      <p class="fnote">{copy.json.confirmHint}</p>
      <div class="dialog-actions">
        <button
          type="button"
          class="btn-line"
          // biome-ignore lint/a11y/noAutofocus: the safe choice of a destructive confirmation takes focus.
          autoFocus
          onClick={closeDialog}
        >
          {copy.json.cancel}
        </button>
        <button
          type="button"
          class="btn-primary"
          onClick={() => {
            closeDialog();
            state.apply();
          }}
        >
          {copy.json.applyAnyway}
        </button>
      </div>
    </Dialog>
  );
}

/** The export dialog (owned by the export module), opened from the header. */
function ExportEntry() {
  const open = dialog.value.kind === 'export';
  // The frame on screen when the dialog opened ("Save current frame as PNG").
  const openedAt = useMemo(() => (open ? frame.peek() : 0), [open]);
  return (
    <ExportDialog
      project={renderProject.value}
      open={open}
      onClose={closeDialog}
      currentFrame={openedAt}
    />
  );
}

/** Every dialog of the app; at most one is open. */
export function Dialogs() {
  return (
    <>
      <StartFromDialog />
      <ShareDialog />
      <OpenDialogs />
      <ExportBlockedDialog />
      <ConfirmJsonDialog />
      <ImportListDialog />
      <ProjectJsonDialog />
      <ExportEntry />
    </>
  );
}
