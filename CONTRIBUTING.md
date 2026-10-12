# Contributing to Waycine

Thanks for helping. Bug reports, ideas, documentation fixes and code are all
welcome. For anything larger than a small fix, open an issue first so we can
agree on the approach before you spend time on it.

Waycine began as a port of a private renderer that made the map scenes of one
season's highlight video. When the tests and code comments say "the
original", they mean that renderer; the parity fixtures keep only its numbers.

## Setup

- **Node.js 24** (see `.nvmrc`; 22.12 or newer also works) and npm 11.
- Install exactly what the lockfile says:

  ```sh
  npm ci
  ```

- The browser tests drive an installed browser, never Playwright's bundled
  Chromium (it has no H.264 encoder): **Microsoft Edge** by default, and
  Google Chrome on CI. Choose another with the `WAYCINE_E2E_CHANNEL`
  environment variable (for example `WAYCINE_E2E_CHANNEL=chrome npm run e2e`
  where Edge is not installed). A dev server already running on port 25180 is
  reused; with `CI` set, Playwright starts its own instead (stop yours first,
  otherwise the run stops with "already used"), forbids `test.only`, retries a
  failed test once and switches to the GitHub reporter.
- MP4 output from the CLI, and the CLI's encode tests, need an `ffmpeg` with
  `libx264` on your `PATH`; the tests that need it are skipped without it.

## Repository layout

| Path | What it is |
| --- | --- |
| `packages/waycine` | The engine, published as `waycine`: `src/core` (no DOM, no dependencies), `src/browser`, `src/node`, `fonts/`, `presets/`, `test/` |
| `packages/cli` | The `waycine` command, published as `@waycine/cli` |
| `apps/web` | The web app (Preact, Vite), private; `e2e/` holds the Playwright specs |
| `docs` | User documentation; `docs/parameters.md` is generated |
| `scripts` | Repository tools: hygiene check, docs generator, bench, golden update, font metrics |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Web app dev server at http://127.0.0.1:25180 |
| `npm run build` | `tsc -b` (engine and CLI into `dist/`), then the web app's production build |
| `npm run typecheck` | `tsc -b` for every project |
| `npm test` | Unit, parity and golden tests (Vitest) |
| `npm run check` | Biome (format and lint) and the repository hygiene check |
| `npm run verify` | `check`, `typecheck`, `test` and `build`; must pass before a pull request |
| `npm run e2e` | Browser tests (Playwright); starts the dev server if it is not running |
| `npm run bench` | Node frame-time bench against the performance budget (`-- --check` fails when over budget); needs a build first |
| `npm run golden:update` | Re-renders the golden frames after an intended visual change |
| `npm run docs:gen` | Regenerates `docs/parameters.md`, the JSON Schema and the site's third-party notices |
| `npm run fonts:metrics` | Regenerates `packages/waycine/fonts/metrics.json` after a bundled font is replaced |
| `npm run preview:pages -w @waycine/web` | Builds the site as GitHub Pages serves it and previews it at http://127.0.0.1:25181/waycine/ |

### Ports

The dev server always binds `127.0.0.1:25180` and the preview server
`127.0.0.1:25181`, both with `strictPort`: when a port is busy the server
stops with an error instead of moving to another port, because the tests and
the docs rely on those addresses. Stop whatever holds the port, or run your
own server there (`npm run e2e` reuses a running dev server).

On Windows, `EACCES` on either port usually means Hyper-V, WSL or WinNAT has
reserved a port range that covers it. List the reserved ranges with

```sh
netsh interface ipv4 show excludedportrange protocol=tcp
```

Restarting the WinNAT service (as an administrator) usually releases such a
range. The ports themselves are fixed on purpose; please do not change them
in a pull request.

## Code style

- **TypeScript, strict.** `strict`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax` and the other flags in `tsconfig.base.json` apply
  everywhere; no `any` without a comment that says why.
- **Biome** formats and lints everything: two spaces, single quotes,
  semicolons, trailing commas, lines up to 100 characters. Run
  `npx biome check --write .` to fix most issues; `npm run check` must pass.
- ES modules only. Relative imports in the packages (`packages/*`, Node
  module resolution) carry explicit `.js` extensions; the web app and its
  browser tests (`apps/web`, bundler resolution) leave them out. Named
  exports; the browser and node entries re-export the core by name.
- Every exported function and type gets a JSDoc comment that says what it
  does, its units and its edge cases.
- Every user-facing string of the web app lives in `apps/web/src/copy/`.
- Pin dependency versions exactly, and add no new dependency without an
  issue that discusses it first. The engine core has no runtime
  dependencies and must keep it that way.

### Determinism (the engine)

A frame must depend only on the project and the frame number, so the
browser, Node and every export produce the same video:

- No `Date`, `Math.random`, timers or DOM in `packages/waycine/src/core` (its
  `tsconfig` has no DOM library, so DOM use does not compile).
- The frame index is the unit of time. Durations become frames once, in
  `compile` (`max(1, round(seconds x fps))`); phases inside a segment split
  with `floor`. Never accumulate floats across frames: compute each frame
  from its index.
- Format numbers with `Intl.NumberFormat('en-US')`, never the user's locale.
- Text widths are measured through the backend and cached per compile, keyed
  by font; fonts must be loaded before the first `compile`.
- A new setting needs a `FIELDS` entry (label, help, range), a default in
  `DEFAULTS` that keeps existing videos unchanged, validation, and a
  regenerated `docs/parameters.md` (`npm run docs:gen`). The FIELDS coverage
  and liveness tests fail when one is missing or when a setting changes no
  pixel.

## Tests

- **Unit tests** (`packages/waycine/test/unit`, `packages/cli/test`,
  `apps/web/src/**/*.test.ts`) run in Node with Vitest.
- **Parity tests** (`packages/waycine/test/parity`) compare the camera,
  timeline and layout numbers of every frame of the reference season
  (`test/fixtures/projects/season-2026.waycine.json`, the season the
  original renderer was made for; a test project, not a shipped demo), in
  landscape and portrait, with reference states recorded once from the
  original renderer that Waycine ports, to 1e-9. The fixtures in
  `packages/waycine/test/fixtures/reference-states*.json` contain numbers
  only (cameras, progress values, positions), never code or other data from
  the original. They are not regenerated here; a deliberate change to
  fidelity updates the test and explains why.
- **Golden frames** (`packages/waycine/test/golden`) render a few dozen
  frames (the reference season in 16:9 and 9:16 and with a description line,
  the Europe demo in 9:16, long names and a round-the-world route in 16:9,
  and an equator route, a Pacific crossing and a single stop in 1:1) with
  `@napi-rs/canvas` and the bundled fonts, and compare them with the PNGs in
  `test/golden/png/`.
  `png/manifest.json` records the platform, architecture and
  `@napi-rs/canvas` version that made them: on a matching machine the
  comparison is strict (no channel more than 2 levels off); elsewhere text
  rasterization differs a little, so it is tolerant (mean difference below
  1.5 levels and fewer than 0.5% of pixels more than 16 levels off). A
  failing frame writes the actual image and a diff to
  `packages/waycine/node_modules/.tmp/golden/`. After an intended visual
  change, run `npm run golden:update` and look at every changed PNG before
  you commit it.
- **Browser tests** (`apps/web/e2e`) cover the editor, stops, share links and
  exports. They never call the real place-search services: Photon and
  Nominatim are mocked with `page.route`.
- **Bench**: `npm run bench` times frames in Node against the budget (30 ms
  per 1080p frame, 70 ms per zoom-through frame, 25 fps for the CLI). On
  hybrid CPUs run it pinned to performance cores; `--check` exits 2
  ("inconclusive") when the machine slowed down during the run.

## Writing and language

- **English only**: code, identifiers, comments, UI copy, sample data,
  presets, tests, docs and commit messages. The hygiene check rejects CJK
  characters.
- No absolute paths of your machine (drive letters, home folders) and no
  personal data in committed files. Presets and fixtures contain only the
  fields of the project format. The hygiene check rejects e-mail addresses,
  private network addresses, home-folder paths, key and credential files and
  tokens in well-known formats.
- Public docs (`README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`,
  `SECURITY.md`, `THIRD_PARTY_NOTICES.md`, `docs/`) must stand on their own
  for someone with a fresh clone.
- Code and comments under `apps/` and `packages/` describe behaviour; they
  do not cite documents that are not in the repository.
- The names in the last block of `.gitignore` are reserved for local tooling
  and are ignored at any depth, so do not use one of them for a source
  folder; the hygiene check rejects a committed path that contains one.
- `npm run check` runs `scripts/check-hygiene.mjs`, which also fails on
  broken Markdown links and on generated files that are out of date.

## Commits and pull requests

Commit messages use `<type>: description` in the imperative, lower case,
without a final period, for example `fix: keep the card inside the frame on
4:5`. Types: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`,
`ci`, `chore`.

Before you open a pull request:

- [ ] `npm run verify` passes.
- [ ] `npm run e2e` passes if you changed the web app or the export.
- [ ] New or changed behaviour has tests.
- [ ] A new setting has its `FIELDS` entry, default and validation, and
      `npm run docs:gen` was run.
- [ ] Changed golden PNGs were looked at, and the pull request says why they
      changed.
- [ ] User-visible changes have a line in the `[Unreleased]` section of
      `CHANGELOG.md`.
- [ ] No new dependency, or the issue that agreed to it is linked.
- [ ] Everything is in English.

## Release checklist (maintainers)

1. Start from a green `main`: CI passes on Node 22 and 24, and the e2e job
   passes.
2. Set the version in `packages/waycine/package.json`, `VERSION` in
   `packages/waycine/src/core/index.ts`, `packages/cli/package.json` and its
   exact `waycine` dependency, and the version badge at the top of
   `README.md`; run `npm install` to update the lockfile.
3. In `CHANGELOG.md`, rename `## [Unreleased]` to the version and date
   (`## [0.1.0] - YYYY-MM-DD`; this happens in the release commit of step 7,
   before the tag exists, so a tagged commit never says "Unreleased"), add a new empty `## [Unreleased]` above it,
   and update the link definitions at the bottom of the file
   (`[0.1.0]: https://github.com/zhenyuanlu/waycine/releases/tag/v0.1.0`, and
   `[Unreleased]` comparing the new tag with `HEAD`).
4. Run `npm run docs:gen` (the schema and settings page name the version),
   then `npm run verify` and `npm run e2e`.
5. Check what npm will publish: `npm pack --dry-run -w waycine -w @waycine/cli`
   lists only `dist/`, `fonts/`, `presets/`, the READMEs, `LICENSE` files and
   `THIRD_PARTY_NOTICES.md`.
6. Check the site: `npm run preview:pages -w @waycine/web`, open
   http://127.0.0.1:25181/waycine/, play a preset and export a video.
7. Commit steps 2 to 4 as the release commit, then tag `vX.Y.Z` on that
   commit and push; the Pages workflow deploys the site from `main`.
8. Create the GitHub release from the tag with the changelog section.
   Publishing the release starts the Release workflow
   (`.github/workflows/release.yml`): it checks that the tag matches the
   package versions, runs the checks again and publishes `waycine`, then
   `@waycine/cli`, to npm. It uses npm trusted publishing, so no npm token
   is stored in the repository; a version that is already on npm is skipped.
9. First release only, or when the workflow cannot run: publish by hand with
   two-factor authentication, `npm publish -w waycine --access public`, then
   `npm publish -w @waycine/cli --access public` (each package builds its
   `dist/` first: `prepublishOnly` runs `tsc -b`). A trusted publisher can
   only be set on a package that exists, so after the first publish open each
   package's settings on npmjs.com and add the trusted publisher: GitHub
   Actions, `zhenyuanlu` / `waycine`, workflow `release.yml`.
10. First release only: once the site loads and both packages are on npm,
    remove the "Pre-release" notes from `README.md`, `docs/cli.md` and
    `docs/browser-support.md`, "pre-release" from the version badge in
    `README.md` and the "Once published:" line above the install command in
    `docs/cli.md`; check that the first CI run passed in
    Chrome on Linux, as `docs/browser-support.md` says; commit.

A change to the project format that is not backward compatible also raises
the schema version, adds a migration step and a new schema file (see
[docs/project-format.md](docs/project-format.md#versions-and-migration)).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
