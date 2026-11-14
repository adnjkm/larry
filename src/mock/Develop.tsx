import { useEffect, useRef } from "react";
import { type DitherMethod, ditherPhoto, drawDevelopLight, type Ring } from "./dither.ts";

/** How the develop wave looks. Times in ms, sizes in CSS px. */
export type DevelopLook = {
  /** The first ring's run out to the frame's far corner. */
  waveMs: number;
  /** Time between the faint rings that follow while Larry works. */
  pulseMs: number;
};

type DevelopOptions = {
  /** Starts the wave when it turns true; everything clears when it turns false. */
  active: boolean;
  photo: string;
  box: { width: number; height: number };
  /** The frame's corner radius, so the light stays inside it. */
  radius: number;
  /** The viewfinder's zoom when the wave started, so the grey photo lines up with the colour one. */
  zoom: number;
  /** Dither cell size in CSS px for the photo and for the light. */
  grain: number;
  lightGrain: number;
  method: DitherMethod;
  /** Where the rings start, in CSS px from the frame's top left. Below the frame is the shutter. */
  origin: [number, number];
  look: DevelopLook;
  /** Runs once, when the first ring has reached the top of the frame. */
  onTop?: () => void;
};

/** One wave runs out from the shutter, then fainter rings follow it every `pulseMs`, each this much longer than the gap, so two overlap. */
const PULSE_LIFE = 1.8;
const PULSE_STRENGTH = 0.4;
/** The light redraws at this rate: it's dither, and the cells read as steady at 30. */
const FRAME_MS = 1000 / 30;
/** The glow copies the frame at this fraction of its size; it is blurred anyway, so more would only cost. */
const GLOW_SCALE = 1 / 8;

/**
 * The move from photo to model, on the camera screen. A ring of synthwave dither runs out from the shutter across
 * the frame, and behind it the photo turns into grey dither; then fainter rings keep coming while Larry works.
 *
 * The frame also glows like a lit screen: `glow` is a tiny copy of whatever the frame shows (the photo, the grey
 * photo inside the ring, the ring's light), redrawn each frame. Put it behind the frame at the frame's size and blur
 * it, and the colours at each part of the frame spill past its edge there.
 *
 * Returns refs for three canvases: `photo` then `light` over the photo, inside the frame; `glow` behind the frame.
 */
export function useDevelop(options: DevelopOptions) {
  const photo = useRef<HTMLCanvasElement>(null);
  const light = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!options.active) return;
    const photoEl = photo.current;
    const lightEl = light.current;
    const glowEl = glow.current;
    if (!photoEl || !lightEl || !glowEl) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scratch = document.createElement("canvas");
    const start = performance.now();
    let raf = 0;
    let last = -Infinity;
    let cancelled = false;
    let decoded = false;
    let topped = false;

    const { box, grain, method, zoom } = latest.current;
    const image = new Image();
    image.src = latest.current.photo;
    void image.decode().then(() => {
      if (cancelled) return;
      ditherPhoto(photoEl, image, box, grain, { method, zoom });
      decoded = true;
    });

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS) return;
      last = now;
      const o = latest.current;
      const { width, height } = o.box;
      const [ox, oy] = o.origin;
      // Far enough that a ring's tail has cleared the farthest corner.
      const corner = Math.max(...[[0, 0], [width, 0], [0, height], [width, height]].map(([x = 0, y = 0]) => Math.hypot(x - ox, y - oy)));
      const band = corner * 0.3;
      const reach = corner + band;
      const t = reduced ? o.look.waveMs : now - start;
      const rings: Ring[] = [];

      const k = Math.min(1, t / o.look.waveMs);
      // Fast off the shutter and easing out, as glimm's band does.
      const wave = 1 - (1 - k) ** 3;
      if (k < 1) rings.push({ radius: wave * reach, band, strength: 1 - k ** 4 });
      // The top edge is nearest the origin straight above it, so that's where the ring first reaches it.
      if (!topped && (wave * reach >= oy || k >= 1)) {
        topped = true;
        o.onTop?.();
      }
      // The grey photo is revealed a little behind the ring's leading edge, under its brightest part.
      photoEl.style.clipPath = k < 1 ? `circle(${Math.max(0, wave * reach - band * 0.25)}px at ${ox}px ${oy}px)` : "none";

      const pulseLife = o.look.pulseMs * PULSE_LIFE;
      for (let n = 0; ; n++) {
        const age = t - (o.look.waveMs * 0.75 + n * o.look.pulseMs);
        if (age < 0) break;
        if (age > pulseLife) continue;
        const p = age / pulseLife;
        rings.push({ radius: Math.sqrt(p) * reach, band: band * 0.7, strength: PULSE_STRENGTH * (1 - p) ** 1.2 });
      }
      drawDevelopLight(lightEl, width, height, o.radius, o.origin, rings, o.lightGrain, reduced ? 0 : t / 1000, scratch);

      // The glow: the frame as it looks now, in miniature.
      const gw = Math.max(1, Math.round(width * GLOW_SCALE));
      const gh = Math.max(1, Math.round(height * GLOW_SCALE));
      if (glowEl.width !== gw || glowEl.height !== gh) {
        glowEl.width = gw;
        glowEl.height = gh;
      }
      const g = glowEl.getContext("2d");
      if (g) {
        g.clearRect(0, 0, gw, gh);
        if (decoded) {
          // The colour photo as the viewfinder shows it, filling the frame at its zoom.
          const fill = Math.max(gw / image.naturalWidth, gh / image.naturalHeight) * o.zoom;
          const iw = image.naturalWidth * fill;
          const ih = image.naturalHeight * fill;
          g.drawImage(image, (gw - iw) / 2, (gh - ih) / 2, iw, ih);
          // The grey photo over it, inside the ring while the wave runs and everywhere once it has passed.
          g.save();
          if (k < 1) {
            g.beginPath();
            g.arc(ox * GLOW_SCALE, oy * GLOW_SCALE, Math.max(0, wave * reach - band * 0.25) * GLOW_SCALE, 0, 2 * Math.PI);
            g.clip();
          }
          g.drawImage(photoEl, 0, 0, gw, gh);
          g.restore();
        }
        g.drawImage(lightEl, 0, 0, gw, gh);
      }
      if (reduced) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      photoEl.style.clipPath = "circle(0px at 0px 0px)";
      for (const el of [photoEl, lightEl, glowEl]) el.getContext("2d")?.clearRect(0, 0, el.width, el.height);
    };
  }, [options.active]);

  return { photo, light, glow };
}
