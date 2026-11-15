// A dithered border round a rounded card, in funky-shadow's Synthwave preset (iamnoman.com/funky-shadow): hot gold and
// coral at the card's edge cooling through pink and purple to night, ragged at its outer edge, and heavier down and to
// the right like a cast shadow. Painted once per size; it never takes the pointer.
import { useEffect, useRef } from "react";
import { SYNTHWAVE } from "./primitives/parts.ts";
import { hexRgb, inset, threshold, valueNoise } from "../../src/surface/dither.ts";

/** CSS px the border reaches past the card on every side. */
export const FRAME_PAD = 22;
/** CSS px per dither cell: a little chunkier than the 1 px dither, as funky-shadow's are. */
const CELL = 2;
/** How far the cast shadow drops, down and right. */
const DROP = { x: 9, y: 11 };
const RADIUS = 20;

/** Cool to hot: night, indigo, purple, pink, coral, gold. */
const STOPS = SYNTHWAVE.map(hexRgb);

/** Smooth value noise in 0..1 on a `cell` px grid. */
const noise = (x: number, y: number, cell: number) => valueNoise(x / cell, y / cell);

/** Distance from a point to a rounded rectangle's outline: negative inside. */
const outside = (px: number, py: number, x: number, y: number, w: number, h: number, r: number) => -inset(px - x, py - y, w, h, r);

function paint(ctx: CanvasRenderingContext2D, cols: number, rows: number, w: number, h: number) {
  const img = ctx.createImageData(cols, rows);
  const d = img.data;
  const last = STOPS.length - 1;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const px = (x + 0.5) * CELL,
        py = (y + 0.5) * CELL;
      const card = outside(px, py, FRAME_PAD, FRAME_PAD, w, h, RADIUS);
      if (card <= 0) continue;
      const n = noise(px, py, 14) * 0.65 + noise(px, py, 5) * 0.35;
      // A glow all round the card, ragged where the noise says, plus the dropped shadow, solid under the card's lower right.
      const ring = 1 - card / (9 + 9 * n);
      const drop = 1 - Math.max(0, outside(px, py, FRAME_PAD + DROP.x, FRAME_PAD + DROP.y, w, h, RADIUS)) / (3 + 5 * n);
      const cover = Math.max(ring * 0.85, drop);
      const b = threshold(x, y);
      if (cover <= b) continue;
      // Hot at the card's edge and toward its top left, cooling outward and toward the bottom right.
      const diagonal = (px / (w + 2 * FRAME_PAD)) * 0.5 + (py / (h + 2 * FRAME_PAD)) * 0.5;
      const heat = Math.min(0.999, Math.max(0, 1 - card / FRAME_PAD - (diagonal - 0.35) * 0.55 + (n - 0.5) * 0.3));
      const g = heat * last;
      const lo = Math.floor(g);
      const [r, gr, bl] = STOPS[Math.min(last, g - lo > b ? lo + 1 : lo)]!;
      const k = (y * cols + x) * 4;
      d[k] = r;
      d[k + 1] = gr;
      d[k + 2] = bl;
      d[k + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

/** The border for a `width` x `height` card, placed FRAME_PAD out from it on every side. */
export function FunkyFrame({ width, height }: { width: number; height: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cols = Math.ceil((width + 2 * FRAME_PAD) / CELL);
  const rows = Math.ceil((height + 2 * FRAME_PAD) / CELL);
  useEffect(() => {
    const el = canvas.current;
    if (!el || width === 0 || height === 0) return;
    el.width = cols;
    el.height = rows;
    const ctx = el.getContext("2d");
    if (ctx) paint(ctx, cols, rows, width, height);
  }, [width, height, cols, rows]);
  return <canvas ref={canvas} className="sheet-frame" aria-hidden style={{ left: -FRAME_PAD, top: -FRAME_PAD, width: cols * CELL, height: rows * CELL }} />;
}
