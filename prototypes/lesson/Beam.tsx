// A border beam (after libraries.dev/beam) drawn as dither in funky-shadow's Synthwave preset: a short arc of light
// that rides the button's outline round and round. Like border-beam, the arc is a turning conic window, brightest in
// its middle and fading at both ends, made of a stroke on the edge, a faint glow just inside it and a bloom outside.
// Its light runs night → indigo → purple → pink → coral → gold, so the hot middle of the beam is gold.
import { useEffect, useRef } from "react";
import { SYNTHWAVE } from "./primitives/parts.ts";

/** CSS px the bloom may reach past the button on every side. */
export const BEAM_PAD = 10;
/** CSS px per dither cell: the 1 px dither the rest of the lesson uses. */
const CELL = 1;
/** One turn of the beam, in ms. */
const TURN_MS = 3200;
/** The lit share of the turn (border-beam's 54% to 78%). */
const ARC = 0.24;
/** Half the stroke's width on the edge, how far the glow reaches inside, and how far the bloom reaches out, in CSS px. */
const STROKE = 1.4;
const INNER = 4;
const BLOOM = 8;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Dark to hot: night, indigo, purple, pink, coral, gold. */
const STOPS = SYNTHWAVE.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]);

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

/** Paints the beam at time `t` ms into `img`. */
function paint(img: ImageData, cols: number, rows: number, f: ReturnType<typeof fieldOf>, t: number) {
  const { turn, out } = f;
  const head = (t / TURN_MS) % 1;
  const last = STOPS.length - 1;
  const d = img.data;
  d.fill(0);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const o = out[i]!;
      if (o < -INNER || o > BLOOM) continue;
      // Where in the lit window this cell is: 0 at the trailing end, 1 at the leading end.
      const back = (((head - turn[i]!) % 1) + 1) % 1;
      if (back > ARC) continue;
      const along = 1 - back / ARC;
      // Brightest in the middle of the arc, fading smoothly to nothing at both ends.
      const peak = Math.sin(Math.PI * along) ** 2;
      // The stroke on the edge, then the glow fading inward and the bloom fading outward.
      const layer = Math.abs(o) <= STROKE ? 1 : o < 0 ? 0.45 * (1 + o / INNER) : 0.6 * (1 - (o - STROKE) / (BLOOM - STROKE)) ** 1.6;
      const light = peak * layer;
      const b = (BAYER[(y % 4) * 4 + (x % 4)]! + 0.5) / 16;
      if (light <= b * 0.85) continue;
      const g = Math.min(0.999, 0.15 + 0.85 * light) * last;
      const lo = Math.floor(g);
      const [r, gr, bl] = STOPS[Math.min(last, g - lo > b ? lo + 1 : lo)]!;
      const k = i * 4;
      d[k] = r;
      d[k + 1] = gr;
      d[k + 2] = bl;
      d[k + 3] = 255;
    }
}

/** The beam round a `width` x `height` pill. Takes no pointer, so the button under it works as before. */
export function Beam({ width, height }: { width: number; height: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cols = Math.ceil((width + 2 * BEAM_PAD) / CELL);
  const rows = Math.ceil((height + 2 * BEAM_PAD) / CELL);
  useEffect(() => {
    const el = canvas.current;
    if (!el || width === 0 || height === 0) return;
    el.width = cols;
    el.height = rows;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const field = fieldOf(cols, rows, width, height);
    const img = ctx.createImageData(cols, rows);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(img, cols, rows, field, TURN_MS * 0.15);
      ctx.putImageData(img, 0, 0);
      return;
    }
    const start = performance.now();
    let raf = 0;
    let last = -Infinity;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // Thirty frames a second is plenty for a dithered beam.
      if (now - last < 1000 / 30) return;
      last = now;
      paint(img, cols, rows, field, now - start);
      ctx.putImageData(img, 0, 0);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, cols, rows]);
  return <canvas ref={canvas} className="beam" data-beam aria-hidden style={{ left: -BEAM_PAD, top: -BEAM_PAD, width: cols * CELL, height: rows * CELL }} />;
}
