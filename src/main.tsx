import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

const ComparePage = lazy(() => import("./compare/ComparePage.tsx"));

document.body.style.margin = "0";
const root = document.getElementById("root");
if (!root) throw new Error("#root is missing");

createRoot(root).render(
  <StrictMode>
    {new URLSearchParams(location.search).has("compare") ? (
      <Suspense fallback={null}>
        <ComparePage />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
