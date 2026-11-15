// The demo's own dev server: the project's Vite config, rooted here. The object comes from LARRY_DEMO (`pnpm demo` is
// the bottle at http://localhost:5176/, `pnpm demo:pen` the click pen at http://localhost:5177/, and `pnpm demo:pen-plus`
// the click pen's combined lesson, Aiden's course with the story lesson's features over it, at http://localhost:5178/).
import { fileURLToPath } from "node:url";
import base from "../../vite.config.ts";

const repo = fileURLToPath(new URL("../..", import.meta.url));

// Each demo has its own dependency cache: sharing one (or the app's) with a dev server running beside it let the two
// re-bundle React at once, and a page could load two copies of React and render blank.
const DEMOS = {
  bottle: { port: 5176, cacheDir: `${repo}node_modules/.vite-demo` },
  pen: { port: 5177, cacheDir: `${repo}node_modules/.vite-demo-pen` },
  "pen-plus": { port: 5178, cacheDir: `${repo}node_modules/.vite-demo-pen-plus`, object: "pen", variant: "plus" },
} as const;

const object = process.env.LARRY_DEMO ?? "bottle";
if (!Object.hasOwn(DEMOS, object)) {
  throw new Error(`LARRY_DEMO=${object} is not a demo. Valid: ${Object.keys(DEMOS).join(", ")}`);
}
const demo: { port: number; cacheDir: string; object?: string; variant?: string } = DEMOS[object as keyof typeof DEMOS];

export default {
  ...base,
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: `${repo}public`,
  cacheDir: demo.cacheDir,
  // The object photographed and taught; a variant plays another lesson for it ("plus": the combined lesson).
  define: { __DEMO_OBJECT__: JSON.stringify(demo.object ?? object), __DEMO_VARIANT__: JSON.stringify(demo.variant ?? "") },
  server: { ...base.server, port: demo.port, strictPort: true, host: true, fs: { allow: [repo] } },
};
