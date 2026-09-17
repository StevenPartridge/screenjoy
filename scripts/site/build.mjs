import { build } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../..');
const configFile = resolve(root, 'vite.site.config.ts');
await build({ configFile });
// The renderer runs only while building. Cloudflare receives HTML and assets.
await build({ configFile, publicDir: false, build: {
  ssr: resolve(root, 'site/prerender.tsx'),
  outDir: resolve(root, 'outputs/site-renderer'),
  emptyOutDir: true,
} });
const { render } = await import(pathToFileURL(resolve(root, 'outputs/site-renderer/prerender.js')).href);
const output = resolve(root, 'dist/site');
const template = await readFile(resolve(output, 'index.html'), 'utf8');
for (const [path, file, title] of [
  ['/', 'index.html', 'Screenjoy — Tiny worlds for your website'],
  ['/golf', 'golf/index.html', 'Pocket Golf · Screenjoy'],
  ['/golf/lab', 'golf/lab/index.html', 'Hole lab · Pocket Golf · Screenjoy'],
  ['/404', '404.html', 'Window not found · Screenjoy'],
]) {
  const target = resolve(output, file);
  await mkdir(resolve(target, '..'), { recursive: true });
  const canonical = new URL(path, 'https://screenjoy.didish.art').href;
  let html = template.replace('<!--screenjoy-html-->', render(path))
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(/(<link rel="canonical" href=")[^"]+/, `$1${canonical}`)
    .replace(/(<meta property="og:url" content=")[^"]+/, `$1${canonical}`);
  if (path === '/404') html = html.replace('</head>', '<meta name="robots" content="noindex" /></head>');
  await writeFile(target, html);
}
await writeFile(resolve(output, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cache-Control: public, max-age=0, must-revalidate

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`);
await writeFile(resolve(output, 'robots.txt'), 'User-agent: *\nAllow: /\n');
console.log('Static Screenjoy site ready in dist/site (home, Golf, hole lab, and 404).');
