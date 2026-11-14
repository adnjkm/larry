import { LOOK, MATERIAL_NAMES, type Look, type Rgb } from "./look.ts";
import type { Field } from "./relief.ts";

/**
 * The cheap half of the raised look: turns baked per-cell data into pixels, one pixel per cell. It runs every frame
 * (for a turning wheel, a drifting grain), so it allocates nothing but a view and does no per-cell calls beyond the noise.
 */

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// Pixels are written as one 32-bit word each. Which byte is red depends on the machine, so pack for it once.
const LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const pack = (r: number, g: number, b: number) => (LITTLE ? (255 << 24) | (b << 16) | (g << 8) | r : (r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
const packRgb = (c: Rgb) => pack(Math.round(c[0] ?? 0), Math.round(c[1] ?? 0), Math.round(c[2] ?? 0));

type Palette = { tones: Uint32Array[]; ink: number };
const palettes = new WeakMap<Look, Palette>();

/** A look's colours packed once, so the per-cell loop never touches an array of arrays. */
function paletteOf(look: Look): Palette {
  let p = palettes.get(look);
  if (!p) {
    p = {
      tones: MATERIAL_NAMES.map((name) => Uint32Array.from(look.materials[name]?.tones.map(packRgb) ?? [0])),
      ink: packRgb(look.ink),
    };
    palettes.set(look, p);
  }
  return p;
}

// Copied from src/mock/dither.ts so this file stands alone.
function hash(x: number, y: number) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) & 16777215) / 16777216;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

const STEP = 0.4;

// Value noise at (x * STEP + t, y * STEP), as dither.ts's valueNoise computes it, but split so the hashes are shared.
// The noise moves 0.4 lattice steps per cell, so one lattice point's hash serves ~2.5 cells across and ~2.5 rows down.
// Hashing each lattice point once per row pair, not four times per cell, is what keeps drift affordable.
// Two lattice rows (this one and the next) live in one array reused between calls.
let lattice = new Float32Array(0);

function hashRow(into: number, yi: number, xi0: number, width: number) {
  for (let i = 0; i < width; i++) lattice[into + i] = hash(xi0 + i, yi);
}

/**
 * Paints `fields` into `out`, one pixel per cell.
 *
 * Several fields are averaged cell by cell, which is motion blur for a part that turns. The first field's owner wins.
 * A cell the part covers more than the Bayer threshold is the part, dithered between its material's tones; a cell
 * it doesn't cover is the cast shadow's ink if the shadow clears a slightly softer threshold, else transparent.
 * `origin` is the part's Bayer phase, so neighbouring parts' patterns line up. `drift` is how far noise moves the tone.
 */
export function paintField(
  fields: readonly Field[],
  out: ImageData,
  opts: { origin: readonly [number, number]; drift: number; seconds: number },
  look: Look = LOOK,
): void {
  const first = fields[0];
  if (!first) return;
  const { cols, rows } = first;
  const count = cols * rows;
  const px = new Uint32Array(out.data.buffer, out.data.byteOffset, count);
  const { tones, ink } = paletteOf(look);
  const { owner } = first;
  const [ox, oy] = opts.origin;
  const n = fields.length;
  const single = n === 1;
  const wobble = 0.08 * opts.drift;
  const t0 = opts.seconds;

  // Noise setup: lattice columns run from xi0 for `lw` points, rows are filled as y advances.
  const xi0 = Math.floor(t0);
  const xFrac = t0 - xi0;
  const lw = Math.ceil((cols - 1) * STEP + xFrac) + 2;
  if (wobble > 0 && lattice.length < 2 * lw) lattice = new Float32Array(2 * lw);
  let yiHave = -Infinity;
  let v = 0;

  for (let y = 0; y < rows; y++) {
    if (wobble > 0) {
      const yi = Math.floor(y * STEP);
      if (yi !== yiHave) {
        // Usually the next lattice row down: its upper row is the last call's lower row.
        if (yi === yiHave + 1) lattice.copyWithin(0, lw, 2 * lw);
        else hashRow(0, yi, xi0, lw);
        hashRow(lw, yi + 1, xi0, lw);
        yiHave = yi;
      }
      v = smooth(y * STEP - yi);
    }
    const bayerRow = ((y + oy) & 3) * 4;
    for (let x = 0; x < cols; x++) {
      const c = y * cols + x;
      const th = (BAYER4[bayerRow + ((x + ox) & 3)]! + 0.5) / 16;

      let tone: number;
      let cover: number;
      let cast: number;
      if (single) {
        tone = first.tone[c]!;
        cover = first.cover[c]!;
        cast = first.cast[c]!;
      } else {
        tone = cover = cast = 0;
        for (let i = 0; i < n; i++) {
          const f = fields[i]!;
          tone += f.tone[c]!;
          cover += f.cover[c]!;
          cast += f.cast[c]!;
        }
        tone /= n;
        cover /= n;
        cast /= n;
      }

      const o = owner[c]!;
      if (cover > th && o >= 0) {
        const steps = tones[o]!;
        const top = steps.length - 1;
        let t = tone;
        if (wobble > 0) {
          const xs = x * STEP + xFrac;
          const xi = Math.floor(xs);
          const u = smooth(xs - xi);
          const a = lattice[xi]!;
          const c = lattice[lw + xi]!;
          const noise = a + (lattice[xi + 1]! - a) * u + (c - a) * v + (a - lattice[xi + 1]! - c + lattice[lw + xi + 1]!) * u * v;
          t += (noise - 0.5) * wobble;
        }
        const i = Math.floor(t * top + th);
        px[c] = steps[i < 0 ? 0 : i > top ? top : i]!;
      } else if (cast > th * 0.9 + 0.05) {
        px[c] = ink;
      } else {
        px[c] = 0;
      }
    }
  }
}
