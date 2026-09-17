# @screenjoy/game-of-life

A deterministic Conway's Game of Life screensaver packaged as one
framework-agnostic custom element. It uses the classic B3/S23 rules on a
wrapping grid and advances to the next seed when the current colony settles or
enters a repeating cycle.

```sh
npm install @screenjoy/game-of-life
```

```js
// Bundler entry, such as src/main.js
import "@screenjoy/game-of-life";
```

```html

<game-of-life seed="1970" speed="1" density="0.28" style="width: 100%; height: 360px;"></game-of-life>
```

Give the element an explicit size. Change `seed` for another deterministic
colony, `speed` to adjust the generation rate, and `density` to control the
starting population.

Automatic restarts increment the `seed` attribute and emit a bubbling
`seedchange` event with the new numeric seed in `event.detail.seed`.

Set the `paused` attribute (or call `pause()`) to freeze the current generation.
The element pauses automatically when hidden or offscreen.

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
