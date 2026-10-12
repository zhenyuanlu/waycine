import { useSignalEffect } from '@preact/signals';
import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import type { SectionId } from 'waycine';
import { copy } from '../copy/en';
import { isPhone, isUltrawide, isWide } from '../state/media';
import { getPath, jsonEqual } from '../state/paths';
import { activeProfile, baseProject, project } from '../state/project';
import {
  type EditorView,
  editorView,
  phoneSection,
  revealSection,
  showAllSettings,
  showSection,
} from '../state/ui';
import { AllSettings } from './AllSettings';
import { allRows, BASIC_SECTIONS, GROUPS, SECTION_NUMBER, settingsCount } from './catalog';
import { Demos, Welcome } from './DemoPicker';
import { ProjectFileBlock } from './ProjectFile';
import { currentGroup, currentSection, scrollToTop, useScrollSpy } from './scrollspy';
import { LookSection } from './sections/LookSection';
import { StatsSection } from './sections/StatsSection';
import { TextSection } from './sections/TextSection';
import { TimingSection } from './sections/TimingSection';
import { VideoSection } from './sections/VideoSection';
import { StopsSection } from './stops/StopsSection';
import { railMeta } from './summaries';

const SECTION_VIEWS: Record<string, () => JSX.Element> = {
  stops: StopsSection,
  text: TextSection,
  look: LookSection,
  timing: TimingSection,
  stats: StatsSection,
  video: VideoSection,
};

/** The demo picker, the Basics sections 01-06 (one at a time on a phone) and the project-file block. */
function Basics() {
  const pane = useRef<HTMLDivElement>(null);
  const phone = isPhone.value;
  const one = phoneSection.value;
  useScrollSpy(pane, 'section', (id) => {
    if (currentSection.peek() !== id) currentSection.value = id;
  });
  useSignalEffect(() => {
    const id = revealSection.value;
    if (id === null) return;
    requestAnimationFrame(() => {
      const target = pane.current?.querySelector<HTMLElement>(`[data-section="${id}"]`) ?? null;
      if (isPhone.peek()) pane.current?.scrollTo({ top: 0 });
      else scrollToTop(pane.current, target);
      revealSection.value = null;
    });
  });
  const sections = phone ? BASIC_SECTIONS.filter((id) => id === one) : BASIC_SECTIONS;
  return (
    <div class="scroll basics" ref={pane}>
      {(!phone || one === 'stops') && <Demos />}
      <Welcome />
      {sections.map((id) => {
        const View = SECTION_VIEWS[id];
        return View === undefined ? null : <View key={id} />;
      })}
      {(!phone || one === 'video') && <ProjectFileBlock />}
    </div>
  );
}

/** Basics | All settings tabs (below 1800 px; the rail replaces them on wider screens). */
function Tabs({ view }: { view: EditorView }) {
  const count = settingsCount(activeProfile.value);
  const tabs: { id: EditorView; label: string }[] = [
    { id: 'basics', label: copy.editor.basics },
    { id: 'all', label: copy.editor.allSettings },
  ];
  return (
    <div class="ed-tabs" role="tablist" aria-label={copy.editor.tabs}>
      {tabs.map((tab, i) => {
        const selected = tab.id === view;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            class="ed-tab"
            aria-selected={selected}
            aria-controls="editor-pane"
            tabIndex={selected ? 0 : -1}
            onClick={() => (editorView.value = tab.id)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const next = tabs[(i + 1) % tabs.length];
              if (next === undefined) return;
              editorView.value = next.id;
              document.getElementById(`tab-${next.id}`)?.focus();
            }}
          >
            {tab.label}
            {tab.id === 'all' && <span class="count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** The contents rail (1800 px and wider): Basics 01-06 and All settings 02-12. */
function Rail({ view, docked }: { view: EditorView; docked: boolean }) {
  const meta = railMeta.value;
  const profile = activeProfile.value;
  const rows = allRows(profile);
  const p = project.value;
  const base = baseProject.value;
  const total = settingsCount(profile);
  const changedIn = (g: SectionId): number =>
    (rows.get(g) ?? []).filter((r) => !jsonEqual(getPath(p, r.path), getPath(base, r.path))).length;
  const basicsShown = view === 'basics' || docked;
  const allShown = view === 'all' || docked;
  return (
    <nav class="rail" aria-label={copy.editor.contents}>
      <p class="rail-h cap">{copy.editor.basics}</p>
      {BASIC_SECTIONS.map((id) => {
        const current = basicsShown && currentSection.value === id;
        return (
          <button
            key={id}
            type="button"
            class={`rail-i${current ? ' is-current' : ''}`}
            aria-current={current ? 'location' : undefined}
            onClick={() => showSection(id)}
          >
            <span class="no">{SECTION_NUMBER[id]}</span>
            <span class="nm">{copy.sections[id]}</span>
            <span class="m">{meta[id] ?? ''}</span>
          </button>
        );
      })}
      <p class="rail-h cap second">
        <span>{copy.editor.allSettings}</span>
        <span class="num">{total}</span>
      </p>
      {GROUPS.map((g) => {
        const current = allShown && currentGroup.value === g;
        const changed = changedIn(g);
        return (
          <button
            key={g}
            type="button"
            class={`rail-i${current ? ' is-current' : ''}`}
            aria-current={current ? 'location' : undefined}
            onClick={() => showAllSettings(g)}
            title={changed > 0 ? copy.editor.groupChanged(changed) : undefined}
          >
            <span class="no">{SECTION_NUMBER[g]}</span>
            <span class="nm">{copy.sections[g]}</span>
            <span class="m">
              <i class={`cdot-s${changed > 0 ? ' on' : ''}`} aria-hidden="true" />
              {rows.get(g)?.length ?? 0}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * The editor column: the contents rail (1800 px and wider) or the tabs, the
 * Basics or All settings pane, and on ultrawide screens a docked All
 * settings column. The phone shows one section at a time.
 */
export function Editor() {
  const phone = isPhone.value;
  const docked = isUltrawide.value && !phone;
  const railed = isWide.value && !phone;
  const view: EditorView = phone
    ? phoneSection.value === 'all'
      ? 'all'
      : 'basics'
    : docked
      ? 'basics'
      : editorView.value;
  const tabbed = !phone && !railed;
  return (
    <>
      {railed && <Rail view={view} docked={docked} />}
      <div class="editor">
        {tabbed && <Tabs view={view} />}
        {tabbed || phone ? (
          <div
            class={`pane pane-${view}`}
            id="editor-pane"
            role="tabpanel"
            aria-labelledby={phone ? `ptab-${phoneSection.value}` : `tab-${view}`}
          >
            {view === 'basics' ? <Basics /> : <AllSettings />}
          </div>
        ) : (
          <div class={`pane pane-${view}`} id="editor-pane">
            {view === 'basics' ? <Basics /> : <AllSettings />}
          </div>
        )}
      </div>
      {docked && (
        <div class="dock">
          <AllSettings docked />
        </div>
      )}
    </>
  );
}
