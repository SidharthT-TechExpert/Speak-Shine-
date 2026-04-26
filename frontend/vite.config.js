import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync, mkdirSync } from "fs";
import { resolve } from "path";

// Simple plugin to copy rnnoise.wasm into public/ at build time
function copyWasm() {
  return {
    name: "copy-rnnoise-wasm",
    buildStart() {
      try {
        const src  = resolve("node_modules/@jitsi/rnnoise-wasm/dist/rnnoise.wasm");
        const dest = resolve("public/rnnoise.wasm");
        copyFileSync(src, dest);
      } catch {}
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyWasm()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    minify: "esbuild",
    sourcemap: false,
    target: "es2020",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          router: ["react-router-dom"],
          charts: ["recharts"],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  esbuild: {
    logOverride: { "this-is-undefined-in-esm": "silent" },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom"],
  },
  assetsInclude: ["**/*.wasm"],
});
