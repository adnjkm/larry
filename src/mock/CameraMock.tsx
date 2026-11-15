import * as stylex from "@stylexjs/stylex";
import { camera } from "../camera/camera.stylex.ts";
import { Button } from "@ui-sdk/react/button";
import { lazy, type ReactNode, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Kit, type Part, parseKit } from "../../shared/kit.ts";
import { Camera } from "../camera/Camera.tsx";
import { ACCENT, CAMERA } from "../camera/look.ts";
import { screen } from "../camera/screen.stylex.ts";
import { DEFAULT_LOOK, type DitherLook } from "../kit3d/ditherLook.ts";
import { KitViewer } from "../kit3d/KitViewer.tsx";
import { pill } from "../surface/relief.ts";
import { PillLabel } from "../ui/PillSurface.tsx";
import { Surface } from "../surface/Surface.tsx";
import { colors, fonts, radii } from "../tokens.stylex.ts";
import { LessonProgress } from "../ui/LessonProgress.tsx";
import { defaultSettings, type MockSettings, type Pace, type Screen } from "./settings.ts";

/*
 * Mockup of the camera and the move from photo to model, in a phone frame. Nothing here talks to the server: the
 * camera is a fixture photo, and the kit's parts arrive on a timer copied from real runs.
 */

const Dials = import.meta.env.DEV ? lazy(() => import("./Dials.tsx")) : null;

const photoUrls = import.meta.glob<string>("../../fixtures/photos/*.jpg", { eager: true, query: "?url", import: "default" });
const kitJson = import.meta.glob<unknown>("../../fixtures/kits/*.json", { eager: true, import: "default" });
const nameOf = (path: string) =>
  path
    .split("/")
    .pop()
    ?.replace(/\.\w+$/, "") ?? path;

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

/**
 * The model screen: the progress bar, the model and the pill are one group, spaced `gap` apart and lifted `lift` off
 * the bottom; the pill is `pill` tall with the link `link` under it.
 */
const MODEL_SCREEN = { gap: 24, lift: 48, pill: 56, link: 16, count: 16 };
/** The model's dithered shadow in the accent too. */
const LOOK: DitherLook = { ...DEFAULT_LOOK, colors: { ...DEFAULT_LOOK.colors, accent: ACCENT.toLowerCase() } };

type Phase = "live" | "reading" | "building" | "done";
type StartAt = "live" | "done";

/** Milliseconds after the photos are sent. "real" follows a low-effort run: header at 5 s, first part at 6.7 s, done at about 12 s. */
const PACES: Record<Pace, { started: number; first: number; gap: number; tail: number }> = {
  demo: { started: 900, first: 1700, gap: 550, tail: 500 },
  real: { started: 5000, first: 6700, gap: 1300, tail: 900 },
};

const fadeIn = stylex.keyframes({ "0%": { opacity: 0 }, "100%": { opacity: 1 } });

const light = stylex.createTheme(screen, {
  bg: colors.paper,
  fg: colors.ink,
  muted: colors.graphite,
  chrome: "rgba(20, 20, 20, 0.06)",
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

/** Where a screen after the camera sits inside the phone: below the status bar, above the gesture bar, in CSS px. */
export type PhoneScreen = { top: number; height: number; width: number };

/**
 * The camera in a phone, with the fake flow round it. Given `after`, it is a demo: the result's "Build It" hands the
 * phone over to whatever `after` draws, until `onCamera`. `dials` shows the DialKit panel (dev only); on by default
 * without `after`.
 */
export default function CameraMock({
  object: initialObject,
  after,
  dials = !after,
}: { object?: string; after?: (props: { screen: PhoneScreen; onCamera: () => void }) => ReactNode; dials?: boolean } = {}) {
  const [settings, setSettings] = useState<MockSettings>(() =>
    defaultSettings(initialObject ?? (OBJECT_NAMES.includes("bottle") ? "bottle" : (OBJECT_NAMES[0] ?? ""))),
  );
  const [run, setRun] = useState<{ id: number; startAt: StartAt }>({ id: 0, startAt: "live" });
  const [built, setBuilt] = useState(false);
  const restart = (startAt: StartAt) => {
    setBuilt(false);
    setRun((r) => ({ id: r.id + 1, startAt }));
  };

  // Which screen is on the phone: the camera until it lifts off the model, the model, then the lesson once Build It
  // hands over.
  const [onCamera, setOnCamera] = useState(true);
  const current: Screen = built && after ? "lesson" : onCamera ? "camera" : "model";
  const screens: Screen[] = after ? ["camera", "model", "lesson"] : ["camera", "model"];
  /** Starts a run on `screen`: the camera, the finished model, or the lesson straight after it. */
  const jump = (screen: Screen) => {
    restart(screen === "camera" ? "live" : "done");
    if (screen === "lesson" && after) setBuilt(true);
  };
  // Picking a screen in the dials goes there, and so does opening the page with one picked. Moving on by using the
  // flow changes the picked screen too, but then it's already there.
  useEffect(() => {
    if (dials && settings.screen !== current) jump(settings.screen);
  }, [settings.screen]);

  const usableTop = STATUS_BAR + (settings.tab ? CHROME_TOOLBAR : 0);
  const usableHeight = DEVICE.height - usableTop - GESTURE_BAR;
  const frame = { width: DEVICE.width + 2 * DEVICE.bezel, height: DEVICE.height + 2 * DEVICE.bezel };
  const scale = useFitScale(frame.height + 32);
  const object = OBJECTS.find((o) => o.name === settings.object) ?? OBJECTS[0];
  if (!object) return null;
  // The phone on the left holds still on the screen before this one, to compare against: the camera beside the model,
  // the model beside the lesson. The camera has nothing before it, so the model stands beside it.
  const previous: Screen = current === "model" ? "camera" : "model";

  return (
    <div {...stylex.props(s.shell)}>
      <div {...stylex.props(s.phoneSlot(frame.width * scale, frame.height * scale))}>
        <div inert {...stylex.props(s.phone(scale))}>
          <Flow
            key={`still-${previous}-${object.name}-${run.id}`}
            object={object}
            pace={settings.pace}
            startAt={previous === "camera" ? "live" : "done"}
            settings={settings}
            usableTop={usableTop}
            usableHeight={usableHeight}
            onRestart={() => {}}
            still
          />
        </div>
      </div>

      <div {...stylex.props(s.phoneSlot(frame.width * scale, frame.height * scale))}>
        <div data-phone {...stylex.props(s.phone(scale))}>
          {current === "lesson" && after ? (
            <div data-after {...stylex.props(s.screen, light)}>
              <div {...stylex.props(light, s.page)}>
                <div {...stylex.props(s.viewport(usableTop, usableHeight))}>
                  {after({ screen: { top: usableTop, height: usableHeight, width: DEVICE.width }, onCamera: () => restart("live") })}
                </div>
              </div>
              <SystemBars tab={settings.tab} />
            </div>
          ) : (
            <Flow
              key={`${run.id}-${object.name}-${settings.pace}`}
              object={object}
              pace={settings.pace}
              startAt={run.startAt}
              settings={settings}
              usableTop={usableTop}
              usableHeight={usableHeight}
              onRestart={() => restart("live")}
              onBuild={after && (() => setBuilt(true))}
              onCamera={setOnCamera}
            />
          )}
        </div>
      </div>
      {Dials && dials && (
        <Suspense>
          <Dials
            objects={OBJECT_NAMES}
            screens={screens}
            current={current}
            initial={settings}
            onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            onReplay={() => jump(current)}
          />
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

function Flow({
  object,
  pace,
  startAt,
  settings,
  usableTop,
  usableHeight,
  onRestart,
  onBuild,
  onCamera,
  still = false,
}: {
  object: MockObject;
  pace: Pace;
  startAt: StartAt;
  settings: MockSettings;
  usableTop: number;
  usableHeight: number;
  onRestart: () => void;
  onBuild?: () => void;
  /** Whether the camera is still over the model, until it has lifted away. */
  onCamera?: (up: boolean) => void;
  /** A still copy for comparing against: nothing turns, and the keyboard doesn't work it. */
  still?: boolean;
}) {
  const atEnd = startAt === "done";
  const { kit } = object;
  const [phase, setPhase] = useState<Phase>(atEnd ? "done" : "live");
  // The lesson, one step per mechanism: the furthest step reached (-1 until Build It), and the step on screen, which
  // can be any step up to the furthest, never past it.
  const steps = settings.model.steps;
  const [reached, setReached] = useState(-1);
  const [step, setStep] = useState(0);
  const finished = reached >= steps;
  const [parts, setParts] = useState<Part[]>(atEnd ? kit.parts : []);
  // The camera is a sheet over the result. Once the model is ready it slides up and away, revealing the result.
  const [sheet, setSheet] = useState<"up" | "leaving" | "gone">(atEnd ? "gone" : "up");
  useEffect(() => onCamera?.(sheet !== "gone"), [sheet]);

  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms: number, run: () => void) => void timers.current.push(window.setTimeout(run, ms));

  function read() {
    setPhase("reading");
    const pacing = PACES[pace];
    kit.parts.forEach((part, i) =>
      later(pacing.first + i * pacing.gap, () => {
        if (i === 0) setPhase("building");
        setParts((p) => [...p, part]);
      }),
    );
    later(pacing.first + (kit.parts.length - 1) * pacing.gap + pacing.tail, () => {
      setPhase("done");
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
  const { model } = settings;
  // The model takes what's left once the progress bar, the pill and link, the gaps and the lift are placed.
  const actions = MODEL_SCREEN.pill + 16 + MODEL_SCREEN.link;
  const modelHeight = Math.min(
    model.height,
    usableHeight - (MODEL_SCREEN.count + 12 + model.keyHeight) - actions - 2 * MODEL_SCREEN.gap - MODEL_SCREEN.lift - 24,
  );
  // In the demo, Build It hands the phone to the lesson. On its own, the mockup has no lesson yet, so the pill stands in
  // for finishing a step: it starts the lesson, then moves it on.
  const build = () => {
    if (onBuild) return onBuild();
    const next = Math.min(steps, reached + 1);
    setReached(next);
    setStep(Math.min(steps - 1, next));
  };
  const label = !done ? "Laying out parts…" : onBuild || reached < 0 ? "Build It" : finished ? "Built" : reached === steps - 1 ? "Finish" : "Next Step";

  return (
    <div {...stylex.props(s.screen, done && light)}>
      {/* The result, built underneath while Larry works, so it's whole when the camera lifts off it. */}
      {(phase === "building" || done) && (
        <div {...stylex.props(light, s.page)}>
          <div {...stylex.props(s.viewport(usableTop, usableHeight))}>
            {/* The progress bar, the model and the pill are one group, evenly spaced, so the bar sits as far above the
                model as the pill sits below it. Nothing else: no header, counts or parts list. */}
            <div {...stylex.props(s.reveal)}>
              <LessonProgress
                count={steps}
                reached={reached}
                step={step}
                onStep={setStep}
                width={cardWidth}
                height={model.keyHeight}
                caption={`${steps} ${steps === 1 ? "mechanism" : "mechanisms"}`}
              />
              <div {...stylex.props(s.stage)}>
                {parts.length > 0 && (
                  <div {...stylex.props(s.model)}>
                    {/* Covered by the camera until it lifts, so it holds still until then. */}
                    <KitViewer parts={parts} spin={!still && sheet !== "up"} roll={model.tilt} height={modelHeight} look={LOOK} />
                  </div>
                )}
              </div>
              <div {...stylex.props(s.actions(cardWidth))}>
                <Button disabled={!done || finished} data-build onClick={build} {...stylex.props(s.build)}>
                  <Surface
                    shape={pill(cardWidth, MODEL_SCREEN.pill)}
                    relief="cap"
                    material="slate"
                    ground="light"
                    grain={CAMERA.grain}
                    depth={CAMERA.relief}
                    drift={CAMERA.idleDither}
                  />
                  <PillLabel>{label}</PillLabel>
                </Button>
                <Button {...stylex.props(s.link)} onClick={onRestart}>
                  Scan something else
                </Button>
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
            <Camera
              photo={object.photo}
              width={DEVICE.width}
              height={usableHeight}
              busy={phase === "reading" || phase === "building"}
              tuning={settings.tuning}
              onCapture={read}
              keys={!still}
            />
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

  card: (width: number, height: number) => ({
    position: "relative",
    width,
    height,
    borderRadius: camera.cardRadius,
    overflow: "hidden",
    backgroundColor: screen.card,
    transition: `height 700ms ${camera.easeOut}, background-color 600ms ease`,
  }),

  // The model screen: the lesson's progress, the model large, and the one thing to do and a way out, as one evenly
  // spaced group, centred and lifted a little above the middle.
  reveal: {
    flexGrow: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: MODEL_SCREEN.gap,
    paddingBottom: MODEL_SCREEN.lift,
  },
  stage: { alignSelf: "stretch", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  model: { width: "100%", animationName: fadeIn, animationDuration: "600ms", animationDelay: "200ms", animationFillMode: "both" },
  actions: (width: number) => ({ width, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }),
  // The pill is a raised dark key: its look is the Surface under the label. Pressing sinks it a touch.
  build: {
    position: "relative",
    width: "100%",
    height: MODEL_SCREEN.pill,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: { default: "pointer", ":disabled": "default" },
    opacity: { default: 1, ":disabled": 0.5 },
    transform: { default: "none", ":active:not(:disabled)": "scale(0.98)" },
    transition: `transform 160ms ${camera.easeOut}, opacity 300ms ease`,
  },

  link: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: screen.muted,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: "16px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
  },
});
