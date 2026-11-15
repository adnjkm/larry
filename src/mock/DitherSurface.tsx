import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef } from "react";
import { drawSurface, type Relief } from "./dither.ts";

/**
 * The raised look, for any part that should read as a physical key, knob or cap: the zoom wheel's greys, light and
 * grain, drawn under the part's own content. A UI SDK part keeps its behaviour; this only paints it.
 *
 * To give a new part the look, make the part `position: relative`, put a DitherSurface first inside it at the part's
 * size, put its content in a positioned element after it so it sits on top, and pick a relief:
 *
 *     <SwitchThumb {...stylex.props(s.knob)}>
 *       <DitherSurface width={28} height={28} radius={14} relief="cap" grain={1.5} />
 *       <span {...stylex.props(s.overSurface)}><Icon /></span>
 *     </SwitchThumb>
 *
 * Add a preset to RELIEF before reaching for a one-off Relief, so parts of a kind keep the same shape.
 */
export const RELIEF = {
  /** A key cap or knob: a flat face whose edge rounds over. The switch knob. */
  cap: { bevel: 0.32, depth: 0.55, crown: 0.06 },
  /** A button pushed in: the same cap, sitting lower. */
  capPressed: { bevel: 0.32, depth: 0.2, crown: 0.02 },
  /** A dish, like a 3DS circle pad: a rounded rim around a face that sinks toward the middle. The shutter. */
  dish: { bevel: 0.12, depth: 0.8, crown: 0, well: { inset: 0.2, depth: 0.14 } },
  /** The dish pressed: the rim sits lower and the hollow shallower. */
  dishPressed: { bevel: 0.12, depth: 0.4, crown: 0, well: { inset: 0.2, depth: 0.08 } },
  /** A dome, rounded from edge to middle, like a bead or a soft rubber key. */
  dome: { bevel: 1, depth: 0.45, crown: 0 },
} satisfies Record<string, Relief>;

export type ReliefName = keyof typeof RELIEF;

type DitherSurfaceProps = {
  width: number;
  height: number;
  /** Corner radius in CSS px. Half the side makes a circle. */
  radius: number;
  relief: ReliefName | Relief;
  /** The dither's cell size in CSS px, the same grain the bars and the wheel use. The surface dithers a little finer. */
  grain: number;
  /** Scales how tall the relief stands, so a dial can soften or deepen every part at once. 1 keeps the preset. */
  depth?: number;
  /** How much faint grain drifts over the face, 0 to 1. */
  strength?: number;
};

export function DitherSurface({ width, height, radius, relief, grain, depth = 1, strength = 0.6 }: DitherSurfaceProps) {
  const shape: Relief = typeof relief === "string" ? RELIEF[relief] : relief;
  const scaled: Relief = { ...shape, depth: shape.depth * depth, well: shape.well && { ...shape.well, depth: shape.well.depth * depth } };
  const canvas = useSlowDither((el, seconds) => drawSurface(el, width, height, radius, scaled, grain, strength, seconds), [width, height, radius, scaled.bevel, scaled.depth, scaled.crown, scaled.well?.inset, scaled.well?.depth, grain, strength]);
  return <canvas ref={canvas} aria-hidden {...stylex.props(s.surface(width, height))} />;
}

const s = stylex.create({
  surface: (width: number, height: number) => ({ position: "absolute", top: 0, left: 0, width, height, pointerEvents: "none" }),
});

/**
 * Redraws a canvas a dozen times a second with the seconds since mount, for dither that drifts slowly.
 * Draws once and stops when the user prefers reduced motion.
 */
export function useSlowDither(draw: (canvas: HTMLCanvasElement, seconds: number) => void, deps: readonly unknown[]) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(draw);
  latest.current = draw;
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let raf = 0;
    let last = -Infinity;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 1000 / 12) return;
      last = now;
      latest.current(el, reduced ? 0 : (now - start) / 4000);
      if (reduced) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, deps);
  return canvas;
}
