import * as stylex from "@stylexjs/stylex";
import { Button } from "@ui-sdk/react/button";
import { useState } from "react";
import type { Kit } from "../../shared/kit.ts";
import { downloadGlb } from "../kit3d/exportGlb.ts";
import { buttons, notes, type } from "../ui/styles.ts";

export function DownloadButton({ kit, primary = false }: { kit: Kit; primary?: boolean }) {
  const [status, setStatus] = useState<"idle" | "busy" | "failed">("idle");
  return (
    <>
      <Button
        data-action="download"
        disabled={status === "busy"}
        {...stylex.props(buttons.base, primary ? buttons.primary : buttons.secondary)}
        onClick={() => {
          setStatus("busy");
          downloadGlb(kit).then(
            () => setStatus("idle"),
            () => setStatus("failed"),
          );
        }}
      >
        {status === "busy" ? "Preparing…" : "Download 3D model (.glb)"}
      </Button>
      {status === "failed" && <p {...stylex.props(type.body, notes.failText)}>The model could not be exported. Try again.</p>}
    </>
  );
}
