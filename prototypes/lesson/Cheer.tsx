// A short "well done" that washes in over the screen when a fix works, then dissolves: the words as fat
// bubble letters, raised and lit like the app's other raised parts (src/surface), and nothing behind
// them. They are one canvas of square dither cells painted frame by frame: a ragged front sweeps the
// letters in, each puffs up as it passes, and on the way out the dither thins them back to scattered dots.
import { useEffect, useRef, useState } from "react";
import { pack, ramp, raster, snap, threshold } from "../../src/surface/dither.ts";
import { LOOK } from "../../src/surface/look.ts";

/** Whole life of one pop, in ms. Keep in step with the `cheer-*` timings in lesson.css. */
export const CHEER_MS = 1700;
/** The front sweeps the letters in over this long, and the dissolve starts at OUT_AT and lasts the rest. */
const IN_MS = 520;
const OUT_AT = 1200;

/** One dither cell in CSS px, the build viewer's grain; it is rounded to whole device px. */
const GRAIN = 1.5;
/** Mask samples across a cell: shapes are worked out finer than the cells, then averaged. */
const SS = 3;
/** The letters' tones, dark to light: plum, deep pink, the accent, light pink, near white. */
const PINK = ramp(LOOK.materials.pink.tones);
/** The letters' outline: darker than the ramp's plum, so the words hold over whatever is on the screen. */
const INK = pack(34, 0, 26);
/** The outline's width in CSS px, and the clear room kept round the words. */
const OUTLINE = 2.2;
const PAD = 8;
/** The light, pointing from the letters toward it: upper left, well above the screen. */
const LIGHT = (() => {
  const v = [-0.46, -0.58, 0.67] as const;
  const n = Math.hypot(...v);
  return { x: v[0] / n, y: v[1] / n, z: v[2] / n };
})();
/** Where a flat face sits on the ramp (the accent), how hard a slope swings it, and the glint's size and strength. */
const SHADE = { flat: 0.5, gain: 1.25, fill: 0.3, glint: 0.9, tight: 14 };

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

// ---- the words, set as bubble letters

const FONT = (size: number) => `700 ${size}px "Open Runde", ui-rounded, system-ui, sans-serif`;
/** How much a letter is fattened all round, as a share of the type size. Any more and the eye of an e or the turns of an s close up. */
const FAT = 0.036;

type Glyph = { ch: string; x: number; y: number; turn: number };
type Setting = { size: number; fat: number; w: number; h: number; glyphs: Glyph[] };

/**
 * Sets `text` in the biggest size that fits `maxW` CSS px in the fewest lines. Letters are spaced out by the fattening
 * so they nearly touch, and each one tips and bobs a little, as hand-drawn bubble letters do.
 */
function setting(ctx: CanvasRenderingContext2D, text: string, maxW: number): Setting {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const attempt = (size: number, maxLines: number): Setting | null => {
    ctx.font = FONT(size);
    const fat = size * FAT;
    const track = 2 * fat + size * 0.01;
    const space = size * 0.42;
    const wide = (word: string) => ctx.measureText(word).width + ([...word].length - 1) * track;
    const lines: { words: string[]; w: number }[] = [];
    for (const word of words) {
      const ww = wide(word);
      const line = lines.at(-1);
      if (line && line.w + space + ww <= maxW) {
        line.words.push(word);
        line.w += space + ww;
      } else lines.push({ words: [word], w: ww });
    }
    if (lines.length > maxLines || lines.some((l) => l.w > maxW)) return null;
    const lead = size * 0.98 + 2 * fat;
    const w = Math.max(...lines.map((l) => l.w));
    const glyphs: Glyph[] = [];
    let n = 0;
    lines.forEach((line, row) => {
      let x = (w - line.w) / 2;
      for (const word of line.words) {
        // A letter sits where the whole word would put it, so pairs like "Ye" keep their kerning.
        let done = "";
        for (const ch of word) {
          const adv = ctx.measureText(ch).width;
          const kern = ctx.measureText(done + ch).width - ctx.measureText(done).width - adv;
          done += ch;
          x += kern;
          const odd = n++ % 2 === 0 ? -1 : 1;
          glyphs.push({ ch, x: x + adv / 2, y: size * 0.78 + row * lead + odd * size * 0.02, turn: odd * 0.05 + (hash(n, row, 7) - 0.5) * 0.04 });
          x += adv + track;
        }
        x += space - track;
      }
    });
    return { size, fat, w, h: size * 1.04 + (lines.length - 1) * lead, glyphs };
  };
  for (const lines of [1, 2, 3]) for (const size of [60, 56, 52, 46, 42]) {
    const s = attempt(size, lines);
    if (s) return s;
  }
  for (let size = 38; size > 14; size -= 4) {
    const s = attempt(size, 4);
    if (s) return s;
  }
  return attempt(14, 99) ?? { size: 14, fat: 1, w: 0, h: 0, glyphs: [] };
}

/** Squared distance, in samples, from every sample to the nearest one where `on` is `want` (Felzenszwalb's transform). */
function distance(on: Uint8Array, w: number, h: number, want: number) {
  const INF = 1e12;
  const out = new Float64Array(w * h);
  const n = Math.max(w, h);
  const f = new Float64Array(n),
    v = new Int32Array(n),
    z = new Float64Array(n + 1),
    d = new Float64Array(n);
  const pass = (len: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s: number;
      do {
        const p = v[k]!;
        s = (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p);
      } while (s <= z[k]! && --k >= 0);
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1]! < q) k++;
      const p = v[k]!;
      d[q] = (q - p) * (q - p) + f[p]!;
    }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = on[y * w + x] === want ? 0 : INF;
    pass(h);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y]!;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = out[y * w + x]!;
    pass(w);
    for (let x = 0; x < w; x++) out[y * w + x] = d[x]!;
  }
  return out;
}

type Field = {
  cols: number;
  rows: number;
  /** When the front reaches a cell, 0..1, left to right with a wobbly edge. */
  front: Float32Array;
  /** 2 on a letter, 1 on its outline, 0 off it. */
  part: Uint8Array;
  /** The slope of a letter's puffed surface. */
  sx: Float32Array;
  sy: Float32Array;
};

/**
 * Bakes one pop at `CELL` CSS px to a cell: the words drawn fat into a mask, the mask's distance from its edge rounded into a dome (so every
 * stroke is a puffed tube), and the front's noise. Lighting waits for `paint`, which is cheap enough to run each frame.
 */
function bake(text: string, maxW: number, CELL: number, seed: number): (Field & { w: number; h: number }) | null {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  const set = setting(probe, text, maxW);
  const pad = Math.ceil(set.fat + OUTLINE) + PAD;
  // Whole cells, and an even count of them, so the canvas centres on whole pixels.
  const cols = 2 * Math.ceil((set.w + 2 * pad) / CELL / 2);
  const rows = 2 * Math.ceil((set.h + 2 * pad) / CELL / 2);
  const w = cols * CELL,
    h = rows * CELL;

  // The mask, SS samples to a cell.
  const mw = cols * SS,
    mh = rows * SS;
  const off = document.createElement("canvas");
  off.width = mw;
  off.height = mh;
  const m = off.getContext("2d", { willReadFrequently: true });
  if (!m) return null;
  const k = SS / CELL;
  m.setTransform(k, 0, 0, k, 0, 0);
  m.translate(w / 2, h / 2);
  m.rotate(-0.035);
  m.translate(-set.w / 2, -set.h / 2);
  m.font = FONT(set.size);
  m.textAlign = "center";
  m.textBaseline = "alphabetic";
  m.lineJoin = "round";
  m.lineCap = "round";
  m.lineWidth = 2 * set.fat;
  m.fillStyle = m.strokeStyle = "#000";
  for (const g of set.glyphs) {
    m.save();
    m.translate(g.x, g.y);
    m.rotate(g.turn);
    m.fillText(g.ch, 0, 0);
    m.strokeText(g.ch, 0, 0);
    m.restore();
  }
  const alpha = m.getImageData(0, 0, mw, mh).data;
  const on = new Uint8Array(mw * mh);
  for (let i = 0; i < on.length; i++) on[i] = alpha[i * 4 + 3]! > 127 ? 1 : 0;
  const inside = distance(on, mw, mh, 0);
  const outside = distance(on, mw, mh, 1);

  // Height at each sample: a quarter round from the edge in, as deep as a stroke is wide, so strokes come out as tubes.
  const px = CELL / SS;
  const bevel = set.size * 0.085 + set.fat;
  const lift = bevel * 0.55;
  let Z = new Float32Array(mw * mh);
  for (let i = 0; i < Z.length; i++) {
    if (!on[i]) continue;
    const e = Math.min(1, ((Math.sqrt(inside[i]!) - 0.5) * px) / bevel);
    Z[i] = lift * Math.sqrt(1 - (1 - e) * (1 - e));
  }
  // A light blur takes the crease off the tubes' spines and the stair-steps off their edges.
  for (let passes = 0; passes < 2; passes++) {
    const B = new Float32Array(mw * mh);
    for (let y = 1; y < mh - 1; y++)
      for (let x = 1; x < mw - 1; x++) {
        const i = y * mw + x;
        B[i] = (Z[i - mw - 1]! + Z[i - mw]! + Z[i - mw + 1]! + Z[i - 1]! + Z[i]! + Z[i + 1]! + Z[i + mw - 1]! + Z[i + mw]! + Z[i + mw + 1]!) / 9;
      }
    Z = B;
  }

  // Down to cells: mean height, share covered, and distance from the letters' edge (CSS px, positive inside).
  const cells = cols * rows;
  const H = new Float32Array(cells),
    fill = new Float32Array(cells),
    sd = new Float32Array(cells);
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      let zs = 0,
        ons = 0,
        ds = 0;
      for (let j = 0; j < SS; j++)
        for (let i = 0; i < SS; i++) {
          const s = (cy * SS + j) * mw + cx * SS + i;
          zs += Z[s]!;
          ons += on[s]!;
          ds += on[s] ? Math.sqrt(inside[s]!) - 0.5 : 0.5 - Math.sqrt(outside[s]!);
        }
      const c = cy * cols + cx;
      H[c] = zs / (SS * SS);
      fill[c] = ons / (SS * SS);
      sd[c] = (ds / (SS * SS)) * px;
    }

  const f: Field = { cols, rows, front: new Float32Array(cells), part: new Uint8Array(cells), sx: new Float32Array(cells), sy: new Float32Array(cells) };
  const at = (a: Float32Array, x: number, y: number) => a[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))]!;
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      const c = cy * cols + cx;
      f.part[c] = fill[c]! >= 0.5 ? 2 : sd[c]! > -OUTLINE ? 1 : 0;
      f.sx[c] = (at(H, cx + 1, cy) - at(H, cx - 1, cy)) / (2 * CELL);
      f.sy[c] = (at(H, cx, cy + 1) - at(H, cx, cy - 1)) / (2 * CELL);
      // Worked in CSS px, so the front keeps its shape whatever the cell.
      f.front[c] = ((cx * CELL) / w) * 0.75 + noise(cx * CELL, cy * CELL, 12, seed) * 0.25;
    }
  return { ...f, w, h };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (t: number) => Math.min(1, Math.max(0, t));
/** 0 to 1 with a little overshoot: a letter puffs up past full, then settles. */
const puff = (u: number) => 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2;

/** Paints one frame at time `t` ms. */
function paint(px: Uint32Array, f: Field, t: number) {
  const rise = smooth(clamp(t / IN_MS));
  // The way out mirrors the way in: a second front sweeps left to right and thins the letters away.
  const fall = smooth(clamp((t - OUT_AT) / (CHEER_MS - OUT_AT)));
  const flatLit = LIGHT.z * (1 - SHADE.fill) + SHADE.fill;
  // The glint sits where the surface faces halfway between the light and the viewer.
  const hl = Math.hypot(LIGHT.x, LIGHT.y, LIGHT.z + 1);
  const hx = LIGHT.x / hl,
    hy = LIGHT.y / hl,
    hz = (LIGHT.z + 1) / hl;
  const flatGlint = hz ** SHADE.tight;
  for (let y = 0; y < f.rows; y++)
    for (let x = 0; x < f.cols; x++) {
      const i = y * f.cols + x;
      const b = threshold(x, y);
      const part = f.part[i]!;
      if (part === 0) {
        px[i] = 0;
        continue;
      }
      const at = f.front[i]!;
      // Behind the front a letter is there; right at the front it is still thin, like a wave edge.
      const shown = clamp((rise * 1.15 - at) * 4) * (1 - clamp((fall * 1.35 - at) * 4));
      if (shown <= b) {
        px[i] = 0;
        continue;
      }
      if (part === 1) {
        px[i] = INK;
        continue;
      }
      const up = puff(clamp((rise * 1.15 - at) * 2.2));
      const nx = -f.sx[i]! * up,
        ny = -f.sy[i]! * up;
      const len = Math.hypot(nx, ny, 1);
      const key = Math.max(0, (nx * LIGHT.x + ny * LIGHT.y + LIGHT.z) / len);
      const lit = key * (1 - SHADE.fill) + SHADE.fill / len;
      const glint = Math.max(0, (nx * hx + ny * hy + hz) / len) ** SHADE.tight;
      px[i] = snap(PINK, SHADE.flat + (lit - flatLit) * SHADE.gain + Math.max(0, glint - flatGlint) * SHADE.glint, b);
    }
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
    const anchor = c?.parentElement;
    if (live === 0 || !c || !anchor) return;
    let raf = 0;
    let off = false;
    const begin = () => {
      if (off) return;
      const room = Math.min(anchor.offsetParent?.clientWidth ?? innerWidth, innerWidth, 440);
      const dpr = devicePixelRatio || 1;
      const field = bake(text, room - 24 - 2 * PAD, Math.max(1, Math.round(GRAIN * dpr)) / dpr, live * 7919);
      const r = field && raster(c, field.cols, field.rows);
      if (!field || !r) return;
      // Centred on the anchor. The cell count is even, so the offsets are whole device px and every cell is one size.
      c.style.width = `${field.w}px`;
      c.style.height = `${field.h}px`;
      c.style.left = `${-field.w / 2}px`;
      c.style.top = `${-field.h / 2}px`;
      const draw = (t: number) => {
        paint(r.px, field, t);
        r.ctx.putImageData(r.image, 0, 0);
      };
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return draw(IN_MS);
      const start = performance.now();
      const frame = (now: number) => {
        const t = now - start;
        draw(Math.min(t, CHEER_MS));
        if (t < CHEER_MS) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };
    // The letters are drawn from the page's font, so wait for it if it is still on its way.
    if (document.fonts.check(FONT(60))) begin();
    else document.fonts.load(FONT(60)).then(begin, begin);
    return () => {
      off = true;
      cancelAnimationFrame(raf);
    };
  }, [live, text]);

  if (live === 0) return null;
  return (
    <div key={live} className="cheer" role="status" aria-live="polite">
      <canvas ref={canvas} className="cheer-art" aria-hidden />
      <span className="cheer-text">{text}</span>
    </div>
  );
}
