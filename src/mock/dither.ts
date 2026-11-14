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

/**
 * Draws the photo as it sits in a `box`-sized viewfinder, one canvas pixel per `pixel` CSS pixels,
 * and dithers it to two colours. `bias` brightens or darkens before dithering.
 */
export function ditherPhoto(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  box: { width: number; height: number },
  pixel: number,
  { method = "bayer", bias = 0, dark = "#232323", light = "#ffffff" }: { method?: DitherMethod; bias?: number; dark?: string; light?: string } = {},
) {
  const cols = Math.ceil(box.width / pixel);
  const rows = Math.ceil(box.height / pixel);
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const fit = fitFor({ width: image.naturalWidth, height: image.naturalHeight }, box);
  ctx.clearRect(0, 0, cols, rows);
  if (fit === "contain") {
    const back = rectFor("cover", image.naturalWidth, image.naturalHeight, cols, rows);
    ctx.filter = `blur(${Math.max(1, 16 / pixel)}px) brightness(0.55)`;
    ctx.drawImage(image, back.x, back.y, back.w, back.h);
    ctx.filter = "none";
  }
  const r = rectFor(fit, image.naturalWidth, image.naturalHeight, cols, rows);
  ctx.drawImage(image, r.x, r.y, r.w, r.h);

  const data = ctx.getImageData(0, 0, cols, rows);
  stretchToGray(data.data, bias);
  dither(data, { method, palette: [hex(dark), hex(light)] });
  ctx.putImageData(data, 0, 0);
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

/** A scan bar `rows` tall whose pixels thin out upward from a solid leading edge at the bottom. */
export function drawScanBand(canvas: HTMLCanvasElement, cols: number, rows: number, color: string) {
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const data = ctx.createImageData(cols, rows);
  for (let y = 0; y < rows; y++) {
    const v = ((y + 1) / rows) ** 1.6 * 255;
    for (let x = 0; x < cols; x++) data.data.set([v, v, v, 255], (y * cols + x) * 4);
  }
  ordered(data, { palette: [[0, 0, 0], hex(color)] });
  clearBlack(data.data);
  ctx.putImageData(data, 0, 0);
}

function clearBlack(px: Uint8ClampedArray) {
  for (let i = 0; i < px.length; i += 4) if (px[i] === 0 && px[i + 1] === 0 && px[i + 2] === 0) px[i + 3] = 0;
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

// ---------------------------------------------------------------- dithered disc

/**
 * A white disc built from dither cells, so knobs and the shutter face match the dithered bars: its edge is pixelated
 * at the dither's grain rather than a smooth circle, and grey cells gather toward the rim and the lower right, as if
 * lit from the upper left, drifting slowly with noise. `strength` scales the shading; the pixelated edge stays.
 */
export function drawDitherDisc(canvas: HTMLCanvasElement, size: number, cellCss: number, strength: number, seconds: number) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const S = Math.round(size * dpr);
  if (canvas.width !== S || canvas.height !== S) {
    canvas.width = S;
    canvas.height = S;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, S, S);

  const cell = Math.max(2, Math.round(cellCss * dpr));
  const n = Math.ceil(S / cell);
  // The grid is centred so the disc's pixelated edge is symmetric.
  const start = (S - n * cell) / 2;
  const R = S / 2;
  const coverage = new ImageData(n, n);
  const shade = new ImageData(n, n);
  const scale = cell / dpr;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cx = start + (x + 0.5) * cell - R;
      const cy = start + (y + 0.5) * cell - R;
      const dist = Math.hypot(cx, cy);
      // How much of this cell the circle covers, roughly: 1 well inside, 0 well outside.
      const c = Math.max(0, Math.min(1, (R - dist) / cell + 0.5));
      const dx = cx / R;
      const dy = cy / R;
      const d = dist / R;
      const rim = Math.max(0, (d - 0.45) / 0.55) ** 2;
      // Facing away from a light at the upper left.
      const away = Math.max(0, (dx + dy) / Math.SQRT2);
      const noise = valueNoise(x * scale * 0.12 + seconds, y * scale * 0.12 - seconds * 0.5);
      const v = d <= 1 ? (0.55 * rim + 0.35 * away * d + 0.25 * (noise - 0.5)) * strength : 0;
      const cg = Math.round(c * 255);
      const sg = Math.max(0, Math.min(255, Math.round(v * 255)));
      coverage.data.set([cg, cg, cg, 255], (y * n + x) * 4);
      shade.data.set([sg, sg, sg, 255], (y * n + x) * 4);
    }
  }
  ordered(coverage, { palette: [[0, 0, 0], [255, 255, 255]] });
  ordered(shade, { palette: [[0, 0, 0], [255, 255, 255]] });
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      if (coverage.data[i] === 0) continue;
      const px = Math.round(start + x * cell);
      const py = Math.round(start + y * cell);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(px, py, cell, cell);
      if (shade.data[i] !== 0) {
        ctx.fillStyle = "#C9C9C9";
        ctx.fillRect(px, py, cell - 1, cell - 1);
      }
    }
  }
}

// ---------------------------------------------------------------- thumbwheel

/** Dark to light. The dark two sit low so the grooves and rims read as shadow; the pale grey gives the lit faces a step before white. */
const WHEEL_TONES: [number, number, number][] = [
  [26, 26, 26],
  [84, 84, 84],
  [168, 168, 168],
  [240, 240, 240],
];

/**
 * How bright a point on the drum's surface is, by where it sits in one ridge's turn (0 to 1). Each groove is a V:
 * its first wall faces away from the light and its second faces it, and the ridge's edge just past it catches a
 * highlight.
 */
function ridgeProfile(turn: number, groove: number) {
  if (turn < groove * 0.5) return 0.12;
  if (turn < groove) return 0.5;
  if (turn < groove + 0.07) return 1.2;
  return 1;
}

/**
 * A thumbwheel seen from the front: a rounded-rectangle drum with `ridges` grooves round it. Grooves crowd toward the
 * sides as the drum curves away. `angle` turns the drum, in radians. `blur` is how far it turned during the last
 * frame: each groove is averaged over that sweep, so a fast spin smears into a dithered motion blur. The sides shade
 * darker. ditherdance dithers the whole drum to three greys at a little finer than the dither's grain.
 */
export function drawThumbwheel(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  radius: number,
  angle: number,
  blur: number,
  ridges: number,
  /** Thickness of the dark rims along the top and bottom, in CSS px. */
  rim: number,
  cellCss: number,
  seconds: number,
) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const W = Math.round(width * dpr);
  const H = Math.round(height * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // A little finer than the bars' grain: the wheel is small and its ridges are its whole shape.
  const cell = Math.max(2, Math.round(cellCss * dpr * 0.67));
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);
  const field = new ImageData(cols, rows);
  const R = W / 2;
  const samples = blur > 0.02 ? 8 : 1;
  const grooveWidth = 0.34;
  const lip = Math.round((rim * dpr) / cell);

  // Each column's tone doesn't depend on the row, so work it out once per column.
  const columnTone = new Float32Array(cols);
  const columnFacing = new Float32Array(cols);
  for (let x = 0; x < cols; x++) {
    let lit = 0;
    let shade = 0;
    let facingSum = 0;
    for (let sub = 0; sub < 2; sub++) {
      const s = Math.max(-0.999, Math.min(0.999, ((x + 0.25 + sub * 0.5) * cell - R) / R));
      const facing = Math.sqrt(1 - s * s);
      const phi = Math.asin(s);
      shade += 0.3 + 0.7 * facing ** 0.8;
      facingSum += facing;
      for (let k = 0; k < samples; k++) {
        const a = angle - (samples > 1 ? (blur * k) / (samples - 1) : 0);
        const turn = (((phi + a) * ridges) / (Math.PI * 2)) % 1;
        // Averaging the profile over the sweep is what smears a fast spin.
        lit += ridgeProfile((turn + 1) % 1, grooveWidth);
      }
    }
    columnTone[x] = ((shade / 2) * lit) / (2 * samples);
    columnFacing[x] = facingSum / 2;
  }
  for (let y = 0; y < rows; y++) {
    const atLip = y < lip || y >= rows - lip;
    // Where the rims meet the ridges: the rim's inner edge catches light and the ridges just inside sit in its shadow.
    const lipEdge = lip > 0 && (y === lip - 1 || y === rows - lip);
    const underLip = lip > 0 && (y === lip || y === rows - lip - 1);
    for (let x = 0; x < cols; x++) {
      const facing = columnFacing[x] ?? 0;
      // The flat top and bottom rims carry no grooves and sit darker.
      let t = atLip ? (lipEdge ? 0.62 : 0.4) * (0.3 + 0.7 * facing) : Math.min(1, columnTone[x] ?? 0) * (underLip ? 0.6 : 1);
      t += (valueNoise(x * 0.4 + seconds, y * 0.4) - 0.5) * 0.08;
      const g = Math.max(0, Math.min(255, Math.round(t * 255)));
      field.data.set([g, g, g, 255], (y * cols + x) * 4);
    }
  }
  ordered(field, { palette: WHEEL_TONES });

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, radius * dpr);
  ctx.clip();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      ctx.fillStyle = `rgb(${field.data[i]}, ${field.data[i + 1]}, ${field.data[i + 2]})`;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  ctx.restore();
}

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
 * frames. Returns whether any of the band showed.
 */
export function ditherBand(
  out: HTMLCanvasElement,
  source: HTMLCanvasElement,
  width: number,
  height: number,
  bleed: number,
  cellCss: number,
  scratch: HTMLCanvasElement,
): boolean {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const W = Math.round(width * dpr);
  const H = Math.round(height * dpr);
  if (out.width !== W || out.height !== H) {
    out.width = W;
    out.height = H;
  }
  const ctx = out.getContext("2d");
  if (!ctx) return false;
  ctx.clearRect(0, 0, W, H);
  const cell = Math.max(1, Math.round(cellCss * dpr));
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);
  if (scratch.width !== cols || scratch.height !== rows) {
    scratch.width = cols;
    scratch.height = rows;
  }
  const small = scratch.getContext("2d", { willReadFrequently: true });
  if (!small || source.width === 0 || source.height === 0) return false;
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
  let shown = false;
  for (let i = 0; i < alpha.length; i++) {
    const a = data[i * 4 + 3] ?? 0;
    alpha[i] = a;
    data[i * 4 + 3] = 255;
    if (a > 8) shown = true;
  }
  if (!shown) return false;
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
  return true;
}
