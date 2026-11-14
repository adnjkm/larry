import stylex from "@stylexjs/unplugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [stylex.vite(), react()],
  // Bundled up front: these are only reached through a lazily discovered import, and discovering them
  // mid-session left the dev server answering 504 "Outdated Optimize Dep".
  optimizeDeps: { include: ["@ui-sdk/core", "@ui-sdk/react/primitive"] },
  server: {
    proxy: { "/api": "http://localhost:8787" },
  },
});
