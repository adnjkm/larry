import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./base.css";

const ComparePage = lazy(() => import("./compare/ComparePage.tsx"));
const PrimitivesPage = lazy(() => import("./primitives/PrimitivesPage.tsx"));
const StagePage = lazy(() => import("./primitives/stage/dev/StagePage.tsx"));
const PlayPage = lazy(() => import("./primitives/play/PlayPage.tsx"));
const TunePage = lazy(() => import("./tune/TunePage.tsx"));

const params = new URLSearchParams(location.search);
const Page = params.has("compare") ? ComparePage : params.has("primitives") ? PrimitivesPage : params.has("stage") ? StagePage : params.has("play") ? PlayPage : params.has("tune") ? TunePage : undefined;

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
