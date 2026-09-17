import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { packages, root } from './packages.mjs';
const blockers = [];
const config = await readFile(resolve(root, 'release.config.json'), 'utf8').then(JSON.parse).catch(() => null);
if (!config?.namespaceOwnershipConfirmed) blockers.push('Confirm npm namespace ownership in release.config.json.');
if (!config?.assetRightsConfirmed) blockers.push('Confirm ownership and redistribution rights for code and shipped assets.');
if (!config?.publicIdentityConfirmed) blockers.push('Confirm the public identity and repository destination.');
const selected = config?.packages;
if (!Array.isArray(selected) || !selected.length) blockers.push('Choose the exact package names for this release.');
const all = await packages();
if (Array.isArray(selected)) for (const name of selected) if (!all.some(p => p.manifest.name === name)) blockers.push(`Unknown release package: ${name}`);
for (const {path, manifest} of all.filter(p => !selected || selected.includes(p.manifest.name))) {
  const license = await readFile(resolve(path, 'LICENSE'), 'utf8').catch(() => '');
  if (!license || license.includes('COPYRIGHT HOLDER TO BE CONFIRMED')) blockers.push(`${manifest.name}: finish the MIT copyright notice.`);
  if (!manifest.repository?.url || !manifest.homepage || !manifest.bugs?.url) blockers.push(`${manifest.name}: set repository, homepage, and bugs URLs.`);
}
if (blockers.length) { console.error('Publication is blocked:\n' + blockers.map(x => `- ${x}`).join('\n')); process.exitCode = 1; }
else console.log('Release metadata is complete. This command does not publish. Review tested artifacts and publish runtime before dependent packages.');
