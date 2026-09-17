import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(path, "http://localhost"), {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Screenjoy package demo", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>Screenjoy — Game of Life and tiny screensavers<\/title>/i,
  );
  assert.match(html, /Simple rules\. Endless life\./);
  assert.doesNotMatch(html, /No stowaways\./);
  assert.match(html, /Conway&#x27;s Game of Life seed/);
  assert.match(html, /View Conway&#x27;s Game of Life full screen/);
  assert.match(html, /Install only.*Game of Life.*\./);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("keeps the finished demo free of starter preview code", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<ScreensaverDemo\b/);
  assert.match(layout, /Screenjoy — Game of Life and tiny screensavers/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.deepEqual(
    await readdir(new URL("app/_sites-preview", projectRoot)).catch(error => { if (error.code === "ENOENT") return []; throw error; }),
    [],
  );
});


test("Fishtank can be opened directly with feeding controls", async () => {
  const response = await render("/?saver=tank");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /A tiny ocean, all to itself\./);
  assert.match(html, /Feed the fish/);
  assert.match(html, /<fish-tank[^>]*seed="728"/);
  assert.match(html, /View Fishtank full screen/);
});

test("Pocket Golf is available in the gallery and as a dedicated playable page", async () => {
  for (const path of ['/golf', '/?saver=golf']) {
    const response = await render(path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Enter Pocket Golf fullscreen|View Pocket Golf full screen/);
    assert.match(html, /Seed or hole address|Pocket Golf seed/);
    assert.match(html, /Copy hole link/);
    assert.match(html, /Completed holes count toward your saved score/);
    assert.doesNotMatch(html, /Prototype 01|No score saved|One practice hole/);
    if (path === '/?saver=golf') {
      assert.match(html, /class="hero"/);
      assert.match(html, /class="hero-copy"/);
      assert.match(html, /One more hole\./);
      assert.match(html, /class="hero-stage hero-stage-golf"/);
      assert.match(html, /class="window-shell(?: [^"]*)?"/);
      assert.match(html, /<pocket-golf[^>]*class="hero-saver"/);
      assert.match(html, /class="control-panel"/);
      assert.doesNotMatch(html, /golf-embedded|class="golf-player/);
    }
  }
});

test("Pocket Golf exposes the same package installation section as the other savers", async () => {
  const html = await (await render('/?saver=golf')).text();
  assert.match(html, /Install only.*Pocket Golf/);
  assert.match(html, /npm install @screenjoy\/pocket-golf/);
  assert.match(html, /import &quot;@screenjoy\/pocket-golf&quot;/);
  assert.match(html, /&lt;pocket-golf/);
  assert.match(html, /hole-index=&quot;0&quot;/);
  assert.doesNotMatch(html, /speed=&quot;/);
});

test("Starliner seat links restore the seed, flight mode, and speed", async () => {
  const response = await render('/?saver=starliner&seed=42&mode=cruise&speed=0.65');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /You have the window seat/);
  assert.match(html, /<star-liner[^>]*seed="42"[^>]*speed="0.65"[^>]*mode="cruise"/);
  assert.match(html, /Copy seat link/);
  assert.match(html, /View Starliner full screen/);
  assert.match(html, /npm install @screenjoy\/starliner/);
});

test("Starliner rejects malformed shared settings and clamps speed", async () => {
  const html = await (await render('/?saver=starliner&seed=oops&mode=warp&speed=Infinity')).text();
  assert.match(html, /<star-liner[^>]*seed="2026"[^>]*speed="1.00"[^>]*mode="ftl"/);
  const fast = await (await render('/?saver=starliner&seed=0&speed=99')).text();
  assert.match(fast, /<star-liner[^>]*seed="0"[^>]*speed="1.80"/);
});


test("every gallery selection has a stable server-rendered URL and usable window controls", async () => {
  for (const [name, tag] of Object.entries({starliner:'star-liner',golf:'pocket-golf',life:'game-of-life',rain:'code-rain',fractal:'fractal-generator',ski:'downhill-ski',tank:'fish-tank',pipes:'pipes-saver',maze:'brick-maze'})) {
    const html = await (await render(`/?saver=${name}`)).text();
    assert.ok(html.includes(`<${tag}`), name);
    assert.match(html, /Choose a Screenjoy/);
    assert.match(html, /Reset position/);
    assert.match(html, /Adjust this scene/);
    assert.match(html, /Release preview/);
  }
});
