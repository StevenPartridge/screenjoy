import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const port = process.env.PORT ?? "3001";
const numericPort = Number(port);

if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
  console.error(`Invalid PORT value: ${port}`);
  process.exit(1);
}

const vinextCli = fileURLToPath(
  new URL("../node_modules/vinext/dist/cli.js", import.meta.url),
);
const result = spawnSync(
  process.execPath,
  [vinextCli, "dev", "--port", String(numericPort)],
  { env: process.env, stdio: "inherit" },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
