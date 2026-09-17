import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./site", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  envPrefix: "SCREENJOY_PUBLIC_",
  build: {
    outDir: "../dist/site",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: { watch: { ignored: ["**/outputs/**", "**/.scratch/**"] } },
});
