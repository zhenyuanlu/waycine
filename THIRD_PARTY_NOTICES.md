# Third-party notices

Waycine is licensed under the MIT License (see [LICENSE](LICENSE)). It uses
the software, fonts, data and services below, which keep their own licenses.
A plain-text copy of this file ships with the web app as
`third-party-notices.txt`.

## What ships where

- **The web app** (the static site) bundles Preact, @preact/signals,
  @preact/signals-core, fflate, Mediabunny, two helpers that the Vite build
  adds, the Barlow fonts and a blur routine ported from Pillow. From your
  browser it calls the Photon and Nominatim place-search services, which
  return OpenStreetMap data.
- **The `waycine` npm package** ships the Barlow fonts and a blur routine
  ported from Pillow. Mediabunny is a dependency that npm installs from its
  own package; `@napi-rs/canvas` is an optional peer dependency that you
  install.
- **The `@waycine/cli` npm package** depends on `waycine` and
  `@napi-rs/canvas` (which contains Skia), both installed by npm. It runs an
  ffmpeg that you install yourself; ffmpeg is never distributed with Waycine.
- Development tools (TypeScript, Vite, Vitest, Biome, Playwright, axe-core
  and their dependencies) are used to build and test Waycine and are not part
  of the packages or the site, except for the Vite helpers listed below.

## Fonts: Barlow Condensed and Barlow Semi Condensed

- Files: `BarlowCondensed-Bold.ttf` and `BarlowSemiCondensed-SemiBold.ttf`,
  in [packages/waycine/fonts](packages/waycine/fonts) and in the web app.
- Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow).
- License: SIL Open Font License, Version 1.1 (full text below and in
  [packages/waycine/fonts/OFL.txt](packages/waycine/fonts/OFL.txt)).
- Source: https://github.com/google/fonts (`ofl/barlowcondensed`,
  `ofl/barlowsemicondensed`).
- Changes: none. The files ship unmodified; at runtime Waycine registers them
  under the family names `WaycineDisplay` and `WaycineBody`.

```text
Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded, 
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## Mediabunny

- Version 1.60.0, by Vanilagy and contributors.
- Use: in-browser MP4 and WebM encoding (`waycine/browser` and the web app).
- License: Mozilla Public License 2.0, https://www.mozilla.org/MPL/2.0/
- Source code: https://github.com/Vanilagy/mediabunny and the npm package
  https://www.npmjs.com/package/mediabunny (version 1.60.0).
- Changes: none. Waycine uses Mediabunny unmodified as a dependency; the web
  app contains it in minified form, built from that published source.

## MIT-licensed libraries

The following are licensed under the MIT License, whose text follows the list.

- Preact 10.29.8 (https://github.com/preactjs/preact), in the web app:
  Copyright (c) 2015-present Jason Miller
- @preact/signals 2.11.2 and @preact/signals-core 1.14.4
  (https://github.com/preactjs/signals), in the web app:
  Copyright (c) 2022-present Preact Team
- fflate 0.8.3 (https://github.com/101arrowz/fflate), in the web app:
  Copyright (c) 2026 Arjun Barrett
- Vite 8.3.1 (https://github.com/vitejs/vite): its module-preload helpers are
  part of the web app's bundle:
  Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

```text
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Pillow (ported blur algorithm)

- What: the route glow and the zoom blur use a TypeScript port of the
  extended box blur of Pillow 12.3.0 (`libImaging/BoxBlur.c`), written for
  Waycine in `packages/waycine/src/core/draw/blur.ts`. It is part of the
  engine, so it is in the `waycine` package and in the web app. No Pillow
  file or binary is distributed.
- Source: https://github.com/python-pillow/Pillow
- License: MIT-CMU. Copyright notice and license text:

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

## @napi-rs/canvas and Skia

- `@napi-rs/canvas` (https://github.com/Brooooooklyn/canvas) draws the
  frames in Node: the CLI depends on version 1.0.9, and `waycine/node`
  accepts 1.0.9 or a newer 1.x. It is installed from npm and is not bundled
  by Waycine.
- License: MIT. Copyright notice and license text:
  https://github.com/Brooooooklyn/canvas/blob/main/LICENSE
- Its prebuilt binaries contain Skia (https://skia.org), Copyright (c) 2011
  Google Inc., under the BSD 3-Clause License:
  https://skia.googlesource.com/skia/+/main/LICENSE

## OpenStreetMap data

Place search results come from OpenStreetMap: (c) OpenStreetMap
contributors, available under the Open Database License (ODbL) 1.0. See
https://www.openstreetmap.org/copyright. The web app shows this attribution
next to the place search. A project keeps only the names and coordinates you
choose.

## Photon (place search while you type)

The web app sends what you type into the place search (three characters or
more, after a short pause) to the public Photon server at
https://photon.komoot.io, run by komoot, under its fair-use terms. When you
import a list, it also sends the city names of the rows that have no
coordinates (at most 50, one per second), after you start the import. Photon
is open-source software under the Apache License 2.0
(https://github.com/komoot/photon); Waycine does not include any of it.

## Nominatim ("Search more precisely")

Only when you press "Search more precisely", the web app asks the
OpenStreetMap Foundation's Nominatim service
(https://nominatim.openstreetmap.org) and follows its usage policy
(https://operations.osmfoundation.org/policies/nominatim/): never for
search-as-you-type, at most one request per second, results cached in your
browser, and the attribution shown. Waycine does not include Nominatim
software.

## GitHub mark

The web app's link to the source code shows the GitHub mark. GitHub and the
GitHub mark are trademarks of GitHub, Inc. The mark is used only to link to
this project's repository on GitHub; Waycine is not affiliated with or
endorsed by GitHub.

## ffmpeg (not distributed)

The CLI encodes MP4 files by running an ffmpeg program that you install
yourself (`--ffmpeg`, `WAYCINE_FFMPEG` or your `PATH`). Waycine does not
bundle, download or link ffmpeg. Your copy of ffmpeg is under its own
license (LGPL or GPL, depending on how it was built); see
https://ffmpeg.org/legal.html. The web app does not use ffmpeg.
