// Entry for primitives.html. Bench lives in its own module so an edit hot-updates it; this entry has no exports, so
// Vite reloads the page for an edit here instead of running createRoot a second time.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Bench } from "./Bench.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Bench />
  </StrictMode>,
);
