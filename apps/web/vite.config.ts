import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const wasmPackage = fileURLToPath(
  new URL("../../crates/physics-wasm/pkg/cat_qubit_physics_wasm.js", import.meta.url),
);

export default defineConfig({
  // GitHub Pages serves the site under /<repository>/, set by the deploy workflow.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@physics-wasm": wasmPackage,
    },
  },
  server: {
    fs: {
      allow: [repositoryRoot],
    },
  },
  worker: {
    format: "es",
  },
});
