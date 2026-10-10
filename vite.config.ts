import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  appType: "spa",
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      // Claude connector (OAuth + MCP). Host is preserved so the worker
      // advertises http://localhost:5173 as issuer/resource — the origin the
      // browser and MCP client actually use, which OAuth requires to match.
      "/oauth": { target: "http://127.0.0.1:8787" },
      "/mcp": { target: "http://127.0.0.1:8787" },
      "/.well-known/oauth-": { target: "http://127.0.0.1:8787" },
    },
  },
});
