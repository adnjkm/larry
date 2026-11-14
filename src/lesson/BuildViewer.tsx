import { useMemo } from "react";
import type { Kit, Part } from "../../shared/kit.ts";
import { KitViewer } from "../kit3d/KitViewer.tsx";

const BUILD_HEIGHT = 270;

/** Same shape, drawn by the dither shader as screen-door transparency. */
const ghost = (part: Part): Part => ({ ...part, color: "#d9d9d9", finish: "clear" });

/** The whole kit, spinning. Parts not earned yet are ghosts, and the camera is framed on the full kit so it never jumps. */
export function BuildViewer({ kit, earned, height = BUILD_HEIGHT }: { kit: Kit; earned: ReadonlySet<string>; height?: number }) {
  // KitViewer keeps a material per part object, so each ghost is made once and reused until its part is earned.
  const ghosts = useMemo(() => new Map(kit.parts.map((p) => [p.id, ghost(p)])), [kit]);
  const shown = useMemo(() => ({ ...kit, parts: kit.parts.map((p) => (earned.has(p.id) ? p : (ghosts.get(p.id) as Part))) }), [kit, earned, ghosts]);
  return <KitViewer kit={shown} frame={kit.parts} spin height={height} />;
}
