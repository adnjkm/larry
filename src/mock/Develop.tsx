import { useEffect, useLayoutEffect, useRef } from "react";
import { type AmbientLook, drawAmbient, type GreyField, greyField } from "./dither.ts";

/** How the grey photo moves while Larry works. */
export type DevelopLook = AmbientLook & {
  /** How long after the last shot the ambient starts easing in, in ms. It eases in while the band is still climbing, so the photo is already moving behind it. */
  settleMs: number;
};

/**
 * The capture sweep as it stands this frame: whether it's running, its dithered band, and how far down the frame the
 * band's top edge is (0 to 1), or null while none of it shows.
 */
export type SweepNow = { running: boolean; canvas: HTMLCanvasElement | null; front: number | null };

type DevelopOptions = {
  /** Draws while true; everything clears when it turns false. */
  active: boolean;
  photo: string;
  box: { width: number; height: number };
  /** The viewfinder's zoom when the last shot was taken, so the grey photo is framed the same. */
  zoom: number;
  /** Dither cell size in CSS px. */
  grain: number;
  look: DevelopLook;
  /** What the capture sweep is showing, for the glow while it runs. */
  sweep: () => SweepNow;
};

/** The ambient redraws at this rate: it's dither, and the cells read as steady at 30. */
const FRAME_MS = 1000 / 30;
/** How long the ambient takes to ease in. */
const EASE_IN_MS = 1400;
/** The glow copies the frame at this fraction of its size; it is blurred anyway, so more would only cost. */
const GLOW_SCALE = 1 / 8;

/**
 * The photo after the last shot. The capture sweep unveils it in grey dither, and then it stays alive while Larry
 * works: the sweep's synthwave light on a rocking liquid surface over it, the photo bending under it (see drawAmbient).
 *
 * Two canvases. `still` goes inside the sweep's scope (shown once the shot's change runs) and is drawn once: a canvas
 * that changes every frame inside glimm's scope costs glimm a redraw of the page each time. `grey` is the live one: it
 * goes over the scope but under the band, and shows wherever the band has passed.
 *
 * The frame also glows like a lit screen: `glow` is a tiny copy of whatever the frame shows, redrawn each frame. Put
 * it behind the frame at the frame's size and blur it, and the colours at each part of the frame spill past its edge.
 */
export function useDevelop(options: DevelopOptions) {
  const still = useRef<HTMLCanvasElement>(null);
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
    void img.decode().then(() => live && (image.current = img), () => {});
    return () => {
      live = false;
      image.current = null;
    };
  }, [options.photo]);

  useLayoutEffect(() => {
    if (!options.active) return;
    const stillEl = still.current;
    const greyEl = grey.current;
    const glowEl = glow.current;
    if (!stillEl || !greyEl || !glowEl) return;
    greyEl.style.clipPath = "inset(100% 0 0 0)";
    // Whether the band has shown yet: once it has, its going means it has left the top, not that it hasn't started.
    let passed = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let field: GreyField | null = null;
    let raf = 0;
    let last = -Infinity;

    const draw = (now: number) => {
      const o = latest.current;
      const img = image.current;
      if (!field && img) {
        field = greyField(img, o.box, o.grain, { zoom: o.zoom });
        if (field) {
          const size = field.cell / field.dpr;
          for (const el of [stillEl, greyEl]) {
            el.style.width = `${field.cols * size}px`;
            el.style.height = `${field.rows * size}px`;
          }
          // The sweep unveils this one; it never changes, so glimm, which watches what it covers, has nothing to redo.
          drawAmbient(stillEl, field, o.look, 0, 0);
        }
      }
      if (!field) return;
      const k = reduced ? 0 : Math.min(1, Math.max(0, (now - start - o.look.settleMs) / EASE_IN_MS));
      const sweep = o.sweep();
      // The live canvas shows only where the band has passed: below its top edge while it climbs (the band itself is
      // drawn over that edge), and everywhere once it has gone.
      if (sweep.front !== null) passed = true;
      greyEl.style.clipPath =
        !sweep.running || (passed && sweep.front === null) ? "none" : sweep.front === null ? "inset(100% 0 0 0)" : `inset(${(Math.max(0, sweep.front) * 100).toFixed(2)}% 0 0 0)`;
      const shown = greyEl;
      if (!reduced || k === 0) drawAmbient(greyEl, field, o.look, (now - start) / 1000, k * k * (3 - 2 * k));

      // The glow: the frame as it looks now, in miniature. While the sweep runs, the colour photo still shows above it.
      const { width, height } = o.box;
      const gw = Math.max(1, Math.round(width * GLOW_SCALE));
      const gh = Math.max(1, Math.round(height * GLOW_SCALE));
      if (glowEl.width !== gw || glowEl.height !== gh) {
        glowEl.width = gw;
        glowEl.height = gh;
      }
      const g = glowEl.getContext("2d");
      if (!g || !img) return;
      g.clearRect(0, 0, gw, gh);
      const size = field.cell / field.dpr;
      const fw = field.cols * size * GLOW_SCALE;
      const fh = field.rows * size * GLOW_SCALE;
      if (sweep.front !== null) {
        const fill = Math.max(gw / img.naturalWidth, gh / img.naturalHeight) * o.zoom;
        g.drawImage(img, (gw - img.naturalWidth * fill) / 2, (gh - img.naturalHeight * fill) / 2, img.naturalWidth * fill, img.naturalHeight * fill);
        const top = Math.max(0, sweep.front) * gh;
        g.drawImage(shown, 0, (top / fh) * shown.height, shown.width, shown.height - (top / fh) * shown.height, 0, top, fw, fh - top);
        if (sweep.canvas) g.drawImage(sweep.canvas, 0, 0, gw, gh);
      } else {
        g.drawImage(shown, 0, 0, fw, fh);
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS) return;
      last = now;
      draw(now);
    };
    // The first frame now, before paint, so the grey photo is there when the sweep's change shows it.
    draw(start);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      greyEl.style.clipPath = "inset(100% 0 0 0)";
      for (const el of [stillEl, greyEl, glowEl]) el.getContext("2d")?.clearRect(0, 0, el.width, el.height);
    };
  }, [options.active]);

  return { still, grey, glow };
}
