import { ordered } from "ditherdance";
import { SYNTHWAVE } from "../../shared/primitives/parts.ts";
import { hexRgb, threshold } from "../surface/dither.ts";

const PALETTE = SYNTHWAVE.map(hexRgb);

/**
 * Redraws glimm's sweep band, a WebGL canvas, as dither. The band is shrunk to one pixel per cell, ditherdance snaps
 * each cell's colour to the synthwave palette, and each cell is kept or dropped by its opacity against a Bayer
 * threshold, so the band's soft edges break up into cells instead of fading. `bleed` is how far, in CSS px, the source
 * reaches past the box on every side; only the part over the box is drawn. `scratch` is a spare canvas reused between
 * frames. Returns how far down the box the band's top edge is, 0 at the top to 1 at the bottom, or null if none of
 * it showed.
 */
export function ditherBand(
  out: HTMLCanvasElement,
  source: HTMLCanvasElement,
  width: number,
  height: number,
  bleed: number,
  cellCss: number,
  scratch: HTMLCanvasElement,
): number | null {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const W = Math.round(width * dpr);
  const H = Math.round(height * dpr);
  if (out.width !== W || out.height !== H) {
    out.width = W;
    out.height = H;
  }
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, W, H);
  const cell = Math.max(1, Math.round(cellCss * dpr));
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);
  if (scratch.width !== cols || scratch.height !== rows) {
    scratch.width = cols;
    scratch.height = rows;
  }
  const small = scratch.getContext("2d", { willReadFrequently: true });
  if (!small || source.width === 0 || source.height === 0) return null;
  small.clearRect(0, 0, cols, rows);
  const sx = (bleed / (width + 2 * bleed)) * source.width;
  const sy = (bleed / (height + 2 * bleed)) * source.height;
  // The cells cover a little more than the box when it isn't a whole number of cells, so read that much more too.
  const sw = (source.width - 2 * sx) * ((cols * cell) / W);
  const sh = (source.height - 2 * sy) * ((rows * cell) / H);
  small.drawImage(source, sx, sy, sw, sh, 0, 0, cols, rows);
  const image = small.getImageData(0, 0, cols, rows);
  const { data } = image;

  // ditherdance works on colour, so set each cell's opacity aside and dither it separately.
  const alpha = new Uint8ClampedArray(cols * rows);
  let front = -1;
  for (let i = 0; i < alpha.length; i++) {
    const a = data[i * 4 + 3] ?? 0;
    alpha[i] = a;
    data[i * 4 + 3] = 255;
    if (a > 8 && front < 0) front = Math.floor(i / cols);
  }
  if (front < 0) return null;
  ordered(image, { palette: PALETTE });
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      data[i * 4 + 3] = (alpha[i] ?? 0) / 255 > threshold(x, y) ? 255 : 0;
    }
  }
  small.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, cols * cell, rows * cell);
  return front / rows;
}
