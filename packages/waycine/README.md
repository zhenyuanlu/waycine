# waycine

**Trip map video maker: your journey, in motion.** Waycine ("way cinema")
turns a list of stops into an animated travel map video of a trip, a road
trip, a tour or a race season: a glowing route across a map grid, a card for
every stop, and a finale with the totals of the trip.

This package is the engine. It renders frames deterministically on a canvas
in the browser or in Node, and exports MP4 files in the browser. The
[web app](https://zhenyuanlu.com/waycine/) and the
[`@waycine/cli`](https://www.npmjs.com/package/@waycine/cli) command line are
built on it.

![A race season of seven stops: the route draws itself and every stop shows its card](https://raw.githubusercontent.com/zhenyuanlu/waycine/main/docs/media/demo-race-season.webp)

## Install

```sh
npm install waycine
```

Node.js 22.12 or newer for the Node entry; for rendering in Node also
install the optional peer dependency `@napi-rs/canvas` (1.0.9 or a newer
1.x).

| Import | What it gives you |
| --- | --- |
| `waycine` | The engine core: `validateProject`, `compile`, `sceneAt`, `drawScene`, `renderFrame`, `DEFAULTS`, the settings catalog `FIELDS`, themes and token helpers. No DOM, no dependencies |
| `waycine/browser` | The core plus a canvas backend, `loadBundledFonts`, `exportVideo`, `exportClips`, `recordVideo`, `renderStill` and the export probe |
| `waycine/node` | The core plus `createNodeBackend` (`@napi-rs/canvas`) and `registerBundledFonts` |
| `waycine/presets/*.waycine.json` | The demo projects `europe-trip`, `race-season`, `road-trip`, `world-tour` and `day-trip` |
| `waycine/fonts/*` | The bundled Barlow fonts (SIL Open Font License 1.1) |

## Export a video in the browser

```ts
import { exportVideo, loadBundledFonts, validateProject } from 'waycine/browser';

const json: unknown = await (await fetch('/trip.waycine.json')).json();
const { project, issues } = validateProject(json); // never throws; repairs and reports
for (const issue of issues) console.warn(`${issue.path}: ${issue.message}`);

await loadBundledFonts();
const video = await exportVideo(project, {
  width: 1080,
  height: 1920,
  onProgress: (p) => console.log(`frame ${p.frame} of ${p.total}`),
});
// video.blob is an MP4 (H.264); video.codec is the real codec string.
```

The export runs in a module worker when the browser allows it (bundlers that
understand `new Worker(new URL(...), import.meta.url)` pick it up; with Vite,
add `optimizeDeps: { exclude: ['waycine'] }`), and on the page's own thread
otherwise. When the browser cannot encode the codec at that size,
`exportVideo` throws an `EncoderUnavailableError`. For the web app's
fallbacks (a smaller size, VP9 in WebM, real-time recording), use
`planExportRoute`, `exportVideo` with `codec: 'vp9'` and `recordVideo`. See
[browser support](https://github.com/zhenyuanlu/waycine/blob/main/docs/browser-support.md#using-the-export-from-code).

In a TypeScript project, set `skipLibCheck: true` for now: Mediabunny's
WebCodecs type declarations clash with the DOM library of current TypeScript
versions.

## Render frames in Node

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { createCanvas } from '@napi-rs/canvas';
import { compile, createNodeBackend, renderFrame, validateProject } from 'waycine/node';

const json: unknown = JSON.parse(await readFile('trip.waycine.json', 'utf8'));
const { project } = validateProject(json);

const backend = createNodeBackend(); // registers the bundled fonts
const compiled = compile(project, backend, { width: 1920, height: 1080 });
const canvas = createCanvas(1920, 1080);

renderFrame(canvas.getContext('2d'), compiled, 220, backend);
await writeFile('frame-220.png', await canvas.encode('png'));
```

A frame depends only on the project and its number. A loop that renders many
frames should yield once per frame
(`await new Promise((r) => setImmediate(r))`) so `@napi-rs/canvas` can free
its pixel buffers.

## Documentation

- [Project format](https://github.com/zhenyuanlu/waycine/blob/main/docs/project-format.md):
  the `.waycine.json` file, text tokens, validation and versions.
- [Every setting](https://github.com/zhenyuanlu/waycine/blob/main/docs/parameters.md),
  with defaults and ranges, and the
  [JSON Schema](https://zhenyuanlu.github.io/waycine/schema/v1.json).
- [Browser support](https://github.com/zhenyuanlu/waycine/blob/main/docs/browser-support.md)
  and the export API.
- [Repository and changelog](https://github.com/zhenyuanlu/waycine).

## Notes

Source comments that mention "the original" mean the private Python renderer
Waycine was ported from.

## License

MIT. The bundled Barlow fonts are under the SIL Open Font License 1.1
(`fonts/OFL.txt`), Mediabunny, used for in-browser encoding, is under the
Mozilla Public License 2.0, and the blur is a port of Pillow's box blur
(MIT-CMU); see `THIRD_PARTY_NOTICES.md`.
