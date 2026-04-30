import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // Mirror the production nginx setup: forward `/mermaid/*` to the
    // self-hosted mermaid renderer so devs running `npm run dev` get the
    // same `<img src="/mermaid/img/...">` behaviour as production.
    // Start the renderer locally with:
    //   docker compose up -d mermaid
    // (and uncomment the `ports: 3000:3000` mapping in docker-compose.yml)
    proxy: {
      "/mermaid": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/mermaid/, ""),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // brotli-wasm loads its `.wasm` asset via `new URL('brotli_wasm_bg.wasm', import.meta.url)`.
  // When Vite pre-bundles the package, `import.meta.url` points to `/node_modules/.vite/deps/...`
  // and the resolved `.wasm` path doesn't exist, so the dev server's SPA fallback returns
  // `index.html` — producing `CompileError: WebAssembly.instantiate(): expected magic word
  // 00 61 73 6d, found 3c 21 64 6f` (the bytes of `<!do`). Excluding it from optimizeDeps
  // makes Vite serve the package straight from `node_modules`, where the relative `.wasm`
  // asset path resolves correctly. Production builds are unaffected.
  optimizeDeps: {
    exclude: ["brotli-wasm"],
  },
  assetsInclude: ["**/*.wasm"],
}));
