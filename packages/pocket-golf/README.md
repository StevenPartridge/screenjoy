# @screenjoy/pocket-golf

Mouse-only golf for Screenjoy. Play continuous generated holes at `/golf` or choose Pocket Golf in the gallery. The generation lab at `/golf/lab` retains repeatable layouts and feedback collection using the same aiming, three-click swing, ball flight, and putting controls.

## Install and embed

```sh
npm install @screenjoy/pocket-golf
```

```js
import '@screenjoy/pocket-golf';
```

```html
<pocket-golf
  seed="2026"
  hole-index="0"
  style="width: 100%; aspect-ratio: 1;"
></pocket-golf>
```

Import from your site's JavaScript entry point using a package-aware bundler. The import registers the element automatically. No React component, Screenjoy app route, external stylesheet, image assets, or manual setup call is required. The package owns generation, rendering, swing controls, putting, hole transitions, and browser scores. Its only dependency is `@screenjoy/runtime`, installed with it. Match the host element's size to the space on your site; all game styling lives in its shadow root.

Use `seed` for a repeatable course and `hole-index` for its starting hole. Both accept HTML attributes or the `seed` and `holeIndex` JavaScript properties. Changing either starts a new hole without clearing completed totals. Unlike the passive savers, Pocket Golf keeps its approved swing timing fixed and does not expose a `speed` attribute. Surrounding controls such as fullscreen, copying a link, or the feedback lab are optional host UI.

The app keeps seed entry, replay, new-course, pause, sharing and fullscreen controls around the play area. Hole links reproduce the exact generator version, seed, index and settings. The URL follows the current hole; refreshing starts that hole at the tee. New visits without a hole link start a fresh random seed.

Drag the amber marker, or click terrain, to set direction and target power. Click Swing to start the meter, choose power on either the rise or return, then click in the green accuracy zone on the return. The meter starts at the accuracy centerline. Power stays at zero through the green zone, then rises from 0–100% beyond it. The target and locked-power markers use this same scale. The meter keeps bouncing until a power is selected. Late power selection waits for the next accuracy pass, with no jump in the meter. The larger ring marks carry; the small ring marks predicted rest. On the green, aim for the stopping point. Mistiming accuracy adds a small directional error; the centered timing window is forgiving. Missing the accuracy pass cancels without a stroke.

Water or out of bounds costs one penalty and returns the ball to its pre-shot position. Sand stops the ball and reduces the next shot's range. Putts can leave the green. Sinking a shot displays a result such as “Birdie · -1” for 2.2 seconds, then fades into the next generated hole. Next hole can advance immediately. The sequence retains its generator version and settings. Hover or focus the score to see completed holes.

Completed holes update one versioned localStorage record, `screenjoy:pocket-golf:score:v1`, containing cumulative score relative to par and holes played. An unfinished hole contributes nothing. Replaying a completed hole counts again only when it is completed again. Restarting, resizing, reconnecting, and fades cannot double-count completion. Invalid data is ignored. Blocked storage keeps totals in memory for the session; the app shows a notice. Lab scores are separate and never update the playing total. Simultaneous cross-tab writes are not merged atomically, and scores do not sync across devices.

Supports `seed` and `hole-index`, the shared `fps`, `paused`, and `motion` attributes, plus `play()`, `pause()`, and `restart()`. Restart replays the hole without clearing completed totals. Reduced motion replaces the timed meter with Take shot and resolves travel and view changes immediately. It still shows the result briefly before advancing; pausing or hiding the page suspends that countdown. `motion="allow"` opts back into animation.

## Generation lab

Open `/golf/lab`. Use Next hole to sample the weighted mix or choose Straight, Gentle bend, Dogleg, or Islands. Hazards can be mixed, absent, water only, or sand only. Generate applies the controls; Next continues the settings of the hole currently on screen. Previous returns to recently viewed holes. Replay returns the current hole to its tee.

A hole address includes generator version, seed, index, requested shape and hazard mix. Copy hole link produces a URL that regenerates that address. Invalid or unsupported addresses produce a visible error. New sessions use `g3`, which retains g2's green-side bunkers and larger lakes, gives fairway priority over water, and cuts a rounded rough bank into overlapping water. The bank expands fairway outlines by four world units and uses the same terrain query for rendering and ball contact. Sand placement is unchanged. Use Original, Larger water, and Rough buffer to compare versions for the same seed and index. All retain the same tee, fairway, green, cup and par. Released generator versions remain reproducible; subsequent changes should use a new version.

Every generated candidate is checked for safe approach landings using the actual shot simulation. The base generator retries at most 24 times, then uses a deterministic safe fallback. The g2 hazard pass makes bounded placement attempts and retains the original hazards if a safe replacement does not fit. The lab labels fallbacks. Par is the checked number of approach shots plus two putts, bounded to 3–5. Show a checked landing route draws the validator's resting positions; it is one safe route, not a mandatory path or optimal solution.

Feedback has an overall verdict, optional tags and notes. Save feedback retains the exact address, a geometry fingerprint, terrain counts, and current ball/last-shot details. Draft notes stay attached to their hole while browsing within the tab. Saved feedback survives reloads. Copy feedback formats a report for the conversation; Export JSON downloads all saved records. Nothing is sent automatically. Storage failure leaves records in the tab with a visible export reminder; clipboard failure exposes selectable text.

The lab holds completed holes for review rather than automatically advancing. It continues to support the shared fullscreen control. Set `review` before connecting the element to isolate lab scores from saved play.

```js
import { registerPocketGolf } from '@screenjoy/pocket-golf/element';
registerPocketGolf();
const golf = document.querySelector('pocket-golf');
golf.startCourse({ seed: 'greenskeeper', index: 12, layout: 'dogleg', hazards: 'water' });
const state = golf.getSnapshot();
```

`startCourse(settings)` starts a generated sequence. `loadHole(hole)` copies supplied geometry and resets the current shot while retaining completed totals. `getSnapshot()` returns a copy of the ball and last shot. `getTotals()` returns `{ version, score, holes }`; `scoreSaved` reports whether browser persistence is available. `holeAddress` exposes the exact current replay address. The element emits `holechange` with `{ address, settings }` and `scorechange` with `{ version, score, holes, saved }`. `review` holds the completion screen; `show-route` displays the checked approach route. Calling `restart()` replays whichever hole is loaded.

The package depends only on `@screenjoy/runtime`. `course.ts` owns terrain queries and the approved deterministic shot calculation. `generator.ts` routes versioned requests to the preserved `generator-v1.ts`, hazard tuning in `generator-v2.ts`, or rough shoreline rules in `generator-v3.ts`. `scores.ts` owns saved totals and result names. `reviews.ts` owns feedback serialization. The renderer and shot preview use the same hole model; resizing and fullscreen do not change world coordinates.

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
