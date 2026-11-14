import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CameraMock from "./CameraMock.tsx";

document.body.style.margin = "0";
const root = document.getElementById("root");
if (!root) throw new Error("#root is missing");

createRoot(root).render(
  <StrictMode>
    <CameraMock />
  </StrictMode>,
);
