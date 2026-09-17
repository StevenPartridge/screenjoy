# @screenjoy/pipes

A lightweight, framework-agnostic 3D Pipes screensaver.

```sh
npm install @screenjoy/pipes
```

```js
import "@screenjoy/pipes";
```

```html
<pipes-saver seed="95" speed="1" style="width: 100%; height: 360px;"></pipes-saver>
```

For one continuous pipe instead of the classic collection of shorter pipes:

```html
<pipes-saver mode="single" style="width: 100%; height: 360px;"></pipes-saver>
```

`mode="single"` keeps the same pipe growing until it reaches the scene limit or
becomes boxed in. A boxed-in pipe restarts after its end state. A pipe that
reaches the limit pauses for an on-screen celebration before continuing. The
default is `mode="classic"`, with a 400-segment scene limit at the default
density.

Both modes increment the numeric `seed` after a completed end state and emit a
`seedchange` event with the next seed in `event.detail.seed`. This lets a host UI
keep its seed display in sync with the screensaver.

The package contains Pipes, its Three.js renderer, and the tiny Screenjoy
lifecycle runtime. It does not include Brick Maze or any other saver.

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
