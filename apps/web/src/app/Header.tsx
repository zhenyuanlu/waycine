import { useRef, useState } from 'preact/hooks';
import { copy } from '../copy/en';
import { openProjectFile, requestExport, saveProjectFile } from '../state/actions';
import { isPhone } from '../state/media';
import { saveStatus } from '../state/persist';
import { canRedo, canUndo, project, redo, setValue, undo } from '../state/project';
import { dialog, linkIsDemo, safeZones, type ThemeMode, theater, themeMode } from '../state/ui';
import { UiIcon, type UiIconName } from './icons';
import { LICENSES_URL, SOURCE_URL } from './links';
import { MenuButton, type MenuEntry, Popover } from './Menu';

/** Opens the hidden file picker for project files (also used by Ctrl+O). */
export function openFilePicker(): void {
  document.getElementById('open-project-input')?.click();
}

const MODE_ICON: Record<ThemeMode, UiIconName> = { system: 'monitor', light: 'sun', dark: 'moon' };

function themeItems(): MenuEntry[] {
  return (['system', 'light', 'dark'] as const).map((mode) => ({
    kind: 'radio',
    label: copy.header.themeModes[mode],
    checked: themeMode.value === mode,
    onSelect: () => (themeMode.value = mode),
  }));
}

/** The autosave state in a fixed slot: "✓ Saved", "Saving…", or "Not saved" with a way out. */
function SaveState() {
  const status = saveStatus.value;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <span class={`save-state ${status}`}>
      {status === 'saving' && <span>{copy.saveState.saving}</span>}
      {/* An untouched project (the first visit) has nothing to lose: it reads as saved. */}
      {(status === 'saved' || status === 'idle') && (
        <>
          <UiIcon name="check" size={14} />
          <span>{copy.saveState.saved}</span>
        </>
      )}
      {status === 'paused' && (
        <span>{linkIsDemo.value ? copy.saveState.pausedDemo : copy.saveState.paused}</span>
      )}
      {status === 'failed' && (
        <button
          type="button"
          class="save-fail"
          aria-expanded={anchor !== null}
          onClick={(event) => setAnchor(anchor === null ? event.currentTarget : null)}
        >
          <UiIcon name="warn" size={14} />
          <span>{copy.saveState.failed}</span>
        </button>
      )}
      {anchor !== null && status === 'failed' && (
        <Popover anchor={anchor} label={copy.saveState.failedTitle} onClose={() => setAnchor(null)}>
          <div class="pop-note">
            <p>{copy.saveState.failedBody}</p>
            <button
              type="button"
              class="btn-line sm"
              onClick={() => {
                saveProjectFile();
                setAnchor(null);
              }}
            >
              <UiIcon name="download" size={14} />
              {copy.saveState.download}
            </button>
          </div>
        </Popover>
      )}
    </span>
  );
}

/** The project name, edited in place: Enter keeps it, Esc puts the old name back. */
function ProjectName() {
  const before = useRef(project.value.meta.name);
  return (
    <input
      type="text"
      class="project-name"
      value={project.value.meta.name}
      spellcheck={false}
      autocomplete="off"
      aria-label={copy.header.projectName}
      title={project.value.meta.name}
      onFocus={() => {
        before.current = project.peek().meta.name;
      }}
      onInput={(event) => setValue('meta.name', event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          event.stopPropagation();
          setValue('meta.name', before.current);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function FileInput() {
  return (
    <input
      id="open-project-input"
      type="file"
      class="sr"
      tabIndex={-1}
      aria-label={copy.open.fileLabel}
      accept=".json,.waycine.json,application/json"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void openProjectFile(file);
      }}
    />
  );
}

function PhoneHeader() {
  const items: MenuEntry[] = [
    {
      kind: 'item',
      label: copy.header.redo,
      icon: 'redo',
      disabled: !canRedo.value,
      onSelect: redo,
    },
    { kind: 'sep' },
    {
      kind: 'item',
      label: copy.header.startFrom,
      onSelect: () => (dialog.value = { kind: 'start' }),
    },
    { kind: 'item', label: copy.header.open, name: copy.header.openName, onSelect: openFilePicker },
    {
      kind: 'item',
      label: copy.header.save,
      name: copy.header.saveName,
      onSelect: saveProjectFile,
    },
    { kind: 'item', label: copy.header.share, onSelect: () => (dialog.value = { kind: 'share' }) },
    { kind: 'sep' },
    {
      kind: 'check',
      label: copy.header.safeZone,
      checked: safeZones.value,
      onSelect: () => (safeZones.value = !safeZones.peek()),
    },
    {
      kind: 'item',
      label: copy.header.projectFile,
      onSelect: () => (dialog.value = { kind: 'project-json' }),
    },
    { kind: 'sep' },
    { kind: 'link', label: copy.header.licenses, href: LICENSES_URL },
    { kind: 'link', label: copy.header.source, href: SOURCE_URL },
    { kind: 'sep' },
    { kind: 'cap', label: copy.header.theme },
    ...themeItems(),
  ];
  return (
    <header class="bar">
      <h1 class="sr">{copy.app.name}</h1>
      <ProjectName />
      <button
        type="button"
        class="icon-btn"
        aria-label={copy.header.undo}
        title={copy.header.undoHint}
        disabled={!canUndo.value}
        onClick={undo}
      >
        <UiIcon name="undo" size={20} />
      </button>
      <MenuButton items={items} label={copy.header.more} icon="more" />
      <button type="button" class="btn-primary export-btn" onClick={requestExport}>
        {copy.header.exportShort}
      </button>
      <FileInput />
    </header>
  );
}

/** Wordmark, project name and save state; undo, file actions, theme, Export video and theater mode. */
export function Header() {
  if (isPhone.value) return <PhoneHeader />;
  const hidden = theater.value;
  const fileItems: MenuEntry[] = [
    {
      kind: 'item',
      label: copy.header.startFrom,
      onSelect: () => (dialog.value = { kind: 'start' }),
    },
    {
      kind: 'item',
      label: copy.header.open,
      name: copy.header.openName,
      hint: copy.header.openKeys,
      onSelect: openFilePicker,
    },
    {
      kind: 'item',
      label: copy.header.save,
      name: copy.header.saveName,
      hint: copy.header.saveKeys,
      onSelect: saveProjectFile,
    },
    { kind: 'item', label: copy.header.share, onSelect: () => (dialog.value = { kind: 'share' }) },
    { kind: 'sep' },
    { kind: 'link', label: copy.header.licenses, href: LICENSES_URL },
    { kind: 'link', label: copy.header.source, href: SOURCE_URL },
  ];
  return (
    <header class="bar">
      {/* First stop for keyboard users: past the header and straight to the editor. */}
      <button
        type="button"
        class="skip-link"
        onClick={() => document.getElementById('editor')?.focus()}
      >
        {copy.app.skipToEditor}
      </button>
      <h1 class="wordmark">{copy.app.name}</h1>
      <span class="bar-sep" aria-hidden="true" />
      <ProjectName />
      <SaveState />
      <span class="grow" />
      <button
        type="button"
        class="icon-btn"
        aria-label={copy.header.undo}
        title={copy.header.undoHint}
        disabled={!canUndo.value}
        onClick={undo}
      >
        <UiIcon name="undo" />
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label={copy.header.redo}
        title={copy.header.redoHint}
        disabled={!canRedo.value}
        onClick={redo}
      >
        <UiIcon name="redo" />
      </button>
      <span class="bar-div" aria-hidden="true" />
      <span class="bar-files">
        <button type="button" class="btn" onClick={() => (dialog.value = { kind: 'start' })}>
          {copy.header.startFrom}
        </button>
        <button
          type="button"
          class="btn"
          aria-label={copy.header.openName}
          title={copy.header.openHint}
          onClick={openFilePicker}
        >
          {copy.header.open}
        </button>
        <button
          type="button"
          class="btn"
          aria-label={copy.header.saveName}
          title={copy.header.saveHint}
          onClick={saveProjectFile}
        >
          {copy.header.save}
        </button>
        <button
          type="button"
          class="btn"
          title={copy.header.shareHint}
          onClick={() => (dialog.value = { kind: 'share' })}
        >
          {copy.header.share}
        </button>
      </span>
      <span class="file-menu">
        <MenuButton
          items={fileItems}
          label={copy.header.file}
          text={copy.header.file}
          class="btn"
        />
      </span>
      <MenuButton
        items={themeItems()}
        label={copy.header.theme}
        icon={MODE_ICON[themeMode.value]}
        menuLabel={copy.header.theme}
      />
      <button
        type="button"
        class="btn-primary export-btn"
        title={copy.header.exportHint}
        onClick={requestExport}
      >
        {copy.header.exportVideo}
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label={hidden ? copy.header.showEditor : copy.header.hideEditor}
        title={copy.header.theaterHint(hidden ? copy.header.showEditor : copy.header.hideEditor)}
        onClick={() => (theater.value = !hidden)}
      >
        <UiIcon name={hidden ? 'panelOpen' : 'panelClose'} />
      </button>
      <FileInput />
    </header>
  );
}
