// The demo's own dev server: the project's Vite config, rooted here so http://localhost:5176/ opens the demo.
import { fileURLToPath } from "node:url";
import base from "../../vite.config.ts";

const repo = fileURLToPath(new URL("../..", import.meta.url));

export default {
  ...base,
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: `${repo}public`,
  // Its own dependency cache: sharing the app's with a dev server running beside it let the two re-bundle React at once,
  // and a page could load two copies of React and render blank.
  cacheDir: `${repo}node_modules/.vite-demo`,
  server: { ...base.server, port: 5176, strictPort: true, host: true, fs: { allow: [repo] } },
};
