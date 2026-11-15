import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef } from "react";
import { raster } from "../surface/dither.ts";
import { animate } from "../surface/ticker.ts";
import { type Bar, barDpr, drawBarCells, drawBarFrame } from "./bar.ts";
import { reducedMotion } from "../motion.ts";

/** How fast the dither drifts at rest, and as the loader while Larry works. */
const DRIFT_FPS = 12;
const BUSY_FPS = 24;

/**
 * A dithered bar (see bar.ts). With `reveal="sweep"` the fill eases toward `fill`, so each new third sweeps in from
 * the left. With `reveal="fade"` the whole fill cross-fades in place, for a switch whose knob already shows the motion.
 * Redraws at full rate only while the fill moves; otherwise only the drift, a dozen times a second.
 */
export function DitherBar({ fill, reveal = "sweep", speed = 0.8, ...bar }: Bar & { fill: number; reveal?: "sweep" | "fade"; speed?: number }) {
  const frame = useRef<HTMLCanvasElement>(null);
  const cells = useRef<HTMLCanvasElement>(null);
  const live = useRef({ fill, speed });
  live.current = { fill, speed };
  const { width, height, radius, cell, dividers, glow, idle } = bar;
  const still = reducedMotion.matches;

  useEffect(() => {
    const frameEl = frame.current;
    const cellsEl = cells.current;
    if (!frameEl || !cellsEl) return;
    const look: Bar = { width, height, radius, cell, dividers, glow, idle };
    const dpr = barDpr();
    const r = raster(cellsEl, Math.round(width * dpr), Math.round(height * dpr));
    if (!r) return;
    let shown = live.current.fill;
    let drawn = NaN;
    let clock = 0;
    let last = performance.now();
    const draw = () => {
      const [f, opacity] = reveal === "fade" ? [1, shown] : [shown, 1];
      if (shown !== drawn) {
        drawBarFrame(frameEl, look, f, opacity);
        drawn = shown;
      }
      drawBarCells(r, look, f, opacity, clock);
    };
    // Under reduced motion there is no loop: each new fill re-runs this effect and draws once.
    if (still) {
      draw();
      return;
    }
    return animate(
      DRIFT_FPS,
      (now) => {
        // A hidden tab gets no frames; don't jump on return.
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        clock += dt * live.current.speed;
        const target = live.current.fill;
        // The fade matches the knob's 240 ms slide; the sweep is a little slower so a new third reads as filling.
        shown += (target - shown) * (1 - Math.exp(-dt / (reveal === "fade" ? 0.08 : 0.14)));
        if (Math.abs(target - shown) < 1e-3) shown = target;
        draw();
        return shown !== target ? 60 : live.current.speed > 1 ? BUSY_FPS : DRIFT_FPS;
      },
      cellsEl,
    );
  }, [width, height, radius, cell, dividers, reveal, glow, idle, still ? fill : null]);

  return (
    <>
      <canvas ref={frame} aria-hidden {...stylex.props(s.frame(width, height, glow))} />
      <canvas ref={cells} aria-hidden {...stylex.props(s.cells(width, height, radius))} />
    </>
  );
}

const s = stylex.create({
  frame: (width: number, height: number, pad: number) => ({
    position: "absolute",
    top: -pad,
    left: -pad,
    width: width + 2 * pad,
    height: height + 2 * pad,
    pointerEvents: "none",
  }),
  cells: (width: number, height: number, radius: number) => ({
    position: "absolute",
    top: 0,
    left: 0,
    width,
    height,
    borderRadius: radius,
    pointerEvents: "none",
  }),
});
