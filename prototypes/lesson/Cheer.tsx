// A short "well done" that washes in over the screen when a fix works, then dissolves: a white card
// on a messy dithered splat (after iamnoman.com/funky-shadow) in the Synthwave preset, 1px dither.
// The splat is painted frame by frame: a ragged front sweeps it in pixel by pixel, the card and its
// letters ride in behind the front, and on the way out the dither thins it back to scattered dots.
import { useEffect, useRef, useState } from "react";
import { SYNTHWAVE } from "../../shared/primitives/parts.ts";
import { hexRgb, threshold } from "../../src/surface/dither.ts";

/** Whole life of one pop, in ms. Keep in step with the `cheer-*` timings in lesson.css. */
export const CHEER_MS = 1700;
/** The wash sweeps in over this long, and the dissolve starts at OUT_AT and lasts the rest. */
const IN_MS = 680;
/** Starts with the card's wipe out (cheer-card-out in lesson.css) and runs a little ahead of it. */
const OUT_AT = 1180;

/** Hot to cool along the wash: gold → orange → pink → purple → indigo → night. */
const STOPS = [...SYNTHWAVE].reverse().map(hexRgb);
/** CSS px the splat may reach past the card, and how far it drops down and right of it. */
const SPREAD = 34;
const OFFSET = { x: 9, y: 11 };

/** Deterministic value noise in 0..1, so a pop looks the same each time it plays. */
function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, cell: number, seed: number) {
  const gx = x / cell,
    gy = y / cell;
  const x0 = Math.floor(gx),
    y0 = Math.floor(gy);
  const fx = gx - x0,
    fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed),
    b = hash(x0 + 1, y0, seed),
    c = hash(x0, y0 + 1, seed),
    d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

type Field = { w: number; h: number; cover: Float32Array; tone: Float32Array; front: Float32Array };

/**
 * Per pixel: how solid the splat is there (`cover`, ragged at its edge, with a few stray specks
 * beyond it), where along the Synthwave ramp its colour sits (`tone`), and when the wash front
 * reaches it (`front`, 0..1, left to right with a wobbly edge).
 */
function fieldOf(w: number, h: number, seed: number): Field {
  const cover = new Float32Array(w * h),
    tone = new Float32Array(w * h),
    front = new Float32Array(w * h);
  // The splat's core is the card's box dropped by OFFSET (the canvas is placed so that box sits
  // SPREAD in from every side); it bulges out past the core wherever the noise says.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dx = Math.max(SPREAD - x, 0, x - (w - SPREAD));
      const dy = Math.max(SPREAD - y, 0, y - (h - SPREAD));
      const blob = 0.55 * noise(x, y, 22, seed) + 0.3 * noise(x, y, 9, seed + 1) + 0.15 * noise(x, y, 4, seed + 2);
      const reach = SPREAD * (0.35 + 1.1 * blob);
      const edge = Math.hypot(dx, dy) / reach;
      // Specks: a few lone pixels past the edge, like paint flicked off the splat.
      const speck = edge > 1 && edge < 1.9 && hash(x, y, seed + 9) > 0.985 ? 0.8 : 0;
      cover[i] = Math.max(1 - edge, speck);
      tone[i] = Math.min(0.999, Math.max(0, (x / w) * 0.7 + (y / h) * 0.3 + (noise(x, y, 16, seed + 3) - 0.5) * 0.35));
      front[i] = (x / w) * 0.75 + noise(x, y, 12, seed + 4) * 0.25;
    }
  return { w, h, cover, tone, front };
}

/** Paints one frame of the splat at time `t` ms. */
function paint(ctx: CanvasRenderingContext2D, img: ImageData, f: Field, t: number) {
  const last = STOPS.length - 1;
  const wash = Math.min(1, t / IN_MS);
  const sweep = wash * wash * (3 - 2 * wash);
  // The way out mirrors the way in: a second front sweeps left to right and thins the splat away.
  const out = t < OUT_AT ? 0 : Math.min(1, (t - OUT_AT) / (CHEER_MS - OUT_AT));
  const outSweep = out * out * (3 - 2 * out);
  const d = img.data;
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++) {
      const i = y * f.w + x;
      const o = i * 4;
      const b = threshold(x, y);
      // Behind the front the splat is there; right at the front it is still thin, like a wave edge.
      const ahead = sweep * 1.15 - f.front[i]!;
      const arrived = ahead <= 0 ? 0 : Math.min(1, ahead * 4);
      const gone = out === 0 ? 0 : Math.min(1, Math.max(0, (outSweep * 1.35 - f.front[i]!) * 4));
      const solid = f.cover[i]! * arrived * (1 - gone);
      if (solid <= b) {
        d[o + 3] = 0;
        continue;
      }
      const g = f.tone[i]! * last;
      const lo = Math.floor(g);
      const [r, gr, bl] = STOPS[Math.min(last, g - lo > b ? lo + 1 : lo)]!;
      d[o] = r;
      d[o + 1] = gr;
      d[o + 2] = bl;
      d[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

/**
 * Pops `text` for CHEER_MS each time `show` changes to a new non-zero value (pass a counter), then
 * leaves nothing behind. The screen's own line already says the same thing, so this is announced
 * politely and never takes focus or blocks a tap.
 */
export function Cheer({ text, show }: { text: string; show: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(0);

  useEffect(() => {
    if (show === 0) return;
    setLive(show);
    navigator.vibrate?.([12, 50, 18]);
    const done = setTimeout(() => setLive(0), CHEER_MS);
    return () => clearTimeout(done);
  }, [show]);

  useEffect(() => {
    const c = canvas.current;
    if (live === 0 || !c) return;
    const w = Math.round(c.clientWidth),
      h = Math.round(c.clientHeight);
    if (w === 0 || h === 0) return;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const field = fieldOf(w, h, live * 7919);
    const img = ctx.createImageData(w, h);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      paint(ctx, img, field, IN_MS);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = now - start;
      paint(ctx, img, field, Math.min(t, CHEER_MS));
      if (t < CHEER_MS) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [live]);

  if (live === 0) return null;
  return (
    <div key={live} className="cheer" role="status" aria-live="polite" aria-label={text}>
      <canvas
        ref={canvas}
        className="cheer-splat"
        aria-hidden
        style={{ left: OFFSET.x - SPREAD, top: OFFSET.y - SPREAD, width: `calc(100% + ${2 * SPREAD}px)`, height: `calc(100% + ${2 * SPREAD}px)` }}
      />
      <span className="cheer-card" aria-hidden>
        {[...text].map((ch, i) => (
          <span key={i} className="cheer-letter" style={{ animationDelay: `${260 + i * 30}ms` }}>
            {ch === " " ? " " : ch}
          </span>
        ))}
      </span>
    </div>
  );
}
