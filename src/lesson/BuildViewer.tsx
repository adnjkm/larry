import { useMemo } from "react";
import type { Kit, Part } from "../../shared/kit.ts";
import { measureParts } from "../kit3d/buildKit.ts";
import { KitViewer } from "../kit3d/KitViewer.tsx";

const BUILD_HEIGHT = 270;
/** CSS pixels per dither pixel at the full height, held at every height so the grain matches across screens. */
const GRAIN = BUILD_HEIGHT / 180;

/** Same shape, drawn by the dither shader as screen-door transparency. */
const ghost = (part: Part): Part => ({ ...part, color: "#d9d9d9", finish: "clear" });

/** The whole kit, spinning. Parts not earned yet are ghosts, and the camera is framed on the full kit so it never jumps. */
export function BuildViewer({ kit, earned, height = BUILD_HEIGHT }: { kit: Kit; earned: ReadonlySet<string>; height?: number }) {
  const parts = useMemo(() => kit.parts.map((p) => (earned.has(p.id) ? p : ghost(p))), [kit, earned]);
  const frame = useMemo(() => measureParts(kit.parts), [kit]);
  return <KitViewer parts={parts} frame={frame} spin height={height} pixelScale={GRAIN} />;
}
