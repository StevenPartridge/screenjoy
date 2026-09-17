import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export const root = resolve(import.meta.dirname, '../..');
export async function packages() {
  const names = await readdir(resolve(root, 'packages'));
  const result = await Promise.all(names.map(async directory => ({ directory, path: resolve(root, 'packages', directory), manifest: JSON.parse(await readFile(resolve(root, 'packages', directory, 'package.json'), 'utf8')) })));
  return result.sort((a,b) => a.directory === 'runtime' ? -1 : b.directory === 'runtime' ? 1 : a.directory.localeCompare(b.directory));
}
