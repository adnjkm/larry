import { memo, useMemo } from "react";
import type { Kit, Part } from "../../shared/kit.ts";
import { type KitBounds, measureParts } from "../kit3d/buildKit.ts";
import { KitViewer } from "../kit3d/KitViewer.tsx";
import { VIEWPORT_GRAIN, VIEWPORT_HEIGHT } from "../viewport.ts";

/** Same shape, drawn by the dither shader as screen-door transparency. */
const ghost = (part: Part): Part => ({ ...part, color: "#d9d9d9", finish: "clear" });

const boundsByKit = new WeakMap<Kit, KitBounds>();

function boundsOf(kit: Kit): KitBounds {
  let bounds = boundsByKit.get(kit);
  if (!bounds) boundsByKit.set(kit, (bounds = measureParts(kit.parts)));
  return bounds;
}

/** The whole kit, spinning. Parts not earned yet are ghosts, and the camera is framed on the full kit so it never jumps. */
export const BuildViewer = memo(function BuildViewer({ kit, earned }: { kit: Kit; earned: ReadonlySet<string> }) {
  const parts = useMemo(() => kit.parts.map((p) => (earned.has(p.id) ? p : ghost(p))), [kit, earned]);
  return <KitViewer parts={parts} frame={boundsOf(kit)} spin height={VIEWPORT_HEIGHT} pixelScale={VIEWPORT_GRAIN} />;
});
