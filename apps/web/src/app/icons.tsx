/**
 * Line icons for the app chrome (24 x 24 grid, drawn at 16 px with a 1.5 px
 * stroke, `currentColor`). Decorative: the control that holds one carries the
 * accessible name.
 */
const PATHS = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  chevronDown: 'm6 9 6 6 6-6',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  play: 'M7 4.5v15l12.5-7.5z',
  pause: 'M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z',
  prev: 'M18 5v14L8 12zM6 5v14',
  next: 'M6 5v14l10-7zM18 5v14',
  fullscreen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  exitFullscreen: 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5',
  safe: 'M3 6V3h3M18 3h3v3M21 18v3h-3M6 21H3v-3M7 8h10v8H7z',
  panelClose: 'M4 4h16v16H4zM15 4v16M8.5 9.5 11 12l-2.5 2.5',
  panelOpen: 'M4 4h16v16H4zM15 4v16M11 9.5 8.5 12l2.5 2.5',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  warn: 'M12 3 2 20h20zM12 10v4.5M12 17.5h.01',
  pin: 'M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  duplicate: 'M9 9h11v11H9zM5 15H4V4h11v1',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff:
    'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.5 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  trash: 'M4 7h16M10 11v6M14 11v6M5.5 7l1 13h11l1-13M9 7V4h6v3',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  reset: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 10l5-5 5 5M5 20h14',
  film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.3-2.4 3.8M12 17h.01',
  type: 'M5 6V4h14v2M12 4v16M9 20h6',
  palette:
    'M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-4 3.5h-2a2 2 0 0 0-1.5 3.3A1.8 1.8 0 0 1 12 21zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  stats: 'M5 20V10M12 20V4M19 20v-7',
  sliders: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  loop: 'M17 3l3 3-3 3M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M7 21l-3-3 3-3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4',
  locate: 'M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  shrink: 'M4 14h6v6M20 10h-6V4M14 10l6-6M4 20l6-6',
  grow: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
} as const;

/** Names of the available icons. */
export type UiIconName = keyof typeof PATHS;

/** Dot-like icons draw with a thicker stroke. */
const HEAVY = new Set<UiIconName>(['grip', 'more']);
/** Icons filled rather than stroked. */
const FILLED = new Set<UiIconName>(['play', 'pause']);

export function UiIcon({ name, size = 16 }: { name: UiIconName; size?: number }) {
  const filled = FILLED.has(name);
  return (
    <svg
      class="i"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      stroke-width={HEAVY.has(name) ? 3.4 : 1.5 * (24 / size)}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
