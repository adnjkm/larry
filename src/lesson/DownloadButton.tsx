import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import type { Kit } from "../../shared/kit.ts";
import { downloadGlb } from "../kit3d/exportGlb.ts";
import { buttons, notes, type } from "./styles.ts";

export function DownloadButton({ kit }: { kit: Kit }) {
  const [status, setStatus] = useState<"idle" | "busy" | "failed">("idle");
  return (
    <>
      <button
        type="button"
        data-action="download"
        disabled={status === "busy"}
        {...stylex.props(buttons.base)}
        onClick={() => {
          setStatus("busy");
          downloadGlb(kit).then(
            () => setStatus("idle"),
            () => setStatus("failed"),
          );
        }}
      >
        {status === "busy" ? "Preparing…" : "Download 3D model (.glb)"}
      </button>
      {status === "failed" && <p {...stylex.props(type.body, notes.failText)}>The model could not be exported. Try again.</p>}
    </>
  );
}
