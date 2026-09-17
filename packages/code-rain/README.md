# @screenjoy/code-rain

A deterministic phosphor code-rain screensaver packaged as one
framework-agnostic custom element. It mixes katakana, Latin characters, and
digits into layered glyph streams and inherits Screenjoy's offscreen pausing
and reduced-motion behavior.

```sh
npm install @screenjoy/code-rain
```

```js
// Bundler entry, such as src/main.js
import "@screenjoy/code-rain";
```

```html

<code-rain seed="10101" speed="1" density="1" style="width: 100%; height: 360px;"></code-rain>
```

Give the element an explicit size. Change `seed` for another deterministic
signal, `speed` to adjust the fall rate, and `density` to spread out or pack in
the streams.

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
