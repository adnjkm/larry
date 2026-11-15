type Size = { width: number; height: number };

type PhotoFit = "cover" | "contain";

/** Portrait photos fill the viewfinder; landscape ones sit inside it over a blurred copy, the way the feed shows them. */
export function fitFor(image: Size, box: Size): PhotoFit {
  return Math.abs(image.width / image.height - box.width / box.height) < 0.25 ? "cover" : "contain";
}

function rectFor(fit: PhotoFit, iw: number, ih: number, w: number, h: number) {
  const scale = fit === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  return { x: (w - iw * scale) / 2, y: (h - ih * scale) / 2, w: iw * scale, h: ih * scale };
}

/** How the viewfinder frames the photo: its zoom about the centre, and the fake angle a shot moves it to. */
export type Framing = { zoom: number; flip: boolean; scale: number; shiftY: number };

/** The camera is a still photo; each shot after the first fakes a new angle on it. */
export const ANGLES: readonly Omit<Framing, "zoom">[] = [
  { flip: false, scale: 1, shiftY: 0 },
  { flip: true, scale: 1, shiftY: 0 },
  { flip: false, scale: 1.12, shiftY: 0.03 },
];

export const angleCss = ({ flip, scale, shiftY }: Omit<Framing, "zoom">) =>
  flip ? "scaleX(-1)" : scale !== 1 || shiftY ? `scale(${scale}) translateY(${shiftY * 100}%)` : "none";

/**
 * The photo as the viewfinder shows it, drawn over a `w` x `h` box: cover or contain (over a blurred, darkened copy),
 * zoomed and angled. `backdrop` is the blur in this box's px.
 */
export function drawPhoto(ctx: CanvasRenderingContext2D, image: HTMLImageElement, w: number, h: number, framing: Framing, backdrop: number) {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(framing.zoom, framing.zoom);
  ctx.scale(framing.flip ? -framing.scale : framing.scale, framing.scale);
  ctx.translate(-w / 2, -h / 2 + framing.shiftY * h);
  const fit = fitFor({ width: iw, height: ih }, { width: w, height: h });
  if (fit === "contain") {
    const back = rectFor("cover", iw, ih, w, h);
    ctx.filter = `blur(${Math.max(1, backdrop)}px) brightness(0.55)`;
    ctx.drawImage(image, back.x, back.y, back.w, back.h);
    ctx.filter = "none";
  }
  const r = rectFor(fit, iw, ih, w, h);
  ctx.drawImage(image, r.x, r.y, r.w, r.h);
  ctx.restore();
}

/** A photo in grey, one value per dither cell, 0 to 1. `cell` is in device px at `dpr`. */
export type GreyField = { cols: number; rows: number; dpr: number; cell: number; lum: Float32Array };

/**
 * The viewfinder's photo in grey at the dither's grain, framed as the viewfinder frames it, and stretched to its own
 * range so a dark object on a mid-tone wall still separates.
 */
export function greyField(image: HTMLImageElement, box: Size, cellCss: number, framing: Framing): GreyField | null {
  // The phone is drawn small, so this stops at 2x: more cells would cost frames, not detail.
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cell = Math.max(2, Math.round(cellCss * dpr));
  const cols = Math.ceil((box.width * dpr) / cell);
  const rows = Math.ceil((box.height * dpr) / cell);
  const scratch = document.createElement("canvas");
  scratch.width = cols;
  scratch.height = rows;
  const small = scratch.getContext("2d", { willReadFrequently: true });
  if (!small) return null;
  // The cells run a little past the box when it isn't a whole number of them; the photo is laid out over the box.
  drawPhoto(small, image, (box.width * dpr) / cell, (box.height * dpr) / cell, framing, (16 * dpr) / cell);
  const px = small.getImageData(0, 0, cols, rows).data;
  const count = cols * rows;
  const lum = new Float32Array(count);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < count; i++) {
    const v = 0.2126 * px[i * 4]! + 0.7152 * px[i * 4 + 1]! + 0.0722 * px[i * 4 + 2]!;
    lum[i] = v;
    histogram[Math.min(255, Math.round(v))]!++;
  }
  const low = percentile(histogram, count * 0.04);
  const high = percentile(histogram, count * 0.98);
  const range = Math.max(12, high - low);
  for (let i = 0; i < count; i++) lum[i] = Math.min(1, Math.max(0, (lum[i]! - low) / range));
  return { cols, rows, dpr, cell, lum };
}

function percentile(histogram: Uint32Array, rank: number) {
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v]!;
    if (seen > rank) return v;
  }
  return 255;
}
