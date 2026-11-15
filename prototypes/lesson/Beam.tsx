// A border beam (after libraries.dev/beam) drawn as dither in funky-shadow's Synthwave preset: a short arc of light
// that rides the button's outline round and round. Like border-beam, the arc is a turning conic window, brightest in
// its middle and fading at both ends, made of a stroke on the edge, a faint glow just inside it and a bloom outside.
// Its light runs night → indigo → purple → pink → coral → gold, so the hot middle of the beam is gold.
import { useEffect, useRef } from "react";
import { SYNTHWAVE } from "../../shared/primitives/parts.ts";
import { type Raster, raster, ramp, threshold } from "../../src/surface/dither.ts";
import { animate } from "../../src/surface/ticker.ts";

/** CSS px the bloom may reach past the button on every side. */
export const BEAM_PAD = 10;
/** CSS px per dither cell: the 1 px dither the rest of the lesson uses. */
const CELL = 1;
/**
 * Each lap the beam winds up and whooshes once round on easings.dev's Anticipate, cubic-bezier(1, -0.4, 0.35, 0.95):
 * a small pull back, a fast run, an easy stop. It then rests a beat before the next lap.
 */
const LAP_MS = 1500;
const REST_MS = 550;
/** The lit share of the turn (border-beam's 54% to 78%), shortest at rest and drawn out into a streak at full speed. */
const ARC = 0.24;
const ARC_REST = 0.6;
const ARC_FAST = 1.7;
/** Half the stroke's width on the edge, how far the glow reaches inside, and how far the bloom reaches out, in CSS px. */
const STROKE = 1.4;
const INNER = 4;
const BLOOM = 8;

/** Dark to hot: night, indigo, purple, pink, coral, gold. */
const STOPS = ramp(SYNTHWAVE);

/** A CSS cubic-bezier as a function of progress (0 to 1), solving x for t by bisection then reading y. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (p: number) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let lo = 0,
      hi = 1;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < p) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}
const ANTICIPATE = cubicBezier(1, -0.4, 0.35, 0.95);

/** Where the beam's head is at `t` ms, in turns (it only ever grows, a whole turn a lap), and its speed in turns per lap. */
function headAt(t: number) {
  const cycle = LAP_MS + REST_MS;
  const lap = Math.floor(t / cycle);
  const into = Math.min(1, (t - lap * cycle) / LAP_MS);
  const step = 1 / 60;
  const speed = Math.abs(ANTICIPATE(Math.min(1, into + step)) - ANTICIPATE(Math.max(0, into - step))) / (2 * step);
  return { head: lap + ANTICIPATE(into), speed };
}

/** For each cell: its turn round the button's centre (0 to 1, clockwise from up) and its distance outside the pill's outline. */
function fieldOf(cols: number, rows: number, w: number, h: number) {
  const r = h / 2;
  const turn = new Float32Array(cols * rows);
  const out = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const px = (x + 0.5) * CELL - BEAM_PAD;
      const py = (y + 0.5) * CELL - BEAM_PAD;
      const i = y * cols + x;
      // The pill: a rounded rectangle whose corner radius is half its height.
      const qx = Math.abs(px - w / 2) - (w / 2 - r);
      const qy = Math.abs(py - h / 2) - (h / 2 - r);
      out[i] = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      // Measured on the ellipse that fits the pill, so the beam takes about as long round the ends as along the sides.
      const a = Math.atan2(px - w / 2, -(py - h / 2) * (w / h)) / (2 * Math.PI);
      turn[i] = a < 0 ? a + 1 : a;
    }
  return { turn, out };
}

/** Paints the beam at time `t` ms. */
function paint({ cols, rows, px, ctx, image }: Raster, f: ReturnType<typeof fieldOf>, t: number) {
  const { turn, out } = f;
  const now = headAt(t);
  const head = ((now.head % 1) + 1) % 1;
  // Anticipate's run peaks near twice the lap's average speed; the arc stretches with it.
  const arc = ARC * (ARC_REST + (ARC_FAST - ARC_REST) * Math.min(1, now.speed / 2.2));
  const last = STOPS.length - 1;
  px.fill(0);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const o = out[i]!;
      if (o < -INNER || o > BLOOM) continue;
      // Where in the lit window this cell is: 0 at the trailing end, 1 at the leading end.
      const back = (((head - turn[i]!) % 1) + 1) % 1;
      if (back > arc) continue;
      const along = 1 - back / arc;
      // Brightest in the middle of the arc, fading smoothly to nothing at both ends.
      const peak = Math.sin(Math.PI * along) ** 2;
      // The stroke on the edge, then the glow fading inward and the bloom fading outward.
      const layer = Math.abs(o) <= STROKE ? 1 : o < 0 ? 0.45 * (1 + o / INNER) : 0.6 * (1 - (o - STROKE) / (BLOOM - STROKE)) ** 1.6;
      const light = peak * layer;
      const b = threshold(x, y);
      if (light <= b * 0.85) continue;
      const g = Math.min(0.999, 0.15 + 0.85 * light) * last;
      const lo = Math.floor(g);
      px[i] = STOPS[Math.min(last, g - lo > b ? lo + 1 : lo)]!;
    }
  ctx.putImageData(image, 0, 0);
}

/** The beam round a `width` x `height` pill. Takes no pointer, so the button under it works as before. */
export function Beam({ width, height }: { width: number; height: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cols = Math.ceil((width + 2 * BEAM_PAD) / CELL);
  const rows = Math.ceil((height + 2 * BEAM_PAD) / CELL);
  useEffect(() => {
    const el = canvas.current;
    if (!el || width === 0 || height === 0) return;
    const target = raster(el, cols, rows);
    if (!target) return;
    const field = fieldOf(cols, rows, width, height);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(target, field, LAP_MS);
      return;
    }
    const start = performance.now();
    // Sixty frames a second keeps the whoosh smooth (the canvas is tiny), and it sleeps while off screen.
    return animate(60, (now) => paint(target, field, now - start), el);
  }, [width, height, cols, rows]);
  return <canvas ref={canvas} className="beam" data-beam aria-hidden style={{ left: -BEAM_PAD, top: -BEAM_PAD, width: cols * CELL, height: rows * CELL }} />;
}
