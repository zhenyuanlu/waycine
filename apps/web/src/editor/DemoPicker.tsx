import { copy } from '../copy/en';
import { chooseDemo, startFrom } from '../state/actions';
import { PRESETS } from '../state/presets';
import { origin } from '../state/project';
import { showSection, welcomeVisible } from '../state/ui';

/**
 * The demo picker at the top of Basics: the bundled demos as chips, the
 * loaded one marked. Choosing one replaces the project as "Start from" does
 * (an edited project is asked about first and kept in Recent).
 */
export function Demos() {
  const from = origin.value;
  const current = from.kind === 'preset' ? from.id : null;
  return (
    <section class="demos" aria-labelledby="demos-title">
      <h2 id="demos-title" class="cap demos-t">
        {copy.demoPicker.title}
      </h2>
      <div class="demos-row">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            class="chip"
            aria-pressed={preset.id === current}
            title={preset.hint}
            onClick={() => chooseDemo(preset.id)}
          >
            {preset.name}
          </button>
        ))}
      </div>
    </section>
  );
}

/** First-visit block under the demo picker: start with your own stops or a blank project. */
export function Welcome() {
  if (!welcomeVisible.value) return null;
  return (
    <section class="welcome" aria-labelledby="welcome-title">
      <p class="cap kicker" aria-hidden="true">
        {copy.welcome.kicker}
      </p>
      <h2 id="welcome-title" class="welcome-t">
        {copy.welcome.title}
      </h2>
      <p class="welcome-b">{copy.welcome.body}</p>
      <div class="welcome-actions">
        <button
          type="button"
          class="btn-line"
          title={copy.welcome.ownStopsHint}
          onClick={() => {
            startFrom({ kind: 'own-stops' });
            showSection('stops');
          }}
        >
          {copy.welcome.ownStops}
        </button>
        <button type="button" class="btn" onClick={() => startFrom({ kind: 'blank' })}>
          {copy.welcome.blank}
        </button>
        <button type="button" class="btn" onClick={() => (welcomeVisible.value = false)}>
          {copy.welcome.dismiss}
        </button>
      </div>
    </section>
  );
}
