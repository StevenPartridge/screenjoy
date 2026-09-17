# Contributing

Use the Node version in `.node-version`, run `npm ci`, then `npm run dev`.
Before proposing a change, run lint, typecheck, tests, and the consumer check
listed in the README. Keep changes focused on one scene or one shared behavior.

Report bugs through the public repository's Issues tab once the repo is live.
Include the package version, browser/OS, seed or hole URL, container dimensions,
expected behavior, and a small reproduction. Do not include credentials, private
URLs, browser profiles, or personal data in screenshots or logs.

Keep custom-element registration idempotent, multiple instances independent,
and disconnect cleanup complete. Respect reduced motion and visibility. Add a
regression test when fixing a behavior bug; avoid tests that only duplicate the
implementation. Verify the tarball when changing exports, types, or assets.

Only contribute code and assets you have permission to redistribute. Document
asset origin and terms. Contributions to original project code use the project's
MIT license after the release notices are finalized. Open an issue before a new
scene, dependency, or major API change. There is no response-time guarantee.
