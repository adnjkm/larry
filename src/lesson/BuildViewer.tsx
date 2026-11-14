import { useMemo } from "react";
import type { Kit, Part } from "../../shared/kit.ts";
import { KitViewer } from "../kit3d/KitViewer.tsx";

const BUILD_HEIGHT = 270;

/** Same shape, drawn by the dither shader as screen-door transparency. */
const ghost = (part: Part): Part => ({ ...part, color: "#d9d9d9", finish: "clear" });

/** The whole kit, spinning. Parts not earned yet are ghosts, and the camera is framed on the full kit so it never jumps. */
export function BuildViewer({ kit, earned, height = BUILD_HEIGHT }: { kit: Kit; earned: ReadonlySet<string>; height?: number }) {
  const parts = useMemo(() => kit.parts.map((p) => (earned.has(p.id) ? p : ghost(p))), [kit, earned]);
  return <KitViewer parts={parts} frame={kit.parts} spin height={height} />;
}
