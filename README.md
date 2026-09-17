# Screenjoy

Small animated scenes and games for ordinary websites. Each Screenjoy is a
TypeScript custom element with its own npm package and Shadow DOM. Install the
one you want. The static website uses React and Vite; the elements do not require React
or Vue.

[Source and issues](https://github.com/StevenPartridge/screenjoy) · [MIT license](LICENSE)

Version 0.1.0 is the initial release. See [CHANGELOG](CHANGELOG.md).

| Package | Element | Rendering |
| --- | --- | --- |
| `@screenjoy/starliner` | `<star-liner>` | Canvas 2D starfield and cabin |
| `@screenjoy/game-of-life` | `<game-of-life>` | Canvas 2D cellular automaton |
| `@screenjoy/downhill-ski` | `<downhill-ski>` | Canvas 2D skiing game |
| `@screenjoy/code-rain` | `<code-rain>` | Canvas 2D glyphs |
| `@screenjoy/brick-maze` | `<brick-maze>` | Canvas 2D maze |
| `@screenjoy/fractal-generator` | `<fractal-generator>` | WebGL fractals |
| `@screenjoy/pipes` | `<pipes-saver>` | Three.js pipes |
| `@screenjoy/fishtank` | `<fish-tank>` | Three.js aquarium and GLB models |
| `@screenjoy/pocket-golf` | `<pocket-golf>` | Canvas 2D golf game |

All depend on `@screenjoy/runtime`, which manages resizing, frame pacing,
reduced motion, visibility, and disconnect cleanup. Three.js is a runtime
dependency of Pipes and Fishtank only.

## Use a Screenjoy

In a bundler project such as Vite:

```sh
npm install @screenjoy/starliner
```

```js
// src/main.js
import '@screenjoy/starliner';
```

```html
<!-- index.html -->
<star-liner seed="2026" mode="cruise"
  style="width: 100%; height: 360px;"></star-liner>
<script type="module" src="/src/main.js"></script>
```

Bare package names are resolved by the bundler. Pasting that import into an
unbundled HTML file will not work without an import map. A standalone CDN build
is not currently provided. Give every element explicit dimensions, including a
height or aspect ratio. See each package README for its controls and events.

```js
const scene = document.querySelector('star-liner');
scene.pause();
scene.play();
```

`paused` is a boolean HTML attribute: even `paused="false"` means paused. Remove
it or assign `scene.paused = false` to resume. Reduced motion pauses animation
unless the host explicitly sets `motion="allow"`. Leave that override unset by
default. Scenes pause when offscreen or the document is hidden.

For server-rendered applications, register elements on the client after mount.
See [framework examples](docs/integration.md). Registration is idempotent; the
`/element` entry exposes a manual registration function. Do not instantiate an
element on a server without a DOM.

## Development

Use Node 22.14 or later. CI uses Node 24 and npm 11.17.0.

```sh
npm ci
npm run build:packages
npm run dev
```

The demo defaults to port 3001; set `PORT` to choose another. Its chooser links
to all nine scenes with `?saver=starliner`, `life`, `ski`, `rain`, `fractal`,
`tank`, `pipes`, `maze`, or `golf`. Golf also has `/golf` and an authoring lab.
The window supports titlebar dragging on desktop, keyboard movement, reset,
pause, and fullscreen. On smaller screens it stays fitted to the page.

```sh
npm run lint
npm run typecheck
npm test
npm run test:consumer
npm run release:export
npm run release:check
```

The consumer check installs real tarballs into a temporary directory, without
workspace links, and checks types, imports, assets, and production bundling.
`release:check` verifies the local release configuration and package metadata.
`release:export` creates an inspected snapshot with no Git history, personal
planning, credentials, or live Sites project identifier. Neither command
publishes anything. See [release procedure](docs/releasing.md).

## Limits and privacy

Test browser support before relying on a scene in production. Canvas 2D scenes
need modern custom elements, Shadow DOM, ResizeObserver and IntersectionObserver.
WebGL scenes also need an available GPU context. Reduced motion may produce a
static scene. Interactive scenes need visible instructions and accessible host
controls. Pocket Golf currently targets pointer input; do not describe it as a
fully keyboard-accessible game.

Ski best scores and Golf totals use localStorage on the host site's origin.
They are not sent to a Screenjoy service. Fishtank fetches packaged GLB assets
from the serving origin. The demo has no analytics code or sign-in requirement;
the hosting provider may still keep request logs. See [asset notes](docs/assets.md).

This is a hobby project with no guaranteed support or release schedule.
Contributions are welcome within the scope described in [CONTRIBUTING](CONTRIBUTING.md).

## Public website on Cloudflare

Visit [screenjoy.didish.art](https://screenjoy.didish.art).

The marketing site reuses the live gallery and builds to static HTML and browser assets. Run `npm run cloudflare:check` to build and verify a deployment without publishing, then `npm run cloudflare:dev` to preview it locally. `npm run site:dev` provides the faster Vite development server.

See [Cloudflare deployment](docs/cloudflare-deployment.md) for account setup, the custom domain, deployment commands, and owner deliverables. The npm release and original Vinext preview remain independent.
