/**
 * The FIELDS catalog: one entry per editable setting. It drives the editor
 * UI, validation clamps, generated docs, the JSON schema and the coverage and
 * liveness tests: every leaf of `DEFAULTS` has exactly one entry (per-profile
 * layout values and per-role font values share one `*` entry), plus the
 * per-stop (`stops[].`), per-stat (`stats.items[].`) and optional custom-size
 * (`output.width` / `output.height`) entries.
 */

import { MAX_OUTPUT_SIDE, MIN_OUTPUT_SIDE } from './output.js';
import { THEMES } from './themes.js';
import {
  ASPECTS,
  BULGE_SIDES,
  CARD_PLACEMENTS,
  DESCRIPTION_PLACES,
  EASINGS,
  EXPORT_MODES,
  FLASH_TARGETS,
  FONT_SOURCES,
  FPS_VALUES,
  LABEL_FORMATS,
  LAYOUT_CHOICES,
  LEADER_KINDS,
  MAX_LAT,
  MEDALS,
  PIN_LABEL_ORDERS,
  PIN_LABEL_PLACEMENTS,
  QUALITIES,
  RESULT_LAYOUTS,
  SHORT_SIDES,
  STAT_SOURCES,
  STATS_DIRECTIONS,
  STEP_MODES,
  SUPERSAMPLES,
  TRANSITION_MODES,
  ZOOM_INTERPS,
} from './types.js';

/** Control kind. `date` is an ISO `YYYY-MM-DD` string; `tuple` a fixed-length number list. */
export type FieldKind = 'number' | 'color' | 'text' | 'date' | 'enum' | 'bool' | 'tuple';

/**
 * A hint for hosts: `basic` marks the settings a simple editor should surface
 * first; `advanced` the rest. A host decides what it actually shows (the web
 * app lays out its Basics view by hand).
 */
export type FieldLevel = 'basic' | 'advanced';

/** Editor sections, in display order (1-6 basic, 7-12 "All settings"). */
export type SectionId =
  | 'stops'
  | 'text'
  | 'look'
  | 'timing'
  | 'stats'
  | 'video'
  | 'camera'
  | 'route'
  | 'pins'
  | 'card'
  | 'grid'
  | 'layout';

/** Display unit of a numeric field. */
export type FieldUnit =
  | 'Du'
  | 's'
  | 'deg'
  | 'frac'
  | 'alpha'
  | 'x'
  | 'px'
  | 'fps'
  | 'Mbps'
  | 'chars';

/** One catalog entry. */
export interface FieldDef {
  /**
   * Dotted path into the project. `layouts.*.` marks a per-profile field
   * (`*` = the active profile), `fonts.*.` a per-role field, `stops[].` a
   * per-stop field (`stops[].results[].` per result) and `stats.items[].` a
   * per-stat field.
   */
  readonly path: string;
  /** Short English label. */
  readonly label: string;
  /** One-sentence English help text. */
  readonly help: string;
  /** Extra search terms. */
  readonly keywords: readonly string[];
  /** Editor section. */
  readonly section: SectionId;
  /** Basic or advanced. */
  readonly level: FieldLevel;
  /** Control kind. */
  readonly kind: FieldKind;
  /** Minimum (numbers: value; tuples: each element). Validation clamps numbers to it. */
  readonly min?: number;
  /** Maximum. Validation clamps numbers to it. */
  readonly max?: number;
  /** UI step. */
  readonly step?: number;
  /** Display unit. */
  readonly unit?: FieldUnit;
  /** Allowed values for `enum` fields. */
  readonly options?: readonly (string | number)[];
  /** Element count for `tuple` fields. */
  readonly length?: number;
  /** A number field that may also be `null` (its meaning is in the help text). */
  readonly nullable?: boolean;
  /** True when the value lives under `layouts.<profile>` (one value per profile). */
  readonly perProfile?: boolean;
  /**
   * Whether changing the value changes rendered frames. Default true. False
   * only for settings that never reach a frame's pixels: export-only settings,
   * metadata, and the left and right insets of the safe-area guide.
   */
  readonly live?: boolean;
  /**
   * Name of the liveness fixture in which the field is live, for settings that
   * only matter in some projects (for example `fly`, `longNames`,
   * `partnerResults`, `portrait`). Without it the default probe project is used.
   */
  readonly liveWhen?: string;
}

/** An editor section. */
export interface SectionDef {
  /** Section id. */
  readonly id: SectionId;
  /** English label. */
  readonly label: string;
  /** Basic sections are always visible; advanced ones sit under "All settings". */
  readonly level: FieldLevel;
}

/** Editor sections in display order. */
export const SECTIONS: readonly SectionDef[] = [
  { id: 'stops', label: 'Stops', level: 'basic' },
  { id: 'text', label: 'Titles & text', level: 'basic' },
  { id: 'look', label: 'Look', level: 'basic' },
  { id: 'timing', label: 'Timing', level: 'basic' },
  { id: 'stats', label: 'Finale stats', level: 'basic' },
  { id: 'video', label: 'Video', level: 'basic' },
  { id: 'camera', label: 'Camera', level: 'advanced' },
  { id: 'route', label: 'Route', level: 'advanced' },
  { id: 'pins', label: 'Pins', level: 'advanced' },
  { id: 'card', label: 'Stop card', level: 'advanced' },
  { id: 'grid', label: 'Map grid & HUD', level: 'advanced' },
  { id: 'layout', label: 'Layout', level: 'advanced' },
];

// ---------------------------------------------------------------------------
// Builders. Each takes the parts every entry has, then the kind-specific ones;
// `extra` sets the level (default advanced), keywords and liveness flags.

interface Extra {
  keywords?: readonly string[];
  level?: FieldLevel;
  live?: boolean;
  liveWhen?: string;
  unit?: FieldUnit;
  step?: number;
  nullable?: boolean;
}

type Head = readonly [path: string, section: SectionId, label: string, help: string];

function base(head: Head, kind: FieldKind, extra: Extra): FieldDef {
  const [path, section, label, help] = head;
  const def: {
    -readonly [K in keyof FieldDef]: FieldDef[K];
  } = {
    path,
    label,
    help,
    keywords: extra.keywords ?? [],
    section,
    level: extra.level ?? 'advanced',
    kind,
  };
  if (extra.unit !== undefined) def.unit = extra.unit;
  if (extra.step !== undefined) def.step = extra.step;
  if (extra.nullable === true) def.nullable = true;
  if (path.startsWith('layouts.*.')) def.perProfile = true;
  if (extra.live === false) def.live = false;
  if (extra.liveWhen !== undefined) def.liveWhen = extra.liveWhen;
  return def;
}

/** A number with its range: `[min, max, step, unit]`. */
function num(
  head: Head,
  range: readonly [min: number, max: number, step: number, unit?: FieldUnit],
  extra: Extra = {},
): FieldDef {
  const [min, max, step, unit] = range;
  return { ...base(head, 'number', { ...extra, step, unit }), min, max };
}

/** A fixed-length number list; each element in `[min, max]`. */
function tuple(
  head: Head,
  length: number,
  range: readonly [min: number, max: number, step: number, unit?: FieldUnit],
  extra: Extra = {},
): FieldDef {
  const [min, max, step, unit] = range;
  return { ...base(head, 'tuple', { ...extra, step, unit }), min, max, length };
}

function color(head: Head, extra: Extra = {}): FieldDef {
  return base(head, 'color', { keywords: ['colour', 'color'], ...extra });
}

function text(head: Head, extra: Extra = {}): FieldDef {
  return base(head, 'text', extra);
}

function bool(head: Head, extra: Extra = {}): FieldDef {
  return base(head, 'bool', extra);
}

function choice(head: Head, options: readonly (string | number)[], extra: Extra = {}): FieldDef {
  return { ...base(head, 'enum', extra), options };
}

function date(head: Head, extra: Extra = {}): FieldDef {
  return base(head, 'date', extra);
}

const BASIC = { level: 'basic' } as const;

/** `theme.id` values: the built-in themes, then `custom`. */
const THEME_IDS: readonly string[] = [...THEMES.map((t) => t.id), 'custom'];

// Shared ranges.
const DU_SIZE = [1, 400, 1, 'Du'] as const;
const DU_OFFSET = [-2000, 2000, 1, 'Du'] as const;
const DU_TRACK = [-10, 40, 0.5, 'Du'] as const;
const ALPHA = [0, 1, 0.01, 'alpha'] as const;
const FRAC = [0, 1, 0.01, 'frac'] as const;
const SECONDS = [0, 10, 0.05, 's'] as const;

// ---------------------------------------------------------------------------
// 1 Stops (edited by the stop editor; listed for docs, search and liveness)

const STOP_FIELDS: readonly FieldDef[] = [
  text(
    [
      'stops[].id',
      'stops',
      'Stop id',
      'Stable identifier of the stop, used by the app and in links.',
    ],
    {
      keywords: ['identifier', 'key'],
      live: false,
    },
  ),
  text(['stops[].city', 'stops', 'City', 'Place name shown on the card and next to the pin.'], {
    ...BASIC,
    keywords: ['place', 'name', 'location', 'label'],
  }),
  num(
    ['stops[].lat', 'stops', 'Latitude', 'Degrees north (negative for south).'],
    [-MAX_LAT, MAX_LAT, 0.0001, 'deg'],
    {
      keywords: ['coordinates', 'position'],
    },
  ),
  num(
    ['stops[].lon', 'stops', 'Longitude', 'Degrees east (negative for west).'],
    [-180, 180, 0.0001, 'deg'],
    {
      keywords: ['coordinates', 'position'],
    },
  ),
  text(['stops[].event', 'stops', 'Event', 'Line under the city on the stop card.'], {
    ...BASIC,
    keywords: ['race', 'festival', 'occasion', 'description'],
  }),
  date(['stops[].date', 'stops', 'Date', 'Date of the stop (YYYY-MM-DD).'], {
    ...BASIC,
    keywords: ['day', 'when', 'start'],
  }),
  date(
    [
      'stops[].endDate',
      'stops',
      'End date',
      'Optional last day; the card then shows a date range.',
    ],
    {
      ...BASIC,
      keywords: ['range', 'until', 'finish'],
    },
  ),
  text(
    [
      'stops[].dateText',
      'stops',
      'Date text',
      'Free text shown instead of the formatted date, on the card and the pin.',
    ],
    {
      keywords: ['date', 'override', 'when'],
    },
  ),
  text(
    ['stops[].partner', 'stops', 'Extra line', 'Optional credit or partner line on the stop card.'],
    {
      ...BASIC,
      keywords: ['partner', 'credit', 'team', 'crew'],
    },
  ),
  text(
    [
      'stops[].region',
      'stops',
      'Region',
      'State or province as shown, for example MA; counted by the regions stat.',
    ],
    {
      keywords: ['state', 'province', 'county'],
      liveWhen: 'regions',
    },
  ),
  text(
    [
      'stops[].regionCode',
      'stops',
      'Region code',
      'Region key used to count regions, for example US-MA.',
    ],
    {
      keywords: ['state', 'iso', 'code'],
      liveWhen: 'regions',
    },
  ),
  text(
    [
      'stops[].country',
      'stops',
      'Country',
      'Two-letter country code, for example US; counted by the countries stat.',
    ],
    {
      keywords: ['nation', 'iso'],
    },
  ),
  choice(
    [
      'stops[].results[].medal',
      'stops',
      'Medal',
      'Medal drawn before the result and as dots next to the pin.',
    ],
    MEDALS,
    {
      ...BASIC,
      keywords: ['gold', 'silver', 'bronze', 'result', 'award'],
    },
  ),
  text(
    [
      'stops[].results[].text',
      'stops',
      'Result',
      'Result line on the card, drawn exactly as typed.',
    ],
    {
      ...BASIC,
      keywords: ['place', 'rank', 'score'],
    },
  ),
  num(
    [
      'stops[].results[].count',
      'stops',
      'Medal count',
      'Number of medal dots next to the pin for this result.',
    ],
    [1, 5, 1],
    {
      ...BASIC,
      keywords: ['times', 'dots', 'repeat'],
    },
  ),
  num(
    [
      'stops[].durationSec',
      'stops',
      'Stop length',
      'Overrides the stop length for this stop only.',
    ],
    [0.1, 60, 0.1, 's'],
    {
      keywords: ['duration', 'seconds'],
    },
  ),
  bool(
    [
      'stops[].hidden',
      'stops',
      'Hidden',
      'Leave this stop out of the video (no pin, route leg, card or stat).',
    ],
    {
      keywords: ['skip', 'hide', 'exclude'],
    },
  ),
];

// ---------------------------------------------------------------------------
// 2 Titles & text

const TEXT_FIELDS: readonly FieldDef[] = [
  text(['text.title', 'text', 'Title', 'Shown at the start over the whole route.'], {
    ...BASIC,
    keywords: ['heading', 'name', 'headline'],
  }),
  text(
    [
      'text.subtitle',
      'text',
      'Subtitle',
      'Line under the title. Use Insert to add live counts such as stops or kilometres.',
    ],
    {
      ...BASIC,
      keywords: ['tokens', 'summary'],
    },
  ),
  text(
    [
      'text.description',
      'text',
      'Description',
      'Optional extra line under the subtitle, for example your team or trip name; leave it empty to hide it.',
    ],
    {
      ...BASIC,
      keywords: ['caption', 'tagline', 'team', 'third line', 'tokens'],
      liveWhen: 'description',
    },
  ),
  choice(
    [
      'text.descriptionAt',
      'text',
      'Show description',
      'Show the description only in the intro, or also at the end under the stats.',
    ],
    DESCRIPTION_PLACES,
    {
      ...BASIC,
      keywords: ['caption', 'finale', 'ending', 'outro'],
      liveWhen: 'descriptionFinale',
    },
  ),
  text(
    ['text.kicker', 'text', 'Stop label', 'Small line above each city, for example STOP 01 / 07.'],
    {
      ...BASIC,
      keywords: ['kicker', 'number', 'counter'],
    },
  ),
  bool(
    [
      'text.uppercase',
      'text',
      'All caps',
      'Render titles, cities, events and labels in capital letters; result lines stay as typed.',
    ],
    {
      ...BASIC,
      keywords: ['uppercase', 'capitals', 'case'],
    },
  ),
  bool(
    [
      'text.solid',
      'text',
      'Solid text',
      'Draw all text fully opaque, without fade-ins; shapes still fade.',
    ],
    {
      keywords: ['opacity', 'alpha', 'fade', 'original'],
    },
  ),
  text(
    [
      'text.cardDate',
      'text',
      'Card date format',
      'Date format on the stop card: YYYY, MM, DD, M, D and MMM are replaced.',
    ],
    {
      keywords: ['date', 'format'],
    },
  ),
  text(
    [
      'text.pinDate',
      'text',
      'Pin date format',
      'Date format next to each pin; leave empty to hide pin dates.',
    ],
    {
      keywords: ['date', 'format', 'label'],
    },
  ),
  text(
    [
      'text.rangeSeparator',
      'text',
      'Date range separator',
      'Text between the first and last day of a stop with an end date.',
    ],
    {
      keywords: ['date', 'range', 'dash'],
      liveWhen: 'ranges',
    },
  ),
  text(
    [
      'text.pinDateJoin',
      'text',
      'Shared pin date separator',
      'Joins the dates of stops at the same place on one pin label.',
    ],
    {
      keywords: ['date', 'duplicate', 'same place', 'join'],
      liveWhen: 'duplicates',
    },
  ),
];

// ---------------------------------------------------------------------------
// 3 Look

const LOOK_FIELDS: readonly FieldDef[] = [
  choice(
    ['theme.id', 'look', 'Theme', 'Built-in theme the colours came from, or custom.'],
    THEME_IDS,
    {
      keywords: ['palette', 'preset'],
      live: false,
    },
  ),
  color(['theme.background', 'look', 'Background', 'Colour behind the map.'], {
    ...BASIC,
    keywords: ['colour', 'color', 'bg'],
  }),
  color(['theme.route', 'look', 'Route', 'Colour of the route line.'], {
    ...BASIC,
    keywords: ['colour', 'color', 'line', 'path'],
  }),
  color(['theme.glow', 'look', 'Glow', 'Colour of the soft glow around the route.'], {
    ...BASIC,
    keywords: ['colour', 'color', 'halo'],
  }),
  color(
    ['theme.accent', 'look', 'Accent', 'Subtitle, stop labels, dates, card bar and stat labels.'],
    {
      ...BASIC,
      keywords: ['colour', 'color', 'highlight'],
    },
  ),
  color(['theme.grid', 'look', 'Grid', 'Map grid lines, grid labels and the corner marks.'], {
    keywords: ['colour', 'color', 'graticule', 'lines'],
  }),
  color(['theme.pin', 'look', 'Pin halo', 'Halo and pulse rings around each pin.'], {
    keywords: ['colour', 'color', 'ring', 'pulse'],
  }),
  color(['theme.pinCore', 'look', 'Pin centre', 'Solid dot at the centre of each pin.'], {
    keywords: ['colour', 'color', 'dot', 'core'],
  }),
  color(['theme.text', 'look', 'Text', 'Titles, cities, events, card lines and big numbers.'], {
    keywords: ['colour', 'color', 'font'],
  }),
  color(
    [
      'theme.flash',
      'look',
      'Flash',
      'Colour the zoom-through fades into between stops (unless it fades into the background).',
    ],
    {
      keywords: ['colour', 'color', 'white', 'dip', 'dark', 'transition'],
    },
  ),
  color(['theme.medals.gold', 'look', 'Gold medal', 'Colour of gold medals.'], {
    keywords: ['colour', 'color', 'first'],
  }),
  color(['theme.medals.silver', 'look', 'Silver medal', 'Colour of silver medals.'], {
    keywords: ['colour', 'color', 'second'],
  }),
  color(['theme.medals.bronze', 'look', 'Bronze medal', 'Colour of bronze medals.'], {
    keywords: ['colour', 'color', 'third'],
  }),
  color(['theme.medals.ring', 'look', 'Ring medal', 'Colour of outline (ring) medals.'], {
    keywords: ['colour', 'color', 'qualified', 'outline'],
  }),
  text(
    [
      'fonts.*.family',
      'look',
      'Font family',
      'Font used for this role; the bundled fonts are WaycineDisplay and WaycineBody.',
    ],
    {
      keywords: ['font', 'typeface', 'text'],
    },
  ),
  num(
    ['fonts.*.weight', 'look', 'Font weight', 'Nominal weight of the font; for information only.'],
    [100, 900, 100],
    {
      keywords: ['font', 'bold'],
      live: false,
    },
  ),
  choice(
    ['fonts.*.source', 'look', 'Font source', 'Bundled font, or a font uploaded on this device.'],
    FONT_SOURCES,
    {
      keywords: ['font', 'upload', 'local'],
      live: false,
    },
  ),
  num(
    [
      'fonts.*.sizeAdjust',
      'look',
      'Font size scale',
      'Multiplies every text size drawn with this font (width and height).',
    ],
    [0.5, 2, 0.01, 'x'],
    {
      keywords: ['font', 'text', 'size', 'calibration'],
    },
  ),
  num(
    [
      'fonts.*.widthAdjust',
      'look',
      'Font width scale',
      'Stretches or narrows every text drawn with this font; heights stay the same. Calibrated for the chosen font; reset it to 1 when you change the font.',
    ],
    [0.5, 2, 0.01, 'x'],
    { keywords: ['font', 'text', 'width', 'condensed', 'calibration'] },
  ),
];

// ---------------------------------------------------------------------------
// 4 Timing

const TIMING_FIELDS: readonly FieldDef[] = [
  num(
    ['timing.overviewSec', 'timing', 'Intro length', 'Seconds of the opening overview.'],
    [0.5, 30, 0.1, 's'],
    {
      ...BASIC,
      keywords: ['duration', 'overview', 'intro'],
    },
  ),
  num(
    ['timing.stopSec', 'timing', 'Stop length', 'Seconds spent on each stop.'],
    [0.5, 30, 0.1, 's'],
    {
      ...BASIC,
      keywords: ['duration', 'stop'],
    },
  ),
  num(
    ['timing.finaleSec', 'timing', 'Finale length', 'Seconds of the closing pull-back with stats.'],
    [0.5, 30, 0.1, 's'],
    {
      ...BASIC,
      keywords: ['duration', 'finale', 'outro', 'ending'],
    },
  ),
  num(
    [
      'timing.endHoldSec',
      'timing',
      'End hold',
      'Seconds to hold the last frame at the end of the video.',
    ],
    [0, 30, 0.1, 's'],
    {
      keywords: ['duration', 'pause', 'freeze'],
      // Adds frames that repeat the last one; no frame's pixels change.
      live: false,
    },
  ),
  choice(
    [
      'timing.transition.mode',
      'timing',
      'Transition',
      'Zoom through each pin into a flash, or fly between stops.',
    ],
    TRANSITION_MODES,
    {
      ...BASIC,
      keywords: ['zoom', 'fly', 'flash', 'white', 'dip', 'dark', 'transition'],
    },
  ),
  choice(
    [
      'timing.transition.flashTo',
      'timing',
      'Flash into',
      'What the zoom between stops fades into: the flash colour (white unless you change it), or the background colour for a dip to dark.',
    ],
    FLASH_TARGETS,
    {
      ...BASIC,
      keywords: ['flash', 'white', 'dip', 'dark', 'black', 'background', 'fade', 'transition'],
      liveWhen: 'flashBackground',
    },
  ),
  bool(
    [
      'timing.overview.enabled',
      'timing',
      'Show intro',
      'Start with the overview of the whole route.',
    ],
    {
      ...BASIC,
      keywords: ['overview', 'intro'],
    },
  ),
  bool(['timing.finale.enabled', 'timing', 'Show finale', 'End with the pull-back and stats.'], {
    ...BASIC,
    keywords: ['finale', 'ending', 'outro'],
  }),
  num(
    [
      'timing.overview.routeEndFrac',
      'timing',
      'Route draw time',
      'Share of the intro by which the route reaches the last stop.',
    ],
    [0.05, 1, 0.01, 'frac'],
    {
      keywords: ['overview', 'intro', 'route', 'speed'],
    },
  ),
  num(
    [
      'timing.overview.pushIn',
      'timing',
      'Intro push-in',
      'How much the camera zooms in during the intro.',
    ],
    [0, 1, 0.01, 'frac'],
    {
      keywords: ['overview', 'zoom', 'camera'],
    },
  ),
  num(
    [
      'timing.overview.titleFadeSec',
      'timing',
      'Title fade-in',
      'Seconds the title takes to fade in.',
    ],
    SECONDS,
    {
      keywords: ['overview', 'title', 'fade'],
    },
  ),
  num(
    [
      'timing.overview.pulseWindow',
      'timing',
      'Intro pulse window',
      'How long, in stops of route travel, a pin pulses after the route reaches it.',
    ],
    [0, 5, 0.05],
    {
      keywords: ['overview', 'pulse', 'ring'],
    },
  ),
  num(
    [
      'timing.overview.pulseRate',
      'timing',
      'Intro pulse speed',
      'Pulse progress per stop of route travel during the intro.',
    ],
    [0.1, 10, 0.1, 'x'],
    {
      keywords: ['overview', 'pulse', 'ring'],
    },
  ),
  num(
    [
      'timing.overview.outroSec',
      'timing',
      'Intro fade-out',
      'One-file videos only: seconds the route, pins and title fade out before stop 1.',
    ],
    SECONDS,
    {
      keywords: ['overview', 'outro', 'fade'],
    },
  ),
  num(
    [
      'timing.stop.flyFrac',
      'timing',
      'Flight share',
      'Share of each stop spent flying in from the previous stop.',
    ],
    [0, 0.95, 0.01, 'frac'],
    {
      keywords: ['fly', 'camera', 'move'],
    },
  ),
  num(
    [
      'timing.stop.zoomFrac',
      'timing',
      'Zoom-through share',
      'Share of each stop spent zooming into the pin (zoom-through only).',
    ],
    [0, 0.9, 0.01, 'frac'],
    {
      keywords: ['zoom', 'flash', 'transition'],
    },
  ),
  num(
    [
      'timing.stop.pinLightAt',
      'timing',
      'Pin lights at',
      'Point of the flight, as a share, at which the pin appears and pulses.',
    ],
    FRAC,
    {
      keywords: ['pin', 'pulse', 'appear'],
    },
  ),
  num(
    [
      'timing.stop.pulseDurFrac',
      'timing',
      'Stop pulse length',
      'Length of the pin pulse as a share of the stop.',
    ],
    [0.05, 2, 0.01, 'frac'],
    {
      keywords: ['pulse', 'ring'],
    },
  ),
  num(
    [
      'timing.stop.labelDelaySec',
      'timing',
      'Card delay',
      'Seconds after a stop starts before its card appears.',
    ],
    SECONDS,
    {
      keywords: ['card', 'delay', 'appear'],
    },
  ),
  num(
    [
      'timing.stop.labelFadeSec',
      'timing',
      'Card fade-in',
      'Seconds the card takes to slide and fade in.',
    ],
    SECONDS,
    {
      keywords: ['card', 'fade', 'slide'],
    },
  ),
  num(
    [
      'timing.stop.cardFadeOutSec',
      'timing',
      'Card fade-out',
      'Fly transition only: seconds the card takes to fade out at the end of a stop.',
    ],
    SECONDS,
    {
      keywords: ['card', 'fade'],
      liveWhen: 'fly',
    },
  ),
  num(
    [
      'timing.transition.zoomGain',
      'timing',
      'Zoom depth',
      'How far the zoom-through dives into the pin.',
    ],
    [0, 40, 0.5, 'x'],
    {
      keywords: ['zoom', 'flash', 'transition'],
    },
  ),
  num(
    [
      'timing.transition.zoomExp',
      'timing',
      'Zoom curve',
      'Shape of the zoom-through acceleration; higher starts slower.',
    ],
    [0.2, 6, 0.1],
    {
      keywords: ['zoom', 'easing', 'transition'],
    },
  ),
  num(
    ['timing.transition.blurMax', 'timing', 'Zoom blur', 'Blur at the end of the zoom-through.'],
    [0, 40, 0.5, 'Du'],
    {
      keywords: ['blur', 'zoom', 'transition'],
    },
  ),
  num(
    [
      'timing.transition.blurExp',
      'timing',
      'Blur curve',
      'Shape of the blur build-up; higher starts later.',
    ],
    [0.2, 6, 0.1],
    {
      keywords: ['blur', 'easing', 'transition'],
    },
  ),
  num(
    [
      'timing.transition.whiteStart',
      'timing',
      'Flash starts',
      'How far into the zoom the flash begins, as a share of the zoom.',
    ],
    [0, 0.99, 0.01, 'frac'],
    {
      keywords: ['flash', 'white', 'transition'],
    },
  ),
  num(
    [
      'timing.transition.whiteExp',
      'timing',
      'Flash curve',
      'Shape of the flash build-up; higher starts later.',
    ],
    [0.2, 6, 0.1],
    {
      keywords: ['flash', 'white', 'easing'],
    },
  ),
  num(
    [
      'timing.transition.recoverSec',
      'timing',
      'Flash length',
      'How long the picture takes to fade back after the cut (one-file videos only).',
    ],
    SECONDS,
    {
      keywords: ['flash', 'fade', 'transition', 'recovery', 'white', 'dip', 'dark'],
    },
  ),
  num(
    [
      'timing.finale.cameraEndFrac',
      'timing',
      'Finale camera time',
      'Share of the finale the camera takes to pull back.',
    ],
    [0.05, 1, 0.01, 'frac'],
    {
      keywords: ['finale', 'camera', 'pull back'],
    },
  ),
  num(
    [
      'timing.finale.pulseStart',
      'timing',
      'Finale pulse start',
      'Share of the finale after which the pins pulse.',
    ],
    FRAC,
    {
      keywords: ['finale', 'pulse'],
    },
  ),
  num(
    [
      'timing.finale.pulseDur',
      'timing',
      'Finale pulse length',
      'Length of each finale pulse as a share of the finale.',
    ],
    [0.05, 2, 0.01, 'frac'],
    {
      keywords: ['finale', 'pulse'],
    },
  ),
  num(
    [
      'timing.finale.pulseStagger',
      'timing',
      'Finale pulse stagger',
      'Delay between the pulses of consecutive pins.',
    ],
    [0, 1, 0.01],
    {
      keywords: ['finale', 'pulse', 'delay'],
    },
  ),
  num(
    [
      'timing.finale.pinLabelsAfter',
      'timing',
      'Finale labels after',
      'Pin labels show once the finale camera has moved this share of the way.',
    ],
    FRAC,
    {
      keywords: ['finale', 'labels', 'pins'],
    },
  ),
  num(
    [
      'timing.finale.statsStart',
      'timing',
      'Stats start',
      'Share of the finale after which the stats appear.',
    ],
    FRAC,
    {
      keywords: ['finale', 'stats', 'numbers'],
    },
  ),
  num(
    [
      'timing.finale.statsDur',
      'timing',
      'Stats duration',
      'Share of the finale over which the stats appear.',
    ],
    [0.01, 1, 0.01, 'frac'],
    {
      keywords: ['finale', 'stats', 'numbers'],
    },
  ),
  num(
    ['timing.finale.statsRate', 'timing', 'Stats speed', 'How quickly each stat fades in.'],
    [0.1, 10, 0.1, 'x'],
    {
      keywords: ['finale', 'stats', 'fade'],
    },
  ),
  num(
    ['timing.finale.statsStagger', 'timing', 'Stats stagger', 'Delay between consecutive stats.'],
    [0, 2, 0.01],
    {
      keywords: ['finale', 'stats', 'delay'],
    },
  ),
];

// ---------------------------------------------------------------------------
// 5 Finale stats

const STATS_FIELDS: readonly FieldDef[] = [
  bool(['stats.show', 'stats', 'Show stats', 'Show the big numbers during the finale.'], {
    ...BASIC,
    keywords: ['numbers', 'summary'],
  }),
  choice(
    [
      'stats.items[].source',
      'stats',
      'Stat',
      'What the number counts; custom shows your own value.',
    ],
    STAT_SOURCES,
    {
      ...BASIC,
      keywords: ['number', 'count', 'distance'],
    },
  ),
  text(
    ['stats.items[].label', 'stats', 'Stat label', 'Word after the number, for example STOPS.'],
    {
      ...BASIC,
      keywords: ['number', 'caption'],
    },
  ),
  text(
    [
      'stats.items[].labelOne',
      'stats',
      'Label for one',
      'Word used when the number is exactly 1, for example STOP.',
    ],
    {
      keywords: ['singular', 'plural'],
    },
  ),
  text(
    [
      'stats.items[].value',
      'stats',
      'Own value',
      'Shown instead of the counted number (required for custom stats).',
    ],
    {
      ...BASIC,
      keywords: ['override', 'custom', 'number'],
    },
  ),
  num(
    ['stats.labelSize', 'stats', 'Stat label size', 'Size of the words after the numbers.'],
    DU_SIZE,
    {
      keywords: ['text', 'size'],
    },
  ),
  num(
    [
      'stats.labelTracking',
      'stats',
      'Stat label spacing',
      'Extra space between the letters of the stat labels.',
    ],
    DU_TRACK,
    {
      keywords: ['tracking', 'letter spacing'],
    },
  ),
];

// ---------------------------------------------------------------------------
// 6 Video

const VIDEO_FIELDS: readonly FieldDef[] = [
  choice(
    [
      'output.aspect',
      'video',
      'Format',
      'Landscape 16:9, portrait 9:16, square 1:1, 4:5 or a custom size.',
    ],
    ASPECTS,
    {
      ...BASIC,
      keywords: ['aspect', 'ratio', 'orientation', 'size'],
    },
  ),
  choice(
    [
      'output.shortSide',
      'video',
      'Video size',
      'Default size for Export video; you can change it there.',
    ],
    SHORT_SIDES,
    {
      ...BASIC,
      keywords: ['size', 'resolution', 'quality', '720p', '1080p', '4k'],
      unit: 'px',
      live: false,
    },
  ),
  choice(['output.fps', 'video', 'Frame rate', 'Frames per second.'], FPS_VALUES, {
    ...BASIC,
    keywords: ['fps', 'framerate', 'smooth'],
    unit: 'fps',
  }),
  choice(
    [
      'output.quality',
      'video',
      'Quality',
      'Default quality for Export video (higher makes bigger files); you can change it there.',
    ],
    QUALITIES,
    {
      ...BASIC,
      keywords: ['bitrate', 'size'],
      live: false,
    },
  ),
  num(
    [
      'output.width',
      'video',
      'Custom width',
      'Width in pixels when the format is custom (even, 320 to 4096).',
    ],
    [MIN_OUTPUT_SIDE, MAX_OUTPUT_SIDE, 2, 'px'],
    {
      keywords: ['size', 'custom', 'resolution'],
      liveWhen: 'customSize',
    },
  ),
  num(
    [
      'output.height',
      'video',
      'Custom height',
      'Height in pixels when the format is custom (even, 320 to 4096).',
    ],
    [MIN_OUTPUT_SIDE, MAX_OUTPUT_SIDE, 2, 'px'],
    {
      keywords: ['size', 'custom', 'resolution'],
      liveWhen: 'customSize',
    },
  ),
  choice(
    [
      'output.supersample',
      'video',
      'Extra smooth',
      'Render at twice the size and scale down (slower).',
    ],
    SUPERSAMPLES,
    {
      keywords: ['supersample', 'antialias', 'quality'],
      unit: 'x',
      live: false,
    },
  ),
  choice(
    ['output.layout', 'video', 'Layout', 'Which layout to use; Auto picks it from the format.'],
    LAYOUT_CHOICES,
    {
      keywords: ['profile', 'landscape', 'portrait', 'square'],
    },
  ),
  num(
    [
      'output.bitrateMbps',
      'video',
      'Bitrate',
      'Exact bitrate in Mbps; 0 uses the quality setting.',
    ],
    [0, 200, 0.5, 'Mbps'],
    {
      keywords: ['quality', 'size'],
      live: false,
    },
  ),
  choice(
    [
      'output.exportMode',
      'video',
      'Export as',
      'One continuous video, or separate clips per part.',
    ],
    EXPORT_MODES,
    {
      keywords: ['clips', 'segments', 'zip'],
    },
  ),
  text(
    [
      'meta.name',
      'video',
      'Project name',
      'Name of the project; exported files are named after it.',
    ],
    {
      keywords: ['title', 'file name'],
      live: false,
    },
  ),
];

// ---------------------------------------------------------------------------
// 7 Camera

const CAMERA_FIELDS: readonly FieldDef[] = [
  num(
    [
      'camera.stampZoom',
      'camera',
      'Stop zoom',
      'How far each stop zooms in, relative to the overview.',
    ],
    [0.5, 20, 0.1, 'x'],
    {
      keywords: ['zoom', 'close'],
    },
  ),
  num(
    [
      'camera.flyZoomOut',
      'camera',
      'Flight zoom-out',
      'How much the camera zooms out in the middle of a flight.',
    ],
    [0, 0.9, 0.01, 'frac'],
    {
      keywords: ['zoom', 'fly', 'arc'],
    },
  ),
  num(
    [
      'camera.finaleZoom',
      'camera',
      'Finale zoom',
      'Zoom at the end of the finale, relative to the overview.',
    ],
    [0.1, 5, 0.01, 'x'],
    {
      keywords: ['zoom', 'finale', 'pull back'],
    },
  ),
  num(
    [
      'camera.minSpanDeg',
      'camera',
      'Minimum map span',
      'Smallest area the overview shows, in degrees (single stops, city trips).',
    ],
    [0.001, 90, 0.001, 'deg'],
    {
      keywords: ['zoom', 'span', 'extent'],
    },
  ),
  choice(
    ['camera.flyEasing', 'camera', 'Movement easing', 'Curve of camera moves and the route draw.'],
    EASINGS,
    {
      keywords: ['easing', 'curve', 'smooth'],
    },
  ),
  choice(
    [
      'camera.fadeEasing',
      'camera',
      'Fade easing',
      'Curve of fades, the card slide, rings and stats.',
    ],
    EASINGS,
    {
      keywords: ['easing', 'curve', 'fade'],
    },
  ),
  choice(
    [
      'camera.zoomInterp',
      'camera',
      'Zoom blending',
      'Blend zoom levels in straight steps (linear) or evenly by scale (log).',
    ],
    ZOOM_INTERPS,
    {
      keywords: ['zoom', 'interpolation'],
    },
  ),
];

// ---------------------------------------------------------------------------
// 8 Route

const ROUTE_FIELDS: readonly FieldDef[] = [
  bool(['route.show', 'route', 'Show route', 'Draw the route line and its glow.'], {
    keywords: ['line', 'path'],
  }),
  num(['route.coreWidth', 'route', 'Line width', 'Width of the route line.'], [0, 40, 0.5, 'Du'], {
    keywords: ['thickness', 'stroke'],
  }),
  num(
    ['route.glowWidth', 'route', 'Glow width', 'Width of the glow stroke before it is blurred.'],
    [0, 120, 1, 'Du'],
    {
      keywords: ['halo', 'thickness'],
    },
  ),
  num(['route.glowBlur', 'route', 'Glow blur', 'Softness of the route glow.'], [0, 60, 0.5, 'Du'], {
    keywords: ['blur', 'soft', 'halo'],
  }),
  num(['route.glowOpacity', 'route', 'Glow strength', 'Opacity of the route glow.'], ALPHA, {
    keywords: ['opacity', 'halo'],
  }),
  num(
    [
      'route.bulge',
      'route',
      'Curve bend',
      'How strongly each leg of the route arcs; 0 is straight.',
    ],
    [-1, 1, 0.01, 'frac'],
    {
      keywords: ['arc', 'curve', 'bezier'],
    },
  ),
  choice(
    ['route.bulgeSide', 'route', 'Curve side', 'Side of travel the route arcs bend to.'],
    BULGE_SIDES,
    {
      keywords: ['arc', 'curve', 'direction'],
    },
  ),
  num(
    ['route.samples', 'route', 'Curve samples', 'Points per route leg; more is smoother.'],
    [2, 256, 1],
    {
      keywords: ['smooth', 'bezier'],
    },
  ),
];

// ---------------------------------------------------------------------------
// 9 Pins

const PIN_FIELDS: readonly FieldDef[] = [
  num(['pins.radius', 'pins', 'Pin size', 'Radius of the pin dot.'], [0, 60, 0.5, 'Du'], {
    keywords: ['dot', 'radius'],
  }),
  num(
    ['pins.haloPad', 'pins', 'Halo size', 'How far the halo extends beyond the pin dot.'],
    [0, 60, 0.5, 'Du'],
    {
      keywords: ['glow', 'ring'],
    },
  ),
  num(['pins.haloAlpha', 'pins', 'Halo opacity', 'Opacity of the halo around each pin.'], ALPHA, {
    keywords: ['glow', 'alpha'],
  }),
  tuple(
    [
      'pins.rings',
      'pins',
      'Pulse rings',
      'Start offsets of the pulse rings in pulse progress (the project file may list up to 4).',
    ],
    2,
    [0, 1, 0.05],
    {
      keywords: ['pulse', 'ripple'],
    },
  ),
  num(
    ['pins.ringStart', 'pins', 'Ring start size', 'Radius of a pulse ring when it starts.'],
    [0, 200, 1, 'Du'],
    {
      keywords: ['pulse', 'ripple', 'radius'],
    },
  ),
  num(['pins.ringGrow', 'pins', 'Ring growth', 'How much a pulse ring grows.'], [0, 400, 1, 'Du'], {
    keywords: ['pulse', 'ripple', 'radius'],
  }),
  num(
    ['pins.ringWidth', 'pins', 'Ring width', 'Line width of the pulse rings.'],
    [0, 30, 0.5, 'Du'],
    {
      keywords: ['pulse', 'ripple', 'stroke'],
    },
  ),
  num(
    ['pins.ringAlpha', 'pins', 'Ring opacity', 'Opacity of a pulse ring when it starts.'],
    ALPHA,
    {
      keywords: ['pulse', 'ripple', 'alpha'],
    },
  ),
  num(['pins.medalShine', 'pins', 'Medal shine', 'Strength of the highlight on medals.'], ALPHA, {
    keywords: ['medal', 'gloss'],
  }),
  num(
    [
      'pins.ringMedalWidth',
      'pins',
      'Ring medal width',
      'Outline width of ring medals, as a share of their radius.',
    ],
    [0.05, 1, 0.01, 'frac'],
    {
      keywords: ['medal', 'outline', 'qualified'],
    },
  ),
  bool(['pins.label.show', 'pins', 'Show pin labels', 'Show the city and date next to each pin.'], {
    keywords: ['label', 'names'],
  }),
  choice(
    [
      'pins.label.placement',
      'pins',
      'Label placement',
      'Auto moves each label to the place around its pin that best clears the route and the other labels. Fixed keeps every label beside its pin.',
    ],
    PIN_LABEL_PLACEMENTS,
    {
      keywords: ['label', 'overlap', 'collision', 'position', 'side'],
    },
  ),
  num(
    ['pins.label.dx', 'pins', 'Label distance', 'Horizontal distance of the label from its pin.'],
    [-200, 400, 1, 'Du'],
    {
      keywords: ['label', 'offset'],
    },
  ),
  num(
    [
      'pins.label.cityDy',
      'pins',
      'Label city height',
      'Vertical position of the city label relative to the pin.',
    ],
    [-300, 300, 1, 'Du'],
    {
      keywords: ['label', 'offset'],
    },
  ),
  num(
    [
      'pins.label.dateDy',
      'pins',
      'Label date height',
      'Vertical position of the date label relative to the pin.',
    ],
    [-300, 300, 1, 'Du'],
    {
      keywords: ['label', 'offset'],
    },
  ),
  num(
    ['pins.label.citySize', 'pins', 'Label city size', 'Text size of the city next to each pin.'],
    DU_SIZE,
    {
      keywords: ['label', 'font', 'size'],
    },
  ),
  num(
    [
      'pins.label.cityTracking',
      'pins',
      'Label city spacing',
      'Extra space between the letters of pin city labels.',
    ],
    DU_TRACK,
    {
      keywords: ['label', 'tracking', 'letter spacing'],
    },
  ),
  num(
    ['pins.label.dateSize', 'pins', 'Label date size', 'Text size of the date next to each pin.'],
    DU_SIZE,
    {
      keywords: ['label', 'font', 'size'],
    },
  ),
  num(
    ['pins.label.alpha', 'pins', 'Label opacity', 'Opacity of pin labels (solid text ignores it).'],
    ALPHA,
    {
      keywords: ['label', 'alpha'],
    },
  ),
  num(
    [
      'pins.label.medalGap',
      'pins',
      'Medal dot gap',
      'Space between the date and the first medal dot.',
    ],
    [-100, 200, 1, 'Du'],
    {
      keywords: ['medal', 'dots', 'offset'],
    },
  ),
  num(
    ['pins.label.medalR', 'pins', 'Medal dot size', 'Radius of the medal dots next to pins.'],
    [0, 40, 0.5, 'Du'],
    {
      keywords: ['medal', 'dots', 'radius'],
    },
  ),
  num(
    [
      'pins.label.medalStep',
      'pins',
      'Medal dot spacing',
      'Distance between neighbouring medal dots.',
    ],
    [0, 100, 1, 'Du'],
    {
      keywords: ['medal', 'dots', 'spacing'],
    },
  ),
  num(
    [
      'pins.label.medalDy',
      'pins',
      'Medal dot height',
      'Vertical position of the medal dots relative to the pin.',
    ],
    [-200, 200, 1, 'Du'],
    {
      keywords: ['medal', 'dots', 'offset'],
    },
  ),
  num(['pins.label.medalAlpha', 'pins', 'Medal dot opacity', 'Opacity of the medal dots.'], ALPHA, {
    keywords: ['medal', 'dots', 'alpha'],
  }),
];

// ---------------------------------------------------------------------------
// 10 Stop card

/** The five entries of a text slot (`card.<slot>.*`). */
function slotFields(slot: string, name: string): FieldDef[] {
  const kw = ['card', slot];
  return [
    num(
      [
        `card.${slot}.dx`,
        'card',
        `${name} x`,
        `Horizontal position of the ${name.toLowerCase()} on the card.`,
      ],
      [-400, 1200, 1, 'Du'],
      {
        keywords: [...kw, 'offset', 'position'],
      },
    ),
    num(
      [
        `card.${slot}.dy`,
        'card',
        `${name} y`,
        `Vertical position of the ${name.toLowerCase()} on the card.`,
      ],
      [-400, 1200, 1, 'Du'],
      {
        keywords: [...kw, 'offset', 'position'],
      },
    ),
    num(
      [`card.${slot}.size`, 'card', `${name} size`, `Text size of the ${name.toLowerCase()}.`],
      DU_SIZE,
      {
        keywords: [...kw, 'font', 'size'],
      },
    ),
    num(
      [
        `card.${slot}.tracking`,
        'card',
        `${name} spacing`,
        `Extra space between the letters of the ${name.toLowerCase()}.`,
      ],
      DU_TRACK,
      {
        keywords: [...kw, 'tracking', 'letter spacing'],
      },
    ),
    num(
      [
        `card.${slot}.alpha`,
        'card',
        `${name} opacity`,
        `Opacity of the ${name.toLowerCase()} (solid text ignores it).`,
      ],
      ALPHA,
      {
        keywords: [...kw, 'alpha'],
      },
    ),
  ];
}

/** The auto-fit entries of a shrinking slot (`card.city`, `card.event`). */
function fitFields(slot: string, name: string): FieldDef[] {
  const kw = ['card', slot, 'auto-fit', 'shrink', 'long'];
  return [
    num(
      [
        `card.${slot}.minSize`,
        'card',
        `${name} smallest size`,
        `Smallest size a long ${name.toLowerCase()} may shrink to.`,
      ],
      DU_SIZE,
      {
        keywords: kw,
        liveWhen: 'longNames',
      },
    ),
    num(
      [
        `card.${slot}.shrinkStep`,
        'card',
        `${name} shrink step`,
        `Size removed per step while a long ${name.toLowerCase()} shrinks to fit.`,
      ],
      [0.5, 60, 0.5, 'Du'],
      {
        keywords: kw,
        liveWhen: 'longNames',
      },
    ),
    num(
      [
        `card.${slot}.fitMaxW`,
        'card',
        `${name} width limit`,
        `Widest the ${name.toLowerCase()} may be before it shrinks: 0 or less counts from the frame width (-170 is the width minus 170), more than 0 is a fixed width.`,
      ],
      [-4000, 4000, 1, 'Du'],
      { keywords: kw, liveWhen: 'longNames' },
    ),
    bool(
      [
        `card.${slot}.measureTracking`,
        'card',
        `${name} fit counts spacing`,
        `Include letter spacing when checking whether the ${name.toLowerCase()} fits.`,
      ],
      {
        keywords: kw,
        liveWhen: 'longNames',
      },
    ),
  ];
}

const CARD_FIELDS: readonly FieldDef[] = [
  bool(['card.show', 'card', 'Show cards', 'Show a card with the details of each stop.'], {
    keywords: ['label', 'info'],
  }),
  bool(
    ['card.showKicker', 'card', 'Show stop label', 'Show the small stop label above the city.'],
    { keywords: ['kicker', 'counter'] },
  ),
  bool(['card.showEvent', 'card', 'Show event', 'Show the event line on the card.'], {
    keywords: ['event', 'line'],
  }),
  bool(['card.showDate', 'card', 'Show date', 'Show the date line on the card.'], {
    keywords: ['date', 'line'],
  }),
  bool(
    ['card.showPartner', 'card', 'Show extra line', 'Show the partner or credit line on the card.'],
    {
      keywords: ['partner', 'credit'],
      liveWhen: 'partnerResults',
    },
  ),
  bool(['card.showResults', 'card', 'Show results', 'Show result lines with medals on the card.'], {
    keywords: ['results', 'medals'],
  }),
  num(
    ['card.slide', 'card', 'Slide distance', 'How far the card slides in from the right.'],
    [-400, 400, 1, 'Du'],
    {
      keywords: ['animation', 'motion'],
    },
  ),
  num(
    [
      'card.backdrop',
      'card',
      'Backdrop',
      'How much the route and the grid dim under the card, so no line runs through its text. 0 draws no backdrop.',
    ],
    ALPHA,
    {
      keywords: ['plate', 'background', 'overlap', 'dim', 'route'],
    },
  ),
  num(
    [
      'card.leaderAlpha',
      'card',
      'Pointer opacity',
      'Opacity of the line from the pin to the card.',
    ],
    ALPHA,
    {
      keywords: ['leader', 'line', 'alpha'],
    },
  ),
  num(
    ['card.leaderWidth', 'card', 'Pointer width', 'Width of the line from the pin to the card.'],
    [0, 20, 0.5, 'Du'],
    {
      keywords: ['leader', 'line', 'stroke'],
    },
  ),
  num(
    ['card.barWidth', 'card', 'Bar width', 'Width of the accent bar beside the card.'],
    [0, 60, 0.5, 'Du'],
    {
      keywords: ['accent', 'bar', 'stripe'],
    },
  ),
  num(
    ['card.barDx', 'card', 'Bar position', 'Horizontal position of the accent bar on the card.'],
    [-400, 400, 1, 'Du'],
    {
      keywords: ['accent', 'bar', 'offset'],
    },
  ),
  ...slotFields('kicker', 'Stop label'),
  ...slotFields('city', 'City'),
  ...fitFields('city', 'City'),
  ...slotFields('event', 'Event'),
  ...fitFields('event', 'Event'),
  ...slotFields('date', 'Date'),
  num(
    [
      'card.rowsY',
      'card',
      'Rows start',
      'Vertical position where the extra line and result rows start.',
    ],
    [-400, 1200, 1, 'Du'],
    {
      keywords: ['results', 'partner', 'offset'],
    },
  ),
  num(
    ['card.line.dx', 'card', 'Rows x', 'Horizontal position of the extra line and result rows.'],
    [-400, 1200, 1, 'Du'],
    {
      keywords: ['results', 'partner', 'offset'],
    },
  ),
  num(
    ['card.line.size', 'card', 'Rows text size', 'Text size of the extra line and result rows.'],
    DU_SIZE,
    {
      keywords: ['results', 'partner', 'font', 'size'],
    },
  ),
  num(
    [
      'card.line.tracking',
      'card',
      'Rows spacing',
      'Extra space between the letters of the extra line and result rows.',
    ],
    DU_TRACK,
    {
      keywords: ['results', 'partner', 'tracking'],
    },
  ),
  num(
    [
      'card.line.alpha',
      'card',
      'Rows opacity',
      'Opacity of the extra line and result rows (solid text ignores it).',
    ],
    ALPHA,
    {
      keywords: ['results', 'partner', 'alpha'],
    },
  ),
  num(
    ['card.line.partnerLineH', 'card', 'Extra line height', 'Line height of the extra line.'],
    [0, 200, 1, 'Du'],
    {
      keywords: ['partner', 'line height'],
      liveWhen: 'partnerResults',
    },
  ),
  num(
    [
      'card.line.resultRowH',
      'card',
      'Result row height',
      'Line height of result rows stacked one per line.',
    ],
    [0, 200, 1, 'Du'],
    {
      keywords: ['results', 'line height'],
      liveWhen: 'portrait',
    },
  ),
  num(
    ['card.line.medalR', 'card', 'Result medal size', 'Radius of the medals on result rows.'],
    [0, 60, 0.5, 'Du'],
    {
      keywords: ['results', 'medal', 'radius'],
    },
  ),
  num(
    [
      'card.line.medalDx',
      'card',
      'Result medal x',
      'Horizontal position of the medal on a result row.',
    ],
    [-100, 200, 1, 'Du'],
    {
      keywords: ['results', 'medal', 'offset'],
    },
  ),
  num(
    [
      'card.line.medalDy',
      'card',
      'Result medal y',
      'Vertical position of the medal on a result row.',
    ],
    [-100, 200, 1, 'Du'],
    {
      keywords: ['results', 'medal', 'offset'],
    },
  ),
  num(
    [
      'card.line.textDx',
      'card',
      'Result text x',
      'Horizontal position of the result text after its medal.',
    ],
    [-100, 400, 1, 'Du'],
    {
      keywords: ['results', 'offset'],
    },
  ),
  num(
    ['card.line.inlineGap', 'card', 'Result gap', 'Space between results written on one line.'],
    [0, 400, 1, 'Du'],
    {
      keywords: ['results', 'spacing', 'inline'],
    },
  ),
  num(
    [
      'card.bar.base',
      'card',
      'Bar height',
      'Height of the accent bar before extra lines and results.',
    ],
    [0, 1200, 1, 'Du'],
    {
      keywords: ['accent', 'bar', 'height'],
    },
  ),
  num(
    ['card.bar.perResult', 'card', 'Bar per result', 'Extra accent bar height for results.'],
    [0, 400, 1, 'Du'],
    {
      keywords: ['accent', 'bar', 'results'],
    },
  ),
];

// ---------------------------------------------------------------------------
// 11 Map grid & HUD

const GRID_FIELDS: readonly FieldDef[] = [
  bool(['graticule.show', 'grid', 'Show grid', 'Draw the latitude and longitude grid.'], {
    keywords: ['graticule', 'lines'],
  }),
  choice(
    [
      'graticule.stepMode',
      'grid',
      'Grid spacing',
      'Pick the spacing automatically from the zoom, or use a fixed step.',
    ],
    STEP_MODES,
    {
      keywords: ['graticule', 'step', 'auto'],
      liveWhen: 'fixedGrid',
    },
  ),
  num(
    [
      'graticule.fixedStep',
      'grid',
      'Fixed grid step',
      'Grid spacing in degrees when the spacing is fixed.',
    ],
    [0.01, 90, 0.01, 'deg'],
    {
      keywords: ['graticule', 'spacing', 'degrees'],
      liveWhen: 'fixedGrid',
    },
  ),
  num(
    [
      'graticule.targetSpacing',
      'grid',
      'Grid target spacing',
      'Automatic spacing aims for grid lines about this far apart.',
    ],
    [5, 600, 1, 'Du'],
    {
      keywords: ['graticule', 'spacing', 'density'],
    },
  ),
  num(
    [
      'graticule.zoomSplit',
      'grid',
      'Grid refine zoom',
      'The grid spacing halves once the camera zooms in this far past the overview.',
    ],
    [1.05, 20, 0.05, 'x'],
    {
      keywords: ['graticule', 'zoom', 'halve'],
    },
  ),
  num(
    [
      'graticule.maxSubdiv',
      'grid',
      'Grid refinements',
      'How many times the grid spacing may halve as the camera zooms in.',
    ],
    [0, 4, 1],
    {
      keywords: ['graticule', 'grid', 'step', 'halve'],
    },
  ),
  num(
    ['graticule.lineWidth', 'grid', 'Grid line width', 'Width of the grid lines.'],
    [0, 20, 0.5, 'Du'],
    {
      keywords: ['graticule', 'stroke', 'thickness'],
    },
  ),
  num(
    ['graticule.minorAlpha', 'grid', 'Minor line opacity', 'Opacity of unlabelled grid lines.'],
    ALPHA,
    {
      keywords: ['graticule', 'alpha', 'faint'],
    },
  ),
  num(
    ['graticule.majorAlpha', 'grid', 'Major line opacity', 'Opacity of labelled grid lines.'],
    ALPHA,
    {
      keywords: ['graticule', 'alpha', 'strong'],
    },
  ),
  bool(
    ['graticule.labels', 'grid', 'Grid labels', 'Label the major grid lines with their degrees.'],
    {
      keywords: ['graticule', 'degrees', 'coordinates'],
    },
  ),
  bool(
    [
      'graticule.clearLabels',
      'grid',
      'Keep grid labels apart',
      'Leave out a grid label that would touch a corner mark or another grid label.',
    ],
    {
      keywords: ['graticule', 'overlap', 'collision', 'corner'],
    },
  ),
  num(
    ['graticule.labelSize', 'grid', 'Grid label size', 'Text size of the grid labels.'],
    DU_SIZE,
    {
      keywords: ['graticule', 'font', 'size'],
    },
  ),
  num(
    [
      'graticule.labelAlpha',
      'grid',
      'Grid label opacity',
      'Opacity of the grid labels (solid text ignores it).',
    ],
    ALPHA,
    {
      keywords: ['graticule', 'alpha'],
    },
  ),
  tuple(
    [
      'graticule.lonLabelOffset',
      'grid',
      'Longitude label position',
      'Longitude labels: distance right of their line, and distance from the top of the frame.',
    ],
    2,
    [-400, 400, 1, 'Du'],
    {
      keywords: ['graticule', 'offset', 'east', 'west'],
    },
  ),
  tuple(
    [
      'graticule.latLabelOffset',
      'grid',
      'Latitude label position',
      'Latitude labels: distance from the left of the frame, and distance below their line.',
    ],
    2,
    [-400, 400, 1, 'Du'],
    {
      keywords: ['graticule', 'offset', 'north', 'south'],
    },
  ),
  choice(
    ['graticule.labelFormat', 'grid', 'Grid label style', 'Plain (72W) or with a degree sign.'],
    LABEL_FORMATS,
    {
      keywords: ['graticule', 'degrees', 'format'],
    },
  ),
  bool(
    ['hud.corners', 'grid', 'Corner marks', 'Draw the bracket marks in the corners of the frame.'],
    { keywords: ['hud', 'frame', 'brackets'] },
  ),
  num(
    ['hud.cornerLen', 'grid', 'Corner mark length', 'Length of each arm of the corner marks.'],
    [0, 400, 1, 'Du'],
    {
      keywords: ['hud', 'brackets', 'size'],
    },
  ),
  num(
    [
      'hud.cornerMargin',
      'grid',
      'Corner mark inset',
      'Distance of the corner marks from the frame edges.',
    ],
    [0, 400, 1, 'Du'],
    {
      keywords: ['hud', 'brackets', 'margin'],
    },
  ),
  num(
    ['hud.cornerWidth', 'grid', 'Corner mark width', 'Line width of the corner marks.'],
    [0, 20, 0.5, 'Du'],
    {
      keywords: ['hud', 'brackets', 'stroke'],
    },
  ),
  num(['hud.cornerAlpha', 'grid', 'Corner mark opacity', 'Opacity of the corner marks.'], ALPHA, {
    keywords: ['hud', 'brackets', 'alpha'],
  }),
];

// ---------------------------------------------------------------------------
// 12 Layout (one value per profile: landscape, portrait, square)

const LAYOUT_FIELDS: readonly FieldDef[] = [
  num(
    [
      'layouts.*.fit.marginX',
      'layout',
      'Overview side margins',
      'Total space left and right of the route in the overview.',
    ],
    [0, 4000, 1, 'Du'],
    {
      keywords: ['fit', 'margin', 'overview', 'zoom'],
    },
  ),
  num(
    [
      'layouts.*.fit.marginY',
      'layout',
      'Overview top and bottom margins',
      'Total space above and below the route in the overview.',
    ],
    [0, 4000, 1, 'Du'],
    {
      keywords: ['fit', 'margin', 'overview', 'zoom'],
    },
  ),
  tuple(
    [
      'layouts.*.fit.nudgeDeg',
      'layout',
      'Overview nudge',
      'Moves the overview camera by degrees of longitude and of map height.',
    ],
    2,
    [-10, 10, 0.01, 'deg'],
    {
      keywords: ['fit', 'offset', 'overview', 'centre'],
    },
  ),
  num(
    [
      'layouts.*.fit.nudgeMaxFrac',
      'layout',
      'Nudge limit',
      'Largest nudge as a share of the route span, so small trips stay on screen.',
    ],
    FRAC,
    {
      keywords: ['fit', 'nudge', 'cap'],
      liveWhen: 'nudged',
    },
  ),
  tuple(
    [
      'layouts.*.fit.offsetDu',
      'layout',
      'Overview offset',
      'Moves the fitted route away from the frame centre (right, down).',
    ],
    2,
    DU_OFFSET,
    {
      keywords: ['fit', 'offset', 'overview', 'centre'],
    },
  ),
  tuple(
    [
      'layouts.*.stopPin',
      'layout',
      'Stop pin position',
      'Where the pin sits on screen at each stop, from the frame centre (right, down).',
    ],
    2,
    DU_OFFSET,
    {
      keywords: ['camera', 'stop', 'pin', 'framing'],
    },
  ),
  num(
    ['layouts.*.title.x', 'layout', 'Title x', 'Left edge of the title, subtitle and description.'],
    [-400, 4000, 1, 'Du'],
    {
      keywords: ['title', 'position'],
    },
  ),
  num(['layouts.*.title.y', 'layout', 'Title y', 'Top of the title.'], [-400, 4000, 1, 'Du'], {
    keywords: ['title', 'position'],
  }),
  num(['layouts.*.title.size', 'layout', 'Title size', 'Text size of the title.'], DU_SIZE, {
    keywords: ['title', 'font', 'size'],
  }),
  num(
    [
      'layouts.*.title.tracking',
      'layout',
      'Title spacing',
      'Extra space between the letters of the title.',
    ],
    DU_TRACK,
    {
      keywords: ['title', 'tracking', 'letter spacing'],
    },
  ),
  num(
    ['layouts.*.title.subY', 'layout', 'Subtitle y', 'Top of the subtitle.'],
    [-400, 4000, 1, 'Du'],
    {
      keywords: ['subtitle', 'position'],
    },
  ),
  num(
    ['layouts.*.title.subSize', 'layout', 'Subtitle size', 'Text size of the subtitle.'],
    DU_SIZE,
    {
      keywords: ['subtitle', 'font', 'size'],
    },
  ),
  num(
    [
      'layouts.*.title.subTracking',
      'layout',
      'Subtitle spacing',
      'Extra space between the letters of the subtitle.',
    ],
    DU_TRACK,
    {
      keywords: ['subtitle', 'tracking', 'letter spacing'],
    },
  ),
  num(
    [
      'layouts.*.title.subAlpha',
      'layout',
      'Subtitle opacity',
      'Opacity of the subtitle relative to the title (solid text ignores it).',
    ],
    ALPHA,
    {
      keywords: ['subtitle', 'alpha'],
    },
  ),
  num(
    ['layouts.*.title.descY', 'layout', 'Description y', 'Top of the description line.'],
    [-400, 4000, 1, 'Du'],
    {
      keywords: ['description', 'caption', 'position'],
      liveWhen: 'description',
    },
  ),
  num(
    [
      'layouts.*.title.descSize',
      'layout',
      'Description size',
      'Text size of the description line, in the intro and in the finale.',
    ],
    DU_SIZE,
    {
      keywords: ['description', 'caption', 'font', 'size'],
      liveWhen: 'description',
    },
  ),
  num(
    [
      'layouts.*.title.descTracking',
      'layout',
      'Description spacing',
      'Extra space between the letters of the description.',
    ],
    DU_TRACK,
    {
      keywords: ['description', 'caption', 'tracking', 'letter spacing'],
      liveWhen: 'description',
    },
  ),
  num(
    [
      'layouts.*.title.descAlpha',
      'layout',
      'Description opacity',
      'Opacity of the description relative to the title (solid text ignores it).',
    ],
    ALPHA,
    {
      keywords: ['description', 'caption', 'alpha'],
      liveWhen: 'description',
    },
  ),
  num(
    [
      'layouts.*.title.minSize',
      'layout',
      'Title smallest size',
      'Smallest size a long title may shrink to.',
    ],
    DU_SIZE,
    {
      keywords: ['title', 'auto-fit', 'shrink', 'long'],
      liveWhen: 'longNames',
    },
  ),
  num(
    [
      'layouts.*.title.subMinSize',
      'layout',
      'Subtitle smallest size',
      'Smallest size a long subtitle may shrink to.',
    ],
    DU_SIZE,
    {
      keywords: ['subtitle', 'auto-fit', 'shrink', 'long'],
      liveWhen: 'longNames',
    },
  ),
  num(
    [
      'layouts.*.title.descMinSize',
      'layout',
      'Description smallest size',
      'Smallest size a long description may shrink to.',
    ],
    DU_SIZE,
    {
      keywords: ['description', 'caption', 'auto-fit', 'shrink', 'long'],
      liveWhen: 'longNames',
    },
  ),
  num(
    [
      'layouts.*.title.shrinkStep',
      'layout',
      'Title shrink step',
      'Size removed per step while a long title, subtitle or description shrinks to fit.',
    ],
    [0.5, 60, 0.5, 'Du'],
    {
      keywords: ['title', 'auto-fit', 'shrink', 'long'],
      liveWhen: 'longNames',
    },
  ),
  choice(
    [
      'layouts.*.card.placement',
      'layout',
      'Card placement',
      'Card to the right of the pin, or below it from the left edge.',
    ],
    CARD_PLACEMENTS,
    {
      keywords: ['card', 'position'],
    },
  ),
  num(
    [
      'layouts.*.card.x',
      'layout',
      'Card x',
      'Right of the pin: distance from the pin; below the pin: distance from the left edge.',
    ],
    [-2000, 4000, 1, 'Du'],
    {
      keywords: ['card', 'position', 'offset'],
    },
  ),
  num(
    ['layouts.*.card.dy', 'layout', 'Card y', 'Vertical distance of the card from the pin.'],
    [-2000, 4000, 1, 'Du'],
    {
      keywords: ['card', 'position', 'offset'],
    },
  ),
  choice(
    [
      'layouts.*.card.leader',
      'layout',
      'Pointer shape',
      'Line from the pin to the card: diagonal or vertical.',
    ],
    LEADER_KINDS,
    {
      keywords: ['card', 'leader', 'line'],
    },
  ),
  tuple(
    [
      'layouts.*.card.leaderFrom',
      'layout',
      'Pointer start',
      'Start of the pointer line, from the pin centre (right, down).',
    ],
    2,
    [-400, 400, 1, 'Du'],
    {
      keywords: ['card', 'leader', 'line'],
    },
  ),
  tuple(
    [
      'layouts.*.card.leaderTo',
      'layout',
      'Pointer end',
      'End of the pointer line, from the card corner or below the pin (right, down).',
    ],
    2,
    [-800, 800, 1, 'Du'],
    {
      keywords: ['card', 'leader', 'line'],
    },
  ),
  choice(
    [
      'layouts.*.card.results',
      'layout',
      'Result rows',
      'Results side by side on one line, or one per line.',
    ],
    RESULT_LAYOUTS,
    {
      keywords: ['card', 'results', 'inline', 'stacked'],
    },
  ),
  num(
    [
      'layouts.*.card.partnerWrapChars',
      'layout',
      'Extra line wrap',
      'Split the extra line in two when it is longer than this many characters; 0 never splits.',
    ],
    [0, 200, 1, 'chars'],
    {
      keywords: ['card', 'partner', 'wrap'],
      liveWhen: 'partnerResults',
    },
  ),
  num(
    [
      'layouts.*.card.barPartner',
      'layout',
      'Bar for extra line',
      'Extra accent bar height when a stop has an extra line.',
    ],
    [0, 400, 1, 'Du'],
    {
      keywords: ['card', 'bar', 'partner'],
      liveWhen: 'partnerResults',
    },
  ),
  bool(
    [
      'layouts.*.card.resultsBarPerRow',
      'layout',
      'Bar grows per result',
      'Grow the accent bar for every result row, instead of once.',
    ],
    {
      keywords: ['card', 'bar', 'results'],
      liveWhen: 'partnerResults',
    },
  ),
  choice(
    [
      'layouts.*.pinLabels.order',
      'layout',
      'Label drawing order',
      'Draw each label right after its pin, or all labels after all pins.',
    ],
    PIN_LABEL_ORDERS,
    {
      keywords: ['pins', 'labels', 'overlap'],
      liveWhen: 'crowded',
    },
  ),
  num(
    [
      'layouts.*.pinLabels.flipAboveX',
      'layout',
      'Flip labels after',
      'Labels of pins right of this share of the width go on the left of their pin; empty flips a label only when it would run off the frame. With Label placement on Auto this is only the side a label prefers.',
    ],
    [0, 1, 0.01, 'frac'],
    // With automatic placement the side is only a preference, which a probe frame need not show.
    { keywords: ['pins', 'labels', 'left', 'right'], nullable: true, liveWhen: 'fixedLabels' },
  ),
  bool(
    [
      'layouts.*.pinLabels.medals',
      'layout',
      'Medal dots on labels',
      'Show medal dots after the date on pin labels.',
    ],
    {
      keywords: ['pins', 'labels', 'medals'],
    },
  ),
  num(
    ['layouts.*.stats.x', 'layout', 'Stats x', 'Left edge of the first finale stat.'],
    [-400, 4000, 1, 'Du'],
    {
      keywords: ['stats', 'position', 'finale'],
    },
  ),
  num(
    ['layouts.*.stats.y', 'layout', 'Stats y', 'Top of the first finale stat.'],
    [-400, 4000, 1, 'Du'],
    {
      keywords: ['stats', 'position', 'finale'],
    },
  ),
  choice(
    [
      'layouts.*.stats.direction',
      'layout',
      'Stats arrangement',
      'Stats side by side in a row, or stacked in a column.',
    ],
    STATS_DIRECTIONS,
    {
      keywords: ['stats', 'row', 'column'],
    },
  ),
  num(
    ['layouts.*.stats.pitch', 'layout', 'Stats spacing', 'Distance between neighbouring stats.'],
    [0, 2000, 1, 'Du'],
    {
      keywords: ['stats', 'spacing', 'gap'],
    },
  ),
  num(
    ['layouts.*.stats.numberSize', 'layout', 'Stats number size', 'Text size of the big numbers.'],
    [1, 800, 1, 'Du'],
    {
      keywords: ['stats', 'font', 'size'],
    },
  ),
  num(
    [
      'layouts.*.stats.labelDx',
      'layout',
      'Stats label x',
      'Horizontal position of each stat label from its number.',
    ],
    [-400, 1200, 1, 'Du'],
    {
      keywords: ['stats', 'label', 'offset'],
    },
  ),
  num(
    [
      'layouts.*.stats.labelDy',
      'layout',
      'Stats label y',
      'Vertical position of each stat label from the top of its number.',
    ],
    [-400, 1200, 1, 'Du'],
    {
      keywords: ['stats', 'label', 'offset'],
    },
  ),
  num(
    [
      'layouts.*.safeArea.top',
      'layout',
      'Safe area top',
      'Top margin of the safe-zone guide, as a share of the height.',
    ],
    [0, 0.5, 0.001, 'frac'],
    {
      keywords: ['safe zone', 'guide', 'margin'],
      liveWhen: 'statsColumn',
    },
  ),
  num(
    [
      'layouts.*.safeArea.right',
      'layout',
      'Safe area right',
      'Right margin of the safe-zone guide, as a share of the width (preview only).',
    ],
    [0, 0.5, 0.001, 'frac'],
    {
      keywords: ['safe zone', 'guide', 'margin'],
      live: false,
    },
  ),
  num(
    [
      'layouts.*.safeArea.bottom',
      'layout',
      'Safe area bottom',
      'Bottom margin of the safe-zone guide, as a share of the height.',
    ],
    [0, 0.5, 0.001, 'frac'],
    {
      keywords: ['safe zone', 'guide', 'margin'],
      liveWhen: 'clearance',
    },
  ),
  num(
    [
      'layouts.*.safeArea.left',
      'layout',
      'Safe area left',
      'Left margin of the safe-zone guide, as a share of the width (preview only).',
    ],
    [0, 0.5, 0.001, 'frac'],
    {
      keywords: ['safe zone', 'guide', 'margin'],
      live: false,
    },
  ),
];

/** The catalog, in section order. */
export const FIELDS: readonly FieldDef[] = [
  ...STOP_FIELDS,
  ...TEXT_FIELDS,
  ...LOOK_FIELDS,
  ...TIMING_FIELDS,
  ...STATS_FIELDS,
  ...VIDEO_FIELDS,
  ...CAMERA_FIELDS,
  ...ROUTE_FIELDS,
  ...PIN_FIELDS,
  ...CARD_FIELDS,
  ...GRID_FIELDS,
  ...LAYOUT_FIELDS,
];

/** Catalog lookup by exact `path`. */
export const FIELD_BY_PATH: ReadonlyMap<string, FieldDef> = new Map(
  FIELDS.map((field) => [field.path, field]),
);
