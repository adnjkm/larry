import { LOOK } from "../surface/look.ts";
import { ramp, type Raster, snap, threshold } from "../surface/dither.ts";
import { SYNTHWAVE } from "../../shared/primitives/parts.ts";
import type { DevelopLook } from "./look.ts";
import type { GreyField } from "./photo.ts";

/*
 * The camera's synthwave light over the grey photo after the last shot, cell by cell. For each cell it works out how
 * strongly the light shows (`a`) and where it sits along the synthwave ramp (`tone`), and `light` dithers that: kept or dropped by its strength against the Bayer threshold, then snapped
 * between the two stops either side of its tone.
 */

/** funky-shadow's synthwave preset: near-black, indigo, purple, pink, coral, gold. */
const SYNTHWAVE_RAMP = ramp(SYNTHWAVE);

function light(px: Uint32Array, i: number, th: number, a: number, tone: number) {
  if (a <= th) return false;
  px[i] = snap(SYNTHWAVE_RAMP, tone, th);
  return true;
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

// ---------------------------------------------------------------- the swell

/**
 * The surface of a liquid, as waves that add: wavenumbers in radians per 100 CSS px, speeds in radians per second,
 * heights in crests. They run in different directions, and some against each other, so where they meet they stand and
 * slosh instead of all marching one way.
 */
const SWELL = [
  { kx: 0.9, ky: 2.4, w: 0.8, a: 0.32, p: 0 },
  { kx: -1.4, ky: 2.0, w: -0.6, a: 0.28, p: 1.7 },
  { kx: 2.7, ky: 0.8, w: 1.15, a: 0.14, p: 4.1 },
  { kx: -0.6, ky: -3.2, w: 0.95, a: 0.18, p: 2.6 },
  { kx: 3.6, ky: -1.9, w: -1.4, a: 0.08, p: 5.3 },
];
const WAVES = SWELL.length;
/** CSS px between crests of the light, before the swell bends them. */
const CREST_GAP = 190;

const GREYS = LOOK.materials.bone.tones;
const GREY_RAMP = ramp(GREYS);
const GREY_TOP = GREYS.length - 1;
/** For each of 256 greys: the bone tone at or below it, and how far toward the next. */
const GREY_STEP = new Uint8Array(256);
const GREY_FRAC = new Float32Array(256);
for (let v = 0; v < 256; v++) {
  let s = 0;
  while (s < GREY_TOP && v > GREYS[s + 1]![0]!) s++;
  const lo = GREYS[s]![0]!;
  const hi = GREYS[Math.min(GREY_TOP, s + 1)]![0]!;
  GREY_STEP[v] = s;
  GREY_FRAC[v] = hi > lo ? Math.max(0, (v - lo) / (hi - lo)) : 0;
}

/** What the swell keeps between frames for one grey photo: what depends only on the column or the row, and row buffers. */
export type Swell = {
  field: GreyField;
  colSin: Float64Array;
  colCos: Float64Array;
  colTilt: Float32Array;
  rowAlong: Float32Array;
  h: Float64Array;
  sx: Float64Array;
  sy: Float64Array;
};

export function swellFor(field: GreyField): Swell {
  const { cols, rows, cell, dpr } = field;
  const size = cell / dpr;
  const colSin = new Float64Array(WAVES * cols);
  const colCos = new Float64Array(WAVES * cols);
  const colTilt = new Float32Array(cols);
  const rowAlong = new Float32Array(rows);
  for (let k = 0; k < WAVES; k++) {
    for (let x = 0; x < cols; x++) {
      const v = (SWELL[k]!.kx * x * size) / 100;
      colSin[k * cols + x] = Math.sin(v);
      colCos[k * cols + x] = Math.cos(v);
    }
  }
  for (let x = 0; x < cols; x++) colTilt[x] = ((x - cols / 2) * size) / 200;
  for (let y = 0; y < rows; y++) rowAlong[y] = (y * size) / CREST_GAP;
  return { field, colSin, colCos, colTilt, rowAlong, h: new Float64Array(cols), sx: new Float64Array(cols), sy: new Float64Array(cols) };
}

/**
 * The grey photo while Larry works, alive: the sweep's light on a liquid surface rocking in a tub. Crests of synthwave
 * light, gold at the front falling through pink to indigo as the band does, ride a swell of crossing waves while the
 * whole surface tilts and bobs. The light comes and goes in patches, and the photo bends under the surface's slope as
 * if seen through water. `amount` (0 to 1) eases it all in; at 0 it is the still grey photo.
 */
export function drawSwell(r: Raster, swell: Swell, look: DevelopLook, seconds: number, amount: number) {
  const { field, colSin, colCos, colTilt, rowAlong, h, sx, sy } = swell;
  const { cols, rows, lum, cell, dpr } = field;
  const { px } = r;
  const t = seconds * look.speed;
  const bend = (look.wave * amount) / (cell / dpr);
  const strength = look.light * amount;
  const tilt = 0.55 * Math.sin(t * 0.42) + 0.2 * Math.sin(t * 0.17 + 2);
  const bob = 0.3 * Math.sin(t * 0.29 + 1) + 0.12 * Math.sin(t * 0.71);

  for (let y = 0; y < rows; y++) {
    const row = y * cols;
    if (amount === 0) {
      for (let x = 0; x < cols; x++) px[row + x] = grey(lum[row + x]!, threshold(x, y));
      continue;
    }
    // The swell's height and slope along the row, wave by wave: sin(a + b) and cos(a + b) of the column's a and the
    // row's b, in flat loops over the columns. Its shortest wave is ~170 CSS px, so every other row serves two.
    if ((y & 1) === 0) {
      h.fill(0);
      sx.fill(0);
      sy.fill(0);
      for (let k = 0; k < WAVES; k++) {
        const wave = SWELL[k]!;
        const b = (wave.ky * y * cell) / dpr / 100 - wave.w * t + wave.p;
        const rs = Math.sin(b);
        const rc = Math.cos(b);
        const akx = wave.a * wave.kx;
        const aky = wave.a * wave.ky;
        const o = k * cols;
        for (let x = 0; x < cols; x++) {
          const cs = colSin[o + x]!;
          const cc = colCos[o + x]!;
          const cos = cc * rc - cs * rs;
          h[x]! += wave.a * (cs * rc + cc * rs);
          sx[x]! += akx * cos;
          sy[x]! += aky * cos;
        }
      }
    }
    const rowBase = rowAlong[y]! + bob;
    for (let x = 0; x < cols; x++) {
      const i = row + x;
      const th = threshold(x, y);
      const hx = h[x]!;
      const along = rowBase + hx + tilt * colTilt[x]!;
      const phase = along - Math.floor(along);
      const back = 1 - phase;
      // Sharp at its front, a tail behind, as the band is. A min, not a branch: which side a cell is on is a coin toss.
      const crest = Math.min(phase / 0.06, back * back * back);
      // The light gathers where the swell runs high and thins where it runs low.
      const glint = crest * clamp01(0.55 + hx * 0.9) * strength;
      if (light(px, i, th, glint, back)) continue;
      const gx = Math.min(cols - 1, Math.max(0, (x + sx[x]! * bend + 0.5) | 0));
      const gy = Math.min(rows - 1, Math.max(0, (y + sy[x]! * bend + 0.5) | 0));
      px[i] = grey(lum[gy * cols + gx]! + glint * 0.15, th);
    }
  }
  r.ctx.putImageData(r.image, 0, 0);
}

/** Ordered dither between the bone greys. The step up is floor(frac - th + 1), not a branch on a random threshold. */
function grey(v: number, th: number) {
  const g = Math.round(clamp01(v) * 255);
  return GREY_RAMP[GREY_STEP[g]! + Math.floor(GREY_FRAC[g]! - th + 1)]!;
}
