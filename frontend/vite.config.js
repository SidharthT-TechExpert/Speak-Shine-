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
    // Enable SharedArrayBuffer for FFmpeg.wasm
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: {
    outDir: "dist",
    minify: "esbuild",
    sourcemap: false,
    target: "es2020",
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core — tiny, cached forever
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/react-router-dom/")) {
            return "vendor-react";
          }
          // FFmpeg — large, only needed for video upload compression
          if (id.includes("node_modules/@ffmpeg")) {
            return "vendor-ffmpeg";
          }
          // Recharts — large chart lib, only needed on dashboard pages
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-") || id.includes("node_modules/victory-")) {
            return "vendor-charts";
          }
          // Socket.io — large, only needed for chat/live
          if (id.includes("node_modules/socket.io-client") || id.includes("node_modules/engine.io-client")) {
            return "vendor-socket";
          }
          // Axios
          if (id.includes("node_modules/axios")) {
            return "vendor-axios";
          }
        },
      },
    },
  },
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
});
