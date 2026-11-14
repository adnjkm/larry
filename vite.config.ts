import stylex from "@stylexjs/unplugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [stylex.vite(), react()],
  server: {
    // LARRY_API_PORT moves the API server off 8787, for a second checkout running at the same time.
    proxy: { "/api": `http://localhost:${process.env.LARRY_API_PORT ?? 8787}` },
  },
});
