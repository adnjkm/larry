import * as stylex from "@stylexjs/stylex";
import { camera } from "./camera.stylex.ts";
import { type CSSProperties, type Ref, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { accentChain } from "glimm";
import { GlimmScope, type GlimmScopeHandle } from "glimm/react";
import { animate } from "../surface/ticker.ts";
import { colors, fonts, radii } from "../tokens.stylex.ts";
import { ditherBand } from "./band.ts";
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

/** The band counts as having reached the top once its top edge is this close to the frame's top (a share of its height). */
const TOP_REACHED = 0.03;
const SWEEP_FPS = 60;
/** glimm's "Generate data" palette, through the synthwave stops; the dither snaps it to SYNTHWAVE anyway. */
const UNVEIL_PALETTE = accentChain(["#23005F", "#8700AF", "#FF0087", "#FF5F37", "#FFD700"]);
/** glimm's scope takes a style object, not a class. */
const SCOPE_FILL: CSSProperties = { position: "absolute", inset: 0 };
/**
 * glimm's band is never shown, only read back each frame and redrawn as dither, and reading a canvas back is slow. So
 * its canvas is shrunk by this much: glimm sizes it from its on-screen box, transforms included.
 */
const BAND_SCALE = 0.25;
/**
 * glimm fades its band out over the last 24 px at each edge of its canvas, so the canvas reaches this far past the
 * frame on every side and the fade falls outside it. The canvas is shrunk by BAND_SCALE, so its 24 px are this many here.
 */
const BAND_BLEED = 24 / BAND_SCALE;
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
  const scope = useRef<GlimmScopeHandle>(null);
  const scopeBox = useRef<HTMLDivElement>(null);
  const glimmCanvas = useRef<HTMLCanvasElement | null>(null);
  const zoom = useRef<number>(CAMERA.zoom.min);
  const [chip, setChip] = useState<number>(CAMERA.zoom.min);
  // The view the band is unveiling the current one over, while it climbs.
  const [from, setFrom] = useState<View | null>(null);
  const shown = useRef(view);
  shown.current = view;
  // The band's top edge as a share of the frame's height up from its bottom, while a sweep runs.
  const front = useRef<number | null>(null);
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
    sweep: () => ({ front: front.current, band: band.current }),
  });

  useEffect(() => () => stopSweep.current(), []);

  useLayoutEffect(() => {
    const canvas = scopeBox.current?.querySelector<HTMLCanvasElement>(":scope > div > canvas");
    if (!canvas) return;
    // glimm makes its WebGL context on the first play and reuses one that already exists. Making it first, with
    // preserveDrawingBuffer, keeps each frame readable after it's shown, so the dither can copy it.
    canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
    Object.assign(canvas.style, {
      opacity: "0",
      inset: `${-BAND_BLEED}px`,
      width: `calc(100% + ${2 * BAND_BLEED}px)`,
      height: `calc(100% + ${2 * BAND_BLEED}px)`,
      transform: `scale(${BAND_SCALE})`,
      transformOrigin: "0 0",
    });
    glimmCanvas.current = canvas;
  }, []);

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
        scope.current?.play({});
        const start = performance.now();
        const scratch = document.createElement("canvas");
        let topped = false;
        const finish = () => {
          front.current = null;
          el.getContext("2d")?.clearRect(0, 0, el.width, el.height);
          setFrom(null);
          if (!topped) onTop();
        };
        const stop = animate(SWEEP_FPS, (now) => {
          const source = glimmCanvas.current;
          const since = now - start;
          const edge = source ? ditherBand(el, source, box.width, box.height, BAND_BLEED, latest.current.sweep.grain, scratch) : null;
          front.current = edge === null ? null : 1 - edge;
          // Stop once the band has gone, or a beat after the sweep should have ended, whichever is first.
          if ((edge === null && since > 400) || since > latest.current.sweep.ms + 1200) {
            finish();
            return false;
          }
          if (old.current && edge !== null) old.current.style.clipPath = `inset(0 0 ${((1 - edge) * 100).toFixed(2)}% 0)`;
          if (!topped && edge !== null && edge <= TOP_REACHED) {
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
          <div ref={scopeBox} {...stylex.props(s.fill)}>
            <GlimmScope
              ref={scope}
              palette={UNVEIL_PALETTE}
              direction="btt"
              origin={[0.5, 1]}
              curve={tuning.sweep.curve}
              span={1}
              sweepMs={tuning.sweep.ms}
              style={SCOPE_FILL}
            >
              <Scene photo={photo} box={box} view={view} grey={develop.grey} />
              {from && (
                <div ref={old} {...stylex.props(s.fill)}>
                  <Scene photo={photo} box={box} view={from} />
                </div>
              )}
            </GlimmScope>
          </div>
          <canvas ref={band} aria-hidden {...stylex.props(s.overlay)} />
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
  overlay: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" },
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
