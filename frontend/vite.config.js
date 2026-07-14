import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, "../web-dist"),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022"
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:4173", "/uploads": "http://127.0.0.1:4173" }
  }
});
