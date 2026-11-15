import * as stylex from "@stylexjs/stylex";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { bakeField } from "./bake.ts";
import { LOOK, type MaterialName } from "./look.ts";
import { raster } from "./dither.ts";
import { paintField } from "./paint.ts";
import { animate } from "./ticker.ts";
import { RELIEF, type Field, type Relief, type ReliefName, type Scene, type Shape } from "./relief.ts";
import { reducedMotion } from "../motion.ts";

/**
 * The raised look for any part that should read as a physical key, knob, cap or wheel, drawn under the part's own
 * content. A UI SDK part keeps all its behaviour and accessibility; this only paints it.
 *
 * Make the part `position: relative`, put a Surface first inside it at the part's size, and put the content in a
 * positioned element after it so it sits on top:
 *
 *     <SwitchThumb {...stylex.props(s.knob)}>
 *       <Surface shape={circle(28)} relief="cap" grain={1.5} />
 *       <span {...stylex.props(s.overSurface)}><Icon /></span>
 *     </SwitchThumb>
 *
 * Baking is the costly part and is cached per part and size (see bake.ts); each repaint is cheap (see paint.ts).
 */
export type SurfaceProps = {
  shape: Shape;
  /** A preset, a relief, or for a part that turns a function of the turn `t` in [0, 1). */
  relief: ReliefName | Relief | ((t: number) => Relief);
  /** With the function form: how many frames to bake, at t = i / frames. */
  frames?: number;
  /** 0 to 1, which frame to show. Wraps. */
  at?: number;
  /** Motion blur: average this many frames ending at `at`. 0 is none. */
  smear?: number;
  material?: MaterialName;
  /** CSS px. The cell is round(grain * LOOK.fine * dpr) device px, at least 1. */
  grain: number;
  /** 0 to 1, slow drifting grain. 0 means no animation loop at all. */
  drift?: number;
  /** CSS px of room round the part for its cast shadow. */
  pad?: number;
  /** What the part sits on, for its cast shadow's colour: near-black on dark, a soft grey on light. */
  ground?: "dark" | "light";
  /** Scales how tall the relief stands, so one dial can soften or deepen every part. 1 keeps it as made. */
  depth?: number;
  /** What identifies a function or array relief in the cache. Required for those, since a function has no name. */
  bakeKey?: string;
};

/**
 * A part's baked frames, each baked the first time it's shown: a wheel's later frames bake as it turns, so mounting
 * costs one bake, not one per frame.
 */
type Strip = { count: number; frame: (i: number) => Field };

/** Strips by part: the same key, shape and size bake once however many Surfaces ask. */
const strips = new Map<string, Strip>();

function stripFor({ shape, relief, frames = 1, material = "bone", pad = 6, depth = 1, bakeKey }: SurfaceProps, cellCss: number): Strip {
  const named = typeof relief === "string";
  if (!named && !bakeKey) throw new Error("Surface: bakeKey is required when relief is an array or a function");
  const count = typeof relief === "function" ? Math.max(1, Math.round(frames)) : 1;
  const key = [named ? relief : bakeKey, shape.w, shape.h, shape.r, material, cellCss, count, pad, depth].join("|");
  let strip = strips.get(key);
  if (!strip) {
    const fields: (Field | undefined)[] = Array.from({ length: count });
    const scaled = (part: Relief): Relief => (depth === 1 ? part : part.map((f) => (at) => f(at) * depth));
    const scene = (part: Relief): Scene => ({
      width: shape.w + 2 * pad,
      height: shape.h + 2 * pad,
      parts: [{ x: pad, y: pad, w: shape.w, h: shape.h, r: shape.r, relief: scaled(part), material }],
    });
    strip = {
      count,
      frame: (i) =>
        (fields[i] ??= bakeField(scene(typeof relief === "function" ? relief(i / count) : typeof relief === "string" ? RELIEF[relief] : relief), cellCss)),
    };
    strips.set(key, strip);
  }
  return strip;
}

export function Surface(props: SurfaceProps) {
  const { at = 0, smear = 0, grain, drift = 0, pad = 6, ground = "dark" } = props;
  const dpr = Math.min(3, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
  const deviceCell = Math.max(1, Math.round(grain * LOOK.fine * dpr));
  const cellCss = deviceCell / dpr;
  const strip = stripFor(props, cellCss);

  const n = strip.count;
  const index = n === 1 ? 0 : Math.floor((((at % 1) + 1) % 1) * n) % n;
  const blur = Math.min(n, Math.max(1, Math.round(smear)));
  const shown = useMemo(() => Array.from({ length: blur }, (_, k) => strip.frame((((index - k) % n) + n) % n)), [strip, index, blur, n]);
  const first = shown[0];
  if (!first) throw new Error("Surface: nothing baked");
  const { cols, rows } = first;

  const canvas = useRef<HTMLCanvasElement>(null);
  const origin = useRef<readonly [number, number]>([0, 0]);
  const clock = useRef(0);
  // Always the latest paint, so the drift loop never restarts when `at` changes.
  const paint = useRef<() => void>(() => {});
  paint.current = () => {
    const el = canvas.current;
    const r = el && raster(el, cols, rows);
    if (!r) return;
    paintField(shown, r.image, { origin: origin.current, drift, seconds: clock.current, ground });
    r.ctx.putImageData(r.image, 0, 0);
  };

  // Neighbouring parts take their Bayer phase from where they sit on the page, so their patterns line up.
  useLayoutEffect(() => {
    const rect = canvas.current?.getBoundingClientRect();
    if (rect) origin.current = [Math.round((rect.left + scrollX) / cellCss), Math.round((rect.top + scrollY) / cellCss)];
  }, [cellCss]);

  // A part that turns bakes its other frames while the page is idle, one per callback, so its first spin doesn't stall.
  useEffect(() => {
    if (strip.count === 1) return;
    const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 50));
    const cancel = window.cancelIdleCallback ?? clearTimeout;
    let next = 0;
    let handle = 0;
    const bakeOne = () => {
      if (next >= strip.count) return;
      strip.frame(next++);
      handle = idle(bakeOne);
    };
    handle = idle(bakeOne);
    return () => cancel(handle);
  }, [strip]);

  useEffect(() => paint.current(), [shown, drift, cols, rows, ground]);

  // Drift: a dozen repaints a second, while the part is on screen. None under reduced motion, or with no drift.
  useEffect(() => {
    if (drift <= 0 || reducedMotion.matches) return;
    const start = performance.now();
    return animate(
      12,
      (now) => {
        clock.current = (now - start) / 4000;
        paint.current();
      },
      canvas.current,
    );
  }, [drift > 0]);

  return <canvas ref={canvas} aria-hidden {...stylex.props(s.surface, s.place(cols * cellCss, rows * cellCss, pad))} />;
}

const s = stylex.create({
  // Never takes the pointer: the SDK part above it is what people touch. Pixelated so the cells stay square.
  surface: { position: "absolute", pointerEvents: "none", imageRendering: "pixelated" },
  place: (width: number, height: number, pad: number) => ({ top: -pad, left: -pad, width, height }),
});
