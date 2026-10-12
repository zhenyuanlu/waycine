import { useId, useRef } from 'preact/hooks';
import { FIELD_BY_PATH, THEMES, type Theme } from 'waycine';
import { copy } from '../../copy/en';
import {
  applyTheme,
  closestTheme,
  isBuiltInTheme,
  project,
  setValue,
  undo,
} from '../../state/project';
import { showToast } from '../../state/ui';
import { ColorField } from '../controls';
import { optionLabel, useFieldValue } from '../FieldControl';
import { MoreLink, Section } from '../Section';
import { sectionSummaries } from '../summaries';

// ---------------------------------------------------------------------------
// 03 Look

/** A 16:9 sketch of a theme: its route and glow on its background. */
function ThemeSketch({ theme }: { theme: Theme }) {
  return (
    <svg class="theme-plate" viewBox="0 0 64 36" aria-hidden="true" focusable="false">
      <rect width="64" height="36" fill={theme.background} />
      <path
        d="M6 30 C 18 6, 34 30, 58 9"
        fill="none"
        stroke={theme.glow}
        stroke-width="4"
        opacity="0.55"
      />
      <path d="M6 30 C 18 6, 34 30, 58 9" fill="none" stroke={theme.route} stroke-width="1.3" />
      <circle cx="58" cy="9" r="2" fill={theme.pinCore} stroke={theme.pin} stroke-width="1" />
    </svg>
  );
}

function ThemeList() {
  const theme = project.value.theme;
  const base = closestTheme(theme);
  const edited = !isBuiltInTheme(theme);
  const list = useRef<HTMLDivElement>(null);
  const selected = THEMES.findIndex((t) => t.id === base.id);
  // Another theme replaces edited key colours: say so, with Undo (one step).
  const pick = (id: string): void => {
    const wasEdited = !isBuiltInTheme(project.peek().theme);
    applyTheme(id);
    if (wasEdited) {
      showToast(copy.look.switchedEdited(optionLabel(id)), { label: copy.stops.undo, run: undo });
    }
  };
  const choose = (i: number): void => {
    const t = THEMES[i];
    if (t === undefined) return;
    pick(t.id);
    list.current?.querySelectorAll<HTMLElement>('[role="radio"]')[i]?.focus();
  };
  return (
    <>
      <div class="themes-head">
        <span class="cap" id="themes-label">
          {copy.look.themes}
        </span>
        <button
          type="button"
          class="link sm"
          style={{ visibility: edited ? 'visible' : 'hidden' }}
          tabIndex={edited ? 0 : -1}
          aria-hidden={edited ? undefined : true}
          onClick={() => applyTheme(base.id)}
        >
          {copy.look.resetToTheme}
        </button>
      </div>
      <div class="themes" role="radiogroup" aria-labelledby="themes-label" ref={list}>
        {THEMES.map((t, i) => {
          const checked = i === selected;
          const name = checked && edited ? copy.look.edited(t.label) : t.label;
          return (
            // biome-ignore lint/a11y/useSemanticElements: a theme row holds a sketch, a name and swatches; a native radio cannot.
            <button
              key={t.id}
              type="button"
              role="radio"
              class="theme"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => pick(t.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  choose((i + 1) % THEMES.length);
                } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                  event.preventDefault();
                  choose((i - 1 + THEMES.length) % THEMES.length);
                }
              }}
            >
              <ThemeSketch theme={t.theme} />
              <span class="theme-name">{name}</span>
              <span class="theme-chips" aria-hidden="true">
                {[t.theme.background, t.theme.route, t.theme.glow, t.theme.accent].map((c, k) => (
                  <i key={k} style={{ background: c }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function KeyColour({ path, label }: { path: string; label: string }) {
  const id = useId();
  const { value } = useFieldValue(path);
  return (
    <div class="cl" data-path={path}>
      <label for={id}>{label}</label>
      <ColorField
        id={id}
        value={typeof value === 'string' ? value : '#000000'}
        set={(hex) => setValue(path, hex)}
        label={label}
      />
    </div>
  );
}

export function LookSection() {
  const theme = project.value.theme;
  return (
    <Section
      id="look"
      summary={sectionSummaries.value.look}
      summaryLead={<i class="sum-dot" aria-hidden="true" style={{ background: theme.route }} />}
    >
      <ThemeList />
      <div class="colors">
        <KeyColour
          path="theme.background"
          label={FIELD_BY_PATH.get('theme.background')?.label ?? ''}
        />
        <KeyColour path="theme.route" label={FIELD_BY_PATH.get('theme.route')?.label ?? ''} />
        <KeyColour path="theme.glow" label={FIELD_BY_PATH.get('theme.glow')?.label ?? ''} />
        <KeyColour path="theme.accent" label={FIELD_BY_PATH.get('theme.accent')?.label ?? ''} />
      </div>
      <MoreLink section="look" />
    </Section>
  );
}
