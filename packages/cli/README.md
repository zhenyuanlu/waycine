# waycine-cli

**Trip map video maker: your journey, in motion.** The `waycine` command
renders [Waycine](https://github.com/zhenyuanlu/waycine) videos (animated travel
maps of a trip, a tour or a race season) on your own machine: a full MP4, one
clip per segment, a PNG sequence, or a single frame.
It uses the same engine as the Waycine web app and the bundled Barlow fonts.

## Install

```sh
npm install -g waycine-cli
waycine --help
```

Requirements:

- Node.js 22.12 or newer.
- For MP4 output, an [ffmpeg](https://ffmpeg.org/download.html) with the
  `libx264` encoder (most builds include it). Waycine does not bundle or
  download ffmpeg; it looks for `--ffmpeg <path>`, then the `WAYCINE_FFMPEG`
  environment variable, then `ffmpeg` on your `PATH`. Stills, PNG sequences
  and the other commands work without it.

Frames are drawn with [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas),
which npm installs with prebuilt binaries for Windows, macOS and Linux.

## Quick start

```sh
waycine init --preset europe-trip -o trip.waycine.json   # start from a demo
waycine validate trip.waycine.json                       # check it
waycine info trip.waycine.json                           # see the timeline
waycine still trip.waycine.json --frame 400 -o frame.png # look at one frame
waycine render trip.waycine.json -o trip.mp4             # render the video
```

Edit the project file in any text editor, or in the web app and save it
there. `waycine params --search <words>` lists the settings you can change.

## Commands

| Command | What it does |
| --- | --- |
| `waycine render <project> -o <out.mp4>` | Renders the video (or a frame range) to MP4 |
| `waycine render <project> --segments -o <dir>` | One MP4 per segment (intro, each stop, finale) in a folder |
| `waycine render <project> --frames-dir <dir>` | Every frame as a PNG; no ffmpeg needed |
| `waycine still <project> --frame <n> -o <frame.png>` | One frame as a PNG |
| `waycine info <project>` | The output format and the timeline, segment by segment |
| `waycine validate <project>` | Every issue in the file; exit code 1 when there is an error |
| `waycine init [--preset <name>] [-o <file>]` | A new project from a demo: `europe-trip` (the default), `race-season`, `road-trip`, `world-tour` or `day-trip` |
| `waycine params [--search <text>]` | Every setting: path, type, range, default and help |

Format flags for one run: `--aspect 16:9|9:16|1:1|4:5`, `--short 720|1080|1440|2160`,
`--size WxH`, `--fps`, `--ss 2` (2x supersampling), `--segments`, and
`--font display=<file>` / `--font body=<file>` for your own fonts.

Videos are H.264 High, yuv420p, BT.709, with the exact frame rate (29.97 is
30000/1001) and the index at the front of the file. An MP4 is written to a
temporary file first and renamed only when ffmpeg succeeds, so a failed or
interrupted render (Ctrl+C, exit code 130) never leaves a broken file.

The full reference, with every flag and more examples, is in
[docs/cli.md](https://github.com/zhenyuanlu/waycine/blob/main/docs/cli.md); the
project file format is in
[docs/project-format.md](https://github.com/zhenyuanlu/waycine/blob/main/docs/project-format.md).

## License

MIT. ffmpeg is a separate program under its own license; Waycine only runs
the copy you installed.
