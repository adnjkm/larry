import * as stylex from "@stylexjs/stylex";
import { createParts } from "@ui-sdk/react/primitive";
import { useMemo, useState } from "react";
import { Surface } from "../surface/Surface.tsx";
import { drum, type Relief, rrect } from "../surface/relief.ts";
import { colors } from "../tokens.stylex.ts";
import { CAMERA } from "./look.ts";
import { thumbwheel } from "./thumbwheel.ts";

const { Root: Thumbwheel } = createParts(thumbwheel, { root: "div" });

/** Frames baked per groove. More turns more smoothly, at a bake each. */
const FRAMES = 18;
const RADIUS = 10;

/**
 * The zoom wheel beside the shutter. Drag it sideways, or use the arrow keys, to zoom; let go mid-spin and it coasts.
 * The drum turns with the finger (one radius of drag is one radian), and its ridges smear by how far it turned in the
 * last frame, so a fast spin blurs. The wheel keeps its own value; `onZoom` hears every change, so a caller can follow
 * it without re-rendering.
 */
export function ZoomWheel({ onZoom }: { onZoom: (zoom: number) => void }) {
  const { width, height, ridges, rim } = CAMERA.wheel;
  const { min, max, perPixel } = CAMERA.zoom;
  const [zoom, setZoom] = useState<number>(min);
  // The drum looks the same every groove, so one groove's turn is every angle.
  const pitch = (2 * Math.PI) / ridges;
  const relief = useMemo(
    () =>
      (t: number): Relief => [drum({ ridges, rim, turn: t * pitch })],
    [ridges, rim, pitch],
  );
  return (
    <Thumbwheel
      aria-label="Zoom"
      min={min}
      max={max}
      perPixel={perPixel}
      step={0.1}
      valueText={`${zoom.toFixed(1)}× zoom`}
      onValueChange={(z) => {
        setZoom(z);
        onZoom(z);
      }}
      {...stylex.props(s.wheel(width, height))}
    >
      {(state) => {
        const radians = (state.value - min) / perPixel / (width / 2);
        // Velocity is value per ms; a frame is about 16 ms. A fast spin smears over the frames it turned through.
        const turned = (Math.abs(state.velocity) / perPixel / (width / 2)) * 16;
        return (
          <Surface
            shape={rrect(width, height, RADIUS)}
            relief={relief}
            bakeKey={`wheel-${ridges}-${rim}`}
            frames={FRAMES}
            at={radians / pitch}
            smear={Math.min(FRAMES * 0.6, turned / (pitch / FRAMES))}
            grain={CAMERA.grain}
            depth={CAMERA.relief}
            drift={CAMERA.idleDither}
          />
        );
      }}
    </Thumbwheel>
  );
}

const s = stylex.create({
  wheel: (width: number, height: number) => ({
    position: "relative",
    width,
    height,
    flexShrink: 0,
    cursor: "ew-resize",
    touchAction: "none",
    userSelect: "none",
    borderRadius: RADIUS,
    outline: { default: "none", ":focus-visible": `2px solid ${colors.paper}` },
    outlineOffset: 2,
  }),
});
