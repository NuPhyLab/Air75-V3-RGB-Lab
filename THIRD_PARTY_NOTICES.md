# Third-party notices / 第三方声明

[Documentation / 文档目录](docs/README.md)

Original attribution, license notices and source references are retained below. The bilingual introduction does not replace or modify any license terms.

下方保留第三方署名、许可声明和来源，双语导读不替代或修改任何许可条款。

# Third-party acknowledgements

NuPhyLab is an independent local project. It is not endorsed by NuPhy or OpenAI.

## NuPhy protocol and layout research

The keyboard layout data in `shared/air75-v3-ansi.json` is adapted from ShallowRed/nuphy-leds, licensed under MIT. The USB implementation is informed by public research from ShallowRed/nuphy-leds, pda/kbvu and bohu8264/N-Agent-Bridge (MIT). No NuPhy firmware image or patched firmware is distributed.

- https://github.com/ShallowRed/nuphy-leds
- https://github.com/pda/kbvu
- https://github.com/bohu8264/N-Agent-Bridge

The physical map published by ShallowRed covers indices 0–82; firmware exposes 84 key-light channels. Index 83 remains unmapped by this application, preserved in scene arrays and set to black by default. Source maps disagree on a few positions; USB RGB readback validates channel data, not physical optical position.

## JavaScript runtime and UI

The macOS app bundles the Node.js runtime used for building. Node.js is distributed under its applicable licenses, including MIT and dependency licenses; the full license text accompanies the app in `runtime/LICENSE.node`. React and React DOM are MIT, Vite is MIT, Lucide is ISC. Their sources and licenses remain available in the npm lockfile and UI dependencies. Build tools are not required by the packaged app.

## React and React DOM — full license

The following license covers the bundled React and React DOM UI runtime code.

```text
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

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

## Lucide — full license

The following license covers the bundled Lucide icon code.

```text
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```
