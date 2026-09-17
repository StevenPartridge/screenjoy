import { spawnSync } from 'node:child_process';
import { packages, root } from './packages.mjs';
for (const { manifest } of await packages()) {
  const result = spawnSync('npm', ['run', 'build', '--workspace', manifest.name], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
