# @screenjoy/fractal-generator

A fluid fractal screensaver packaged as one framework-agnostic custom element.
It renders Mandelbrot, Julia, and Burning Ship sets in a small WebGL fragment
shader and inherits Screenjoy's offscreen pausing and reduced-motion behavior.

```sh
npm install @screenjoy/fractal-generator
```

```js
// Bundler entry, such as src/main.js
import "@screenjoy/fractal-generator";
```

```html

<fractal-generator
  seed="314159"
  speed="0.65"
  mode="mandelbrot"
 style="width: 100%; height: 360px;"></fractal-generator>
```

Give the element an explicit size. Change `seed` to choose another focus and
palette, `speed` to adjust its drift, and `mode` to `mandelbrot`, `julia`, or
`burning-ship`.

Set the `paused` attribute (or call `pause()`) to freeze the current frame. The
element pauses automatically when hidden or offscreen.

## Installation notes

Use a bundler such as Vite to resolve the npm import. The package is ESM and
ships TypeScript declarations. For server rendering, register on the client
after mount. Give the element explicit dimensions. The root entry registers
the custom element; `/element` exposes manual registration.

`paused` is a boolean HTML attribute: `paused="false"` still pauses. Remove it
or set the property to `false`. The runtime respects reduced motion and pauses
when offscreen or the document is hidden. `motion="allow"` explicitly overrides
reduced motion; leave it unset by default.

Licensed under MIT. Copyright 2026 Steven Partridge.
