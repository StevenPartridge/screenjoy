import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';
import { render } from '../../outputs/site-renderer/prerender.js';

const output = resolve(import.meta.dirname, '../../dist/site');

test('static pages contain readable content and all their entry assets exist', async () => {
  for (const [path, text] of [
    ['index.html', 'Find your little world.'],
    ['golf/index.html', 'Seed or hole address'],
    ['golf/lab/index.html', 'Hole lab'],
    ['404.html', 'This window opens onto nothing.'],
  ]) {
    const html = await readFile(resolve(output, path), 'utf8');
    assert.ok(html.includes(text), path);
    const canonicalPath = path === 'index.html' ? '/' : path === '404.html' ? '/404' : '/' + path.replace('/index.html', '');
    assert.ok(html.includes(`rel="canonical" href="https://screenjoy.didish.art${canonicalPath}"`), path);
    assert.ok(html.includes('content="https://screenjoy.didish.art/og-game-of-life.png"'), path);
    assert.ok(!html.includes('<!--screenjoy-html-->'), path);
    for (const [, asset] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
      assert.ok((await stat(resolve(output, `.${asset}`))).isFile(), asset);
    }
  }
});

test('shared scene URLs keep their selection and validated flight settings', () => {
  for (const [name, tag] of Object.entries({ starliner: 'star-liner', golf: 'pocket-golf', life: 'game-of-life', rain: 'code-rain', fractal: 'fractal-generator', ski: 'downhill-ski', tank: 'fish-tank', pipes: 'pipes-saver', maze: 'brick-maze' })) {
    assert.ok(render(`/?saver=${name}`).includes(`<${tag}`), name);
  }
  assert.match(render('/?saver=starliner&seed=42&mode=cruise&speed=0.65'), /<star-liner[^>]*seed="42"[^>]*speed="0.65"[^>]*mode="cruise"/);
  assert.match(render('/?saver=starliner&seed=bad&speed=Infinity'), /<star-liner[^>]*seed="2026"[^>]*speed="1.00"/);
  assert.match(render('/?saver=starliner&seed=0&speed=99'), /<star-liner[^>]*seed="0"[^>]*speed="1.80"/);
  assert.ok(render('/?saver=unknown').includes('<game-of-life'));
  assert.ok(render('/not-a-page').includes('This window opens onto nothing.'));
});

test('the deployment contains only static files within Cloudflare limits, including seven fish models', async () => {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      assert.ok(!entry.isSymbolicLink(), path);
      if (entry.isDirectory()) await walk(path);
      else {
        files.push(path);
        assert.ok((await stat(path)).size <= 25 * 1024 * 1024, path);
        assert.match(entry.name, /(?:\.(?:html|js|css|glb|png|svg|ico|txt)|^_headers)$/);
      }
    }
  }
  await walk(output);
  assert.equal(files.filter(path => path.endsWith('.glb')).length, 7);
  assert.ok(files.length < 20000);
  assert.ok(!files.some(path => /(?:\.env|\.map$|\/server\/|hosting\.json|wrangler\.json)/.test(path)));
  assert.match(await readFile(resolve(output, '_headers'), 'utf8'), /\/assets\/\*\n  Cache-Control: public, max-age=31536000, immutable/);
});
