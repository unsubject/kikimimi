import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// The service worker is built as a separate IIFE bundle so it can be served
// from the site root (scope "/"). Main app is the default entry.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@kikimimi/shared": resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      "/audio": "http://localhost:8787",
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        sw: resolve(__dirname, "src/sw.ts"),
      },
      output: {
        // Keep the service worker at a stable path (sw.js) at the root.
        entryFileNames: (chunk) => (chunk.name === "sw" ? "sw.js" : "assets/[name]-[hash].js"),
      },
    },
  },
});
