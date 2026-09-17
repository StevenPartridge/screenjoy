# Release procedure

First-release policy: fresh public history, MIT for original work, only packages
that pass, and the gallery first. Fictional websites can follow later.

1. Confirm the public GitHub account/repository, npm scope ownership, copyright
   holder, asset rights, public support route, and intended demo audience.
2. Apply the confirmed namespace consistently to manifests, imports, READMEs,
   fixtures, and lockfile. Fill each MIT copyright notice and the package
   `repository`, `homepage`, and `bugs` metadata. Use `repository.directory` for
   the package's monorepo path. Do not infer a legal name from a local username.
3. Copy `release.config.example.json` to ignored `release.config.json` and record
   confirmations and the exact package names. The runtime is required by every
   scene. Do not mark an ownership field true without the owner's confirmation.
4. Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, and
   `npm run test:consumer`. Check target browsers, keyboard/pointer behavior,
   reduced motion, resize/reconnect, fullscreen, and any GPU or asset fallback.
5. Run `npm run release:export`. Inspect the file inventory and clean snapshot
   under `outputs/release`. It includes no `.git` history. Its hosting manifest
   has no live project ID. Keep this private until review is complete. Choose
   your public Git author identity before initializing its new repository.
6. Run `npm run release:check`. It checks publication metadata and owner
   confirmations, not browser quality or namespace availability. Inspect the
   exact tarballs from the successful consumer check and publish runtime first,
   then only the selected savers. Verify registry installation from a fresh
   consumer. The included CI workflow never publishes.
7. Tag the exact released source and write release notes. The marketing site is
   a separate deployment and does not block npm publication. If a release is
   bad, correct it with a new version and deprecate the broken version as
   appropriate; do not assume npm versions can be overwritten.

Keep authentication, MFA, recovery codes, and account creation with the owner.
A manual first publish is sufficient. If adopting trusted publishing later,
configure the exact GitHub workflow in npm and use a supported Node/npm runner.
Do not put long-lived publishing tokens into this repo.

`prepublishOnly` prevents ordinary workspace publishing while owner details are
missing. Never treat a dry-run pack or private preview as release approval.
