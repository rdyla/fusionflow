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
    },
  },
});
