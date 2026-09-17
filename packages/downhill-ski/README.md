# @screenjoy/downhill-ski

A clean-room, tiny-canvas downhill game inspired by the joyful chaos of early
desktop skiing games.

```bash
npm install @screenjoy/downhill-ski
```

```js
import "@screenjoy/downhill-ski";
```

```html
<downhill-ski
  seed="1991"
  speed="1"
  mode="free-ride"
 style="width: 100%; height: 360px;"></downhill-ski>
```

The element fills its containing rectangle and supports keyboard, pointer, and
touch input. Every run starts in autopilot, and a new one begins automatically
after a ten-second results countdown, so the screenjoy can keep playing without
input. Click or tap to take over pointer steering; incidental mouse movement is
ignored until then. Use Left/Right or A/D to carve, Up/Down or W/S to brake and
tuck, and Space to launch a trick. Tap Space again in the air for a double.
Press R to restart immediately.

## Attributes

- `seed`: deterministic course seed
- `speed`: pace multiplier from `0.8` to `2.2`
- `mode`: `free-ride`, `slalom`, `freestyle`, or `tree-slalom`
- `fps`: target frame rate
- `paused`: pause the run
- `motion="allow"`: animate even when reduced motion is requested

## Methods

- `restart(seed?)`
- `play()`
- `pause()`

The package depends only on `@screenjoy/runtime`; it does not import another
Screenjoy.

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
