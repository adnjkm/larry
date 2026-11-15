/**
 * The 2D dither toolkit every canvas look is built from: one Bayer matrix, one noise, one way to pack and snap
 * colours, one rounded-rectangle distance, and one way to put cells on a canvas.
 */

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const THRESHOLD = Float32Array.from(BAYER4, (v) => (v + 0.5) / 16);

/** The 4 x 4 ordered-dither threshold at a cell, in (0, 1). */
export const threshold = (x: number, y: number) => THRESHOLD[((y & 3) << 2) | (x & 3)]!;

export function hash(x: number, y: number) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) & 16777215) / 16777216;
}

export const smooth = (t: number) => t * t * (3 - 2 * t);

export function valueNoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export type Rgb = readonly [number, number, number] | readonly number[];

export function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ImageData is RGBA in memory; a Uint32Array view reads it in the machine's byte order.
const LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/** One pixel as a 32-bit word for a Uint32Array view of ImageData. */
export function pack(r: number, g: number, b: number, a = 255) {
  r = Math.round(r) & 255;
  g = Math.round(g) & 255;
  b = Math.round(b) & 255;
  a = Math.round(a) & 255;
  return (LITTLE ? (a << 24) | (b << 16) | (g << 8) | r : (r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

/** Colours, dark to light, packed for `snap`. */
export const ramp = (colors: readonly (Rgb | string)[]) =>
  Uint32Array.from(colors, (c) => {
    const [r = 0, g = 0, b = 0] = typeof c === "string" ? hexRgb(c) : c;
    return pack(r, g, b);
  });

/** Ordered dither along a ramp: `tone` 0 to 1 lands between two stops and the threshold picks one. */
export function snap(stops: Uint32Array, tone: number, th: number) {
  const top = stops.length - 1;
  const i = Math.floor(tone * top + th);
  return stops[i < 0 ? 0 : i > top ? top : i]!;
}

/** Distance from a point to the edge of a `w` x `h` rectangle with `r` corners: positive inside, negative outside. */
export function inset(x: number, y: number, w: number, h: number, r: number) {
  const qx = Math.abs(x - w / 2) - (w / 2 - r);
  const qy = Math.abs(y - h / 2) - (h / 2 - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return -(outside + Math.min(Math.max(qx, qy), 0) - r);
}

/**
 * Distance in from the edge of a speech bubble's tab, positive inside: a triangle pointing straight up from a part's
 * top edge, its tip at (`tab.x`, 0) and its base `tab.w` wide at y = `tab.h`. It runs on down to `below` so it meets
 * the body under it without a seam.
 */
export function tabInset(x: number, y: number, tab: { x: number; w: number; h: number }, below: number) {
  const hw = tab.w / 2;
  const len = Math.hypot(hw, tab.h);
  const dx = x - tab.x;
  const left = (dx * tab.h + y * hw) / len;
  const right = (-dx * tab.h + y * hw) / len;
  return Math.min(left, right, below - y);
}

/** A canvas's pixels as one reused ImageData and a Uint32Array view of it. */
export type Raster = { cols: number; rows: number; image: ImageData; px: Uint32Array; ctx: CanvasRenderingContext2D };

const rasters = new WeakMap<HTMLCanvasElement, Raster>();

/**
 * The canvas's backing store sized to `cols` x `rows` (one pixel per cell; CSS upscales it, pixelated), with an
 * ImageData kept between frames. Write `px`, then `ctx.putImageData(image, 0, 0)`.
 */
export function raster(canvas: HTMLCanvasElement, cols: number, rows: number): Raster | null {
  let r = rasters.get(canvas);
  if (r && r.cols === cols && r.rows === rows && canvas.width === cols && canvas.height === rows) return r;
  canvas.width = cols;
  canvas.height = rows;
  const ctx = r?.ctx ?? canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(cols, rows);
  r = { cols, rows, image, px: new Uint32Array(image.data.buffer, image.data.byteOffset, cols * rows), ctx };
  rasters.set(canvas, r);
  return r;
}
