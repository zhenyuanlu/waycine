# Browser support

The Waycine web app renders and encodes your video in the browser. Nothing is
uploaded: the frames, the encoder and the finished file all stay on your
device. This page lists which browsers can export what, what happens when a
browser lacks something, the known limits, and how to use the same export
from your own code with `waycine/browser`.

## Support at a glance

| Browser | Opens the app | Video export | Notes |
| --- | --- | --- | --- |
| Chrome 111+ and Edge 111+ on Windows, macOS and ChromeOS | Yes | MP4 (H.264) in a background worker | The reference browsers: everything works |
| Chrome on Linux | Yes | MP4 (H.264) in a worker; VP9 in WebM on builds without an H.264 encoder | Some Linux builds of Chromium ship without H.264 |
| Chrome 111+ on Android, Samsung Internet | Yes | MP4 (H.264) in a worker | Some phone encoders refuse the largest vertical sizes; a smaller size is then offered |
| Safari 16.4+ on macOS | Yes | MP4 (H.264) | |
| Safari 16.4+ on iPhone and iPad (and every iOS browser, which all use Safari's engine) | Yes | MP4 (H.264) | Keep the screen on and the tab in front while exporting |
| Firefox 130+ on Windows, macOS and Linux | Yes | MP4 (H.264) where the system provides an encoder, otherwise VP9 in WebM | |
| Firefox 125 to 129 | Yes | Real-time recording to WebM | No WebCodecs before Firefox 130 |
| Firefox for Android | Yes | Real-time recording to WebM | Firefox for Android has no WebCodecs encoder |
| Safari before 16.4, Chrome and Edge before 111, Firefox before 125 | No | | The app needs a 2023-or-newer browser |

The app is built for Chrome and Edge 111, Firefox 114 and Safari 16.4; the
engine also needs `Intl.Segmenter`, which Firefox has since version 125.

How this table was made: the app and the export are tested in Microsoft Edge
on Windows 11 (locally) and in Google Chrome on Linux (in CI). The other rows
follow the published support data for WebCodecs, H.264 encoding,
`OffscreenCanvas` and `MediaRecorder` (caniuse.com, MDN and
webcodecsfundamentals.org, as of September 2026). Reports from other browsers
are welcome.

## What the export needs

| Feature | Used for | Without it |
| --- | --- | --- |
| WebCodecs `VideoEncoder` with H.264 | MP4 files (the default) | VP9 in WebM, or real-time recording (below) |
| `OffscreenCanvas` with a 2D context in workers | Rendering in a background worker | The same export runs on the page itself |
| `MediaRecorder` and `canvas.captureStream()` | The last fallback | No video export; PNG stills still work |
| Screen Wake Lock | Keeping the screen on during an export | The export still runs; keep the screen awake yourself |
| Web Share with files | "Share" after the export (for example to save to Photos) | Download only |

The export dialog checks your browser when it opens and tells you what it
will do before you start.

WebCodecs, Screen Wake Lock and Web Share exist only in a secure context:
an `https://` page or `localhost`. If you host Waycine yourself over plain
`http://` (for example on a home network), editing and preview work, but the
export falls back to real-time recording and separate clips are unavailable.
Serve it over HTTPS, or open it through `localhost`, for the fast export.

## The fallback ladder

When the export dialog opens it asks the browser, for every video size it
offers (720p, 1080p, 1440p, 2160p at the project's aspect), whether it can
encode that size at the chosen quality. Then:

1. **H.264 in MP4** at the size you picked, if the browser can encode it.
2. **A smaller H.264 size**: sizes the browser refuses are disabled with a
   reason, and the largest size that works is selected, with a note.
3. **VP9 in WebM** when no H.264 size works. WebM plays in browsers and VLC,
   but some phones and video editors cannot open it.
4. **Real-time recording** with `MediaRecorder` when the browser has no usable
   WebCodecs encoder: the video plays once in real time while it is recorded
   (MP4 where the browser can record MP4, else WebM). It may drop frames; keep
   the tab in front until it finishes. Separate clips and extra smooth are not
   available on this path.
5. **Nothing**: the dialog says the browser cannot export video. Saving the
   current frame as a PNG still works.

The summary at the top of the dialog shows what you will get: the format and
size, the frame rate, the length, an estimate of the file size and the file
type, for example `MP4 (H.264)`. Under "Technical details" it shows the real
codec string (for example `avc1.640032`), which comes from a one-frame test
encode, so it names the H.264 profile and level your browser will really
write. The file size is an estimate from the bitrate; real files are usually
a little smaller.

## Export options

| Option | What it does |
| --- | --- |
| Format | The shape of the frame: 16:9 (landscape), 9:16 (portrait), 1:1 (square) or 4:5 (portrait for feeds). Changing it changes the project's format, so the preview follows |
| Size | The short side of the frame: 720p, 1080p, 1440p or 4K (2160 px) at that shape. A project with a custom size also offers that size |
| Quality | Standard, High or Max: 0.13, 0.20 or 0.32 bits per pixel per frame (about 8, 12 and 20 Mbps at 1080p 29.97 fps). A project with an explicit bitrate uses it instead |
| Output: One video | One seamless MP4 |
| Output: Separate clips | The intro, each stop and the finale as their own files (each piece starts and ends on its own, without the fades that join them in one video), in one ZIP (stored, not compressed again): `01-overview.mp4`, `02-stop-01-boston.mp4`, ..., `09-finale.mp4`, the same names as `waycine render --segments` |
| Extra smooth | Draws every frame at twice the width and height, then scales it down (a 2 x 2 average), so it takes longer. Only offered while the doubled frame stays within 4096 x 4096 pixels (so up to 1440p at 16:9), the same limit as the CLI's `--ss 2` |
| Save frame as PNG | The frame shown in the player, at the chosen size |

While the export runs, the dialog shows the frame being written, a progress
bar with the time left, and Cancel. When it finishes, the file downloads
automatically; you can download it again, play it in the dialog, share it
where the browser supports sharing files (on phones, for example to save it
to Photos), or export another size.

The file name follows the pattern `waycine-<project>-<aspect>-<size>p.mp4`,
for example `waycine-europe-trip-demo-9x16-1080p.mp4` (`.webm` for
WebM, `.zip` for clips).

## Known limits

- **Memory.** The finished file is held in memory until it is saved. A long
  4K video at Max quality can run to several hundred megabytes, which some
  phones and tablets cannot hold; the dialog warns about large files, and a
  smaller size or quality helps.
- **Background tabs and locked screens.** A desktop browser keeps exporting
  in a background tab. A phone may pause the export when the screen locks or
  you switch apps; the app asks for a screen wake lock where the browser
  supports it.
- **Speed.** The export is faster than real time on a desktop computer (in
  testing, a 1080p video took about a fifth of its length to make in Edge on
  Windows); phones are slower, and extra smooth takes several times as long.
- **Vertical sizes on Android.** Some hardware encoders refuse 1080 x 1920 or
  larger; the dialog then offers the largest size that works.
- **Real-time recording** (Firefox for Android, Firefox before 130) records
  while the video plays, so it takes as long as the video and may drop frames
  on a busy device.
- **Fonts you add** (uploaded in the editor) are rendered on the page's own
  thread rather than in a worker, which keeps the page busier during the
  export.
- **Scripts.** The bundled fonts cover Latin scripts. Text in other scripts
  needs a font you add that contains its letters; the editor warns about
  letters the font lacks.
- **Place search** needs a network connection, and so does the first export
  of a visit (the encoder is downloaded when you first open the export
  dialog). Pasted coordinates work without one.

## Using the export from code

`waycine/browser` exports the same functions the web app uses. In a
TypeScript project, set `skipLibCheck: true` for now: Mediabunny's WebCodecs
type declarations clash with the DOM library of current TypeScript versions.

```ts
import {
  browserCapabilities,
  exportClips,
  exportVideo,
  loadBundledFonts,
  planExportRoute,
  recordVideo,
  renderStill,
  validateProject,
} from 'waycine/browser';

const { project } = validateProject(json);
await loadBundledFonts();

const result = await exportVideo(project, {
  width: 1920,
  height: 1080,
  onProgress: (p) => console.log(`${p.frame} / ${p.total}`),
});
// result.blob (video/mp4), result.codec ('avc1.640032'), result.thread ('worker' or 'main')
```

| Function | Result |
| --- | --- |
| `exportVideo(project, options)` | One video: H.264 in MP4 (`codec: 'avc'`, default) or VP9 in WebM (`codec: 'vp9'`) |
| `exportClips(project, options)` | One file per timeline segment (`clips[]` with `blob`, `kind`, `index`, `city`) |
| `recordVideo(project, options)` | Real-time `MediaRecorder` recording, for browsers without WebCodecs |
| `renderStill(project, frame, options)` | One frame as a PNG `Blob` |
| `planExportRoute(sizes, requested, browserCapabilities())` | The fallback ladder's answer: which route and which sizes work |
| `canSupersample(width, height)` | Whether extra smooth fits this size |

Useful options of `exportVideo` and `exportClips`: `signal` (an
`AbortSignal`; the promise then rejects with an `AbortError`), `onProgress`
(frames done, total, speed, time left and, with `thumbnailWidth`, an
`ImageBitmap` thumbnail you should `close()`), `supersample: 2`, `fps`,
`bitrate`, and `worker`.

When encoding fails part-way, the promise rejects with an `ExportFailedError`
whose `frame` is the frame that was being written; when the browser cannot
encode the requested codec and size at all, with an `EncoderUnavailableError`.

### How the export worker is found

By default (`worker: 'auto'`) the export renders and encodes in a module
worker, `export-worker.js`, which sits next to the package's
`dist/browser/export.js`. The package creates it with

```ts
new Worker(new URL('./export-worker.js', import.meta.url), { type: 'module' });
```

- **Vite**, **webpack 5** and **Parcel** recognise this pattern and bundle the
  worker as its own entry. With Vite, keep `waycine` out of dependency
  pre-bundling, which would lose the worker file:
  `optimizeDeps: { exclude: ['waycine'] }`.
- **Plain ES modules** served as files (with an import map for `mediabunny`)
  load it from next to `export.js`.
- **Other setups**: copy `export-worker.js` (with its imports) where you can
  serve it and pass its URL as `workerUrl`.

If the worker cannot start within 20 seconds, or the browser has no 2D
`OffscreenCanvas`, `VideoEncoder` or `FontFaceSet` in workers, the export runs
on the page's own thread instead (it yields between frames so the page stays
responsive). `worker: 'never'` always does that.

The worker receives the bundled fonts as bytes from the page. A project whose
fonts use `source: 'local'` (fonts registered only on this page) exports on the
page's thread unless you pass those fonts as `fontFaces`
(`{ family, data }` with the font file's bytes).
