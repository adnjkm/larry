import { LOOK } from "../surface/look.ts";
import { ramp, type Raster, snap, threshold } from "../surface/dither.ts";
import { type DevelopLook, SYNTHWAVE_RAMP } from "./look.ts";
import type { GreyField } from "./photo.ts";

/*
 * The camera's synthwave light, cell by cell: the capture sweep's band and the swell over the grey photo after the
 * last shot. Both work out, for each cell, how strongly the light shows (`a`) and where it sits along the synthwave
 * ramp (`tone`), and `light` dithers that: kept or dropped by its strength against the Bayer threshold, then snapped
 * between the two stops either side of its tone.
 */

function light(px: Uint32Array, i: number, th: number, a: number, tone: number) {
  if (a <= th) return false;
  px[i] = snap(SYNTHWAVE_RAMP, tone, th);
  return true;
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smoothstep = (a: number, b: number, t: number) => {
  const k = clamp01((t - a) / (b - a));
  return k * k * (3 - 2 * k);
};

// ---------------------------------------------------------------- the sweep

/*
 * glimm's band, as its "Generate data" demo plays it in a card: a Gaussian across the travel axis whose ends trail its
 * middle on a parabola, a faint wake behind it, and a halo at mid-run. Distances are shares of the frame's height.
 */
const TIGHT = 28;
/** The band starts and ends this far past the frame, so it enters and leaves whole. */
const OVERSCAN = Math.max(0.2, Math.sqrt(4.6 / TIGHT));
/** Where the band has already reached when a sweep starts. */
const PEEK = 0.08;
const RAMP_MS = 140;
const PEAK = 1.1;
/** Ahead of this the band is too faint for any cell to light; behind it the wake ends. */
const AHEAD = 0.4;
const BEHIND = 0.66;

export type SweepFrame = {
  /** The band's middle, as a share of the frame's height up from its bottom. Past 1 it has left the top. */
  front: number;
  /** 0 to 1, how far through its run. */
  progress: number;
  alpha: number;
  curve: number;
};

/** The sweep `since` ms after it started, or null once it has finished. */
export function sweepAt(since: number, ms: number, curve: number): SweepFrame | null {
  const k = since / ms;
  if (k >= 1) return null;
  const progress = PEEK + (1 - PEEK) * (1 - (1 - k) ** 2.4);
  const entry = 0.2 + 0.8 * 4 * progress * (1 - progress);
  const alpha = (1 - k) ** 1.2 * smoothstep(0, 1, since / RAMP_MS) * PEAK * entry;
  return { front: -OVERSCAN + (1 + 2 * OVERSCAN) * progress, progress, alpha, curve };
}

/** How strongly the band shows `d` ahead of its middle (negative behind). */
function bandAt(d: number, f: SweepFrame) {
  const band = Math.exp(-d * d * TIGHT);
  const behind = d < 0 ? -d : 0;
  const trail = smoothstep(0, 0.08, behind) * (1 - smoothstep(0.12, 0.65, behind)) * 0.1;
  const halo = Math.exp(-d * d * 2.5) * 0.05 * 4 * f.progress * (1 - f.progress);
  return Math.min(1, Math.max(band, trail) + halo * (1 - band)) * f.alpha;
}

/** Whether any of the band shows in the frame's top `margin` (a share of its height). */
export const reachedTop = (f: SweepFrame, margin: number) => f.front + AHEAD >= 1 - margin && bandAt(1 - margin - f.front, f) > 1 / 32;

/**
 * One frame of the sweep into `r`, which covers the frame one pixel per cell. Gold leads, falling through coral and
 * pink to indigo in its wake. Only the rows the band can light are worked out.
 */
export function drawSweep(r: Raster, f: SweepFrame) {
  const { px, cols, rows } = r;
  px.fill(0);
  const yTop = Math.max(0, Math.floor((1 - (f.front + AHEAD)) * rows));
  const yBottom = Math.min(rows, Math.ceil((1 - (f.front - BEHIND - f.curve)) * rows));
  for (let y = yTop; y < yBottom; y++) {
    const axis = 1 - (y + 0.5) / rows;
    for (let x = 0; x < cols; x++) {
      const c = (2 * (x + 0.5)) / cols - 1;
      const d = axis - f.front + f.curve * c * c;
      light(px, y * cols + x, threshold(x, y), bandAt(d, f), clamp01(0.75 + d * 1.5));
    }
  }
  r.ctx.putImageData(r.image, 0, 0);
}

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

/** What the swell keeps between frames for one grey photo: everything that depends only on the column or the row. */
export type Swell = {
  field: GreyField;
  colSin: Float32Array;
  colCos: Float32Array;
  colTilt: Float32Array;
  rowSin: Float32Array;
  rowCos: Float32Array;
  rowAlong: Float32Array;
};

export function swellFor(field: GreyField): Swell {
  const { cols, rows, cell, dpr } = field;
  const size = cell / dpr;
  const colSin = new Float32Array(WAVES * cols);
  const colCos = new Float32Array(WAVES * cols);
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
  return { field, colSin, colCos, colTilt, rowSin: new Float32Array(WAVES * rows), rowCos: new Float32Array(WAVES * rows), rowAlong };
}

/**
 * The grey photo while Larry works, alive: the sweep's light on a liquid surface rocking in a tub. Crests of synthwave
 * light, gold at the front falling through pink to indigo as the band does, ride a swell of crossing waves while the
 * whole surface tilts and bobs. The light comes and goes in patches, and the photo bends under the surface's slope as
 * if seen through water. `amount` (0 to 1) eases it all in; at 0 it is the still grey photo.
 */
export function drawSwell(r: Raster, swell: Swell, look: DevelopLook, seconds: number, amount: number) {
  const { field, colSin, colCos, colTilt, rowSin, rowCos, rowAlong } = swell;
  const { cols, rows, lum, cell, dpr } = field;
  const { px } = r;
  const t = seconds * look.speed;
  const bend = (look.wave * amount) / (cell / dpr);
  const strength = look.light * amount;

  for (let k = 0; k < WAVES; k++) {
    const wave = SWELL[k]!;
    for (let y = 0; y < rows; y++) {
      const v = (wave.ky * y * cell) / dpr / 100 - wave.w * t + wave.p;
      rowSin[k * rows + y] = Math.sin(v);
      rowCos[k * rows + y] = Math.cos(v);
    }
  }
  const tilt = 0.55 * Math.sin(t * 0.42) + 0.2 * Math.sin(t * 0.17 + 2);
  const bob = 0.3 * Math.sin(t * 0.29 + 1) + 0.12 * Math.sin(t * 0.71);

  for (let y = 0; y < rows; y++) {
    const rowBase = rowAlong[y]! + bob;
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const th = threshold(x, y);
      if (amount === 0) {
        px[i] = grey(lum[i]!, th);
        continue;
      }
      // The swell's height here and its slope, from sin(a + b) and cos(a + b) of the column's a and the row's b.
      let h = 0;
      let sx = 0;
      let sy = 0;
      for (let k = 0; k < WAVES; k++) {
        const wave = SWELL[k]!;
        const cs = colSin[k * cols + x]!;
        const cc = colCos[k * cols + x]!;
        const rs = rowSin[k * rows + y]!;
        const rc = rowCos[k * rows + y]!;
        const cos = cc * rc - cs * rs;
        h += wave.a * (cs * rc + cc * rs);
        sx += wave.a * wave.kx * cos;
        sy += wave.a * wave.ky * cos;
      }
      const along = rowBase + h + tilt * colTilt[x]!;
      const phase = along - Math.floor(along);
      // Sharp at its front, a tail behind, as the band is.
      const crest = phase < 0.06 ? phase / 0.06 : (1 - phase) ** 3;
      // The light gathers where the swell runs high and thins where it runs low.
      const glint = crest * clamp01(0.55 + h * 0.9) * strength;
      if (light(px, i, th, glint, 1 - phase)) continue;
      const gx = Math.min(cols - 1, Math.max(0, Math.round(x + sx * bend)));
      const gy = Math.min(rows - 1, Math.max(0, Math.round(y + sy * bend)));
      px[i] = grey(lum[gy * cols + gx]! + glint * 0.15, th);
    }
  }
  r.ctx.putImageData(r.image, 0, 0);
}

function grey(v: number, th: number) {
  const g = Math.round(clamp01(v) * 255);
  return GREY_RAMP[GREY_FRAC[g]! > th ? Math.min(GREY_TOP, GREY_STEP[g]! + 1) : GREY_STEP[g]!]!;
}
