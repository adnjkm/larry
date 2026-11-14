import stylex from "@stylexjs/unplugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [stylex.vite(), react()],
  // Bundled up front: these are only reached through a lazily discovered import, and discovering them
  // mid-session left the dev server answering 504 "Outdated Optimize Dep".
  optimizeDeps: { include: ["@ui-sdk/core", "@ui-sdk/react/primitive"] },
  server: {
    // LARRY_API_PORT moves the API server off 8787, for a second checkout running at the same time.
    proxy: { "/api": `http://localhost:${process.env.LARRY_API_PORT ?? 8787}` },
  },
});
