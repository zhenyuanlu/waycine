# Waycine CLI

The `waycine` command renders Waycine projects on your own machine: a full
MP4, one clip per segment, a PNG sequence, or a single frame. It uses the same
engine as the web app, draws with [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas)
and the bundled Barlow fonts, and encodes through an ffmpeg that you install
yourself.

> **Pre-release.** Nothing is published to npm yet. Until it is, run the CLI
> from a clone of the repository (see [From source](#from-source)).

## Install

Requirements:

- Node.js 22.12 or newer.
- For MP4 output: an ffmpeg build with the `libx264` encoder (most builds
  include it). Stills, PNG sequences and every other command work without
  ffmpeg.

Once published:

```sh
npm install -g @waycine/cli
waycine --help
```

### From source

```sh
npm ci
npm run build
node packages/cli/dist/bin.js --help
```

Use `node packages/cli/dist/bin.js` wherever this page says `waycine`.

### ffmpeg

Waycine does **not** bundle or download ffmpeg. The CLI looks for it in this
order:

1. `--ffmpeg <path>`
2. the `WAYCINE_FFMPEG` environment variable
3. `ffmpeg` on your `PATH`

A value with a slash or backslash is a path (relative to the current folder);
a bare name such as `ffmpeg` is looked up on `PATH` only. On Windows
`ffmpeg.exe` (then `.com`) is preferred over an extensionless file of the
same name; `.cmd` and `.bat` wrappers are not used.

If none is found, `waycine render -o` stops before rendering and says so; use
`--frames-dir` to get PNG frames without ffmpeg.

License note: ffmpeg is a separate program under its own license (LGPL or GPL
depending on how it was built; builds with `libx264` are GPL). Waycine only
starts it as an external process and never ships it, so Waycine's MIT license
is unaffected. You obtain ffmpeg, and its license applies to your copy. Get it
from [ffmpeg.org](https://ffmpeg.org/download.html) or your package manager.

## Quick start

```sh
waycine init --preset europe-trip -o my-trip.waycine.json   # start from a demo
waycine validate my-trip.waycine.json                       # check it
waycine info my-trip.waycine.json                           # see the timeline
waycine still my-trip.waycine.json --frame 220 -o frame.png # look at one frame
waycine render my-trip.waycine.json -o my-trip.mp4          # render the video
```

Edit the project file in any text editor (or in the web app, then save it).
`waycine params` lists every setting you can change.

## Commands

| Command | What it does |
| --- | --- |
| `waycine render <project.json> -o <out.mp4>` | Renders the whole video (or a frame range) to MP4 |
| `waycine render <project.json> --segments -o <dir>` | One MP4 per segment (overview, each stop, finale) in a folder |
| `waycine render <project.json> --frames-dir <dir>` | Writes every frame as a PNG; no ffmpeg needed |
| `waycine still <project.json> --frame <n> -o <frame.png>` | Renders one frame to PNG |
| `waycine info <project.json>` | Prints the output format and the timeline, segment by segment |
| `waycine validate <project.json>` | Prints every issue, plus layout warnings (a text that runs past the frame edge even at its smallest size); exit code 1 when there is an error |
| `waycine init [--preset <name>] [-o <file>] [--force]` | Writes a new project from a bundled demo: `europe-trip` (the default), `race-season`, `road-trip`, `world-tour` or `day-trip` |
| `waycine params [--search <text>]` | Prints the settings catalog: path, type, range, default, help |
| `waycine --version`, `waycine --help` | Version and help; `waycine <command> --help` for one command |

### Format flags (render, still, info)

These override the project's `output` settings for one run; the project file
is not changed.

| Flag | Values | Meaning |
| --- | --- | --- |
| `--aspect <ratio>` | `16:9`, `9:16`, `1:1`, `4:5` | Aspect ratio; the layout profile follows (landscape, portrait, square) unless the project pins one |
| `--short <px>` | `720`, `1080`, `1440`, `2160` | Short side of the frame (needs a preset aspect: with a custom-size project, add `--aspect` or use `--size`) |
| `--size <WxH>` | even sides, 320 to 4096 | Exact size (cannot be combined with `--aspect` or `--short`) |
| `--fps <rate>` | `23.976`, `24`, `25`, `29.97`, `30`, `50`, `59.94`, `60` | Frame rate; NTSC rates are exact (29.97 is 30000/1001) |
| `--ss <1\|2>` | `1`, `2` | Supersampling (`render` and `still` only): `2` renders each frame at twice the size and averages 2x2 pixels (only while the doubled frame fits in 4096 x 4096) |
| `--segments` | | Segment timeline: one clip per segment, each starting and ending on its own (without the fades that join them in one video) |
| `--single` | | One seamless timeline (the default unless the project's `output.exportMode` is `segments`) |
| `--font <role=path>` | `display=...`, `body=...` | Use a TTF or OTF file for a font role instead of the bundled Barlow faces (repeatable). Resets that role's `fonts.*.widthAdjust` to 1 (a width set for the bundled faces would distort another font) and says so |

### Render flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `-o, --out <file>` | | MP4 to write. In segments mode (`--segments`, or a project whose `output.exportMode` is `segments`), a folder that receives `01-overview.mp4`, `02-stop-01-<city>.mp4`, ..., `NN-finale.mp4` (a `.mp4` name there is a usage error; use `--single` for one video) |
| `--frames-dir <dir>` | | Also (or only) write each frame as `frame-00000.png`, numbered by timeline frame |
| `--from <n>` | `0` | First frame to render |
| `--to <n>` | last frame | Last frame to render, inclusive |
| `--ffmpeg <path>` | `WAYCINE_FFMPEG`, then `PATH` | ffmpeg executable |
| `--crf <n>` | `16` | x264 quality, 0 to 51; lower is better and bigger |
| `-q, --quiet` | | Print nothing but errors |

`still` takes `--frame <n>` (see `waycine info` for frame numbers), `-o` and the
format flags.

Each MP4 is encoded to a hidden sibling (`.<name>.partial-<pid>.mp4`) and
renamed over `-o` only when ffmpeg succeeds: a failed or interrupted encode
removes that file and never touches an existing video at `-o`.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success (validation warnings do not fail a command) |
| `1` | The command failed: project errors, a missing file or ffmpeg, an encoder error |
| `2` | Usage error: unknown command or flag, a bad flag value, a missing argument |
| `130` | Interrupted (Ctrl+C): ffmpeg is stopped and the partial file removed |

File system errors (a missing permission, a full disk) print as one line.
Set `WAYCINE_DEBUG=1` to add the stack trace of an unexpected error.

## Encoding

Frames are drawn in Node and piped to ffmpeg as raw RGBA (each write waits for
ffmpeg to take the frame). The encode runs:

```sh
ffmpeg -f rawvideo -pix_fmt rgba -s WxH -r 30000/1001 -i - \
  -vf scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv \
  -c:v libx264 -preset slow -crf 16 -profile:v high -g 60 -bf 3 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -movflags +faststart -an out.mp4
```

The result is H.264 High, yuv420p, BT.709 limited range with all four colour
tags set, a keyframe every two seconds, the exact frame rate, and the index at
the front of the file for streaming. `-g` is twice the frame rate; `-r` is the
exact rational for the chosen rate.

## Examples

```sh
# Full 1080p video
waycine render trip.waycine.json -o trip.mp4

# Vertical 1080 x 1920 for phones, 30 fps
waycine render trip.waycine.json --aspect 9:16 --fps 30 -o trip-vertical.mp4

# Square 720p preview of the first five seconds
waycine render trip.waycine.json --aspect 1:1 --short 720 --from 0 --to 149 -o preview.mp4

# One clip per segment, 4K
waycine render trip.waycine.json --segments --short 2160 -o clips/

# PNG frames only (no ffmpeg), frames 200 to 239
waycine render trip.waycine.json --frames-dir frames/ --from 200 --to 239

# A frame with your own fonts (each role's fonts.*.widthAdjust is reset to 1:
# a width calibration made for the bundled font does not fit yours)
waycine still trip.waycine.json --frame 220 -o f220.png \
  --font display=fonts/MyDisplay-Bold.ttf --font body=fonts/MyBody-SemiBold.ttf

# Use a specific ffmpeg
WAYCINE_FFMPEG=/opt/ffmpeg/bin/ffmpeg waycine render trip.waycine.json -o trip.mp4

# Find settings about the glow
waycine params --search glow
```

## Notes

- Rendering is deterministic: a frame depends only on the project and the
  frame number.
- The bundled fonts are Barlow Condensed Bold (display) and Barlow Semi
  Condensed SemiBold (body), under the SIL Open Font License. They cover Latin
  scripts; text in other scripts needs `--font` files that contain its glyphs.
- Text widths can differ by a fraction of a pixel from the web app, so a name
  right at an auto-fit threshold may shrink one step in one and not the other.
