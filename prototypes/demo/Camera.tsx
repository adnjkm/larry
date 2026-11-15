// Aiden's camera mockup (src/mock/CameraMock.tsx at cfb63cd), copied for the demo so its "Build it" can open the
// lesson without changing his file. Only the outer shell differs: no dials (their defaults are fixed in LAYOUT), the
// bottle only, and Build it hands over to the next screen in the same phone. Everything inside Flow is his.
import * as stylex from "@stylexjs/stylex";
import { Button } from "@ui-sdk/react/button";
import { Progress, ProgressTrack } from "@ui-sdk/react/progress";
import { createParts } from "@ui-sdk/react/primitive";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { accentChain } from "glimm";
import { GlimmScope, type GlimmScopeHandle } from "glimm/react";
import { type CSSProperties, type ReactNode, type Ref, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Kit, type Part, parseKit } from "../../shared/kit.ts";
import { KitViewer } from "../../src/kit3d/KitViewer.tsx";
import { colors, fonts, radii } from "../../src/tokens.stylex.ts";
import { DEFAULT_LOOK, type DitherLook } from "../../src/kit3d/ditherLook.ts";
import { ditherBand, drawDitherBar, fitFor } from "../../src/mock/dither.ts";
import { type DevelopLook, type SweepNow, useDevelop } from "../../src/mock/Develop.tsx";
import { Surface } from "../../src/surface/Surface.tsx";
import { circle, drum, type Relief, rrect } from "../../src/surface/relief.ts";
import { thumbwheel } from "../../src/mock/thumbwheel.ts";
import { screen } from "../../src/mock/screen.stylex.ts";

/*
 * Mockup of the camera and the move from photo to model. Nothing here talks to the server:
 * the camera is a fixture photo, and the kit's parts arrive on a timer copied from real runs.
 */

const photoUrls = import.meta.glob<string>("../../fixtures/photos/*.jpg", { eager: true, query: "?url", import: "default" });
const kitJson = import.meta.glob<unknown>("../../fixtures/kits/*.json", { eager: true, import: "default" });
const nameOf = (path: string) => path.split("/").pop()?.replace(/\.\w+$/, "") ?? path;

type MockObject = { name: string; photo: string; kit: Kit };
const OBJECTS: MockObject[] = Object.entries(photoUrls).flatMap(([path, photo]) => {
  const raw = Object.entries(kitJson).find(([p]) => nameOf(p) === nameOf(path))?.[1];
  return raw === undefined ? [] : [{ name: nameOf(path), photo, kit: parseKit(raw) }];
});
const OBJECT_NAMES = OBJECTS.map((o) => o.name);

/*
 * The Pixel 8a frame, in CSS px. The panel is 1080 x 2400 at a device pixel ratio of 2.625, so 412 x 915.
 * Bar heights and the status bar and handle geometry were measured on the Android 15 emulator's Pixel 7 profile,
 * which has the same panel and density. Gesture navigation, the Pixel default.
 */
const DEVICE = { width: 412, height: 915 };
/** 136 device px. */
const STATUS_BAR = 52;
/** 63 device px. */
const GESTURE_BAR = 24;
/** Chrome's address bar in a normal tab. Not there when the app is installed to the home screen. */
const CHROME_TOOLBAR = 56;
const HANDLE = { x: 152, y: 900.5, width: 108, height: 3.5 };

const TOP_BAR = 44;
/** The pink the primitives use for the part that matters (larry-build's colors.pink). */
const ACCENT = "#FF0087";
/** The model's dithered shadow in the accent too. */
const LOOK: DitherLook = { ...DEFAULT_LOOK, colors: { ...DEFAULT_LOOK.colors, accent: ACCENT.toLowerCase() } };
/** Rounds to the 2px half-step grid. */
const even = (n: number) => Math.round(n / 2) * 2;

/** Sizes of the camera's top row: the photo bar and the flash switch share one height. `ditherGrain` is the dither's cell size in CSS px (renamed from ditherCell when its unit changed, so stale saved values are dropped). */
type TopSizes = { height: number; barWidth: number; barRadius: number; flashWidth: number; ditherGrain: number; idleDither: number; relief: number };
const MAX_PHOTOS = 3;

type Pace = "demo" | "real";
type Phase = "live" | "reading" | "building" | "done";
type StartAt = "live" | "done";

/** Every size the dials can change, already worked out for the current frame. */
type Layout = {
  cardWidth: number;
  cardRadius: number;
  cardLive: number;
  cardResult: number;
  /** Height of the band above the card and of the band below it, so the card is centred. */
  barHeight: number;
  shutter: number;
  top: TopSizes;
  wheel: { width: number; height: number; ridges: number; rim: number };
  shot: ShotLook;
  /** `glow` is the frame glow's opacity, 0 to 1, and `reach` its blur in CSS px. */
  develop: DevelopLook & { glow: number; reach: number };
};

/** How a shot's sweep looks: glimm's band, redrawn as dither. */
type ShotLook = { sweepMs: number; curve: number; grain: number; pageEffect: boolean };

/** The zoom wheel: UI SDK's primitive for the behaviour, drawn by our canvas. */
const { Root: Thumbwheel } = createParts(thumbwheel, { root: "div" });
const ZOOM = { min: 1, max: 5, perPixel: 0.02 };


/** Milliseconds after the photos are sent. "real" follows a low-effort run: header at 5 s, first part at 6.7 s, done at about 12 s. */
const PACES: Record<Pace, { started: number; first: number; gap: number; tail: number }> = {
  demo: { started: 900, first: 1700, gap: 550, tail: 500 },
  real: { started: 5000, first: 6700, gap: 1300, tail: 900 },
};

const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const drift = stylex.keyframes({
  "0%": { transform: "translate(0, 0) scale(1.04) rotate(0deg)" },
  "25%": { transform: "translate(-0.8%, 0.5%) scale(1.046) rotate(-0.3deg)" },
  "50%": { transform: "translate(0.6%, -0.4%) scale(1.04) rotate(0.2deg)" },
  "75%": { transform: "translate(-0.3%, -0.6%) scale(1.05) rotate(-0.1deg)" },
  "100%": { transform: "translate(0, 0) scale(1.04) rotate(0deg)" },
});
const flashOut = stylex.keyframes({ "0%": { opacity: 0 }, "15%": { opacity: 0.9 }, "100%": { opacity: 0 } });
const popIn = stylex.keyframes({ "0%": { opacity: 0, transform: "scale(0.5)" }, "100%": { opacity: 1, transform: "scale(1)" } });
const riseIn = stylex.keyframes({ "0%": { opacity: 0, transform: "translateY(6px)" }, "100%": { opacity: 1, transform: "translateY(0)" } });
const fadeIn = stylex.keyframes({ "0%": { opacity: 0 }, "100%": { opacity: 1 } });

const light = stylex.createTheme(screen, {
  bg: "#FFFFFF",
  fg: "#141414",
  muted: "#6B6B6B",
  chrome: "rgba(20, 20, 20, 0.06)",
  card: "#FFFFFF",
});

/** The camera's own colours, the screen's defaults, set again on the camera so it stays dark over the light result as it lifts away. */
const dark = stylex.createTheme(screen, {
  bg: "#141414",
  fg: "#FFFFFF",
  muted: "#8C8C8C",
  chrome: "rgba(255, 255, 255, 0.1)",
  card: "#232323",
});

const colorFade = "color 600ms ease, background-color 600ms ease";

const s = stylex.create({
  // Desktop shell
  shell: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 64,
    padding: 16,
    // Room for the DialKit panel on the right.
    paddingRight: 320,
    boxSizing: "border-box",
    backgroundColor: "#EFEFEF",
    color: colors.ink,
    fontFamily: fonts.sans,
  },
  panel: { width: 280, display: "flex", flexDirection: "column", gap: 24 },
  group: { display: "flex", flexDirection: "column", gap: 8 },
  eyebrow: { margin: 0, fontFamily: fonts.mono, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.graphite },
  heading: { margin: 0, fontSize: 32, lineHeight: "36px", fontWeight: 600, letterSpacing: "-0.02em" },
  blurb: { margin: 0, fontSize: 14, lineHeight: "20px", color: colors.graphite },
  log: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4, fontFamily: fonts.mono, fontSize: 12, lineHeight: "16px", minHeight: 120 },
  logEmpty: { color: colors.graphite },

  // Phone
  phoneSlot: (width: number, height: number) => ({ width, height, flexShrink: 0 }),
  // The frame has its own size, so it is not sized by the already-shrunk slot and then scaled a second time.
  phone: (bezel: number, radius: number, scale: number) => ({
    width: DEVICE.width + 2 * bezel,
    height: DEVICE.height + 2 * bezel,
    boxSizing: "border-box",
    padding: bezel,
    borderRadius: radius,
    backgroundColor: "#0A0A0A",
    boxShadow: "0 40px 80px -24px rgba(0, 0, 0, 0.35)",
    transform: `scale(${scale})`,
    transformOrigin: "top left",
  }),

  // Screen
  screen: {
    position: "relative",
    width: DEVICE.width,
    height: DEVICE.height,
    overflow: "hidden",
    backgroundColor: screen.bg,
    color: screen.fg,
    fontFamily: fonts.sans,
    transition: colorFade,
    userSelect: "none",
  },
  screenRadius: (radius: number) => ({ borderRadius: radius }),
  statusBar: { position: "absolute", top: 0, left: 0, width: DEVICE.width, height: STATUS_BAR, transition: colorFade },
  chromeLight: { backgroundColor: "#FFFFFF", color: "#1F1F1F" },
  toolbar: { position: "absolute", top: STATUS_BAR, left: 0, width: DEVICE.width, height: CHROME_TOOLBAR, boxShadow: "inset 0 -1px 0 #E3E3E3" },
  hole: (size: number) => ({
    position: "absolute",
    top: STATUS_BAR / 2 - size / 2,
    left: DEVICE.width / 2 - size / 2,
    width: size,
    height: size,
    borderRadius: radii.pill,
    backgroundColor: "#000000",
    boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.06)",
  }),
  handle: {
    position: "absolute",
    top: HANDLE.y,
    left: HANDLE.x,
    width: HANDLE.width,
    height: HANDLE.height,
    borderRadius: radii.pill,
    backgroundColor: screen.fg,
    opacity: 0.9,
    transition: colorFade,
  },
  usable: (top: number, height: number) => ({
    position: "absolute",
    top,
    left: 0,
    width: DEVICE.width,
    height,
    boxSizing: "border-box",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#2F6BFF",
    backgroundColor: "rgba(47, 107, 255, 0.06)",
    pointerEvents: "none",
  }),
  usableLabel: {
    position: "absolute",
    top: 4,
    right: 4,
    paddingInline: 6,
    borderRadius: 4,
    backgroundColor: "#2F6BFF",
    color: "#FFFFFF",
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: "18px",
  },
  viewport: (top: number, height: number) => ({ position: "absolute", top, left: 0, width: DEVICE.width, height, display: "flex", flexDirection: "column" }),

  // The band above the card; its row is centred in it, as the shutter is centred in the band below.
  topBar: (height: number) => ({
    height,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingInline: 20,
    transition: `height 700ms ${EASE_OUT}`,
  }),
  iconButton: {
    width: 36,
    height: 36,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    borderRadius: radii.pill,
    padding: 0,
    backgroundColor: screen.chrome,
    color: screen.fg,
    cursor: "pointer",
    transition: colorFade,
  },
  side: (width: number) => ({ width, flexShrink: 0, display: "flex" }),
  sideEnd: { justifyContent: "flex-end" },
  flashToggle: (width: number, height: number) => ({
    position: "relative",
    width,
    height,
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: radii.pill,
    // The bar's glow spills past the switch.
    overflow: "visible",
    backgroundColor: "transparent",
    cursor: "pointer",
  }),
  // One canvas draws the whole control: track, fill, dither and outline.
  // Larger than the bar by `pad` on every side, for the glow.
  ditherBar: (width: number, height: number, pad: number) => ({
    position: "absolute",
    top: -pad,
    left: -pad,
    width: width + 2 * pad,
    height: height + 2 * pad,
    pointerEvents: "none",
  }),
  photoBar: (width: number, height: number) => ({ position: "relative", display: "block", width, height, flexShrink: 0 }),
  knob: (size: number, inset: number) => ({
    position: "absolute",
    top: inset,
    left: inset,
    width: size,
    height: size,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    // The knob's white circle is its dithered disc, pixelated at the edge; no smooth background behind it.
    transition: `transform 240ms ${EASE_OUT}`,
  }),
  knobOn: (travel: number) => ({ transform: `translateX(${travel}px)` }),
  screenFlash: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "#FFFFFF",
    pointerEvents: "none",
    opacity: 0,
    animationName: flashOut,
    animationDuration: "420ms",
  },
  topLabel: (size: number, lineHeight: number) => ({
    fontFamily: fonts.mono,
    fontSize: size,
    lineHeight: `${lineHeight}px`,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  }),

  // Viewfinder card
  cardWrap: { position: "relative", alignSelf: "center", flexShrink: 0 },
  card: (width: number, height: number, radius: number) => ({
    position: "relative",
    width,
    height,
    borderRadius: radius,
    overflow: "hidden",
    backgroundColor: screen.card,
    transition: `height 700ms ${EASE_OUT}, background-color 600ms ease`,
  }),
  feed: (width: number, height: number) => ({ position: "absolute", top: 0, left: 0, width, height }),
  feedDrift: {
    animationName: { default: null, "@media (prefers-reduced-motion: no-preference)": drift },
    animationDuration: "7s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  },
  feedFrozen: { animationPlayState: "paused" },
  angle: (transform: string) => ({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", transform, transition: "transform 300ms ease" }),
  photo: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  photoCover: { objectFit: "cover" },
  photoContain: { objectFit: "contain" },
  photoBackdrop: { objectFit: "cover", filter: "blur(24px) brightness(0.55)", transform: "scale(1.2)" },
  fill: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  overlay: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" },

  // The grey photo, sized by useDevelop to whole cells, so it can run a little past the frame's edge.
  grey: { position: "absolute", top: 0, left: 0, pointerEvents: "none", imageRendering: "pixelated" },
  hidden: { visibility: "hidden" },
  // While Larry works the frame glows like a lit screen: a tiny copy of what it shows, blurred, behind it, so each
  // part of its edge spills its own colour (see useDevelop).
  glow: (width: number, height: number, reach: number) => ({
    position: "absolute",
    top: 0,
    left: 0,
    width,
    height,
    filter: `blur(${reach}px)`,
    opacity: 0,
    transition: "opacity 700ms ease",
    pointerEvents: "none",
  }),
  glowOn: (strength: number) => ({ opacity: strength }),

  // The two screens: the result underneath, the camera over it as a sheet that lifts away.
  page: { position: "absolute", top: 0, left: 0, width: DEVICE.width, height: DEVICE.height, backgroundColor: screen.bg, color: screen.fg },
  sheet: (radius: number) => ({
    borderBottomLeftRadius: radius,
    borderBottomRightRadius: radius,
    overflow: "hidden",
    transition: "transform 820ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 820ms ease",
  }),
  sheetUp: { transform: `translateY(${-DEVICE.height}px)`, boxShadow: "0 24px 48px rgba(0, 0, 0, 0.3)" },
  // While Larry works the camera's controls dim, leaving the glowing frame to hold the eye.
  dimmable: { flexShrink: 0, transition: "opacity 500ms ease" },
  dimmed: { opacity: 0.3, pointerEvents: "none" },

  viewer: { position: "absolute", top: 0, left: 0, width: "100%", animationName: fadeIn, animationDuration: "500ms", animationDelay: "150ms", animationFillMode: "both" },
  pip: {
    position: "absolute",
    left: 14,
    bottom: 14,
    width: 40,
    height: 52,
    borderRadius: 10,
    overflow: "hidden",
    boxShadow: "0 0 0 2px #FFFFFF, 0 4px 12px rgba(0, 0, 0, 0.18)",
    animationName: popIn,
    animationDuration: "400ms",
    animationTimingFunction: EASE_OUT,
    animationDelay: "300ms",
    animationFillMode: "both",
  },
  turnHint: { position: "absolute", right: 16, bottom: 16, fontFamily: fonts.mono, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: screen.muted },

  // Below the card
  lower: { position: "relative", flexGrow: 1 },
  layer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", transition: `opacity 300ms ease, transform 400ms ${EASE_OUT}` },
  label: { fontFamily: fonts.mono, fontSize: 11, lineHeight: "14px", letterSpacing: "0.08em", textTransform: "uppercase", color: screen.muted, transition: colorFade },
  // The shutter is centred in the band below the card. The side slots keep it centred across too.
  // Three columns, the outer two equal, so the shutter stays centred however wide the wheel gets.
  // Inset like the frame and with no gap, so each side slot spans exactly from the frame's edge to the shutter.
  controls: (inset: number) => ({ flexGrow: 1, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", paddingInline: inset }),
  shutter: (size: number) => ({
    width: size,
    height: size,
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: radii.pill,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    cursor: "pointer",
  }),
  // The face's shape is drawn by its dithered disc, so the element itself has no background or rounding.
  shutterFace: (size: number) => ({ position: "relative", width: size, height: size, transition: `transform 160ms ${EASE_OUT}` }),
  // Above a Surface's canvas, which is positioned.
  overSurface: { position: "relative", display: "flex" },
  shutterPressed: { transform: "scale(0.94)" },
  // Equal side slots keep the shutter in the middle.
  slot: { minWidth: 0, display: "flex", justifyContent: "center" },
  slotStart: { justifyContent: "flex-start" },
  zoom: (k: number) => ({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", transform: `scale(${k})`, transformOrigin: "center" }),
  zoomChip: {
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
    color: "#FFFFFF",
    fontFamily: fonts.mono,
    fontSize: 12,
    pointerEvents: "none",
  },
  wheel: (width: number, height: number) => ({
    position: "relative",
    width,
    height,
    flexShrink: 0,
    cursor: "ew-resize",
    touchAction: "none",
    userSelect: "none",
    borderRadius: 10,
    outline: { default: "none", ":focus-visible": "2px solid #FFFFFF" },
    outlineOffset: 2,
  }),
  use: { padding: 0, borderWidth: 0, backgroundColor: "transparent", color: "#FFFFFF", fontFamily: fonts.sans, fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },

  result: { paddingTop: 18, paddingInline: 24, gap: 2 },
  name: { margin: 0, fontSize: 28, lineHeight: "34px", fontWeight: 600, letterSpacing: "-0.02em", animationName: riseIn, animationDuration: "350ms", animationTimingFunction: EASE_OUT },
  countRow: { display: "flex", alignItems: "flex-end", gap: 12, marginTop: 10, height: 56 },
  count: { fontFamily: fonts.mono, fontSize: 64, lineHeight: "56px", fontWeight: 200, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", animationName: riseIn, animationDuration: "250ms" },
  countText: { display: "flex", flexDirection: "column", gap: 2, paddingBottom: 4 },
  countWord: { fontSize: 18, lineHeight: "22px", fontWeight: 500 },
  chips: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 },
  chip: {
    height: 28,
    display: "flex",
    alignItems: "center",
    gap: 6,
    paddingInline: 10,
    borderRadius: radii.pill,
    backgroundColor: screen.chrome,
    fontSize: 13,
    fontWeight: 500,
    animationName: riseIn,
    animationDuration: "300ms",
    animationTimingFunction: EASE_OUT,
  },
  swatch: (color: string) => ({ width: 8, height: 8, flexShrink: 0, backgroundColor: color, boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.12)" }),
  footer: { marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingBottom: 16 },
  primary: {
    width: "100%",
    height: 52,
    borderWidth: 0,
    borderRadius: radii.pill,
    backgroundColor: screen.chrome,
    color: screen.muted,
    fontFamily: fonts.sans,
    fontSize: 17,
    fontWeight: 600,
    transition: "background-color 300ms ease, color 300ms ease",
  },
  primaryReady: { backgroundColor: screen.fg, color: screen.bg, cursor: "pointer" },
  link: { padding: 0, borderWidth: 0, backgroundColor: "transparent", color: screen.muted, fontFamily: fonts.sans, fontSize: 15, fontWeight: 500, cursor: "pointer" },
});

// ---------------------------------------------------------------- shell

/** The camera's dial defaults from src/mock/CameraMock.tsx, as one fixed layout: this demo has no dials. */
const USABLE_TOP = STATUS_BAR;
const USABLE_HEIGHT = DEVICE.height - USABLE_TOP - GESTURE_BAR;
const SCREEN_RADIUS = 44;
const HOLE = 12;
const BEZEL = 10;
const TOP_HEIGHT = 48;
const LAYOUT: Layout = {
  cardWidth: DEVICE.width - 2 * 16,
  cardRadius: 32,
  cardLive: Math.max(160, USABLE_HEIGHT - 2 * 120),
  cardResult: 392,
  barHeight: 120,
  shutter: 96,
  top: {
    height: TOP_HEIGHT,
    barWidth: even(TOP_HEIGHT * 3.65),
    barRadius: 12,
    flashWidth: even(TOP_HEIGHT * 1.75),
    ditherGrain: 1.5,
    idleDither: 0.6,
    relief: 1,
  },
  wheel: { width: 112, height: 64, ridges: 19, rim: 3 },
  shot: { sweepMs: 1200, curve: 0.12, grain: 1.5, pageEffect: true },
  develop: { wave: 4, light: 0.35, speed: 1, settleMs: 1200 * 0.15, glow: 0.8, reach: 18 },
};

/** Where the next screen sits inside the phone: below the status bar, above the gesture bar, in CSS px of the phone. */
export type PhoneScreen = { top: number; height: number; width: number };

/**
 * Aiden's camera, then whatever `after` draws, in the same phone. The camera runs exactly as on camera.html (shutter,
 * zoom wheel, flash, Use, the develop wave and the kit streaming in); its "Build it" hands over to `after`, and
 * `onCamera` brings the camera back.
 */
export default function CameraDemo({ objectName, after }: { objectName: string; after: (props: { screen: PhoneScreen; onCamera: () => void }) => ReactNode }) {
  const [run, setRun] = useState(0);
  const [built, setBuilt] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const restart = () => {
    setLog([]);
    setBuilt(false);
    setRun((r) => r + 1);
  };

  const frame = { width: DEVICE.width + 2 * BEZEL, height: DEVICE.height + 2 * BEZEL };
  const scale = useFitScale(frame.height + 32);
  const object = OBJECTS.find((o) => o.name === objectName) ?? OBJECTS[0];
  if (!object) return null;

  return (
    <div {...stylex.props(s.shell)}>
      <div {...stylex.props(s.panel)}>
        <div {...stylex.props(s.group)}>
          <p {...stylex.props(s.eyebrow)}>Larry · demo</p>
          <h1 {...stylex.props(s.heading)}>Photo to lesson</h1>
          <p {...stylex.props(s.blurb)}>Tap the shutter one to three times, then Use. When the model is ready, Build it starts the lesson.</p>
        </div>
        <div {...stylex.props(s.group)}>
          <p {...stylex.props(s.eyebrow)}>Stream</p>
          <ul {...stylex.props(s.log)}>
            {log.length === 0 && <li {...stylex.props(s.logEmpty)}>Nothing sent yet</li>}
            {log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <p {...stylex.props(s.eyebrow)}>Space takes a photo · Enter uses them</p>
        </div>
      </div>

      <div {...stylex.props(s.phoneSlot(frame.width * scale, frame.height * scale))}>
        <div data-phone {...stylex.props(s.phone(BEZEL, SCREEN_RADIUS + BEZEL, scale))}>
          {built ? (
            <div data-after {...stylex.props(s.screen, s.screenRadius(SCREEN_RADIUS), light)}>
              <div {...stylex.props(light, s.page)}>
                <div {...stylex.props(s.viewport(USABLE_TOP, USABLE_HEIGHT))}>{after({ screen: { top: USABLE_TOP, height: USABLE_HEIGHT, width: DEVICE.width }, onCamera: restart })}</div>
              </div>
              <SystemBars tab={false} hole={HOLE} />
            </div>
          ) : (
            <Flow
              key={run}
              object={object}
              pace="demo"
              startAt="live"
              layout={LAYOUT}
              device={{ tab: false, usableTop: USABLE_TOP, usableHeight: USABLE_HEIGHT, radius: SCREEN_RADIUS, hole: HOLE, showUsable: false }}
              onLog={(line) => setLog((l) => [...l, line])}
              onRestart={restart}
              onBuild={() => setBuilt(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Shrinks the phone on short windows so the whole screen stays visible. */
function useFitScale(height: number) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(1, window.innerHeight / height));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [height]);
  return scale;
}

// ---------------------------------------------------------------- the phone screen

type Header = { name: string; summary: string };
type DeviceFrame = { tab: boolean; usableTop: number; usableHeight: number; radius: number; hole: number; showUsable: boolean };

function Flow({
  object,
  pace,
  startAt,
  layout,
  device,
  onLog,
  onRestart,
  onBuild,
}: {
  object: MockObject;
  pace: Pace;
  startAt: StartAt;
  layout: Layout;
  device: DeviceFrame;
  onLog: (line: string) => void;
  onRestart: () => void;
  onBuild: () => void;
}) {
  const atEnd = startAt === "done";
  const { kit } = object;
  const [phase, setPhase] = useState<Phase>(atEnd ? "done" : "live");
  const [shots, setShots] = useState(atEnd ? 1 : 0);
  // The photo bar fills when the shot's light reaches the top of the frame, not on the press, so the photo looks
  // carried up into it.
  const [filled, setFilled] = useState(atEnd ? 1 : 0);
  const [angle, setAngle] = useState(0);
  // The last shot's sweep has unveiled the grey photo.
  const [developed, setDeveloped] = useState(false);
  const [frozen, setFrozen] = useState(atEnd);
  const [pressed, setPressed] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [zoom, setZoom] = useState(ZOOM.min);
  const [burst, setBurst] = useState(0);
  const [header, setHeader] = useState<Header | undefined>(atEnd ? kit : undefined);
  const [parts, setParts] = useState<Part[]>(atEnd ? kit.parts : []);

  const unveil = useRef<UnveilHandle>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms: number, run: () => void) => void timers.current.push(window.setTimeout(run, ms));

  function read() {
    setPhase("reading");
    setFrozen(true);
    const pacing = PACES[pace];
    const t0 = performance.now();
    const stamp = (what: string) => onLog(`${((performance.now() - t0) / 1000).toFixed(1).padStart(4)} s  ${what}`);
    stamp("photos sent");
    later(pacing.started, () => {
      setHeader(kit);
      stamp(`found ${kit.name}`);
    });
    kit.parts.forEach((part, i) =>
      later(pacing.first + i * pacing.gap, () => {
        if (i === 0) setPhase("building");
        setParts((p) => [...p, part]);
        stamp(`part ${i + 1} · ${part.name}`);
      }),
    );
    later(pacing.first + (kit.parts.length - 1) * pacing.gap + pacing.tail, () => {
      setPhase("done");
      stamp("kit checked");
    });
  }

  function shoot() {
    if (phase !== "live" || frozen || shots >= MAX_PHOTOS) return;
    const n = shots + 1;
    const last = n >= MAX_PHOTOS;
    setFrozen(true);
    if (flashOn) setBurst((b) => b + 1);
    setShots(n);
    // The band climbs from the shutter with the next view already behind it. After the last shot that view is the
    // photo in grey dither, and Larry starts reading.
    unveil.current?.play(
      () => (last ? setDeveloped(true) : setAngle(n)),
      () => setFilled(n),
    );
    if (last) {
      read();
      return;
    }
    later(650, () => setFrozen(false));
  }

  // Moving on with fewer than MAX_PHOTOS plays the same sweep as the last shot: the band climbs from the shutter and
  // leaves the photo in grey dither, then Larry starts reading. (Fixed here only; src/mock/CameraMock.tsx went straight
  // to read(), so its develop never showed for one or two photos.)
  function use() {
    if (phase !== "live" || shots === 0 || frozen) return;
    setFrozen(true);
    unveil.current?.play(
      () => setDeveloped(true),
      () => setFilled(shots),
    );
    read();
  }

  const keys = useRef({ shoot, use });
  keys.current = { shoot, use };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPressed(true);
        keys.current.shoot();
      } else if (e.code === "Enter") keys.current.use();
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setPressed(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const live = phase === "live";
  const working = phase === "reading" || phase === "building";
  const done = phase === "done";
  // The camera is a sheet over the result. Once the model is ready it slides up and away, revealing the result.
  const [sheet, setSheet] = useState<"up" | "leaving" | "gone">(atEnd ? "gone" : "up");
  useEffect(() => {
    if (!done || sheet !== "up") return;
    // A beat on the finished light before the sheet lifts.
    const id = window.setTimeout(() => setSheet("leaving"), 450);
    return () => clearTimeout(id);
  }, [done, sheet]);
  const box = { width: layout.cardWidth, height: layout.cardLive };
  // Each new shot fakes a new angle on the same photo.
  const angleTransform = angle === 1 ? "scaleX(-1)" : angle === 2 ? "scale(1.12) translateY(3%)" : "none";
  const develop = useDevelop({
    active: developed && sheet !== "gone",
    photo: object.photo,
    box,
    zoom,
    grain: layout.top.ditherGrain,
    look: layout.develop,
    sweep: () => unveil.current?.now() ?? NO_SWEEP,
  });

  return (
    <div {...stylex.props(s.screen, s.screenRadius(device.radius), done && light)}>
      {/* The result, built underneath while Larry works, so it's whole when the camera lifts off it. */}
      {/* Mounted once the first wave has passed, so mounting it doesn't hold up the wave's first frames. */}
      {(phase === "building" || done) && (
        <div {...stylex.props(light, s.page)}>
          <div {...stylex.props(s.viewport(device.usableTop, device.usableHeight))}>
            <TopBar result shots={shots} parts={parts.length} height={TOP_BAR} sizes={layout.top} flashOn={false} onFlash={setFlashOn} onBack={onRestart} />
            <div {...stylex.props(s.cardWrap)}>
              <div {...stylex.props(s.card(layout.cardWidth, layout.cardResult, layout.cardRadius))}>
                {parts.length > 0 && (
                  <div {...stylex.props(s.viewer)}>
                    <KitViewer parts={parts} spin height={layout.cardResult} look={LOOK} />
                  </div>
                )}
                <div {...stylex.props(s.pip)} title="Your photo">
                  <img src={object.photo} alt="" {...stylex.props(s.photo, s.photoCover)} />
                </div>
                <span {...stylex.props(s.turnHint)}>Drag to turn</span>
              </div>
            </div>
            <div {...stylex.props(s.lower)}>
              <div {...stylex.props(s.layer, s.result)}>
                <span {...stylex.props(s.label)}>Larry found a</span>
                <h2 {...stylex.props(s.name)}>{header?.name ?? ""}</h2>
                <div {...stylex.props(s.countRow)}>
                  <span {...stylex.props(s.count)}>{parts.length}</span>
                  <span {...stylex.props(s.countText)}>
                    <span {...stylex.props(s.countWord)}>{parts.length === 1 ? "part" : "parts"}</span>
                    <span {...stylex.props(s.label)}>{done ? "Ready to build" : "Still finding more"}</span>
                  </span>
                </div>
                <div {...stylex.props(s.chips)}>
                  {parts.map((part) => (
                    <span key={part.id} {...stylex.props(s.chip)}>
                      <span {...stylex.props(s.swatch(part.color))} />
                      {part.name}
                    </span>
                  ))}
                </div>
                <div {...stylex.props(s.footer)}>
                  <Button disabled={!done} data-build onClick={onBuild} {...stylex.props(s.primary, done && s.primaryReady)}>
                    {done ? "Build it" : "Laying out parts…"}
                  </Button>
                  <Button {...stylex.props(s.link)} onClick={onRestart}>
                    Scan something else
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* The camera. While Larry works its controls dim and the frame glows; when the model is ready it lifts away. */}
      {sheet !== "gone" && (
        <div
          {...stylex.props(dark, s.page, s.sheet(device.radius), sheet === "leaving" && s.sheetUp)}
          onTransitionEnd={(e) => e.target === e.currentTarget && sheet === "leaving" && setSheet("gone")}
        >
          <div {...stylex.props(s.viewport(device.usableTop, device.usableHeight))}>
            <div {...stylex.props(s.dimmable, !live && s.dimmed)}>
              <TopBar busy={working} shots={filled} parts={parts.length} height={layout.barHeight} sizes={layout.top} flashOn={flashOn} onFlash={setFlashOn} onBack={onRestart} />
            </div>

            <div {...stylex.props(s.cardWrap)}>
              <canvas ref={develop.glow} aria-hidden {...stylex.props(s.glow(box.width, box.height, layout.develop.reach), !live && s.glowOn(layout.develop.glow))} />
              <div {...stylex.props(s.card(layout.cardWidth, layout.cardLive, layout.cardRadius))}>
                <div {...stylex.props(s.feed(box.width, box.height), s.feedDrift, (frozen || !live) && s.feedFrozen)}>
                  <Unveil ref={unveil} look={layout.shot} under={<canvas ref={develop.grey} aria-hidden {...stylex.props(s.grey)} />}>
                    <div {...stylex.props(s.zoom(zoom))}>
                      <Photo src={object.photo} transform={angleTransform} box={box} />
                    </div>
                    <canvas ref={develop.still} aria-hidden {...stylex.props(s.grey, !developed && s.hidden)} />
                  </Unveil>
                </div>
                {live && zoom > ZOOM.min + 0.04 && <span {...stylex.props(s.zoomChip)}>{zoom.toFixed(1)}×</span>}
              </div>
            </div>

            <div {...stylex.props(s.lower, s.dimmable, !live && s.dimmed)}>
              {/* Fills the band below the frame, so the controls are centred in it. */}
              <div {...stylex.props(s.layer)}>
                <div {...stylex.props(s.controls((DEVICE.width - layout.cardWidth) / 2))}>
                  <div {...stylex.props(s.slot, s.slotStart)}>
                    <ZoomWheel zoom={zoom} onZoom={setZoom} size={layout.wheel} cell={layout.top.ditherGrain} depth={layout.top.relief} drift={layout.top.idleDither} />
                  </div>
                  <Button
                    aria-label="Take photo"
                    disabled={!live}
                    {...stylex.props(s.shutter(layout.shutter))}
                    onPointerDown={() => setPressed(true)}
                    onPointerUp={() => setPressed(false)}
                    onPointerLeave={() => setPressed(false)}
                    onClick={shoot}
                  >
                    <span {...stylex.props(s.shutterFace(layout.shutter), pressed && s.shutterPressed)}>
                      <Surface
                        shape={circle(layout.shutter)}
                        relief={pressed ? "dishPressed" : "dish"}
                        grain={layout.top.ditherGrain}
                        depth={layout.top.relief}
                        drift={layout.top.idleDither}
                      />
                    </span>
                  </Button>
                  <div {...stylex.props(s.slot)}>
                    {shots > 0 && shots < MAX_PHOTOS && (
                      <Button {...stylex.props(s.use)} onClick={use}>
                        Use {shots} →
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <SystemBars tab={device.tab} hole={device.hole} />
      {burst > 0 && <div key={`burst-${burst}`} {...stylex.props(s.screenFlash)} />}
      {device.showUsable && (
        <div {...stylex.props(s.usable(device.usableTop, device.usableHeight))}>
          <span {...stylex.props(s.usableLabel)}>
            {DEVICE.width} × {device.usableHeight}
          </span>
        </div>
      )}
    </div>
  );
}

/** Android's status bar, Chrome's toolbar when in a tab, the camera hole and the gesture handle. */
function SystemBars({ tab, hole }: { tab: boolean; hole: number }) {
  return (
    <>
      <div {...stylex.props(s.statusBar, tab && s.chromeLight)}>
        <StatusBar />
      </div>
      {tab && (
        <div {...stylex.props(s.toolbar, s.chromeLight)}>
          <ChromeToolbar />
        </div>
      )}
      {hole > 0 && <div {...stylex.props(s.hole(hole))} />}
      <div {...stylex.props(s.handle)} />
    </>
  );
}

/** Positions are the measured ones, so the icons sit where Android draws them. */
function StatusBar() {
  return (
    <svg width={DEVICE.width} height={STATUS_BAR} viewBox={`0 0 ${DEVICE.width} ${STATUS_BAR}`} fill="currentColor" aria-hidden>
      <text x="31" y="30.9" fontFamily="'Google Sans', Roboto, system-ui, sans-serif" fontSize="14.5" fontWeight="500">
        12:30
      </text>
      <path d="M346.65 32 L339.4 21.7 A12.6 12.6 0 0 1 353.9 21.7 Z" />
      <path d="M355.4 32 L367.6 32 L367.6 19.4 Z" />
      <rect x="377.4" y="19.4" width="2.9" height="1.6" rx="0.4" />
      <rect x="375.2" y="20.6" width="7.3" height="11.4" rx="1.3" />
    </svg>
  );
}

/** Roughly Chrome's toolbar: home, address pill, new tab, tab count, menu. Only its height matters here. */
function ChromeToolbar() {
  return (
    <svg width={DEVICE.width} height={CHROME_TOOLBAR} viewBox={`0 0 ${DEVICE.width} ${CHROME_TOOLBAR}`} aria-hidden>
      <path d="M16 27 L24 20 L32 27 V35 H16 Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <rect x="48" y="8" width="216" height="40" rx="20" fill="#F1F3F4" />
      <text x="66" y="33" fontFamily="Roboto, system-ui, sans-serif" fontSize="15" fill="currentColor">
        larry.app
      </text>
      <path d="M289 22v12M283 28h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="331" y="20" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <text x="339" y="32" textAnchor="middle" fontFamily="Roboto, system-ui, sans-serif" fontSize="10" fontWeight="700" fill="currentColor">
        1
      </text>
      <circle cx="387" cy="21" r="1.8" fill="currentColor" />
      <circle cx="387" cy="28" r="1.8" fill="currentColor" />
      <circle cx="387" cy="35" r="1.8" fill="currentColor" />
    </svg>
  );
}

function Photo({ src, transform, box }: { src: string; transform: string; box: { width: number; height: number } }) {
  const [natural, setNatural] = useState<{ width: number; height: number }>();
  const fit = natural ? fitFor(natural, box) : "cover";
  return (
    <div {...stylex.props(s.angle(transform))}>
      {fit === "contain" && <img src={src} alt="" {...stylex.props(s.photo, s.photoBackdrop)} />}
      <img
        src={src}
        alt=""
        draggable={false}
        {...stylex.props(s.photo, fit === "cover" ? s.photoCover : s.photoContain)}
        onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
      />
    </div>
  );
}

/** The camera's top row (the photo bar and the flash switch), or on the result a back button, a summary and retake. */
function TopBar({
  result = false,
  busy = false,
  shots,
  parts,
  height,
  sizes,
  flashOn,
  onFlash,
  onBack,
}: {
  result?: boolean;
  /** Larry is working: the photo bar's dither drifts faster, as a loader. */
  busy?: boolean;
  shots: number;
  parts: number;
  height: number;
  sizes: TopSizes;
  flashOn: boolean;
  onFlash: (on: boolean) => void;
  onBack: () => void;
}) {
  const side = result ? 36 : sizes.flashWidth;
  return (
    <div {...stylex.props(s.topBar(height))}>
      <div {...stylex.props(s.side(side))}>
        {result && (
          <Button aria-label="Back to camera" {...stylex.props(s.iconButton)} onClick={onBack}>
            <BackIcon />
          </Button>
        )}
      </div>
      {result ? (
        <span {...stylex.props(s.topLabel(11, 14))}>
          {shots} {shots === 1 ? "photo" : "photos"} · {parts} parts
        </span>
      ) : (
        <PhotoBar shots={shots} busy={busy} sizes={sizes} />
      )}
      <div {...stylex.props(s.side(side), s.sideEnd)}>
        {result ? (
          <Button aria-label="Scan again" {...stylex.props(s.iconButton)} onClick={onBack}>
            <RetakeIcon />
          </Button>
        ) : (
          <FlashToggle on={flashOn} onChange={onFlash} width={sizes.flashWidth} height={sizes.height} cell={sizes.ditherGrain} idle={sizes.idleDither} relief={sizes.relief} />
        )}
      </div>
    </div>
  );
}

/**
 * Photos taken so far, as one bar that fills a third per photo, like a storage bar. While Larry reads the photos
 * the dither drifts faster, so the bar doubles as the loader.
 */
function PhotoBar({ shots, busy, sizes }: { shots: number; busy: boolean; sizes: TopSizes }) {
  return (
    <Progress value={shots} max={MAX_PHOTOS} aria-label="Photos" getValueLabel={(value) => `${value ?? 0} of ${MAX_PHOTOS} photos`}>
      <ProgressTrack {...stylex.props(s.photoBar(sizes.barWidth, sizes.height))}>
        <DitherBar
          fill={shots / MAX_PHOTOS}
          width={sizes.barWidth}
          height={sizes.height}
          radius={sizes.barRadius}
          cell={sizes.ditherGrain}
          dividers={THIRDS}
          idle={sizes.idleDither}
          speed={busy ? 3 : 0.8}
        />
      </ProgressTrack>
    </Progress>
  );
}

const THIRDS = [1 / 3, 2 / 3];
/** The camera screen's background. */
const CAMERA_BG = "#141414";
const GLOW_PAD = 8;
const NO_DIVIDERS: number[] = [];

const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
    <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const FlashIcon = ({ size, filled, color }: { size: number; filled: boolean; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z" fill={filled ? color : "none"} stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

/**
 * Flash as a switch: a pill track with a circle knob carrying the flash icon. When on, the knob slides right and the
 * pink track carries a drifting dither (lit cells gather at its edge) that grows in from the edge rather than snapping.
 */
function FlashToggle({
  on,
  onChange,
  width,
  height,
  cell,
  idle,
  relief,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  width: number;
  height: number;
  cell: number;
  idle: number;
  relief: number;
}) {
  const knob = height - 6;
  return (
    <Switch checked={on} onCheckedChange={onChange} aria-label="Flash" {...stylex.props(s.flashToggle(width, height))}>
      <DitherBar fill={on ? 1 : 0} reveal="fade" glow={0} width={width} height={height} radius={height / 2} cell={cell} dividers={NO_DIVIDERS} idle={idle} />
      <SwitchThumb {...stylex.props(s.knob(knob, 3), on && s.knobOn(width - height))}>
        <Surface shape={circle(knob)} relief="cap" grain={cell} depth={relief} drift={idle} />
        <span {...stylex.props(s.overSurface)}>
          <FlashIcon size={even(knob * 0.54)} filled={on} color={on ? ACCENT : "#6B6B6B"} />
        </span>
      </SwitchThumb>
    </Switch>
  );
}


/** The band's colours, synthwave from indigo to gold. The dither brings back its near-black as shade. */
const UNVEIL_PALETTE = accentChain(["#23005F", "#8700AF", "#FF0087", "#FF5F37", "#FFD700"]);
/** glimm's scope takes a style object, not a class. */
const SCOPE_FILL: CSSProperties = { position: "absolute", inset: 0 };
/**
 * glimm's band is never shown, only read back each frame and redrawn as dither, and reading a canvas back is slow. So
 * its canvas is shrunk by this much: glimm sizes it from its on-screen box, transforms included, and renders a
 * fraction of the pixels. The dither is coarser than that anyway.
 */
const BAND_SCALE = 0.25;
/**
 * glimm fades its band out over the last 24 px at each edge of its canvas, so a sweep inside a card doesn't end on a
 * hard border. Over the viewfinder that fade reads as an empty margin, so its canvas reaches this far past the frame
 * on every side and the fade falls outside it. The canvas is shrunk by BAND_SCALE, so its 24 px are this many here.
 */
const BAND_BLEED = 24 / BAND_SCALE;
/** The band counts as having reached the top once its edge is this far down the frame, as a share of its height. */
const TOP_REACHED = 0.03;

/** `onTop` runs once, when the band has climbed to the top of the frame. */
type UnveilHandle = { play: (change?: () => void, onTop?: () => void) => void; now: () => SweepNow };
const NO_SWEEP: SweepNow = { running: false, canvas: null, front: null };

/**
 * glimm's sweep, as in its "Generate data" demo: a band rises from the bottom, curved at its ends, and whatever
 * `change` sets is unveiled behind it while the old view holds ahead of it. glimm draws the band; we keep its canvas
 * invisible and redraw each frame as synthwave dither (see ditherBand).
 */
/** `under` sits over the scope but under the band: something that changes every frame, which glimm shouldn't watch. */
function Unveil({ ref, look, under, children }: { ref: Ref<UnveilHandle>; look: ShotLook; under?: ReactNode; children: ReactNode }) {
  const scope = useRef<GlimmScopeHandle>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const out = useRef<HTMLCanvasElement>(null);
  const band = useRef<HTMLCanvasElement | null>(null);
  const loop = useRef(0);
  const playedAt = useRef(0);
  const reachedTop = useRef<(() => void) | undefined>(undefined);
  const front = useRef<number | null>(null);
  const latest = useRef(look);
  latest.current = look;

  useLayoutEffect(() => {
    const canvas = wrap.current?.querySelector<HTMLCanvasElement>(":scope > div > canvas");
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
    band.current = canvas;
  }, []);
  useEffect(() => () => cancelAnimationFrame(loop.current), []);

  useImperativeHandle(
    ref,
    () => ({
      play(change, onTop) {
        scope.current?.play(change ? { change } : {});
        playedAt.current = performance.now();
        reachedTop.current = onTop;
        if (loop.current) return;
        const scratch = document.createElement("canvas");
        const tick = (now: number) => {
          const el = out.current;
          const source = band.current;
          const box = wrap.current;
          if (!el || !source || !box) {
            loop.current = 0;
            return;
          }
          const edge = ditherBand(el, source, box.clientWidth, box.clientHeight, BAND_BLEED, latest.current.grain, scratch);
          front.current = edge;
          const since = now - playedAt.current;
          if (edge !== null && edge <= TOP_REACHED) {
            reachedTop.current?.();
            reachedTop.current = undefined;
          }
          // Stop once the band has gone, or a beat after the sweep should have ended, whichever is first.
          if ((edge === null && since > 400) || since > latest.current.sweepMs + 1200) {
            front.current = null;
            reachedTop.current?.();
            reachedTop.current = undefined;
            el.getContext("2d")?.clearRect(0, 0, el.width, el.height);
            loop.current = 0;
            return;
          }
          loop.current = requestAnimationFrame(tick);
        };
        loop.current = requestAnimationFrame(tick);
      },
      now: () => ({ running: loop.current !== 0, canvas: out.current, front: front.current }),
    }),
    [],
  );

  return (
    <div ref={wrap} {...stylex.props(s.fill)}>
      <GlimmScope
        ref={scope}
        palette={UNVEIL_PALETTE}
        direction="btt"
        origin={[0.5, 1]}
        curve={look.curve}
        span={1}
        sweepMs={look.sweepMs}
        pageEffect={look.pageEffect}
        style={SCOPE_FILL}
      >
        {children}
      </GlimmScope>
      {under}
      <canvas ref={out} aria-hidden {...stylex.props(s.overlay)} />
    </div>
  );
}

/**
 * The zoom wheel beside the shutter. Drag it sideways, or use the arrow keys, to zoom; let go mid-spin and it coasts.
 * The drum turns with the finger (one radius of drag is one radian), and its ridges smear by how far it turned
 * in the last frame, so a fast spin blurs.
 */
function ZoomWheel({
  zoom,
  onZoom,
  size,
  cell,
  depth,
  drift,
}: {
  zoom: number;
  onZoom: (zoom: number) => void;
  size: { width: number; height: number; ridges: number; rim: number };
  cell: number;
  depth: number;
  drift: number;
}) {
  const { width, height, ridges, rim } = size;
  // One groove's turn, baked in WHEEL_FRAMES frames; the drum looks the same every groove, so that is every angle.
  const pitch = (2 * Math.PI) / ridges;
  const relief = useMemo(() => (t: number): Relief => [drum({ ridges, rim, turn: t * pitch })], [ridges, rim, pitch]);
  return (
    <Thumbwheel
      aria-label="Zoom"
      value={zoom}
      min={ZOOM.min}
      max={ZOOM.max}
      perPixel={ZOOM.perPixel}
      step={0.1}
      valueText={`${zoom.toFixed(1)}× zoom`}
      onValueChange={onZoom}
      {...stylex.props(s.wheel(width, height))}
    >
      {(state) => {
        const pixels = (state.value - ZOOM.min) / ZOOM.perPixel;
        const radians = pixels / (width / 2);
        // Velocity is value per ms; a frame is about 16 ms. A fast spin smears over the frames it turned through.
        const turned = (Math.abs(state.velocity) / ZOOM.perPixel / (width / 2)) * 16;
        const smear = Math.min(WHEEL_FRAMES * 0.6, turned / (pitch / WHEEL_FRAMES));
        return (
          <Surface
            shape={rrect(width, height, 10)}
            relief={relief}
            bakeKey={`wheel-${ridges}-${rim}`}
            frames={WHEEL_FRAMES}
            at={radians / pitch}
            smear={smear}
            grain={cell}
            depth={depth}
            drift={drift}
          />
        );
      }}
    </Thumbwheel>
  );
}

/** Frames baked per groove of the zoom wheel. More turns more smoothly, at a bake each. */
const WHEEL_FRAMES = 18;

/**
 * A dithered bar (see drawDitherBar). With `reveal="sweep"` the fill eases toward `fill`, so each new third sweeps in
 * from the left. With `reveal="fade"` the whole fill cross-fades in place, for a switch whose knob already shows the
 * motion.
 */
function DitherBar({
  fill,
  reveal = "sweep",
  glow = GLOW_PAD,
  idle,
  width,
  height,
  radius,
  cell,
  dividers,
  speed = 0.8,
}: {
  fill: number;
  reveal?: "sweep" | "fade";
  glow?: number;
  /** Strength of the grey dither on the empty track, 0 to 1. */
  idle: number;
  width: number;
  height: number;
  radius: number;
  cell: number;
  dividers: readonly number[];
  speed?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ fill, speed });
  live.current = { fill, speed };

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let shown = live.current.fill;
    let clock = 0;
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock += dt * live.current.speed;
      // The fade matches the knob's 240 ms slide; the sweep is a little slower so a new third reads as filling.
      shown += (live.current.fill - shown) * (reduced ? 1 : 1 - Math.exp(-dt / (reveal === "fade" ? 0.08 : 0.14)));
      const look = { cell, color: ACCENT, dividers, base: CAMERA_BG, glow, idle };
      if (reveal === "fade") drawDitherBar(el, width, height, radius, 1, look, reduced ? 0 : clock, shown);
      else drawDitherBar(el, width, height, radius, shown, look, reduced ? 0 : clock);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, radius, cell, dividers, reveal, glow, idle]);

  return <canvas ref={canvas} {...stylex.props(s.ditherBar(width, height, glow))} />;
}

const RetakeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
    <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
