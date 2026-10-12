# Third-party notices

The `waycine` package is licensed under the MIT License (see [LICENSE](LICENSE)). It bundles the fonts below, contains a blur routine ported from Pillow, and depends on the packages below; their own licenses apply to them.

## Bundled fonts: Barlow Condensed and Barlow Semi Condensed

| Item | Detail |
| --- | --- |
| Files | `fonts/BarlowCondensed-Bold.ttf`, `fonts/BarlowSemiCondensed-SemiBold.ttf` |
| Copyright | Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) |
| License | SIL Open Font License, Version 1.1; full text in [fonts/OFL.txt](fonts/OFL.txt) |
| Source | https://github.com/google/fonts (`ofl/barlowcondensed`, `ofl/barlowsemicondensed`) |
| Changes | None. The files ship unmodified; at runtime Waycine registers them under the alias family names `WaycineDisplay` and `WaycineBody`. |

## Pillow (ported blur algorithm)

| Item | Detail |
| --- | --- |
| Use | The route glow and the zoom blur use a TypeScript port of the extended box blur of Pillow 12.3.0 (`libImaging/BoxBlur.c`), in `dist/core/draw/blur.js`. No Pillow file or binary is distributed. |
| License | MIT-CMU; copyright notice and license text below |
| Source | https://github.com/python-pillow/Pillow |

```text
The Python Imaging Library (PIL) is

    Copyright © 1997-2011 by Secret Labs AB
    Copyright © 1995-2011 by Fredrik Lundh and contributors

Pillow is the friendly PIL fork. It is

    Copyright © 2010 by Jeffrey 'Alex' Clark and contributors

Like PIL, Pillow is licensed under the open source MIT-CMU License:

By obtaining, using, and/or copying this software and/or its associated
documentation, you agree that you have read, understood, and will comply
with the following terms and conditions:

Permission to use, copy, modify and distribute this software and its
documentation for any purpose and without fee is hereby granted,
provided that the above copyright notice appears in all copies, and that
both that copyright notice and this permission notice appear in supporting
documentation, and that the name of Secret Labs AB or the author not be
used in advertising or publicity pertaining to distribution of the software
without specific, written prior permission.

SECRET LABS AB AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
SOFTWARE, INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS.
IN NO EVENT SHALL SECRET LABS AB OR THE AUTHOR BE LIABLE FOR ANY SPECIAL,
INDIRECT OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE
OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

## Mediabunny (dependency)

| Item | Detail |
| --- | --- |
| Use | In-browser MP4 encoding (`waycine/browser`), installed from npm as a dependency |
| License | Mozilla Public License 2.0 (https://www.mozilla.org/MPL/2.0/) |
| Source | https://github.com/Vanilagy/mediabunny |
| Changes | None. Waycine uses Mediabunny unmodified and does not vendor or patch it. |

## @napi-rs/canvas (optional peer dependency)

| Item | Detail |
| --- | --- |
| Use | Canvas backend for Node (`waycine/node`), version 1.0.9 or a newer 1.x; installed by the user, not bundled |
| License | MIT (includes Skia, BSD-3-Clause) |
| Source | https://github.com/Brooooooklyn/canvas |
