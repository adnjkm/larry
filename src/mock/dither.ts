import { dither, hex, type Method, ordered } from "ditherdance";

/*
 * ditherdance does the dithering itself. This file only decides what gets dithered:
 * the photo in the viewfinder, a scan bar, and a glow that hugs the viewfinder's edges.
 */

export type PhotoFit = "cover" | "contain";
export type DitherMethod = Extract<Method, "bayer" | "atkinson" | "floyd-steinberg">;

/** Portrait photos fill the viewfinder; landscape ones sit inside it over a blurred copy, the way the feed shows them. */
export function fitFor(image: { width: number; height: number }, box: { width: number; height: number }): PhotoFit {
  return Math.abs(image.width / image.height - box.width / box.height) < 0.25 ? "cover" : "contain";
}

function rectFor(fit: PhotoFit, iw: number, ih: number, w: number, h: number) {
  const scale = fit === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  return { x: (w - iw * scale) / 2, y: (h - ih * scale) / 2, w: iw * scale, h: ih * scale };
}

const photoScratch = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

/**
 * The viewfinder's photo in grey, dithered the way the rest of the screen is: one cell per `cellCss` CSS px at the
 * device's resolution, in the surfaces' greys (the wheel's four plus white), so it reads as the same material as the
 * wheel and the shutter rather than a two-colour print. `zoom` matches the viewfinder's zoom, about the centre.
 * `bias` brightens or darkens before dithering.
 */
export function ditherPhoto(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  box: { width: number; height: number },
  cellCss: number,
  { method = "bayer", bias = 0, zoom = 1 }: { method?: DitherMethod; bias?: number; zoom?: number } = {},
) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const W = Math.round(box.width * dpr);
  const H = Math.round(box.height * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cell = Math.max(2, Math.round(cellCss * dpr));
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);
  let scratch = photoScratch.get(canvas);
  if (!scratch) {
    scratch = document.createElement("canvas");
    photoScratch.set(canvas, scratch);
  }
  scratch.width = cols;
  scratch.height = rows;
  const small = scratch.getContext("2d", { willReadFrequently: true });
  if (!small) return;
  // The cells cover a little more than the box when it isn't a whole number of cells; the photo is laid out over the box.
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
  if (method === "bayer") ordered(data, { palette: PHOTO_TONES });
  else dither(data, { method, palette: PHOTO_TONES });
  small.putImageData(data, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(scratch, 0, 0, cols * cell, rows * cell);
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

// ---------------------------------------------------------------- develop light

/** One ring of the develop wave: how far out its leading edge is, how thick it is, both in CSS px, and how strong, 0 to 1. */
export type Ring = { radius: number; band: number; strength: number };

/** How far a ring's edge wanders in and out with noise, in CSS px, and how many steps round it's worked out at. */
const WOBBLE = 7;
const WOBBLE_STEPS = 360;

/**
 * The light of the develop wave over the photo, as synthwave dither: rings travelling out from `origin` across a
 * `width` x `height` box with `radius` corners. Each ring is gold at its leading edge, falling through coral and pink
 * to indigo behind, its edge wobbling a little with noise, like glimm's band bent into a circle.
 */
export function drawDevelopLight(
  out: HTMLCanvasElement,
  width: number,
  height: number,
  radius: number,
  origin: [number, number],
  rings: readonly Ring[],
  cellCss: number,
  seconds: number,
  scratch: HTMLCanvasElement,
) {
  // The phone is drawn small, so this stops at 2x: a third more cells would cost frames, not detail.
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(width * dpr);
  const H = Math.round(height * dpr);
  if (out.width !== W || out.height !== H) {
    out.width = W;
    out.height = H;
  }
  const ctx = out.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  if (rings.every((r) => r.strength <= 0)) return;
  const cell = Math.max(1, Math.round(cellCss * dpr));
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);
  if (scratch.width !== cols || scratch.height !== rows) {
    scratch.width = cols;
    scratch.height = rows;
  }
  const small = scratch.getContext("2d", { willReadFrequently: true });
  if (!small) return;
  const image = small.createImageData(cols, rows);
  const { data } = image;
  const size = cell / dpr;
  // The wobble depends only on the angle around the origin, so it's worked out once per frame for each step round.
  const wobble = new Float32Array(WOBBLE_STEPS);
  for (let i = 0; i < WOBBLE_STEPS; i++) wobble[i] = (valueNoise(((i / WOBBLE_STEPS) * 2 * Math.PI - Math.PI) * 4 + 20, seconds * 0.6) - 0.5) * 2 * WOBBLE;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = (x + 0.5) * size;
      const py = (y + 0.5) * size;
      if (insetDistance(px, py, width, height, radius) < -size * 0.5) continue;
      const dx = px - origin[0];
      const dy = py - origin[1];
      const plain = Math.hypot(dx, dy);
      // Most cells are nowhere near a ring and have nothing to draw.
      let nearRing = false;
      for (const ring of rings) if (ring.strength > 0 && plain > ring.radius - ring.band - WOBBLE && plain < ring.radius + WOBBLE) nearRing = true;
      if (!nearRing) continue;
      const d = plain + (wobble[Math.round(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * WOBBLE_STEPS) % WOBBLE_STEPS] ?? 0);
      let a = 0;
      let tone = 0.5;
      for (const ring of rings) {
        if (ring.strength <= 0) continue;
        // 0 at the leading edge, 1 at the back of the band.
        const k = (ring.radius - d) / ring.band;
        if (k < 0 || k > 1) continue;
        // A crisp leading edge, then a long soft tail, as glimm's band has.
        const shape = k < 0.1 ? k / 0.1 : (1 - k) ** 1.4;
        const v = shape * ring.strength;
        if (v > a) {
          a = v;
          tone = 1 - k;
        }
      }
      // Ordered dither done here rather than by ditherdance: the cell's place along the palette is already known, so
      // the threshold picks between the two stops either side of it, and keeps or drops the cell by its strength.
      const threshold = ((BAYER4[(y % 4) * 4 + (x % 4)] ?? 0) + 0.5) / 16;
      if (a <= threshold) continue;
      const stop = SYNTHWAVE[Math.min(SYNTHWAVE.length - 1, Math.floor(tone * (SYNTHWAVE.length - 1) + threshold))] ?? [0, 0, 0];
      const i = (y * cols + x) * 4;
      data[i] = stop[0];
      data[i + 1] = stop[1];
      data[i + 2] = stop[2];
      data[i + 3] = 255;
    }
  }
  small.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, cols * cell, rows * cell);
}
