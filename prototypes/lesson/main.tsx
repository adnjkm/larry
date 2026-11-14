// Prototype: pick a sample photo, watch it scanned into parts, then the lesson for that object. A
// hand-written lesson teaches primitives, builds parts from them and breaks one value per module to
// diagnose and fix; any other object gets an Inspect lesson derived from its kit. Every object is
// drawn by the dither 3D viewer and every photo is dithered. Add `?inspect` to force the Inspect lesson.
// App lives in its own module so an edit hot-updates it; this entry has no exports, so Vite reloads the page
// for an edit here instead of running createRoot a second time.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
