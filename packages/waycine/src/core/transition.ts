import { themeIdFor } from './schema/themes.js';
import type { Hex, Theme, WaycineProject } from './schema/types.js';

/**
 * The transition between stops as an editor shows it: one choice that maps
 * onto `timing.transition.mode`, `timing.transition.flashTo` and `theme.flash`.
 *
 * | Style | mode | flashTo | theme.flash |
 * | --- | --- | --- | --- |
 * | `fly` | `fly` | (kept) | (kept) |
 * | `flashWhite` | `zoomThrough` | `color` | `#FFFFFF` |
 * | `dipBackground` | `zoomThrough` | `background` | (kept) |
 * | `flashColor` | `zoomThrough` | `color` | any colour but white |
 */
export const TRANSITION_STYLES = ['fly', 'flashWhite', 'dipBackground', 'flashColor'] as const;
/** A transition style (see `TRANSITION_STYLES`). */
export type TransitionStyle = (typeof TRANSITION_STYLES)[number];

/** The flash colour of the original and of every built-in theme. */
const WHITE: Hex = '#FFFFFF';

function isWhite(hex: Hex): boolean {
  return hex.toUpperCase() === WHITE;
}

/**
 * The transition style of a project: `fly` for fly mode; for zoom-through,
 * `dipBackground` when it fades into the background, else `flashWhite` when
 * the flash colour is exactly white and `flashColor` for any other colour.
 * Pure.
 */
export function transitionStyle(project: WaycineProject): TransitionStyle {
  const tr = project.timing.transition;
  if (tr.mode === 'fly') return 'fly';
  if (tr.flashTo === 'background') return 'dipBackground';
  return isWhite(project.theme.flash) ? 'flashWhite' : 'flashColor';
}

/**
 * A flash colour for `flashColor` when the current one is white: the first
 * of the theme's accent, route, glow, pin halo and background that is not
 * white, else black.
 */
function colorFlash(theme: Theme): Hex {
  const pick = [theme.accent, theme.route, theme.glow, theme.pin, theme.background].find(
    (hex) => !isWhite(hex),
  );
  return pick ?? '#000000';
}

/**
 * Returns `project` with the transition set to `style` (see
 * `TRANSITION_STYLES`), so that `transitionStyle` of the result is `style`.
 * Only what the style needs changes: `fly` keeps the flash settings, so
 * switching back restores them; `dipBackground` keeps `theme.flash`;
 * `flashColor` keeps a non-white flash colour and otherwise takes the first
 * non-white of the theme's accent, route, glow, pin and background, else
 * black. When `theme.flash` changes, `theme.id` becomes the built-in theme
 * with exactly those colours, or `custom`. Pure: the input is not modified,
 * and it is returned as is when nothing changes.
 */
export function applyTransitionStyle(
  project: WaycineProject,
  style: TransitionStyle,
): WaycineProject {
  const tr = project.timing.transition;
  let mode = tr.mode;
  let flashTo = tr.flashTo;
  let flash = project.theme.flash;
  switch (style) {
    case 'fly':
      mode = 'fly';
      break;
    case 'flashWhite':
      mode = 'zoomThrough';
      flashTo = 'color';
      if (!isWhite(flash)) flash = WHITE;
      break;
    case 'dipBackground':
      mode = 'zoomThrough';
      flashTo = 'background';
      break;
    case 'flashColor':
      mode = 'zoomThrough';
      flashTo = 'color';
      if (isWhite(flash)) flash = colorFlash(project.theme);
      break;
  }
  const transitionChanged = mode !== tr.mode || flashTo !== tr.flashTo;
  const flashChanged = flash !== project.theme.flash;
  if (!transitionChanged && !flashChanged) return project;
  let next: WaycineProject = project;
  if (transitionChanged) {
    next = {
      ...next,
      timing: { ...next.timing, transition: { ...tr, mode, flashTo } },
    };
  }
  if (flashChanged) {
    const theme: Theme = { ...next.theme, flash };
    theme.id = themeIdFor(theme);
    next = { ...next, theme };
  }
  return next;
}
