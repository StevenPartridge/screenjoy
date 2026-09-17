# @screenjoy/fishtank

A seeded Three.js reef aquarium in one custom element. Seven sculpted,
Blender-editable fish species swim among coral, swaying sea grass, and anemones.
Tetras school together, fish avoid the reef and each other, and a crab and pearl
clam animate on the sand. Water shafts, moving caustics, soft fish shadows,
and suspended particles give the scene depth.

```js
// Bundler entry, such as src/main.js
import "@screenjoy/fishtank";
```

```html

<fish-tank seed="728" speed="0.8" population="11" style="width: 100%; height: 360px;"></fish-tank>
```

Give the element a width and height. It pauses when hidden or offscreen and
honors reduced-motion preferences by default.

## Attributes

- `seed`: any deterministic scene seed
- `speed`: current and swimming speed from `0.2` to `3`
- `population`: number of fish from `4` to `18`
- `fps`: animation target from `12` to `60`
- `paused`: pauses the aquarium while present
- `motion="allow"`: keeps moving when reduced motion is enabled

## Feeding

Tap or click the water to drop food. Nearby fish approach and eat the sinking
pellets. For a keyboard-accessible control, call `feed()` from a button:

```js
document.querySelector("fish-tank").feed();
```

`feed(x, y)` accepts normalized element coordinates from `0` to `1`. The default
is near the surface center. Meals are rate-limited and the scene keeps at most
24 pellets; uneaten food disappears at the sand. Feeding is disabled while paused.

## Rendering

Static reef meshes are merged by material. Plant sway, water light, and dust run
in shaders; bubbles, food, and fish shadows use instanced geometry. Embedded
canvases render up to 1280 × 800, with the shared runtime's 1080p fullscreen budget.
The camera fits the reef to the element's aspect ratio. Seed and population
changes rebuild the scene, and disconnection releases scene and model resources.

## Editing the fish in Blender

The source models live in `models/`:

- `angel.glb`
- `tang.glb`
- `clown.glb`
- `butterfly.glb`
- `mint.glb`
- `ruby.glb`
- `tetra.glb`

Import any file with Blender's **File → Import → glTF 2.0** command. Blender
handles the glTF Y-up conversion automatically; in the exported model, each
fish faces `+X`.

You can freely change meshes, topology, materials, markings, and object counts.
Keep these animation nodes and their pivots:

- `Tail` — origin at the tail/body joint
- `FinPectoralL` — origin at the left fin root
- `FinPectoralR` — origin at the right fin root

They may be Blender empties or ordinary object parents; the runtime only relies
on their exact names and transform pivots, not a specific Three.js node class.

`FinDorsal` and `FinVentral` are optional animated parts. `Body`, `Eyes`, and
`Mouth` are descriptive names only and can be replaced.

Export the edited root and its children as **glTF Binary (.glb)** over the same
file in `models/`. The regular package build copies those source assets into
`dist/models/` without regenerating them:

```bash
npm run build --workspace=@screenjoy/fishtank
```

To intentionally restore every starter model from the code-native model
factory, run:

```bash
npm run export:starter-models --workspace=@screenjoy/fishtank
```

That reset command overwrites all seven source GLBs in `models/`.

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
