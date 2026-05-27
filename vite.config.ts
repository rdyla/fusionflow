import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    // html-to-docx (used by the SOW Word export) is a Node-targeted library
    // that depends on Buffer + process. Polyfill them so it runs in-browser.
    nodePolyfills({
      include: ["buffer", "process", "stream", "util"],
      globals: { Buffer: true, process: true, global: true },
    }),
  ],
  appType: "spa",
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
