import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

const ComparePage = lazy(() => import("./compare/ComparePage.tsx"));
const PrimitivesPage = lazy(() => import("./primitives/PrimitivesPage.tsx"));

const params = new URLSearchParams(location.search);
const Page = params.has("compare") ? ComparePage : params.has("primitives") ? PrimitivesPage : undefined;

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing");

createRoot(root).render(
  <StrictMode>
    {Page ? (
      <Suspense fallback={null}>
        <Page />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
