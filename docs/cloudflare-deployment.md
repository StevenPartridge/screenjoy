# Screenjoy on Cloudflare

Production hostname: **[screenjoy.didish.art](https://screenjoy.didish.art)**. The custom domain is managed in `wrangler.jsonc`.

The public marketing site uses **Workers Static Assets**, like Rehearsal Viewer. It is public: it does not need that project's Cloudflare Access gate. No custom Worker, server rendering at request time, database, bucket, API token, or npm credential is delivered to browsers.

The build reuses the gallery, movable/fullscreen demo windows, and Golf pages. It renders readable HTML at build time, then adds React and the scene components in the browser. The original Vinext preview remains available independently.

## Local preparation

Use the public Screenjoy checkout (or a fresh clone of `StevenPartridge/screenjoy`), Node 24, and the committed lockfile:

```sh
npm ci
npm run lint
npm run typecheck
npm run cloudflare:check
npm run cloudflare:dev
```

`cloudflare:check` runs a deployment dry run. Wrangler builds the packages and site, checks the generated pages and assets, and prepares an upload without publishing. `cloudflare:dev` serves the same static routing at `http://localhost:8787`; it also rebuilds first. For faster UI work, use `npm run site:dev` at `http://localhost:3002` after building the packages.

The upload directory is **`dist/site`**. Do not upload `dist`, the workspace, or the existing Vinext server output. `npm run site:build` also writes a temporary build-time renderer under ignored `outputs/`; that renderer is not deployed.

Verify the home page, every scene via `/?saver=…`, Starliner seed/mode/speed links, `/golf?hole=…`, and `/golf/lab?hole=…`. Real HTML exists for both Golf routes, and unknown paths return a real 404 page. The static host does not use an SPA fallback. Query settings are restored in the browser; crawlers and browsers without JavaScript see the default collection content. Scenes need JavaScript to animate.

## First deployment

1. Sign in to your own account with `npx wrangler login`. If using a scoped Cloudflare API token instead, supply it through your environment or the hosting provider's secret settings, never this repository. `NPM_TOKEN` is not used for site deployments; all packages are public or built from the workspace.
2. Run `npx wrangler whoami` and confirm the intended account. If you belong to multiple accounts, set `CLOUDFLARE_ACCOUNT_ID` locally to choose the right one.
3. Run `npm run cloudflare:deploy`. The stable Worker name is `screenjoy`. This builds and verifies the site before upload. It attaches `screenjoy.didish.art` as a Custom Domain. Both `workers.dev` and preview URLs are disabled.
4. Wrangler provisions the Custom Domain automatically in the active `didish.art` zone. Cloudflare manages its DNS and TLS. If a different service already owns the hostname, stop and review that conflict before replacing it.
5. Check the new HTTPS URL, switching scenes, dragging/expanding the demo, copying an install example, and opening shared Starliner/Golf links in a fresh tab. Try a narrow mobile screen and reduced motion. Check `/missing-page` returns 404 and Fishtank loads its seven bundled models without cross-origin requests.

The config declares the single `screenjoy.didish.art` Custom Domain so future deployments preserve the intended hostname. Keep the Worker name stable. The public hostname also appears in canonical and social-image URLs; account identifiers and credentials stay outside the source and browser bundle. If changing domains, update both the Wrangler route and the metadata in `site/index.html` and `scripts/site/build.mjs`.

## Later deployments and CI

GitHub CI checks the static build and Wrangler dry run without Cloudflare credentials. Deployment remains manual. For Cloudflare Workers Builds connected to this repository, use Node 24, `npm ci` for installation, no separate build command, and `npm run cloudflare:deploy` for deployment; Wrangler already runs the build. Do not provide `NPM_TOKEN` to this pipeline.

HTML is revalidated on each request. Hashed JavaScript, CSS, and models may be cached for a year. There is no service worker to pin users to an old release, no analytics integration, and no third-party font or image service. Golf and Ski may store scores locally.

## Owner deliverables

- [x] Choose the hostname: `screenjoy.didish.art`.
- [x] Authenticate Wrangler to the account containing `didish.art`.
- [x] Deploy and verify the configured custom domain (September 17, 2026).
- [ ] Try the deployed gallery on your real desktop and phone.

References: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [static HTML routing](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), and [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).
