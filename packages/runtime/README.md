# @screenjoy/runtime

Shared lifecycle and canvas utilities for [Screenjoy](https://github.com/StevenPartridge/screenjoy).
This package is installed automatically by the individual scene packages.
For an animated scene, start with a package such as `@screenjoy/starliner` or
`@screenjoy/game-of-life`.

The runtime provides `SaverElement` and `CanvasSaverElement` base classes,
seeded random-number helpers, and canvas sizing. It manages resize observation,
offscreen and hidden-document suspension, reduced motion, frame pacing, and
disconnect cleanup. Fullscreen raises the backing resolution within a 1080p
pixel budget while preserving logical layout. Individual savers can opt out or
lower their fullscreen frame rate.

## Requirements

Use an ESM bundler and a browser with custom elements, Shadow DOM,
ResizeObserver, and IntersectionObserver. Imports are safe without a DOM,
but custom-element construction and registration belong on the client.

Scenes need explicit container dimensions. The `paused` HTML attribute is
boolean, so `paused="false"` still pauses a scene. Reduced motion is respected
unless a host explicitly opts in with `motion="allow"`.

See the repository's integration examples and individual package READMEs for
installation, attributes, methods, and events. The runtime itself makes no
network requests and stores no user data.

Licensed under MIT. Copyright 2026 Steven Partridge.
