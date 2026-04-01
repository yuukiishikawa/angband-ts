import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: resolve(__dirname),
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@angband/core": resolve(__dirname, "../core/src"),
    },
    extensions: [".ts", ".js", ".tsx", ".jsx", ".json"],
  },
});
