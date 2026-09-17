import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, mkdtemp, readdir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { packages, root } from './packages.mjs';

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const all = await packages();
if (!process.argv.includes('--skip-build')) run('npm', ['run', 'build:packages']);
const output = resolve(root, 'outputs/release');
await mkdir(output, {recursive:true});
const consumer = await mkdtemp(join(tmpdir(), 'screenjoy-consumer-'));
const report = [];
for (const {path, manifest} of all) {
  const [packed] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', consumer, '--ignore-scripts'], path));
  const files = packed.files.map(f => f.path);
  assert(files.includes('LICENSE'), `${manifest.name} must carry its license`);
  assert(files.includes('dist/index.js') && files.includes('dist/index.d.ts'));
  assert(files.some(f => f.startsWith('src/')), 'source maps need source files');
  assert(!files.some(f => /(^|\/)(\.env|\.git|\.scratch|node_modules|app)(\/|$|\.)/.test(f)), 'private/unrelated content in package');
  for (const entry of Object.values(manifest.exports)) {
    if (typeof entry !== 'object') continue;
    for (const file of Object.values(entry)) assert(files.includes(file.replace(/^\.\//,'')), `Missing export ${file}`);
  }
  if (manifest.name.endsWith('/fishtank')) assert.equal(files.filter(f => f.endsWith('.glb')).length, 7);
  report.push({name:manifest.name,filename:packed.filename,size:packed.size,unpackedSize:packed.unpackedSize,integrity:packed.integrity,fileCount:files.length});
}
const workspace = JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const dependencies = Object.fromEntries(report.map(p=>[p.name,`file:./${p.filename}`]));
await writeFile(join(consumer,'package.json'), JSON.stringify({name:'screenjoy-installed-consumer',private:true,type:'module',dependencies,devDependencies:{vite:workspace.devDependencies.vite,typescript:workspace.devDependencies.typescript,vue:'3.5.42','@vitejs/plugin-vue':'6.0.8',react:workspace.dependencies.react,'react-dom':workspace.dependencies['react-dom'],'@types/react':workspace.devDependencies['@types/react'],'@types/react-dom':workspace.devDependencies['@types/react-dom']}},null,2));
run('npm',['install','--ignore-scripts','--no-audit','--no-fund'],consumer);
for (const {manifest} of all) assert(!(await lstat(join(consumer,'node_modules',manifest.name))).isSymbolicLink());
await writeFile(join(consumer,'ssr.mjs'), all.map(p=>`await import(${JSON.stringify(p.manifest.name)});`).join('\n'));
run('node',['ssr.mjs'],consumer);
const tags = ['brick-maze','code-rain','downhill-ski','fish-tank','fractal-generator','game-of-life','pipes-saver','pocket-golf','star-liner'];
await writeFile(join(consumer,'index.html'),`<!doctype html><html lang="en"><meta charset="UTF-8"><title>Installed Screenjoy consumer</title><body>${tags.map(t=>`<${t} seed="2026" style="width:320px;height:240px"></${t}>`).join('\n')}<div id="vue-root"></div><div id="react-root"></div><script type="module" src="/main.ts"></script></body></html>`);
await writeFile(join(consumer,'main.ts'),all.map(p=>`import ${JSON.stringify(p.manifest.name)};`).join('\n')+'\nconst scene = document.querySelector("star-liner"); scene?.pause(); scene?.play();\n');
await writeFile(join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'ESNext',moduleResolution:'Bundler',lib:['DOM','ES2022'],types:[],skipLibCheck:false,jsx:'react-jsx',esModuleInterop:true},include:['main.ts','react.tsx','vue.d.ts']},null,2));
await writeFile(join(consumer,'vite.config.js'), `import vue from '@vitejs/plugin-vue'; export default { plugins: [vue({ template: { compilerOptions: { isCustomElement: tag => tag === 'star-liner' } } })] };`);
await writeFile(join(consumer,'Scene.vue'), `<script setup>import {onMounted} from 'vue'; onMounted(() => { void import('@screenjoy/starliner'); });</script><template><star-liner seed="2026" mode="cruise" style="width:320px;height:240px" /></template>`);
await writeFile(join(consumer,'vue.d.ts'), `declare module '*.vue' { import type {DefineComponent} from 'vue'; const component: DefineComponent; export default component; }`);
await writeFile(join(consumer,'react.tsx'), `import {useEffect} from 'react'; import type {StarlinerElement} from '@screenjoy/starliner/element'; import type {DetailedHTMLProps,HTMLAttributes} from 'react'; declare module 'react' { namespace JSX { interface IntrinsicElements { 'star-liner': DetailedHTMLProps<HTMLAttributes<StarlinerElement>,StarlinerElement> & {seed?:string;mode?:'cruise'|'ftl'}; } } } export default function Scene() { useEffect(() => { void import('@screenjoy/starliner'); }, []); return <star-liner seed="2026" mode="cruise" style={{width:320,height:240}} />; }`);
const main = await readFile(join(consumer,'main.ts'),'utf8');
await writeFile(join(consumer,'main.ts'), main + `import {createApp} from 'vue'; import VueScene from './Scene.vue'; createApp(VueScene).mount('#vue-root'); import {createRoot} from 'react-dom/client'; import {createElement} from 'react'; import ReactScene from './react'; createRoot(document.querySelector('#react-root')!).render(createElement(ReactScene));`);
run('node',['node_modules/typescript/bin/tsc','--noEmit'],consumer);
run('node',['node_modules/vite/bin/vite.js','build'],consumer);
const assets = await readdir(join(consumer,'dist/assets'));
assert.equal(assets.filter(f=>f.endsWith('.glb')).length,7,'consumer must emit all seven fish models');
// Reuse existing behavioral tests against the installed archives, without workspace links.
const testSource = await readFile(resolve(root,'tests/pocket-golf-package.test.mjs'),'utf8');
await writeFile(join(consumer,'package.test.mjs'),testSource);
run('node',['--test','package.test.mjs'],consumer);
await writeFile(join(output,'consumer-report.json'),JSON.stringify({checkedAt:new Date().toISOString(),consumer,checks:['tarball contents','no workspace symlinks','Node import without DOM','strict consumer TypeScript', 'Vue SFC and React TSX integration','Vite production build','seven emitted GLBs','installed Golf lifecycle tests'],packages:report},null,2)+'\n');
console.log(`Passed: ${report.length} installed tarballs, strict types, SSR imports, Vite build, seven GLBs, and Golf lifecycle.\nConsumer: ${consumer}\nReport: outputs/release/consumer-report.json`);
