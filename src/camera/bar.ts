import { hexRgb, pack, type Raster, threshold, valueNoise } from "../surface/dither.ts";
import { colors } from "../tokens.stylex.ts";
import { ACCENT } from "./look.ts";

/*
 * A rounded bar filled from the left, after clove.kshv.me's storage bar. The empty track is dark grey with a quiet
 * grey dither and a hairline. The filled part is a translucent accent tint with accent dither that gathers at its
 * edges and drifts, outlined and split at its dividers by a thin neon stroke, with a glow round it.
 *
 * Two canvases: the frame (glow, track, tint), redrawn only when the fill moves, and the cells over it, redrawn as
 * the dither drifts. Both are at device resolution: each lit cell is a square with a one-pixel gap, which is the
 * texture, and the strokes are hairlines.
 */

export type Bar = {
  width: number;
  height: number;
  radius: number;
  /** CSS px per dither cell. */
  cell: number;
  /** Where to split the fill, as fractions of the width. Only drawn inside the filled part. */
  dividers: readonly number[];
  /** How far the glow spreads past the filled part, in CSS px. 0 draws no glow. */
  glow: number;
  /** Strength of the grey dither on the empty track, 0 to 1. */
  idle: number;
};

const [AR, AG, AB] = hexRgb(ACCENT);
const accent = (alpha: number) => `rgba(${AR}, ${AG}, ${AB}, ${alpha})`;

export const barDpr = () => Math.min(3, window.devicePixelRatio || 1);

function filledShape(ctx: CanvasRenderingContext2D, bar: Bar, filled: number, inset: number) {
  const w = Math.max(2, filled);
  const cap = Math.min(bar.radius, w / 2);
  const end = Math.min(3, cap);
  ctx.beginPath();
  ctx.roundRect(inset, inset, w - 2 * inset, bar.height - 2 * inset, filled >= bar.width - 1 ? bar.radius : [cap, end, end, cap]);
}

/** The frame canvas is `bar.glow` CSS px larger than the bar on every side. `opacity` fades the fill, for a switch. */
export function drawBarFrame(canvas: HTMLCanvasElement, bar: Bar, fill: number, opacity: number) {
  const { width, height, radius, glow: pad } = bar;
  const dpr = barDpr();
  const W = Math.round((width + 2 * pad) * dpr);
  const H = Math.round((height + 2 * pad) * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(dpr, 0, 0, dpr, pad * dpr, pad * dpr);
  const filled = Math.max(0, Math.min(1, fill)) * width;
  const visible = filled >= 0.5 && opacity > 0.01;

  // Its solid fill is painted over by the track next, leaving only the glow.
  if (visible && pad > 0) {
    ctx.save();
    ctx.shadowColor = accent(0.45 * opacity);
    ctx.shadowBlur = pad * dpr;
    ctx.fillStyle = accent(1);
    filledShape(ctx, bar, filled, 0);
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, radius);
  ctx.fillStyle = colors.ink;
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.stroke();
  if (!visible) return;

  ctx.save();
  ctx.clip();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = colors.ink;
  ctx.fillRect(0, 0, filled, height);
  ctx.fillStyle = accent(0.18);
  ctx.fillRect(0, 0, filled, height);
  ctx.restore();
}

/**
 * The dithered cells, at device resolution, into `r` (sized to the bar). Lit cells gather at their strip's edges and
 * drift with noise; the filled part's lean toward white at its edges, like light catching a rim. Then the fill's
 * outline and dividers on top: a faint halo under a 1px bright core.
 */
export function drawBarCells(r: Raster, bar: Bar, fill: number, opacity: number, seconds: number) {
  const dpr = barDpr();
  const { px, cols: W, rows: H } = r;
  px.fill(0);
  const cell = Math.max(2, Math.round(bar.cell * dpr));
  const lit = cell - 1;
  const filled = Math.max(0, Math.min(1, fill)) * bar.width;
  const fillW = filled >= 0.5 && opacity > 0.01 ? Math.round(filled * dpr) : 0;
  const reach = Math.max(cell, H * 0.22);
  const scale = cell / dpr;
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);
  const idleAlpha = 1 - opacity;
  for (let y = 0; y < rows; y++) {
    const cy = (y + 0.5) * cell;
    const ny = y * scale;
    for (let x = 0; x < cols; x++) {
      const cx = (x + 0.5) * cell;
      const nx = x * scale;
      const th = threshold(x, y);
      let color = 0;
      if (x * cell < fillW) {
        const e = Math.exp(-Math.max(0, Math.min(cy, H - cy, cx, fillW - cx)) / reach);
        const n = valueNoise(nx * 0.09 - seconds, ny * 0.15 + seconds * 0.4) * 0.65 + valueNoise(nx * 0.22 + seconds * 1.3, ny * 0.3) * 0.35;
        if (0.04 + 0.8 * e + 0.45 * (n - 0.45) > th) {
          const k = 0.35 * e;
          color = pack(AR + (255 - AR) * k, AG + (255 - AG) * k, AB + (255 - AB) * k, 242 * opacity);
        }
      }
      if (!color && bar.idle > 0 && (x * cell >= fillW || idleAlpha > 0.5)) {
        const e = Math.exp(-Math.max(0, Math.min(cy, H - cy, cx, W - cx)) / reach);
        const t = seconds * 0.5;
        const n = valueNoise(nx * 0.09 - t, ny * 0.15 + t * 0.4) * 0.65 + valueNoise(nx * 0.22 + t * 1.3, ny * 0.3) * 0.35;
        if ((0.04 + 0.8 * e + 0.45 * (n - 0.45)) * bar.idle > th) color = pack(255, 255, 255, (0.1 + 0.18 * e) * 255 * (x * cell < fillW ? idleAlpha : 1));
      }
      if (!color) continue;
      const x0 = x * cell;
      const y0 = y * cell;
      const x1 = Math.min(W, x0 + lit);
      const y1 = Math.min(H, y0 + lit);
      for (let yy = y0; yy < y1; yy++) px.fill(color, yy * W + x0, yy * W + x1);
    }
  }
  r.ctx.putImageData(r.image, 0, 0);
  if (!fillW) return;

  const ctx = r.ctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = opacity;
  const cuts = bar.dividers.map((at) => at * bar.width).filter((x) => x < filled - 2);
  for (const [lineWidth, alpha] of [
    [2.5, 0.2],
    [1, 0.95],
  ] as const) {
    ctx.strokeStyle = accent(alpha);
    ctx.lineWidth = lineWidth;
    filledShape(ctx, bar, filled, 0.5);
    for (const x of cuts) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, bar.height);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
