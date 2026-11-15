import { hex, ordered } from "ditherdance";

/*
 * ditherdance does the dithering itself. This file only decides what gets dithered:
 * the photo in the viewfinder, a scan bar, and a glow that hugs the viewfinder's edges.
 */

export type PhotoFit = "cover" | "contain";

/** Portrait photos fill the viewfinder; landscape ones sit inside it over a blurred copy, the way the feed shows them. */
export function fitFor(image: { width: number; height: number }, box: { width: number; height: number }): PhotoFit {
  return Math.abs(image.width / image.height - box.width / box.height) < 0.25 ? "cover" : "contain";
}

function rectFor(fit: PhotoFit, iw: number, ih: number, w: number, h: number) {
  const scale = fit === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  return { x: (w - iw * scale) / 2, y: (h - ih * scale) / 2, w: iw * scale, h: ih * scale };
}

/** A photo in grey, one value per dither cell, before dithering. */
export type GreyField = { cols: number; rows: number; dpr: number; cell: number; lum: Float32Array };

/**
 * The viewfinder's photo in grey at the dither's grain: one value per `cellCss` CSS px cell, 0 to 1, stretched to the
 * photo's own range so a dark object on a mid-tone wall still separates. `zoom` matches the viewfinder's zoom, about
 * the centre. Laid out once; drawAmbient dithers it each frame.
 */
export function greyField(image: HTMLImageElement, box: { width: number; height: number }, cellCss: number, { bias = 0, zoom = 1 }: { bias?: number; zoom?: number } = {}): GreyField | null {
  // The phone is drawn small, so this stops at 2x: more cells would cost frames, not detail.
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cell = Math.max(2, Math.round(cellCss * dpr));
  const W = box.width * dpr;
  const H = box.height * dpr;
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);
  const scratch = document.createElement("canvas");
  scratch.width = cols;
  scratch.height = rows;
  const small = scratch.getContext("2d", { willReadFrequently: true });
  if (!small) return null;
  const bw = (W / cell) * zoom;
  const bh = (H / cell) * zoom;
  const ox = (W / cell - bw) / 2;
  const oy = (H / cell - bh) / 2;
  const fit = fitFor({ width: image.naturalWidth, height: image.naturalHeight }, box);
  if (fit === "contain") {
    const back = rectFor("cover", image.naturalWidth, image.naturalHeight, bw, bh);
    small.filter = `blur(${Math.max(1, (16 * dpr) / cell)}px) brightness(0.55)`;
    small.drawImage(image, ox + back.x, oy + back.y, back.w, back.h);
    small.filter = "none";
  }
  const r = rectFor(fit, image.naturalWidth, image.naturalHeight, bw, bh);
  small.drawImage(image, ox + r.x, oy + r.y, r.w, r.h);
  const data = small.getImageData(0, 0, cols, rows);
  stretchToGray(data.data, bias);
  const lum = new Float32Array(cols * rows);
  for (let i = 0; i < lum.length; i++) lum[i] = (data.data[i * 4] ?? 0) / 255;
  return { cols, rows, dpr, cell, lum };
}

/** Greys the image and stretches its own range to full black and white, so a dark object on a mid-tone wall still separates. */
function stretchToGray(px: Uint8ClampedArray, bias: number) {
  const count = px.length / 4;
  const lums = new Float32Array(count);
  for (let i = 0; i < count; i++) lums[i] = 0.2126 * (px[i * 4] ?? 0) + 0.7152 * (px[i * 4 + 1] ?? 0) + 0.0722 * (px[i * 4 + 2] ?? 0);
  const sorted = Float32Array.from(lums).sort();
  const low = sorted[Math.floor(count * 0.04)] ?? 0;
  const high = sorted[Math.floor(count * 0.98)] ?? 255;
  const range = Math.max(12, high - low);
  for (let i = 0; i < count; i++) {
    const v = (((lums[i] ?? 0) - low) / range + bias) * 255;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
  }
}

// ---------------------------------------------------------------- edge glow

/** The look of the dithered edge, after clove.kshv.me's storage bar: lit cells cluster at the edge and drift with a slow noise. */
export type EdgeLook = {
  /** CSS px per cell. */
  cell: number;
  /** How far in from the edge the cells reach, in CSS px. */
  reach: number;
  /** 0 is no cells, 1 a solid ring at the very edge. */
  density: number;
  /** How much the noise breaks the ring up, 0 to 1. */
  noise: number;
  /** How fast the noise drifts. 0 holds still. */
  speed: number;
  color: string;
  opacity: number;
};

/** Distance from a point inside a rounded rectangle to its nearest edge. */
function insetDistance(x: number, y: number, w: number, h: number, r: number) {
  const dx = Math.max(r - x, x - (w - r), 0);
  const dy = Math.max(r - y, y - (h - r), 0);
  if (dx > 0 && dy > 0) return r - Math.hypot(dx, dy);
  return Math.min(x, w - x, y, h - y);
}

function hash(x: number, y: number) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) & 16777215) / 16777216;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number) {
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

/**
 * Draws one frame of the edge glow onto `canvas`, which covers a `width` x `height` rounded rectangle.
 * Builds a brightness field (bright at the edge, broken up by drifting noise), lets ditherdance's Bayer
 * matrix decide which cells light, then draws each lit cell as a small square with a gap.
 */
export function drawEdgeGlow(canvas: HTMLCanvasElement, width: number, height: number, radius: number, look: EdgeLook, seconds: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const cols = Math.floor(width / look.cell);
  const rows = Math.floor(height / look.cell);
  if (cols < 1 || rows < 1) return;
  const field = new ImageData(cols, rows);
  const edge = new Float32Array(cols * rows);
  const t = seconds * look.speed;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const d = insetDistance((x + 0.5) * look.cell, (y + 0.5) * look.cell, width, height, radius);
      const e = Math.exp(-Math.max(0, d) / Math.max(1, look.reach));
      const n = valueNoise(x * 0.09 - t, y * 0.09 + t * 0.6) * 0.65 + valueNoise(x * 0.25 + t * 1.3, y * 0.25) * 0.35;
      const v = e * look.density * (1 - look.noise + look.noise * 1.6 * n);
      edge[y * cols + x] = e;
      const g = Math.max(0, Math.min(255, v * 255));
      field.data.set([g, g, g, 255], (y * cols + x) * 4);
    }
  }
  ordered(field, { palette: [[0, 0, 0], [255, 255, 255]] });

  const size = Math.max(1, look.cell - Math.max(1, Math.round(look.cell / 4)));
  const offset = (look.cell - size) / 2;
  ctx.fillStyle = look.color;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (field.data[(y * cols + x) * 4] === 0) continue;
      // Cells deeper inside fade, so the ring reads as light falling off rather than a hard band.
      ctx.globalAlpha = look.opacity * (0.35 + 0.65 * (edge[y * cols + x] ?? 0));
      ctx.fillRect(x * look.cell + offset, y * look.cell + offset, size, size);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- dithered bar

export type BarLook = {
  /** CSS px per dither cell. */
  cell: number;
  /** The fill's accent, #rrggbb. */
  color: string;
  /** Where to split the fill, as fractions of the width. Only drawn inside the filled part. */
  dividers: readonly number[];
  /** What sits behind the bar, #rrggbb. The empty track and the fill's tint are laid over it. */
  base: string;
  /** How far the glow spreads past the filled part, in CSS px. 0 draws no glow. */
  glow: number;
  /** Strength of the grey dither on the empty track, 0 to 1. */
  idle: number;
};

/**
 * Lights cells across [x0, x1) of a `height`-tall strip, densest at the strip's edges and drifting with noise, and
 * paints each with `paint(edge)`, where edge is 1 at an edge and falls toward 0 inside. Works in device pixels so the
 * dither reads as texture rather than big pixels. ditherdance's Bayer matrix decides which cells light.
 */
function ditherStrip(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  height: number,
  dpr: number,
  cellCss: number,
  seconds: number,
  strength: number,
  paint: (edge: number) => string,
) {
  const cell = Math.max(2, Math.round(cellCss * dpr));
  const lit = cell - 1;
  const left = Math.round(x0 * dpr);
  const right = Math.round(x1 * dpr);
  const H = Math.round(height * dpr);
  const cols = Math.ceil((right - left) / cell);
  const rows = Math.ceil(H / cell);
  if (cols < 1 || rows < 1) return;
  const field = new ImageData(cols, rows);
  const edge = new Float32Array(cols * rows);
  const reach = Math.max(cell, H * 0.22);
  // Noise is sampled in CSS px from the bar's left, so the pattern holds still as the strip's ends move.
  const scale = cell / dpr;
  const offset = left / dpr;
  for (let y = 0; y < rows; y++) {
    const cy = (y + 0.5) * cell;
    for (let x = 0; x < cols; x++) {
      const cx = (x + 0.5) * cell;
      const d = Math.min(cy, H - cy, cx, right - left - cx);
      const e = Math.exp(-Math.max(0, d) / reach);
      const nx = offset + x * scale;
      const ny = y * scale;
      const n = valueNoise(nx * 0.09 - seconds, ny * 0.15 + seconds * 0.4) * 0.65 + valueNoise(nx * 0.22 + seconds * 1.3, ny * 0.3) * 0.35;
      edge[y * cols + x] = e;
      const gray = Math.max(0, Math.min(255, (0.04 + 0.8 * e + 0.45 * (n - 0.45)) * strength * 255));
      field.data.set([gray, gray, gray, 255], (y * cols + x) * 4);
    }
  }
  ordered(field, { palette: [[0, 0, 0], [255, 255, 255]] });
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (field.data[(y * cols + x) * 4] === 0) continue;
      ctx.fillStyle = paint(edge[y * cols + x] ?? 0);
      ctx.fillRect(left + x * cell, y * cell, lit, lit);
    }
  }
}

/**
 * A rounded bar filled from the left to `fill` (0 to 1), after clove.kshv.me's storage bar. The empty track is dark
 * grey with a quiet grey dither and a hairline. The filled part is a translucent accent tint with accent dither that
 * gathers at its edges and drifts, outlined and split at `dividers` by a thin neon stroke. `opacity` fades the filled
 * layer, for controls that cross-fade rather than sweep. The canvas is `look.glow` CSS px larger than the bar on
 * every side, for the glow.
 */
export function drawDitherBar(canvas: HTMLCanvasElement, width: number, height: number, radius: number, fill: number, look: BarLook, seconds: number, opacity = 1) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const pad = look.glow;
  const W = Math.round((width + 2 * pad) * dpr);
  const Hc = Math.round((height + 2 * pad) * dpr);
  if (canvas.width !== W || canvas.height !== Hc) {
    canvas.width = W;
    canvas.height = Hc;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const origin = pad * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, Hc);
  ctx.setTransform(dpr, 0, 0, dpr, origin, origin);

  const [r, g, b] = hex(look.color);
  const accent = (alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;
  const filled = Math.max(0, Math.min(1, fill)) * width;
  const visible = filled >= 0.5 && opacity > 0.01;
  const track = () => {
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, radius);
  };
  const w = Math.max(2, filled);
  const cap = Math.min(radius, w / 2);
  const end = Math.min(3, cap);
  const filledShape = (inset: number) => {
    ctx.beginPath();
    ctx.roundRect(inset, inset, w - 2 * inset, height - 2 * inset, filled >= width - 1 ? radius : [cap, end, end, cap]);
  };

  // The glow, around the filled part only. Its solid fill is painted over by the track next.
  if (visible && pad > 0) {
    ctx.save();
    ctx.shadowColor = accent(0.45 * opacity);
    ctx.shadowBlur = pad * dpr;
    ctx.fillStyle = accent(1);
    filledShape(0);
    ctx.fill();
    ctx.restore();
  }

  // The empty track: dark grey, a quiet grey dither, a hairline.
  ctx.save();
  track();
  ctx.clip();
  ctx.fillStyle = look.base;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.fillRect(0, 0, width, height);
  if (look.idle > 0) {
    ctx.setTransform(1, 0, 0, 1, origin, origin);
    ditherStrip(ctx, 0, width, height, dpr, look.cell, seconds * 0.5, look.idle, (e) => `rgba(255, 255, 255, ${0.1 + 0.18 * e})`);
    ctx.setTransform(dpr, 0, 0, dpr, origin, origin);
  }
  ctx.restore();
  track();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.stroke();
  if (!visible) return;

  // The filled part.
  ctx.save();
  ctx.globalAlpha = opacity;
  track();
  ctx.clip();
  ctx.fillStyle = look.base;
  ctx.fillRect(0, 0, filled, height);
  ctx.fillStyle = accent(0.18);
  ctx.fillRect(0, 0, filled, height);
  ctx.setTransform(1, 0, 0, 1, origin, origin);
  ditherStrip(ctx, 0, filled, height, dpr, look.cell, seconds, 1, (e) => {
    // Lit cells nearest the edge lean toward white, like light catching a rim.
    const k = 0.35 * e;
    return `rgba(${Math.round(r + (255 - r) * k)}, ${Math.round(g + (255 - g) * k)}, ${Math.round(b + (255 - b) * k)}, 0.95)`;
  });
  ctx.setTransform(dpr, 0, 0, dpr, origin, origin);

  // Outline and dividers share one stroke: a faint halo under a 1px bright core.
  const cuts = look.dividers.map((at) => at * width).filter((x) => x < filled - 2);
  for (const [lineWidth, alpha] of [
    [2.5, 0.2],
    [1, 0.95],
  ] as const) {
    ctx.strokeStyle = accent(alpha);
    ctx.lineWidth = lineWidth;
    filledShape(0.5);
    for (const x of cuts) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- photo tones

/** A dithered photo is in the raised parts' greys: LOOK.materials.bone in src/surface/look.ts. */
const PHOTO_TONES: [number, number, number][] = [
  [26, 26, 26],
  [84, 84, 84],
  [168, 168, 168],
  [240, 240, 240],
  [255, 255, 255],
];

// ---------------------------------------------------------------- shot unveil

/** funky-shadow's synthwave preset end to end: near-black, indigo, purple, our pink, coral and gold. */
export const SYNTHWAVE: [number, number, number][] = [
  [0, 0, 35],
  [35, 0, 95],
  [135, 0, 175],
  [255, 0, 135],
  [255, 95, 55],
  [255, 215, 0],
];

/** A 4 × 4 Bayer matrix, for keeping or dropping a cell by its opacity. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

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
  // The first row the band shows in, so a caller can tell when it has climbed to the top.
  let front = -1;
  for (let i = 0; i < alpha.length; i++) {
    const a = data[i * 4 + 3] ?? 0;
    alpha[i] = a;
    data[i * 4 + 3] = 255;
    if (a > 8 && front < 0) front = Math.floor(i / cols);
  }
  if (front < 0) return null;
  ordered(image, { palette: SYNTHWAVE });
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const threshold = ((BAYER4[(y % 4) * 4 + (x % 4)] ?? 0) + 0.5) / 16;
      data[i * 4 + 3] = (alpha[i] ?? 0) / 255 > threshold ? 255 : 0;
    }
  }
  small.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, cols * cell, rows * cell);
  return front / rows;
}

// ---------------------------------------------------------------- develop ambient

const LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const pack = ([r, g, b]: readonly number[]) => (LITTLE ? (255 << 24) | ((b ?? 0) << 16) | ((g ?? 0) << 8) | (r ?? 0) : ((r ?? 0) << 24) | ((g ?? 0) << 16) | ((b ?? 0) << 8) | 255) >>> 0;
const GREY_LUM = Float32Array.from(PHOTO_TONES, ([v]) => v / 255);
const GREY_PACKED = Uint32Array.from(PHOTO_TONES, pack);
const SYNTH_PACKED = Uint32Array.from(SYNTHWAVE, pack);

/** How the ambient moves. Sizes in CSS px. */
export type AmbientLook = {
  /** How far the photo sways, at most. */
  wave: number;
  /** How strongly the synthwave light shows, 0 to 1. */
  light: number;
  /** 1 is the resting pace. */
  speed: number;
};

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
/** CSS px between crests of the light, before the swell bends them. */
const CREST_GAP = 190;

/**
 * The grey photo while Larry works, alive: the capture sweep's light, but on a liquid surface rocking in a tub rather
 * than a band rising. Crests of synthwave light, gold at the front falling through pink to indigo as glimm's band
 * does, ride a swell of waves crossing at different angles and speeds, while the whole surface tilts back and forth
 * and bobs. The light comes and goes in patches, and the photo bends under the surface's slope as if seen through
 * water. Everything is ordered dither at the photo's grain, so the cells crawl as it moves. `amount` (0 to 1) eases
 * the whole effect in. `out` is sized to the field's cells and shown pixelated.
 */
export function drawAmbient(out: HTMLCanvasElement, field: GreyField, look: AmbientLook, seconds: number, amount: number) {
  const { cols, rows, lum, cell, dpr } = field;
  if (out.width !== cols || out.height !== rows) {
    out.width = cols;
    out.height = rows;
  }
  const ctx = out.getContext("2d");
  if (!ctx) return;
  const image = ctx.createImageData(cols, rows);
  const px = new Uint32Array(image.data.buffer);
  const size = cell / dpr; // CSS px per cell
  const t = seconds * look.speed;
  const bend = (look.wave * amount) / size; // cells of displacement per unit of slope
  const light = look.light * amount;
  const last = GREY_LUM.length - 1;
  const n = SWELL.length;

  // Each wave is sin(kx·x + ky·y − w·t + p), split into a column part and a row part so the cell loop only multiplies.
  const colSin = new Float32Array(n * cols);
  const colCos = new Float32Array(n * cols);
  const rowSin = new Float32Array(n * rows);
  const rowCos = new Float32Array(n * rows);
  for (let k = 0; k < n; k++) {
    const wave = SWELL[k];
    if (!wave) continue;
    for (let x = 0; x < cols; x++) {
      const v = (wave.kx * x * size) / 100;
      colSin[k * cols + x] = Math.sin(v);
      colCos[k * cols + x] = Math.cos(v);
    }
    for (let y = 0; y < rows; y++) {
      const v = (wave.ky * y * size) / 100 - wave.w * t + wave.p;
      rowSin[k * rows + y] = Math.sin(v);
      rowCos[k * rows + y] = Math.cos(v);
    }
  }
  // The tub rocks: the surface tilts one way and back, and bobs, on slow periods that don't line up.
  const tilt = 0.55 * Math.sin(t * 0.42) + 0.2 * Math.sin(t * 0.17 + 2);
  const bob = 0.3 * Math.sin(t * 0.29 + 1) + 0.12 * Math.sin(t * 0.71);
  const mid = cols / 2;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // The swell's height here, and its slope across and down.
      let h = 0;
      let sx = 0;
      let sy = 0;
      for (let k = 0; k < n; k++) {
        const wave = SWELL[k];
        if (!wave) continue;
        const cs = colSin[k * cols + x] ?? 0;
        const cc = colCos[k * cols + x] ?? 0;
        const rs = rowSin[k * rows + y] ?? 0;
        const rc = rowCos[k * rows + y] ?? 0;
        // sin(a + b) and cos(a + b) from the column's a and the row's b.
        const sin = cs * rc + cc * rs;
        const cos = cc * rc - cs * rs;
        h += wave.a * sin;
        sx += wave.a * wave.kx * cos;
        sy += wave.a * wave.ky * cos;
      }
      const along = (y * size) / CREST_GAP + h + (tilt * (x - mid) * size) / 200 + bob;
      const phase = along - Math.floor(along);
      // The crest: sharp at its front, a tail behind, as the band is.
      const crest = phase < 0.06 ? phase / 0.06 : (1 - phase) ** 3;
      // Patches: the light gathers where the swell runs high and thins where it runs low.
      const patch = Math.min(1, Math.max(0, 0.55 + h * 0.9));
      const i = y * cols + x;
      const threshold = ((BAYER4[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;

      const a = crest * patch * light;
      if (a > threshold) {
        const k = Math.min(SYNTH_PACKED.length - 1, Math.floor((1 - phase) * (SYNTH_PACKED.length - 1) + threshold));
        px[i] = SYNTH_PACKED[k] ?? 0;
        continue;
      }
      // Otherwise the photo, seen through the surface: bent by its slope, a touch brighter under a crest.
      const gx = Math.min(cols - 1, Math.max(0, Math.round(x + sx * bend)));
      const gy = Math.min(rows - 1, Math.max(0, Math.round(y + sy * bend)));
      const g = Math.min(1, Math.max(0, (lum[gy * cols + gx] ?? 0) + crest * patch * light * 0.15));
      let s = 0;
      while (s < last && g > (GREY_LUM[s + 1] ?? 1)) s++;
      const lo = GREY_LUM[s] ?? 0;
      const hi = GREY_LUM[Math.min(last, s + 1)] ?? 1;
      const f = hi > lo ? (g - lo) / (hi - lo) : 0;
      px[i] = GREY_PACKED[f > threshold ? Math.min(last, s + 1) : s] ?? 0;
    }
  }
  ctx.putImageData(image, 0, 0);
}
