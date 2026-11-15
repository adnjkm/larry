import * as stylex from "@stylexjs/stylex";
import { camera } from "./camera.stylex.ts";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { raster } from "../surface/dither.ts";
import { animate } from "../surface/ticker.ts";
import { colors, fonts, radii } from "../tokens.stylex.ts";
import { drawSweep, reachedTop, type SweepFrame, sweepAt } from "./light.ts";
import { CAMERA, type Tuning } from "./look.ts";
import { angleCss, ANGLES, fitFor, type Framing } from "./photo.ts";
import { screen } from "./screen.stylex.ts";
import { glowPad, useDevelop } from "./useDevelop.ts";
import { reducedMotion } from "../motion.ts";

/** What the frame shows: the photo at a fake angle, or after the last shot the photo developing in grey dither. */
export type View = { angle: number; developed: Framing | null };

export type ViewfinderHandle = {
  /**
   * Sweeps the band up the frame from the shutter, unveiling the view the caller sets in the same event behind it
   * while the old one holds ahead. `onTop` runs once, when the band has climbed to the top.
   */
  sweep: (onTop: () => void) => void;
  zoom: (zoom: number) => void;
  framing: () => Framing;
};

/** The band counts as having reached the top once it shows in this share of the frame's top. */
const TOP_MARGIN = 0.03;
const SWEEP_FPS = 60;
/** The swell eases in this far into the sweep that unveils it, so the photo is already moving behind the band. */
const SETTLE = 0.15;

/** The viewfinder card: the feed, the sweep after each shot, the developing grey photo and its glow. */
export function Viewfinder({
  ref,
  photo,
  box,
  view,
  live,
  frozen,
  tuning,
}: {
  ref: Ref<ViewfinderHandle>;
  photo: string;
  box: Box;
  view: View;
  live: boolean;
  frozen: boolean;
  tuning: Tuning;
}) {
  const feed = useRef<HTMLDivElement>(null);
  const old = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLCanvasElement>(null);
  const zoom = useRef<number>(CAMERA.zoom.min);
  const [chip, setChip] = useState<number>(CAMERA.zoom.min);
  // The view the band is unveiling the current one over, while it climbs.
  const [from, setFrom] = useState<View | null>(null);
  const shown = useRef(view);
  shown.current = view;
  const frame = useRef<SweepFrame | null>(null);
  const stopSweep = useRef<() => void>(() => {});
  const latest = useRef(tuning);
  latest.current = tuning;

  const develop = useDevelop({
    framing: view.developed,
    photo,
    box,
    grain: CAMERA.grain,
    look: tuning.develop,
    settleMs: tuning.sweep.ms * SETTLE,
    sweep: () => ({ frame: frame.current, band: band.current }),
  });

  useEffect(() => () => stopSweep.current(), []);

  useImperativeHandle(
    ref,
    () => ({
      sweep(onTop) {
        stopSweep.current();
        const el = band.current;
        if (!el || reducedMotion.matches) {
          onTop();
          return;
        }
        if (old.current) old.current.style.clipPath = "";
        setFrom(shown.current);
        // Whole device px per cell, so the pixelated cells come out even.
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        const cell = Math.max(1, Math.round(latest.current.sweep.grain * dpr));
        const cols = Math.ceil((box.width * dpr) / cell);
        const rows = Math.ceil((box.height * dpr) / cell);
        el.style.width = `${(cols * cell) / dpr}px`;
        el.style.height = `${(rows * cell) / dpr}px`;
        const r = raster(el, cols, rows);
        if (!r) return;
        const start = performance.now();
        let topped = false;
        const finish = () => {
          frame.current = null;
          r.px.fill(0);
          r.ctx.putImageData(r.image, 0, 0);
          setFrom(null);
          if (!topped) onTop();
        };
        const stop = animate(SWEEP_FPS, (now) => {
          const { ms, curve } = latest.current.sweep;
          const f = sweepAt(now - start, ms, curve);
          frame.current = f;
          if (!f) {
            finish();
            return false;
          }
          drawSweep(r, f);
          if (old.current) old.current.style.clipPath = `inset(0 0 ${(Math.min(1, Math.max(0, f.front)) * 100).toFixed(2)}% 0)`;
          if (!topped && reachedTop(f, TOP_MARGIN)) {
            topped = true;
            onTop();
          }
        });
        stopSweep.current = () => {
          stop();
          stopSweep.current = () => {};
          finish();
        };
      },
      zoom(z) {
        zoom.current = z;
        feed.current?.style.setProperty("--zoom", String(z));
        setChip(Math.round(z * 10) / 10);
      },
      framing: () => ({ zoom: zoom.current, ...ANGLES[shown.current.angle % ANGLES.length]! }),
    }),
    [box.width, box.height],
  );

  const pad = glowPad(tuning.develop.reach);
  return (
    <div {...stylex.props(s.wrap)}>
      <canvas
        ref={develop.glow}
        aria-hidden
        {...stylex.props(s.glow(box.width + 2 * pad, box.height + 2 * pad, pad), !live && s.glowOn(tuning.develop.glow))}
      />
      <div {...stylex.props(s.card(box.width, box.height))}>
        <div ref={feed} {...stylex.props(s.feed, s.drift, (frozen || !live) && s.frozen)}>
          <Scene photo={photo} box={box} view={view} grey={develop.grey} />
          {from && (
            <div ref={old} {...stylex.props(s.fill)}>
              <Scene photo={photo} box={box} view={from} />
            </div>
          )}
          <canvas ref={band} aria-hidden {...stylex.props(s.cells)} />
        </div>
        {live && chip > CAMERA.zoom.min + 0.04 && <span {...stylex.props(s.chip)}>{chip.toFixed(1)}×</span>}
      </div>
    </div>
  );
}

type Box = { width: number; height: number };

function Scene({ photo, box, view, grey }: { photo: string; box: Box; view: View; grey?: Ref<HTMLCanvasElement> }) {
  return (
    <>
      <div {...stylex.props(s.fill, s.zoom)}>
        <Photo src={photo} box={box} transform={angleCss(ANGLES[view.angle % ANGLES.length]!)} />
      </div>
      {grey && <canvas ref={grey} aria-hidden {...stylex.props(s.cells, !view.developed && s.hidden)} />}
    </>
  );
}

function Photo({ src, box, transform }: { src: string; box: Box; transform: string }) {
  const [natural, setNatural] = useState<Box>();
  const fit = natural ? fitFor(natural, box) : "cover";
  return (
    <div {...stylex.props(s.fill, s.angle(transform))}>
      {fit === "contain" && <img src={src} alt="" {...stylex.props(s.fill, s.backdrop)} />}
      <img
        src={src}
        alt=""
        draggable={false}
        {...stylex.props(s.fill, fit === "cover" ? s.cover : s.contain)}
        onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
      />
    </div>
  );
}

const drift = stylex.keyframes({
  "0%": { transform: "translate(0, 0) scale(1.04) rotate(0deg)" },
  "25%": { transform: "translate(-0.8%, 0.5%) scale(1.046) rotate(-0.3deg)" },
  "50%": { transform: "translate(0.6%, -0.4%) scale(1.04) rotate(0.2deg)" },
  "75%": { transform: "translate(-0.3%, -0.6%) scale(1.05) rotate(-0.1deg)" },
  "100%": { transform: "translate(0, 0) scale(1.04) rotate(0deg)" },
});

const s = stylex.create({
  wrap: { position: "relative", alignSelf: "center", flexShrink: 0 },
  card: (width: number, height: number) => ({
    position: "relative",
    width,
    height,
    borderRadius: camera.cardRadius,
    overflow: "hidden",
    backgroundColor: screen.card,
    transition: "background-color 600ms ease",
  }),
  feed: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  drift: {
    animationName: { default: null, "@media (prefers-reduced-motion: no-preference)": drift },
    animationDuration: "7s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  },
  frozen: { animationPlayState: "paused" },
  fill: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  zoom: { transform: "scale(var(--zoom, 1))", transformOrigin: "center" },
  angle: (transform: string) => ({ transform, transition: "transform 300ms ease" }),
  cover: { objectFit: "cover" },
  contain: { objectFit: "contain" },
  backdrop: { objectFit: "cover", filter: "blur(24px) brightness(0.55)", transform: "scale(1.2)" },
  // Sized to whole cells, so they can run a little past the frame's edge.
  cells: { position: "absolute", top: 0, left: 0, pointerEvents: "none", imageRendering: "pixelated" },
  hidden: { visibility: "hidden" },
  // While Larry works the frame glows like a lit screen (see useDevelop).
  glow: (width: number, height: number, pad: number) => ({
    position: "absolute",
    top: -pad,
    left: -pad,
    width,
    height,
    opacity: 0,
    transition: "opacity 700ms ease",
    pointerEvents: "none",
  }),
  glowOn: (strength: number) => ({ opacity: strength }),
  chip: {
    position: "absolute",
    bottom: 12,
    left: "50%",
    transform: "translateX(-50%)",
    paddingInline: 8,
    height: 24,
    display: "flex",
    alignItems: "center",
    borderRadius: radii.pill,
    backgroundColor: "rgba(20, 20, 20, 0.72)",
    color: colors.paper,
    fontFamily: fonts.mono,
    fontSize: 12,
    pointerEvents: "none",
  },
});
