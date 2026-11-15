// The demo: Aiden's camera first, then the water bottle lesson in the same phone. Run with `npx vite --config prototypes/demo/vite.config.ts` (port 5176).
// Demo lives in its own module so an edit hot-updates it; this entry has no exports, so Vite reloads the page for an
// edit here instead of running createRoot a second time.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Demo } from "./Demo.tsx";

document.body.style.margin = "0";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
