// The demo: Aiden's camera first, then the object's lesson in the same phone. `pnpm demo` (bottle, port 5176) or `pnpm demo:pen` (click pen, port 5177).
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
