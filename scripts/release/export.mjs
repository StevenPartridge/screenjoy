import { cp, mkdir, readFile, writeFile, readdir, lstat, mkdtemp } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { root } from './packages.mjs';
const output = resolve(root,'outputs/release');
await mkdir(output,{recursive:true});
const destination = await mkdtemp(join(output,'source-'));
const allowed = ['app','packages','public','scripts','build','worker','tests','.github','docs','README.md','CONTRIBUTING.md','CHANGELOG.md','LICENSE','package.json','package-lock.json','tsconfig.json','tsconfig.package.json','vite.config.ts','next.config.ts','eslint.config.mjs','postcss.config.mjs','.node-version','.gitignore','release.config.example.json'];
for (const entry of allowed) await cp(resolve(root,entry),resolve(destination,entry),{recursive:true,filter: source => !/(^|\/)(dist|node_modules|\.scratch|\.DS_Store|chatgpt-auth\.ts|agents)(\/|$)/.test(relative(root,source))});
await mkdir(join(destination,'.openai'),{recursive:true});
await writeFile(join(destination,'.openai/hosting.json'),JSON.stringify({d1:null,r2:null},null,2)+'\n');
const manifestPath = join(destination,'package.json');
const manifest = JSON.parse(await readFile(manifestPath,'utf8'));
delete manifest.scripts['db:generate'];
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
const inventory = [];
const issues = [];
const secretPatterns = [/gh[pousr]_[A-Za-z0-9]{25,}/, /npm_[A-Za-z0-9]{20,}/, /sk-[A-Za-z0-9_-]{20,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\/Users\/[^/\s]+\//, /appgprj_[a-z0-9]+/];
async function walk(directory) {
  for (const name of await readdir(directory)) {
    const path = join(directory,name), info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`Symlinks are excluded from the export: ${relative(destination,path)}`);
    if (info.isDirectory()) { await walk(path); continue; }
    const data = await readFile(path);
    const text = data.toString('utf8');
    if (secretPatterns.some(pattern => pattern.test(text))) issues.push(relative(destination,path));
    inventory.push({path:relative(destination,path),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
  }
}
await walk(destination);
if (issues.length) throw new Error(`Export requires review; token, private path, or deployment identifier pattern in: ${issues.join(', ')}`);
const archive = `${destination}.tgz`;
const packed = spawnSync('tar',['-czf',archive,'-C',destination,'.'],{stdio:'inherit'});
if (packed.status !== 0) process.exit(packed.status ?? 1);
await writeFile(join(output,'source-export.json'),JSON.stringify({createdAt:new Date().toISOString(),destination,archive,historyIncluded:false,hostingIdentityIncluded:false,privacyScan:'No matching common token/private-path/project-ID patterns; human rights and identity review still required.',inventory},null,2)+'\n');
console.log(`Prepared ${inventory.length} reviewed-path files with no Git history or live hosting identifier.\nSnapshot: ${destination}\nArchive: ${archive}`);
