import * as stylex from "@stylexjs/stylex";
import { camera } from "../camera/camera.stylex.ts";
import { Button } from "@ui-sdk/react/button";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Kit, type Part, parseKit } from "../../shared/kit.ts";
import { Camera } from "../camera/Camera.tsx";
import { ACCENT, CAMERA } from "../camera/look.ts";
import { screen } from "../camera/screen.stylex.ts";
import { DEFAULT_LOOK, type DitherLook } from "../kit3d/ditherLook.ts";
import { KitViewer } from "../kit3d/KitViewer.tsx";
import { colors, fonts, radii } from "../tokens.stylex.ts";
import { defaultSettings, type MockSettings, type Pace } from "./settings.ts";

/*
 * Mockup of the camera and the move from photo to model, in a phone frame. Nothing here talks to the server: the
 * camera is a fixture photo, and the kit's parts arrive on a timer copied from real runs.
 */

const Dials = import.meta.env.DEV ? lazy(() => import("./Dials.tsx")) : null;

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
const DEVICE = { width: 412, height: 915, radius: 44, bezel: 10, hole: 12 };
/** 136 device px. */
const STATUS_BAR = 52;
/** 63 device px. */
const GESTURE_BAR = 24;
/** Chrome's address bar in a normal tab. Not there when the app is installed to the home screen. */
const CHROME_TOOLBAR = 56;
const HANDLE = { x: 152, y: 900.5, width: 108, height: 3.5 };

const RESULT = { top: 44, cardHeight: 392 };
/** The model's dithered shadow in the accent too. */
const LOOK: DitherLook = { ...DEFAULT_LOOK, colors: { ...DEFAULT_LOOK.colors, accent: ACCENT.toLowerCase() } };

type Phase = "live" | "reading" | "building" | "done";
type StartAt = "live" | "done";

/** Milliseconds after the photos are sent. "real" follows a low-effort run: header at 5 s, first part at 6.7 s, done at about 12 s. */
const PACES: Record<Pace, { started: number; first: number; gap: number; tail: number }> = {
  demo: { started: 900, first: 1700, gap: 550, tail: 500 },
  real: { started: 5000, first: 6700, gap: 1300, tail: 900 },
};

const popIn = stylex.keyframes({ "0%": { opacity: 0, transform: "scale(0.5)" }, "100%": { opacity: 1, transform: "scale(1)" } });
const riseIn = stylex.keyframes({ "0%": { opacity: 0, transform: "translateY(6px)" }, "100%": { opacity: 1, transform: "translateY(0)" } });
const fadeIn = stylex.keyframes({ "0%": { opacity: 0 }, "100%": { opacity: 1 } });

const light = stylex.createTheme(screen, {
  bg: colors.paper,
  fg: colors.ink,
  muted: colors.graphite,
  chrome: "rgba(20, 20, 20, 0.06)",
  card: colors.paper,
});

/** The screen's defaults, set again on the camera so it stays dark while the screen under it turns light. */
const dark = stylex.createTheme(screen, {
  bg: colors.ink,
  fg: colors.paper,
  muted: "#8C8C8C",
  chrome: "rgba(255, 255, 255, 0.1)",
  card: "#232323",
});

const colorFade = "color 600ms ease, background-color 600ms ease";

export default function CameraMock() {
  const [settings, setSettings] = useState<MockSettings>(() => defaultSettings(OBJECT_NAMES.includes("bottle") ? "bottle" : (OBJECT_NAMES[0] ?? "")));
  const [run, setRun] = useState<{ id: number; startAt: StartAt }>({ id: 0, startAt: "live" });
  const [log, setLog] = useState<string[]>([]);
  const restart = (startAt: StartAt) => {
    setLog([]);
    setRun((r) => ({ id: r.id + 1, startAt }));
  };

  const usableTop = STATUS_BAR + (settings.tab ? CHROME_TOOLBAR : 0);
  const usableHeight = DEVICE.height - usableTop - GESTURE_BAR;
  const frame = { width: DEVICE.width + 2 * DEVICE.bezel, height: DEVICE.height + 2 * DEVICE.bezel };
  const scale = useFitScale(frame.height + 32);
  const object = OBJECTS.find((o) => o.name === settings.object) ?? OBJECTS[0];
  if (!object) return null;

  return (
    <div {...stylex.props(s.shell)}>
      <div {...stylex.props(s.panel)}>
        <div {...stylex.props(s.group)}>
          <p {...stylex.props(s.eyebrow)}>Larry · mockup</p>
          <h1 {...stylex.props(s.heading)}>Photo to model</h1>
          <p {...stylex.props(s.blurb)}>
            Pixel 8a screen, 412 × 915. The status bar, gesture bar and handle are measured from the Android emulator. The camera is a still photo; tap the
            shutter one to three times, then Use. Everything else is in the dials.
          </p>
          <p {...stylex.props(s.blurb)}>
            Usable height: {usableHeight}px {settings.tab ? "in a Chrome tab" : "as an installed app"}.
          </p>
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
        <div data-phone {...stylex.props(s.phone(scale))}>
          <Flow
            key={`${run.id}-${object.name}-${settings.pace}`}
            object={object}
            pace={settings.pace}
            startAt={run.startAt}
            settings={settings}
            usableTop={usableTop}
            usableHeight={usableHeight}
            onLog={(line) => setLog((l) => [...l, line])}
            onRestart={() => restart("live")}
          />
        </div>
      </div>
      {Dials && (
        <Suspense>
          <Dials objects={OBJECT_NAMES} initial={settings} onChange={setSettings} onAction={(action) => restart(action === "jump" ? "done" : "live")} />
        </Suspense>
      )}
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

type Header = { name: string; summary: string };

function Flow({
  object,
  pace,
  startAt,
  settings,
  usableTop,
  usableHeight,
  onLog,
  onRestart,
}: {
  object: MockObject;
  pace: Pace;
  startAt: StartAt;
  settings: MockSettings;
  usableTop: number;
  usableHeight: number;
  onLog: (line: string) => void;
  onRestart: () => void;
}) {
  const atEnd = startAt === "done";
  const { kit } = object;
  const [phase, setPhase] = useState<Phase>(atEnd ? "done" : "live");
  const [shots, setShots] = useState(atEnd ? 1 : 0);
  const [header, setHeader] = useState<Header | undefined>(atEnd ? kit : undefined);
  const [parts, setParts] = useState<Part[]>(atEnd ? kit.parts : []);
  // The camera is a sheet over the result. Once the model is ready it slides up and away, revealing the result.
  const [sheet, setSheet] = useState<"up" | "leaving" | "gone">(atEnd ? "gone" : "up");

  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms: number, run: () => void) => void timers.current.push(window.setTimeout(run, ms));

  function read(n: number) {
    setShots(n);
    setPhase("reading");
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

  const done = phase === "done";
  useEffect(() => {
    if (!done || sheet !== "up") return;
    // A beat on the finished light before the sheet lifts.
    const id = window.setTimeout(() => setSheet("leaving"), 450);
    return () => clearTimeout(id);
  }, [done, sheet]);
  const cardWidth = DEVICE.width - 2 * CAMERA.sideInset;

  return (
    <div {...stylex.props(s.screen, done && light)}>
      {/* The result, built underneath while Larry works, so it's whole when the camera lifts off it. */}
      {(phase === "building" || done) && (
        <div {...stylex.props(light, s.page)}>
          <div {...stylex.props(s.viewport(usableTop, usableHeight))}>
            <ResultHeader shots={shots} parts={parts.length} onBack={onRestart} />
            <div {...stylex.props(s.cardWrap)}>
              <div {...stylex.props(s.card(cardWidth, RESULT.cardHeight))}>
                {parts.length > 0 && (
                  <div {...stylex.props(s.viewer)}>
                    {/* Covered by the camera until it lifts, so it holds still until then. */}
                    <KitViewer parts={parts} spin={sheet !== "up"} height={RESULT.cardHeight} look={LOOK} />
                  </div>
                )}
                <div {...stylex.props(s.pip)} title="Your photo">
                  <img src={object.photo} alt="" {...stylex.props(s.pipPhoto)} />
                </div>
                <span {...stylex.props(s.turnHint)}>Drag to turn</span>
              </div>
            </div>
            <div {...stylex.props(s.lower)}>
              <div {...stylex.props(s.result)}>
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
                  <Button disabled={!done} {...stylex.props(s.primary, done && s.primaryReady)}>
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

      {sheet !== "gone" && (
        <div
          {...stylex.props(dark, s.page, s.sheet, sheet === "leaving" && s.sheetUp)}
          onTransitionEnd={(e) => e.target === e.currentTarget && sheet === "leaving" && setSheet("gone")}
        >
          <div {...stylex.props(s.viewport(usableTop, usableHeight))}>
            <Camera photo={object.photo} width={DEVICE.width} height={usableHeight} busy={phase === "reading" || phase === "building"} tuning={settings.tuning} onCapture={read} />
          </div>
        </div>
      )}

      <SystemBars tab={settings.tab} />
      {settings.showUsable && (
        <div {...stylex.props(s.usable(usableTop, usableHeight))}>
          <span {...stylex.props(s.usableLabel)}>
            {DEVICE.width} × {usableHeight}
          </span>
        </div>
      )}
    </div>
  );
}

/** The result's top row: back, a summary, and scan again. */
function ResultHeader({ shots, parts, onBack }: { shots: number; parts: number; onBack: () => void }) {
  return (
    <div {...stylex.props(s.header)}>
      <Button aria-label="Back to camera" {...stylex.props(s.iconButton)} onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Button>
      <span {...stylex.props(s.summary)}>
        {shots} {shots === 1 ? "photo" : "photos"} · {parts} parts
      </span>
      <Button aria-label="Scan again" {...stylex.props(s.iconButton)} onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Button>
    </div>
  );
}

/** Android's status bar, Chrome's toolbar when in a tab, the camera hole and the gesture handle. */
function SystemBars({ tab }: { tab: boolean }) {
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
      <div {...stylex.props(s.hole)} />
      <div {...stylex.props(s.handle)} />
    </>
  );
}

/** Positions are the measured ones, so the icons sit where Android draws them. Android's own font, not ours. */
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

const s = stylex.create({
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

  phoneSlot: (width: number, height: number) => ({ width, height, flexShrink: 0 }),
  // The frame has its own size, so it is not sized by the already-shrunk slot and then scaled a second time.
  phone: (scale: number) => ({
    width: DEVICE.width + 2 * DEVICE.bezel,
    height: DEVICE.height + 2 * DEVICE.bezel,
    boxSizing: "border-box",
    padding: DEVICE.bezel,
    borderRadius: DEVICE.radius + DEVICE.bezel,
    backgroundColor: "#0A0A0A",
    boxShadow: "0 40px 80px -24px rgba(0, 0, 0, 0.35)",
    transform: `scale(${scale})`,
    transformOrigin: "top left",
  }),

  screen: {
    position: "relative",
    width: DEVICE.width,
    height: DEVICE.height,
    borderRadius: DEVICE.radius,
    overflow: "hidden",
    backgroundColor: screen.bg,
    color: screen.fg,
    fontFamily: fonts.sans,
    transition: colorFade,
    userSelect: "none",
  },
  statusBar: { position: "absolute", top: 0, left: 0, width: DEVICE.width, height: STATUS_BAR, transition: colorFade },
  chromeLight: { backgroundColor: colors.paper, color: "#1F1F1F" },
  toolbar: { position: "absolute", top: STATUS_BAR, left: 0, width: DEVICE.width, height: CHROME_TOOLBAR, boxShadow: "inset 0 -1px 0 #E3E3E3" },
  hole: {
    position: "absolute",
    top: STATUS_BAR / 2 - DEVICE.hole / 2,
    left: DEVICE.width / 2 - DEVICE.hole / 2,
    width: DEVICE.hole,
    height: DEVICE.hole,
    borderRadius: radii.pill,
    backgroundColor: "#000000",
    boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.06)",
  },
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
    borderColor: colors.blue,
    backgroundColor: "rgba(47, 107, 255, 0.06)",
    pointerEvents: "none",
  }),
  usableLabel: {
    position: "absolute",
    top: 4,
    right: 4,
    paddingInline: 6,
    borderRadius: 4,
    backgroundColor: colors.blue,
    color: colors.paper,
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: "18px",
  },
  viewport: (top: number, height: number) => ({ position: "absolute", top, left: 0, width: DEVICE.width, height, display: "flex", flexDirection: "column" }),

  // The two screens: the result underneath, the camera over it as a sheet that lifts away.
  page: { position: "absolute", top: 0, left: 0, width: DEVICE.width, height: DEVICE.height, backgroundColor: screen.bg, color: screen.fg },
  sheet: {
    borderBottomLeftRadius: DEVICE.radius,
    borderBottomRightRadius: DEVICE.radius,
    overflow: "hidden",
    transition: "transform 820ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 820ms ease",
  },
  sheetUp: { transform: `translateY(${-DEVICE.height}px)`, boxShadow: "0 24px 48px rgba(0, 0, 0, 0.3)" },

  header: { height: RESULT.top, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", paddingInline: 20 },
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
  summary: { fontFamily: fonts.mono, fontSize: 11, lineHeight: "14px", letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" },
  cardWrap: { position: "relative", alignSelf: "center", flexShrink: 0 },
  card: (width: number, height: number) => ({
    position: "relative",
    width,
    height,
    borderRadius: camera.cardRadius,
    overflow: "hidden",
    backgroundColor: screen.card,
    transition: `height 700ms ${camera.easeOut}, background-color 600ms ease`,
  }),
  viewer: { position: "absolute", top: 0, left: 0, width: "100%", animationName: fadeIn, animationDuration: "500ms", animationDelay: "150ms", animationFillMode: "both" },
  pip: {
    position: "absolute",
    left: 14,
    bottom: 14,
    width: 40,
    height: 52,
    borderRadius: 10,
    overflow: "hidden",
    boxShadow: `0 0 0 2px ${colors.paper}, 0 4px 12px rgba(0, 0, 0, 0.18)`,
    animationName: popIn,
    animationDuration: "400ms",
    animationTimingFunction: camera.easeOut,
    animationDelay: "300ms",
    animationFillMode: "both",
  },
  pipPhoto: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" },
  turnHint: { position: "absolute", right: 16, bottom: 16, fontFamily: fonts.mono, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: screen.muted },

  lower: { position: "relative", flexGrow: 1 },
  result: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", paddingTop: 18, paddingInline: 24, gap: 2 },
  label: { fontFamily: fonts.mono, fontSize: 11, lineHeight: "14px", letterSpacing: "0.08em", textTransform: "uppercase", color: screen.muted, transition: colorFade },
  name: { margin: 0, fontSize: 28, lineHeight: "34px", fontWeight: 600, letterSpacing: "-0.02em", animationName: riseIn, animationDuration: "350ms", animationTimingFunction: camera.easeOut },
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
    animationTimingFunction: camera.easeOut,
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
