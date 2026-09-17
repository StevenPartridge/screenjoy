# @screenjoy/brick-maze

A dependency-light, framework-agnostic brick-maze screensaver.

```sh
npm install @screenjoy/brick-maze
```

```js
import "@screenjoy/brick-maze";
```

```html
<brick-maze seed="1995" speed="0.9" style="width: 100%; height: 360px;"></brick-maze>
```

The element fills the rectangle you give it and pauses when it is offscreen.

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
