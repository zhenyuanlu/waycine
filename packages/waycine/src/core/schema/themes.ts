import { deepFreeze } from './json.js';
import type { Theme } from './types.js';

/** A built-in colour theme. */
export interface ThemePreset {
  /** Stable id, stored in `theme.id`. */
  id: string;
  /** Display name. */
  label: string;
  /** The full palette (its `id` equals the preset id). */
  theme: Theme;
}

/** Medal colours shared by every built-in theme (`ring` follows each theme's accent). */
const MEDAL_GOLD = '#E8C15A';
const MEDAL_SILVER = '#CFD4DC';
const MEDAL_BRONZE = '#CD8C5C';

interface Palette {
  background: string;
  route: string;
  glow: string;
  accent: string;
  text: string;
  pinCore: string;
}

function makeTheme(id: string, p: Palette): Theme {
  return {
    id,
    background: p.background,
    grid: p.text,
    route: p.route,
    glow: p.glow,
    pin: p.accent,
    pinCore: p.pinCore,
    text: p.text,
    accent: p.accent,
    flash: '#FFFFFF',
    medals: { gold: MEDAL_GOLD, silver: MEDAL_SILVER, bronze: MEDAL_BRONZE, ring: p.accent },
  };
}

/** Orchid: the original renderer's colours and the engine default. */
export const ORCHID: Theme = deepFreeze(
  makeTheme('orchid', {
    background: '#07070B',
    route: '#C77DDB',
    glow: '#660874',
    accent: '#B35AC7',
    text: '#FFFFFF',
    pinCore: '#FFFFFF',
  }),
);

/** The four built-in themes, default first. */
export const THEMES: readonly ThemePreset[] = deepFreeze<ThemePreset[]>([
  { id: 'orchid', label: 'Orchid', theme: ORCHID },
  {
    id: 'midnight-cyan',
    label: 'Midnight Cyan',
    theme: makeTheme('midnight-cyan', {
      background: '#050A10',
      route: '#7DD3FC',
      glow: '#075985',
      accent: '#38BDF8',
      text: '#FFFFFF',
      pinCore: '#FFFFFF',
    }),
  },
  {
    id: 'ember',
    label: 'Ember',
    theme: makeTheme('ember', {
      background: '#0C0806',
      route: '#FDBA74',
      glow: '#7C2D12',
      accent: '#F97316',
      text: '#FFF7ED',
      pinCore: '#FFF7ED',
    }),
  },
  {
    id: 'mono',
    label: 'Mono',
    theme: makeTheme('mono', {
      background: '#0A0A0A',
      route: '#F2F2F2',
      glow: '#3A3A3A',
      accent: '#BDBDBD',
      text: '#FFFFFF',
      pinCore: '#FFFFFF',
    }),
  },
]);

/** Colour keys a built-in theme must match exactly (plus the medals). */
const THEME_COLOR_KEYS = [
  'background',
  'grid',
  'route',
  'glow',
  'pin',
  'pinCore',
  'text',
  'accent',
  'flash',
] as const;

/**
 * Id of the built-in theme with exactly these colours and medals (compared
 * case-insensitively; the theme's own id first), else `custom`. Pure.
 */
export function themeIdFor(theme: Theme): string {
  const same = (preset: Theme): boolean =>
    THEME_COLOR_KEYS.every((k) => preset[k].toUpperCase() === theme[k].toUpperCase()) &&
    (['gold', 'silver', 'bronze', 'ring'] as const).every(
      (k) => preset.medals[k].toUpperCase() === theme.medals[k].toUpperCase(),
    );
  const own = THEMES.find((t) => t.id === theme.id);
  if (own !== undefined && same(own.theme)) return own.id;
  return THEMES.find((t) => same(t.theme))?.id ?? 'custom';
}
