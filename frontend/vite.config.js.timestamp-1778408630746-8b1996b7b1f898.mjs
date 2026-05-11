// vite.config.js
import { defineConfig } from "file:///C:/Users/user/OneDrive/Desktop/whatsapp-bot/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/user/OneDrive/Desktop/whatsapp-bot/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///C:/Users/user/OneDrive/Desktop/whatsapp-bot/frontend/node_modules/@tailwindcss/vite/dist/index.mjs";
import { copyFileSync, mkdirSync } from "fs";
import { resolve } from "path";
function copyWasm() {
  return {
    name: "copy-rnnoise-wasm",
    buildStart() {
      try {
        const src = resolve("node_modules/@jitsi/rnnoise-wasm/dist/rnnoise.wasm");
        const dest = resolve("public/rnnoise.wasm");
        copyFileSync(src, dest);
      } catch {
      }
    }
  };
}
var vite_config_default = defineConfig({
  plugins: [react(), tailwindcss(), copyWasm()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true
      }
    }
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
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/react-router-dom/")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-") || id.includes("node_modules/victory-")) {
            return "vendor-charts";
          }
          if (id.includes("node_modules/socket.io-client") || id.includes("node_modules/engine.io-client")) {
            return "vendor-socket";
          }
          if (id.includes("node_modules/axios")) {
            return "vendor-axios";
          }
          if (id.includes("node_modules/@livekit") || id.includes("node_modules/livekit")) {
            return "vendor-livekit";
          }
        }
      }
    }
  },
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["@jitsi/rnnoise-wasm"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXE9uZURyaXZlXFxcXERlc2t0b3BcXFxcd2hhdHNhcHAtYm90XFxcXGZyb250ZW5kXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXE9uZURyaXZlXFxcXERlc2t0b3BcXFxcd2hhdHNhcHAtYm90XFxcXGZyb250ZW5kXFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy91c2VyL09uZURyaXZlL0Rlc2t0b3Avd2hhdHNhcHAtYm90L2Zyb250ZW5kL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcclxuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xyXG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSBcIkB0YWlsd2luZGNzcy92aXRlXCI7XHJcbmltcG9ydCB7IGNvcHlGaWxlU3luYywgbWtkaXJTeW5jIH0gZnJvbSBcImZzXCI7XHJcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tIFwicGF0aFwiO1xyXG5cclxuLy8gU2ltcGxlIHBsdWdpbiB0byBjb3B5IHJubm9pc2Uud2FzbSBpbnRvIHB1YmxpYy8gYXQgYnVpbGQgdGltZVxyXG5mdW5jdGlvbiBjb3B5V2FzbSgpIHtcclxuICByZXR1cm4ge1xyXG4gICAgbmFtZTogXCJjb3B5LXJubm9pc2Utd2FzbVwiLFxyXG4gICAgYnVpbGRTdGFydCgpIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCBzcmMgID0gcmVzb2x2ZShcIm5vZGVfbW9kdWxlcy9Aaml0c2kvcm5ub2lzZS13YXNtL2Rpc3Qvcm5ub2lzZS53YXNtXCIpO1xyXG4gICAgICAgIGNvbnN0IGRlc3QgPSByZXNvbHZlKFwicHVibGljL3Jubm9pc2Uud2FzbVwiKTtcclxuICAgICAgICBjb3B5RmlsZVN5bmMoc3JjLCBkZXN0KTtcclxuICAgICAgfSBjYXRjaCB7fVxyXG4gICAgfSxcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIHBsdWdpbnM6IFtyZWFjdCgpLCB0YWlsd2luZGNzcygpLCBjb3B5V2FzbSgpXSxcclxuICBzZXJ2ZXI6IHtcclxuICAgIHBvcnQ6IDUxNzMsXHJcbiAgICBwcm94eToge1xyXG4gICAgICBcIi9hcGlcIjoge1xyXG4gICAgICAgIHRhcmdldDogXCJodHRwOi8vbG9jYWxob3N0OjMwMDFcIixcclxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gIH0sXHJcbiAgYnVpbGQ6IHtcclxuICAgIG91dERpcjogXCJkaXN0XCIsXHJcbiAgICBtaW5pZnk6IFwiZXNidWlsZFwiLFxyXG4gICAgc291cmNlbWFwOiBmYWxzZSxcclxuICAgIHRhcmdldDogXCJlczIwMjBcIixcclxuICAgIGNodW5rU2l6ZVdhcm5pbmdMaW1pdDogNjAwLFxyXG4gICAgcm9sbHVwT3B0aW9uczoge1xyXG4gICAgICBvdXRwdXQ6IHtcclxuICAgICAgICBtYW51YWxDaHVua3MoaWQpIHtcclxuICAgICAgICAgIC8vIFJlYWN0IGNvcmUgXHUyMDE0IHRpbnksIGNhY2hlZCBmb3JldmVyXHJcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoXCJub2RlX21vZHVsZXMvcmVhY3QvXCIpIHx8IGlkLmluY2x1ZGVzKFwibm9kZV9tb2R1bGVzL3JlYWN0LWRvbS9cIikgfHwgaWQuaW5jbHVkZXMoXCJub2RlX21vZHVsZXMvcmVhY3Qtcm91dGVyLWRvbS9cIikpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFwidmVuZG9yLXJlYWN0XCI7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICAvLyBSZWNoYXJ0cyBcdTIwMTQgbGFyZ2UgY2hhcnQgbGliLCBvbmx5IG5lZWRlZCBvbiBkYXNoYm9hcmQgcGFnZXNcclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcIm5vZGVfbW9kdWxlcy9yZWNoYXJ0c1wiKSB8fCBpZC5pbmNsdWRlcyhcIm5vZGVfbW9kdWxlcy9kMy1cIikgfHwgaWQuaW5jbHVkZXMoXCJub2RlX21vZHVsZXMvdmljdG9yeS1cIikpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFwidmVuZG9yLWNoYXJ0c1wiO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgLy8gU29ja2V0LmlvIFx1MjAxNCBsYXJnZSwgb25seSBuZWVkZWQgZm9yIGNoYXQvbGl2ZVxyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwibm9kZV9tb2R1bGVzL3NvY2tldC5pby1jbGllbnRcIikgfHwgaWQuaW5jbHVkZXMoXCJub2RlX21vZHVsZXMvZW5naW5lLmlvLWNsaWVudFwiKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gXCJ2ZW5kb3Itc29ja2V0XCI7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICAvLyBBeGlvc1xyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwibm9kZV9tb2R1bGVzL2F4aW9zXCIpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBcInZlbmRvci1heGlvc1wiO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgLy8gTGl2ZUtpdCBcdTIwMTQgb25seSBuZWVkZWQgb24gbGl2ZSBzZXNzaW9uIHBhZ2VcclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcIm5vZGVfbW9kdWxlcy9AbGl2ZWtpdFwiKSB8fCBpZC5pbmNsdWRlcyhcIm5vZGVfbW9kdWxlcy9saXZla2l0XCIpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBcInZlbmRvci1saXZla2l0XCI7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgfSxcclxuICBhc3NldHNJbmNsdWRlOiBbXCIqKi8qLndhc21cIl0sXHJcbiAgb3B0aW1pemVEZXBzOiB7XHJcbiAgICBleGNsdWRlOiBbXCJAaml0c2kvcm5ub2lzZS13YXNtXCJdLFxyXG4gIH0sXHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTRWLFNBQVMsb0JBQW9CO0FBQ3pYLE9BQU8sV0FBVztBQUNsQixPQUFPLGlCQUFpQjtBQUN4QixTQUFTLGNBQWMsaUJBQWlCO0FBQ3hDLFNBQVMsZUFBZTtBQUd4QixTQUFTLFdBQVc7QUFDbEIsU0FBTztBQUFBLElBQ0wsTUFBTTtBQUFBLElBQ04sYUFBYTtBQUNYLFVBQUk7QUFDRixjQUFNLE1BQU8sUUFBUSxvREFBb0Q7QUFDekUsY0FBTSxPQUFPLFFBQVEscUJBQXFCO0FBQzFDLHFCQUFhLEtBQUssSUFBSTtBQUFBLE1BQ3hCLFFBQVE7QUFBQSxNQUFDO0FBQUEsSUFDWDtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQyxNQUFNLEdBQUcsWUFBWSxHQUFHLFNBQVMsQ0FBQztBQUFBLEVBQzVDLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLGNBQWM7QUFBQSxNQUNoQjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixXQUFXO0FBQUEsSUFDWCxRQUFRO0FBQUEsSUFDUix1QkFBdUI7QUFBQSxJQUN2QixlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixhQUFhLElBQUk7QUFFZixjQUFJLEdBQUcsU0FBUyxxQkFBcUIsS0FBSyxHQUFHLFNBQVMseUJBQXlCLEtBQUssR0FBRyxTQUFTLGdDQUFnQyxHQUFHO0FBQ2pJLG1CQUFPO0FBQUEsVUFDVDtBQUVBLGNBQUksR0FBRyxTQUFTLHVCQUF1QixLQUFLLEdBQUcsU0FBUyxrQkFBa0IsS0FBSyxHQUFHLFNBQVMsdUJBQXVCLEdBQUc7QUFDbkgsbUJBQU87QUFBQSxVQUNUO0FBRUEsY0FBSSxHQUFHLFNBQVMsK0JBQStCLEtBQUssR0FBRyxTQUFTLCtCQUErQixHQUFHO0FBQ2hHLG1CQUFPO0FBQUEsVUFDVDtBQUVBLGNBQUksR0FBRyxTQUFTLG9CQUFvQixHQUFHO0FBQ3JDLG1CQUFPO0FBQUEsVUFDVDtBQUVBLGNBQUksR0FBRyxTQUFTLHVCQUF1QixLQUFLLEdBQUcsU0FBUyxzQkFBc0IsR0FBRztBQUMvRSxtQkFBTztBQUFBLFVBQ1Q7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxlQUFlLENBQUMsV0FBVztBQUFBLEVBQzNCLGNBQWM7QUFBQSxJQUNaLFNBQVMsQ0FBQyxxQkFBcUI7QUFBQSxFQUNqQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
