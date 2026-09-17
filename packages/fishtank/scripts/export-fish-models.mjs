import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import {
  FISH_ARCHETYPES,
  createFishModel,
} from "../dist/fish-models.js";

class NodeFileReader {
  result = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob
      .arrayBuffer()
      .then((result) => {
        this.result = result;
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }

  readAsDataURL(blob) {
    blob
      .arrayBuffer()
      .then((result) => {
        const base64 = Buffer.from(result).toString("base64");
        this.result = `data:${blob.type};base64,${base64}`;
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }
}

globalThis.FileReader ??= NodeFileReader;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modelsDirectory = resolve(packageRoot, "models");
const exporter = new GLTFExporter();

await mkdir(modelsDirectory, { recursive: true });

for (const archetype of FISH_ARCHETYPES) {
  const { group } = createFishModel(archetype);
  group.updateMatrixWorld(true);
  const output = await exporter.parseAsync(group, {
    binary: true,
    onlyVisible: true,
    trs: true,
  });
  if (!(output instanceof ArrayBuffer)) {
    throw new Error(`Expected binary GLB output for ${archetype}.`);
  }
  await writeFile(
    resolve(modelsDirectory, `${archetype}.glb`),
    Buffer.from(output),
  );
}
