# Starliner

A quiet passenger window onto a seeded starfield. Choose a slow cruise or FTL and settle in.

```js
// Bundler entry, such as src/main.js
import "@screenjoy/starliner";
```

```html
<star-liner seed="2026" mode="ftl" speed="1"
  style="width: 100%; height: 520px;"></star-liner>
```

The seed fixes a continuous viewing angle, window shape, cabin material, exterior feature, star colors, density, and base speed. Every seat observes the same ship heading through a camera with seeded yaw, pitch, and roll. Forward stars spread outward, oblique views sweep diagonally, and aft views converge. Upper and lower seats tilt the view. Stars move in depth layers; distant clouds drift slowly behind them.

Each seat has one main exterior feature:

- Open stars, with no obstruction.
- A nacelle with glowing ribs and a support pylon, fixed relative to the cabin.
- A view across terraced hull decks with lit passenger windows.
- A companion ship keeping pace in the convoy.
- A rare asteroid tow, with two small tugs and slowly rotating cargo.

Attached structures stay fixed while companions drift slowly within a bounded area. Ship geometry follows the flight axis, so viewing angles change both the star motion and the exterior silhouette. In this fictional setting, convoy ships and asteroid tows share the liner's FTL corridor. No objects dart toward the passenger or interrupt the flight.

| Attribute | Default | Behavior |
| --- | --- | --- |
| `seed` | `2026` | String or number selecting a reproducible seat |
| `mode` | `ftl` | `cruise` or `ftl`, with a gradual transition during animation |
| `speed` | `1` | Multiplier from 0.2 to 2.5 |
| `fps` | `30` | Shared runtime frame limit, from 12 to 60 |
| `paused` | absent | Boolean attribute that freezes the view |
| `motion` | absent | Set to `allow` to override reduced-motion preferences |

`speed`, `mode`, `fps`, and `paused` also support property assignment. Use `regenerate(seed?)`, `pause()`, and `play()` from JavaScript. Resizing preserves flight progress. The shared runtime stops animation offscreen, in hidden tabs, and for reduced-motion preferences. A paused mode change takes effect gradually when playback resumes.

The collection's **Copy seat link** preserves the seed, mode, and speed. Opening it starts the same seat at the beginning of its flight, rather than synchronizing playback time. The second scene pass retains the original seed-to-window-shape and cabin-material mapping. It adds independent `starliner-view-v2` and `starliner-exterior-v2` streams and a denser 3D starfield. Older links receive the richer view for their existing cabin. It uses no external assets or network requests.

Import `@screenjoy/starliner/element` for manual registration with `registerStarliner()`. The package entry registers `<star-liner style="width: 100%; height: 360px;">` automatically.

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
