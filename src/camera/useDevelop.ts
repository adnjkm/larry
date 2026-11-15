import { useEffect, useLayoutEffect, useRef } from "react";
import { raster } from "../surface/dither.ts";
import { animate } from "../surface/ticker.ts";
import { drawSwell, type SweepFrame, type Swell, swellFor } from "./light.ts";
import type { DevelopLook } from "./look.ts";
import { drawPhoto, type Framing, greyField } from "./photo.ts";
import { reducedMotion } from "../motion.ts";

/** The sweep as it stands this frame, for the glow: the band and where it is, or null between sweeps. */
type SweepNow = { frame: SweepFrame | null; band: HTMLCanvasElement | null };

type DevelopOptions = {
  /** How the viewfinder framed the photo at the last shot; null until then. The swell draws while it is set. */
  framing: Framing | null;
  photo: string;
  box: { width: number; height: number };
  /** Dither cell size in CSS px. */
  grain: number;
  look: DevelopLook;
  /** The sweep that unveils the grey photo starts with the last shot; the swell eases in this long after it. */
  settleMs: number;
  sweep: () => SweepNow;
};

/** The swell redraws at this rate: it's dither, and the cells read as steady at 30. */
const FPS = 30;
const EASE_IN_MS = 1400;
/** The glow copies the frame at this fraction of its size; it is blurred anyway, so more would only cost. */
const GLOW_SCALE = 1 / 8;
/** The glow's canvas reaches this many blur radii past the frame, so the blur spills past its edge. */
const GLOW_SPILL = 2;

/** CSS px the glow canvas reaches past the frame on every side. */
export const glowPad = (reach: number) => Math.ceil(reach * GLOW_SPILL * GLOW_SCALE) / GLOW_SCALE;

/**
 * The photo after the last shot: the sweep unveils it in grey dither, and then it stays alive while Larry works, the
 * sweep's synthwave light on a rocking liquid surface over it (see drawSwell).
 *
 * The frame also glows like a lit screen: `glow` is a tiny copy of whatever the frame shows, blurred, behind the frame
 * and reaching `glowPad` past it, so the colours at each part of the frame spill past its edge there.
 */
export function useDevelop(options: DevelopOptions) {
  const grey = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);
  const latest = useRef(options);
  latest.current = options;

  // Decoded ahead, so the grey photo can be drawn the moment the last shot is taken.
  const image = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.src = options.photo;
    let live = true;
    void img.decode().then(
      () => live && (image.current = img),
      () => {},
    );
    return () => {
      live = false;
      image.current = null;
    };
  }, [options.photo]);

  const active = options.framing !== null;
  useLayoutEffect(() => {
    const greyEl = grey.current;
    const glowEl = glow.current;
    if (!active || !greyEl || !glowEl) return;
    const still = reducedMotion.matches;
    const start = performance.now();
    const scene = document.createElement("canvas");
    let swell: Swell | null = null;
    let drawnStill = false;

    const draw = (now: number) => {
      const o = latest.current;
      const img = image.current;
      if (!o.framing || !img) return;
      if (!swell) {
        const field = greyField(img, o.box, o.grain, o.framing);
        if (!field) return;
        swell = swellFor(field);
        const size = field.cell / field.dpr;
        greyEl.style.width = `${field.cols * size}px`;
        greyEl.style.height = `${field.rows * size}px`;
      }
      const { field } = swell;
      const r = raster(greyEl, field.cols, field.rows);
      if (!r) return;
      const k = still ? 0 : Math.min(1, Math.max(0, (now - start - o.settleMs) / EASE_IN_MS));
      // Until it eases in, the swell is the still grey photo: drawn once.
      if (k > 0 || !drawnStill) drawSwell(r, swell, o.look, (now - start) / 1000, k * k * (3 - 2 * k));
      drawnStill = true;
      drawGlow(glowEl, scene, img, greyEl, field.cols * (field.cell / field.dpr), o, o.framing);
    };
    // Now, before paint, so the grey photo is there as the sweep starts to unveil it.
    draw(start);
    const stop = still ? () => {} : animate(FPS, draw, greyEl);
    return () => {
      stop();
      for (const el of [greyEl, glowEl]) el.getContext("2d")?.clearRect(0, 0, el.width, el.height);
    };
  }, [active]);

  return { grey, glow };
}

/** The frame in miniature, blurred: while the sweep runs, the colour photo ahead of it, the grey behind, the band over both. */
function drawGlow(
  glowEl: HTMLCanvasElement,
  scene: HTMLCanvasElement,
  img: HTMLImageElement,
  greyEl: HTMLCanvasElement,
  greyWidth: number,
  o: DevelopOptions,
  framing: Framing,
) {
  const { width, height } = o.box;
  const gw = Math.max(1, Math.round(width * GLOW_SCALE));
  const gh = Math.max(1, Math.round(height * GLOW_SCALE));
  const pad = glowPad(o.look.reach) * GLOW_SCALE;
  if (scene.width !== gw || scene.height !== gh) {
    scene.width = gw;
    scene.height = gh;
  }
  if (glowEl.width !== gw + 2 * pad || glowEl.height !== gh + 2 * pad) {
    glowEl.width = gw + 2 * pad;
    glowEl.height = gh + 2 * pad;
  }
  const s = scene.getContext("2d");
  const g = glowEl.getContext("2d");
  if (!s || !g) return;
  s.clearRect(0, 0, gw, gh);
  // The grey canvas runs a little past the frame, a whole number of cells.
  const k = (greyWidth / width) * gw;
  const ky = (k / greyEl.width) * greyEl.height;
  const { frame, band } = o.sweep();
  if (frame) {
    drawPhoto(s, img, gw, gh, framing, 2);
    const top = Math.max(0, Math.min(1, 1 - frame.front)) * gh;
    s.save();
    s.beginPath();
    s.rect(0, top, gw, gh - top);
    s.clip();
    s.drawImage(greyEl, 0, 0, k, ky);
    s.restore();
    if (band) s.drawImage(band, 0, 0, gw, gh);
  } else {
    s.drawImage(greyEl, 0, 0, k, ky);
  }
  g.clearRect(0, 0, glowEl.width, glowEl.height);
  g.filter = `blur(${o.look.reach * GLOW_SCALE}px)`;
  g.drawImage(scene, pad, pad);
  g.filter = "none";
}
