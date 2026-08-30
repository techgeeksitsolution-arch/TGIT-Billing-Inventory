import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        // Without this, a down/crashed backend makes the proxy emit HTTP 500
        // with an EMPTY body, which breaks every response.json() in the app.
        configure: (proxy) => {
          proxy.on("error", (err, _req, res) => {
            if (!res || res.headersSent || typeof res.writeHead !== "function") return;
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              error: {
                code: "BACKEND_UNAVAILABLE",
                message: `Backend not reachable at http://localhost:4000 (${err.code || err.message}). Is it running?`,
              },
            }));
          });
        },
      },
    },
  }
});
