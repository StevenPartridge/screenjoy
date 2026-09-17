import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(packageRoot, "models");
const outputDirectory = resolve(packageRoot, "dist/models");
const modelNames = [
  "angel",
  "tang",
  "clown",
  "butterfly",
  "mint",
  "ruby",
  "tetra",
];

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  modelNames.map((name) =>
    copyFile(
      resolve(sourceDirectory, `${name}.glb`),
      resolve(outputDirectory, `${name}.glb`),
    ),
  ),
);
