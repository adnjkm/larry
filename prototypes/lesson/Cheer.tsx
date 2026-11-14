// A short "well done" that pops over the screen when a fix works, then fades: a white card on a
// funky dithered shadow (after iamnoman.com/funky-shadow) in the Synthwave preset, 1px dither.
import { useEffect, useRef } from "react";
import { SYNTHWAVE } from "../../src/primitives/parts.ts";

/** How long the whole pop lives, in ms. Keep in step with `cheer-pop` in lesson.css. */
export const CHEER_MS = 1400;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Hot to cool, so the shadow runs gold → orange → pink → purple → indigo → night across the card. */
const STOPS = [...SYNTHWAVE].reverse().map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]);
/** CSS px the shadow reaches past the card, and how far it drops down and right. */
const SPREAD = 22;
const OFFSET = { x: 8, y: 10 };

/** Paints the shadow: ordered dither between neighbouring Synthwave stops, thinning to nothing at its edge. */
function paint(canvas: HTMLCanvasElement) {
  const w = Math.round(canvas.clientWidth);
  const h = Math.round(canvas.clientHeight);
  if (w === 0 || h === 0) return;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(w, h);
  const last = STOPS.length - 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = (BAYER[(y % 4) * 4 + (x % 4)]! + 0.5) / 16;
      // A rounded-rectangle falloff: solid in the middle, dithered away over the last SPREAD px.
      const dx = Math.max(0, Math.abs(x - w / 2) - (w / 2 - SPREAD));
      const dy = Math.max(0, Math.abs(y - h / 2) - (h / 2 - SPREAD));
      const edge = Math.hypot(dx, dy) / SPREAD;
      if (1 - edge <= t) continue;
      // Colour runs along the diagonal; the dither picks between the two nearest stops.
      const g = ((x / w) * 0.65 + (y / h) * 0.35) * last;
      const lo = Math.floor(g);
      const [r, gr, b] = STOPS[Math.min(last, g - lo > t ? lo + 1 : lo)]!;
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gr;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

/**
 * Pops `text` for CHEER_MS each time `show` changes to a new value (pass a counter or key), then
 * calls nothing and leaves nothing behind. Purely a reward: the screen's own line already says the
 * same thing for screen readers, so this one is announced politely and never takes focus.
 */
export function Cheer({ text, show }: { text: string; show: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (show === 0) return;
    if (canvas.current) paint(canvas.current);
    navigator.vibrate?.([12, 50, 18]);
  }, [show]);
  if (show === 0) return null;
  return (
    <div key={show} className="cheer" role="status" aria-live="polite">
      <canvas ref={canvas} className="cheer-shadow" aria-hidden style={{ left: OFFSET.x - SPREAD, top: OFFSET.y - SPREAD, width: `calc(100% + ${2 * SPREAD}px)`, height: `calc(100% + ${2 * SPREAD}px)` }} />
      <span className="cheer-card">{text}</span>
    </div>
  );
}
