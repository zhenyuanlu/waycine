# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Planned as 0.1.0, the first public release: the engine (`waycine`), the
command-line renderer (`waycine-cli`) and the no-code web app.

### Added

#### Web app

- A no-code editor with a live preview. "Basics" holds the stops and five
  sections (Titles & text, Look, Timing, Finale stats, Video); "All
  settings" lists every setting, including Camera, Route, Pins, Stop card,
  Map grid & HUD and Layout, generated from the settings catalog, with
  search (press `/`), a "Changed" filter, a help line for the setting in
  focus, a JSON view, a dot on every changed value, and "Reset" for a group
  or "Reset changed" for everything you changed.
- Four colour themes (Orchid, Midnight Cyan, Ember, Mono) and your
  own colours; a format switch for 16:9, 9:16, 1:1 and 4:5 with a safe-zone
  guide; the transition between stops as one choice (Fly, Flash to white,
  Dip to dark or Flash to colour) with the flash colour and length beside
  it, previewed in the player when you choose it; an optional description
  line under the subtitle, shown in the intro or also under the finale
  stats.
- Stop editor: add, duplicate, hide, delete (with undo), reorder by drag or
  Alt+arrows, sort by date; place search (Photon while typing,
  OpenStreetMap Nominatim on request) or pasted coordinates,
  degrees-minutes-seconds and Google Maps links, which never leave the
  device; results with medals; date ranges; import a CSV or TSV list, or
  paste rows from a spreadsheet; pick a place on the preview; optionally
  ("Follow edits") the paused preview jumps to the stop you edit, and "Show"
  puts it on a stop at any time. Up to 99 stops.
- "Shows as" lines that fill the title, subtitle and stop label tokens as the
  video will, with tokens you insert (with their nouns, such as "7 STOPS")
  and change as chips, from the mouse or the keyboard; the length of the
  video in the Timing section; out-of-range numbers explained under the
  field, and a note when a number is kept at its limit; colour names such as
  "orange" accepted in colour fields.
- Export in the browser: choose the format (16:9, 9:16, 1:1, 4:5), size and
  quality in the dialog; MP4 (H.264) up to 4K where the browser can encode
  it, rendered in a worker; a fallback ladder (a smaller size, VP9 in WebM,
  real-time recording); separate clips in a ZIP; extra smooth (2x
  supersampling); a PNG of the current frame; progress with a live thumbnail
  and Cancel; download, play and share. Nothing is uploaded. See
  [docs/browser-support.md](docs/browser-support.md).
- Five demos, one click away in a "Demos" row at the top of the editor (the
  loaded one is marked) and listed in "Start from" with a line on what each
  shows; a first visit opens the Europe trip demo, and an address ending in
  `?demo=<name>` (for example `?demo=road-trip`) opens another one. Over a
  project already saved in the browser the demo opens with "Keep this
  project" and "Back to my project"; a project that a demo or a shared link
  replaces is kept in Recent, and an edited project is asked about first,
  also after a reload.
- "Licenses" and "Source on GitHub" links at the end of the editor and in the
  File menu (the phone's More menu); the licenses open the third-party notices
  the site serves. The header also links to the source with the GitHub mark.
- Autosave in the browser, recent projects, undo and redo (Ctrl+Z,
  Ctrl+Shift+Z), open and save `.waycine.json` files (Ctrl+O, Ctrl+S, or drop
  a file on the page), share links that carry the whole project in the
  address (up to 65,536 characters), a project-file view to read and edit
  the JSON (with a confirmation before changes that drop stops), and fonts
  uploaded from your computer (kept in the browser).
- Light and dark appearance, a layout for each screen class (laptop, full
  HD, QHD, ultrawide, 4K, tablet and phone) with a preview drawn at the
  screen's own resolution, a page that never shifts under you, a phone
  layout, keyboard shortcuts (L turns looping on and off), "Skip to editor",
  and controls named for assistive technology.

#### Engine (`waycine`)

- The pipeline `validateProject` -> `compile` -> `sceneAt` -> `drawScene`
  (`renderFrame`), deterministic per frame index, with no DOM and no
  runtime dependencies in the core.
- The project format, schema version 1: `DEFAULTS`, the settings catalog
  `FIELDS` (label, help, range and section of every setting) and
  `migrateProject`. `validateProject` never throws: it fills defaults,
  clamps and converts values, keeps unknown keys, and reports every issue.
  See [docs/project-format.md](docs/project-format.md) and
  [docs/parameters.md](docs/parameters.md).
- Three layout profiles (landscape, portrait, square) picked by the shape of
  the video; aspects 16:9, 9:16, 1:1, 4:5 and custom sizes from 320 to
  4096 px; short sides 720 to 2160; frame rates from 23.976 to 60 fps
  (NTSC rates exact).
- Transitions: zoom-through with a flash to white, to any colour or to the
  background (`timing.transition.flashTo`), or fly; one seamless video or
  the separate pieces (`output.exportMode`); optional intro and finale; an
  end hold.
- Text templates with tokens (`{stops|STOP|STOPS}`, `{km}`, `{n:02}`, ...),
  date formats and ranges, an optional description line under the
  subtitle (also in the finale), long names that shrink to fit, and compile
  warnings for texts that still run past the frame edge.
- Finale stats from stops, regions, countries, months, days, kilometres,
  miles or your own values.
- 1 to 99 stops, routes across the 180th meridian, stops at the same place
  sharing a pin, hidden stops and per-stop lengths; pins and labels kept
  clear of the title and the finale stats.
- Text that keeps clear: each pin label takes the place around its pin that
  best clears the route, the other pins and labels, the title and the stats
  (`pins.label.placement`), chosen once for the overview and once for the
  finale so a label never jumps; a soft backdrop dims the route under the
  stop card (`card.backdrop`); grid labels that would touch a corner mark
  or another grid label are left out (`graticule.clearLabels`).
- A route glow and zoom blur drawn with the engine's own box blur instead of
  `ctx.filter`, so every browser and Node draw the same frames.
- Bundled Barlow Condensed and Barlow Semi Condensed fonts (SIL OFL 1.1),
  with a per-role size and width scale.
- `waycine/browser`: `exportVideo`, `exportClips`, `recordVideo`,
  `renderStill`, `planExportRoute`, `browserCapabilities`,
  `probeCodecString`, `canSupersample`, `loadBundledFonts`,
  `ExportFailedError` and `EncoderUnavailableError`; exports run in a module
  worker and fall back to the calling thread.
- `waycine/node`: `createNodeBackend` (`@napi-rs/canvas`, an optional peer
  dependency), `registerBundledFonts` and `bundledFontPath`.
- Helpers: `pickPlace` (the map position under a pixel), `computeStats`,
  `statTokenValues` and `replaceTokens` (tokens as the renderer fills them),
  `transitionStyle` and `applyTransitionStyle`.
- Five demo presets, each for a different kind of journey and format:
  `europe-trip` (a holiday through eight cities, 9:16; the default in the
  web app and in `waycine init`), `race-season` (a made-up team season with
  results and medals, 16:9), `road-trip` (a loop in miles, 1:1),
  `world-tour` (nine shows around the world, across the Pacific, 16:9) and
  `day-trip` (one day in one place with clock times, 4:5). Together they
  use every format, transition and built-in theme.

#### Command line (`waycine-cli`)

- `waycine render` (MP4 through an ffmpeg you install, one clip per segment,
  or PNG frames), `still`, `info`, `validate`, `init` and `params`, with
  format flags (`--aspect`, `--short`, `--size`, `--fps`, `--ss`,
  `--segments`, `--font`) and frame ranges. See [docs/cli.md](docs/cli.md).
- Videos are encoded to a temporary file and renamed only on success;
  Ctrl+C stops ffmpeg and exits with code 130. Memory stays flat during long
  renders (about 220 MB at 1080p).

#### Documentation and tooling

- User documentation: the README, [docs/cli.md](docs/cli.md),
  [docs/browser-support.md](docs/browser-support.md),
  [docs/project-format.md](docs/project-format.md) and the generated
  [docs/parameters.md](docs/parameters.md); a JSON Schema for project files
  (`https://zhenyuanlu.github.io/waycine/schema/v1.json`); third-party notices.
- Tests: camera and layout numbers of every frame checked against recorded
  reference states (numbers only), golden frames, settings-catalog coverage
  and liveness, and browser tests; `npm run bench` against the performance
  budget; `npm run docs:gen`; CI and GitHub Pages workflows, and a release
  workflow that publishes both packages to npm when a GitHub release is
  published; a repository hygiene check.

[Unreleased]: https://github.com/zhenyuanlu/waycine/commits/main
