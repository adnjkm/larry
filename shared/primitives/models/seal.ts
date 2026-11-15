// Seal: block a gap so nothing leaks (src/primitives/docs/design-language.md, motion-language.md).
//
// The rig is a pipe end with a flange, a pink rubber gasket ring on its face, and a lid pressed down on the gasket by
// the hand. The lid is the handle: pressing it down squeezes the gasket. Rubber does not shrink when squeezed, it moves,
// so the gasket's volume is kept: as it gets thinner its ring grows wider, π (R² - r²) t = constant, and past the flange's
// edge it is squeezed out as a lip. Too little squeeze leaves gaps and the joint weeps drops down the pipe.
//
// The game, "Pressure test": run the joint at 300 kPa. Squeezed under 15% it weeps; squeezed over 30% the rubber is forced
// out past the flange, splits and sprays; in between it stays dry. One number, the squeeze, decides which.
//
// A run tells it in order: the lid is backed off and screwed down to the squeeze that was set (the gasket thins and
// spreads by exactly that much), the line pressure counts up from 0 to 300 kPa, and only then does the joint show what
// the squeeze means: drops escape at the gap, the rubber splits and sprays, or nothing comes out.
import type { Part } from "../../kit.ts";
import { clamp01, fall, smooth } from "../motion/ease.ts";
import { frame, MARK, phases } from "../motion/run.ts";
import { COLOR, cylinder, fmt, type Look, lathe, look, on, part, plate, PLATE_TOP, pushDisc, v3, type Pt } from "../parts.ts";
import { type Cue, type Meter, type Primitive, type Run, type Values, type Verdict, VIEW, type Slider, valueOf } from "../types.ts";
import { DEG_TO_RAD } from "../../angles.ts";

// Geometry, millimetres.
/** The gasket's thickness before squeezing. */
export const T0 = 18;
const BORE_R = 14;
const PIPE_R = 20;
const GASKET_R0 = 36;
/** Under this squeeze the joint weeps, over SPLIT the rubber splits. Real static seals sit roughly between. */
export const WEEP = 0.15;
export const SPLIT = 0.3;
/** The flange is as wide as the gasket gets at SPLIT, so the gasket reaches its edge exactly there: volume conservation, not a typed number. */
const wideAt = (s: number, r0 = GASKET_R0) => Math.sqrt(BORE_R ** 2 + (r0 ** 2 - BORE_R ** 2) / (1 - s));
const FLANGE_R = wideAt(SPLIT);
const FLANGE_T = 10;
const PIPE_H = 48;
const LID_T = 10;
const GASKET_Y = PLATE_TOP + PIPE_H + FLANGE_T;
const HANDLE_T = 4;
const DROP_R = 3.2;
const DROP_X = FLANGE_R + DROP_R + 1;
/** The widest the gasket gets, at 40% squeeze. */
const WIDEST = wideAt(0.4);
const SQUEEZE_MAX = 0.4;

/** Everything a pose needs. `build`, `readouts`, the handle and the game all read this. */
export function settle(v: Values) {
  const squeeze = valueOf(SQUEEZE, v);
  const t = T0 * (1 - squeeze);
  /** The gasket's outer radius: the rubber is moved, not lost. */
  const outer = wideAt(squeeze);
  const lip = Math.max(0, outer - FLANGE_R);
  const weeps = squeeze < WEEP - 1e-9;
  /** How many drops are on their way down: more the wider the gaps. */
  const drops = weeps ? Math.ceil((3 * (WEEP - squeeze)) / WEEP - 1e-9) : 0;
  return { squeeze, t, outer, lip, weeps, split: squeeze > SPLIT + 1e-9, drops, lidTop: GASKET_Y + t + LID_T };
}

/**
 * The lid is steel, matte: the metal finish catches the light and renders near-white, which competes with the one
 * light part, the handle, sitting on top of it.
 */
const LID_LOOK: Look = { color: COLOR.steel, finish: "matte" };

/**
 * A weeping joint's drops are on their way down at this `drip` phase when nothing is running: drop k has been falling
 * `drip - k/n` of the way and then goes round again. A run starts a drop only once its time comes (`drip - k/n` ≥ 0),
 * and `drip` < 0 means no drop yet: the pressure is still climbing.
 */
const DRIP_REST = 1.4;

/** A drop's height `phase` of the way down (0 at the joint, 1 on the plate), falling faster as it goes. */
const dropY = (phase: number) => GASKET_Y + FLANGE_T / 2 - (GASKET_Y + FLANGE_T / 2 - (PLATE_TOP + DROP_R)) * fall(phase);
const dropShape = lathe(Array.from({ length: 9 }, (_, i): Pt => {
  const a = ((i / 8) * 180 - 90) * DEG_TO_RAD;
  return [DROP_R * Math.cos(a), DROP_R * Math.sin(a)];
}));

function build(v: Values): Part[] {
  const s = settle(v);
  const pipe = lathe([[BORE_R, 0], [PIPE_R, 0], [PIPE_R, PIPE_H], [FLANGE_R, PIPE_H], [FLANGE_R, PIPE_H + FLANGE_T], [BORE_R, PIPE_H + FLANGE_T], [BORE_R, 0]]);
  const gasket = lathe([[BORE_R, 0], [s.outer, 0], [s.outer, s.t], [BORE_R, s.t], [BORE_R, 0]]);
  const lid = cylinder(FLANGE_R, LID_T);
  const drip = v.drip ?? DRIP_REST;
  return [
    plate(WIDEST + DROP_X + DROP_R, 2 * WIDEST),
    part("pipe", "Pipe end", "The end of a pipe, with a flat flange for the gasket to sit on.", pipe.shape, v3(0, PLATE_TOP + pipe.midY, 0), look.structure, on("plate", "weld")),
    part("gasket", "Gasket", "Soft rubber ring. Squeezed thinner, it spreads wider: the rubber is moved, not lost.", gasket.shape, v3(0, GASKET_Y + gasket.midY, 0), look.focus, on("pipe", "press-fit")),
    part("lid", "Lid", "Closes the pipe and squeezes the gasket against the flange.", lid.shape, v3(0, GASKET_Y + s.t + lid.midY, 0), LID_LOOK, on("pipe", "screw")),
    pushDisc("handle", v3(0, s.lidTop + HANDLE_T / 2, 0), "y", { name: "Press disc", role: "Where your hand presses the lid down.", on: on("lid", "glue") }),
    ...Array.from({ length: s.drops }, (_, k) => ({ k, u: drip - k / s.drops }))
      .filter(({ u }) => u >= 0)
      .map(({ k, u }) => part(`drop-${k + 1}`, "Drop", "A drop that has got through the gaps and runs down the pipe.", dropShape.shape, v3(DROP_X, dropY(u % 1), 0), look.slate, on("pipe", "glue"))),
  ];
}

function readouts(v: Values) {
  const s = settle(v);
  return [
    { label: "Squeeze", value: `thickness lost ÷ original = (${fmt(T0, 1)} − ${fmt(s.t, 1)}) ÷ ${fmt(T0, 1)} = ${fmt(s.squeeze * 100)}%` },
    { label: "Travel", value: `lid down ${fmt(T0 - s.t, 1)} mm; the rubber spreads ${fmt(s.outer - GASKET_R0, 1)} mm outward` },
    { label: "State", value: s.weeps ? `weeping: gaps stay open under ${fmt(WEEP * 100)}%` : s.split ? `crushed: rubber forced ${fmt(s.lip, 1)} mm past the flange` : "sealed: the rubber fills the gaps" },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "weeps" | "splits";

/** Line pressure, kPa. */
export const PRESSURE = 300;

/** The outcome, decided once from the squeeze; meters, judge and play all read it. */
export function test(v: Values) {
  const s = settle(v);
  const kind: Kind = s.weeps ? "weeps" : s.split ? "splits" : "pass";
  return { kind, squeeze: s.squeeze, lip: s.lip, t: s.t };
}

function judge(v: Values): Verdict {
  const r = test(v);
  switch (r.kind) {
    case "weeps":
      return { pass: false, outcome: "weeping", headline: "The joint weeps", detail: "Too loose: gaps stay open, so liquid seeps through." };
    case "splits":
      return { pass: false, outcome: "rubber-split", headline: "The rubber split", detail: "Too tight: the rubber is forced out and splits." };
    case "pass":
      return { pass: true, outcome: "dry-joint", headline: "Dry joint", detail: "The gasket fills every gap without splitting, so the joint stays dry." };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = test(v);
  return [
    { label: "Gaps shut", value: r.squeeze * 100, target: WEEP * 100, max: SQUEEZE_MAX * 100, unit: "%", need: "atLeast" },
    { label: "Not split", value: r.squeeze * 100, target: SPLIT * 100, max: SQUEEZE_MAX * 100, unit: "%", need: "atMost" },
  ];
}

// Choreography, ms: a lead, the lid backed off and screwed down to the set squeeze, the pressure climbing, then the
// joint's answer and a hold. Total 4300.
const LEAD = 200;
const BACK = 300;
const TWIST = 700;
const PRESS = 1100;
const LEAK = 1500;
const HOLD = 500;
/** One drop reaches the plate in this long. */
const DRIP_MS = 700;
const SPRAY_MS = 1000;

/** Four drops of spray, two each side: where each is `u` of the way through its flight, from the lip. */
function spray(outer: number, u: number): Part[] {
  const y0 = GASKET_Y + 4;
  return [[1, 0.8], [1, 0.3], [-1, 0.8], [-1, 0.3]].map(([side, lift], k) => {
    const x = side! * (outer + 3 + 12 * u);
    const y = Math.max(PLATE_TOP + DROP_R, y0 + lift! * 30 * u - 38 * u * u);
    return part(`${MARK}spray-${k + 1}`, "Spray", "Fluid forced out of the split joint.", dropShape.shape, v3(x, y, 0), look.slate, on("plate", "glue"));
  });
}

function play(v: Values): Run {
  const verdict = judge(v);
  const r = test(v);
  const s = settle(v);
  const tl = phases({ lead: LEAD, back: BACK, twist: TWIST, press: PRESS, leak: LEAK, hold: HOLD });
  const weeps = r.kind === "weeps";
  const drops = Math.max(1, s.drops);
  const cues: Cue[] = [];
  // Nothing happens at the joint until the pressure has reached its full PRESSURE: drops start then, or the rubber lets go.
  const top = tl.start("leak");
  if (weeps) for (let ms = top; ms < tl.total; ms += DRIP_MS / drops) cues.push({ ms, kind: "drip" });
  if (r.kind === "splits") cues.push({ ms: top, kind: "pop" });
  if (r.kind === "pass") cues.push({ ms: top, kind: "click" });
  /** The lid's squeeze and the drop phase. No drop is drawn (drip < 0) while the lid moves and the pressure climbs, even at squeezes that would weep. */
  const values = (squeeze: number, drip = -0.5): Values => ({ ...v, squeeze, drip });
  return {
    verdict,
    durationMs: tl.total,
    cues,
    at: (ms) => {
      const { phase } = tl.at(ms);
      switch (phase) {
        case "lead":
          return frame(values(r.squeeze, DRIP_REST), "Squeeze set");
        case "back":
          return frame(values(r.squeeze * (1 - smooth(tl.t("back", ms)))), "Backing the lid off");
        case "twist": {
          const q = r.squeeze * smooth(tl.t("twist", ms));
          return frame(values(q), "Squeezing");
        }
        case "press":
          return frame(values(r.squeeze), "Pressure building");
        default: {
          const since = ms - top;
          if (weeps) {
            return frame(values(r.squeeze, since / DRIP_MS), phase === "hold" ? "Leaking" : "Dripping");
          }
          if (r.kind === "splits") {
            const u = clamp01(since / SPRAY_MS);
            return frame(values(r.squeeze, DRIP_REST), u < 1 ? "Rubber splits" : "Split and spraying", spray(s.outer, u));
          }
          return frame(values(r.squeeze, DRIP_REST), phase === "hold" ? "Dry joint" : "Staying dry");
        }
      }
    },
  };
}

const SQUEEZE: Slider = { id: "squeeze", label: "Squeeze", min: 0, max: SQUEEZE_MAX, step: 0.01, initial: 0.2, unit: "%", displayScale: 100 };

export const seal: Primitive = {
  id: "seal",
  name: "Seal",
  level: "Element",
  job: "Block a gap so nothing leaks",
  howItWorks:
    "Two hard surfaces never touch everywhere: up close they are hills and valleys, and a liquid finds the valleys. A rubber gasket clamped between them is squeezed into those gaps and pushes back on both faces, closing the path. The squeeze is the thickness lost divided by the thickness it started with. Rubber cannot be compressed, only moved, so a thinner gasket spreads wider. Too little squeeze and gaps stay open; too much and the rubber is forced out of the joint. Static seals are typically squeezed roughly 15 to 30 percent.",
  madeOf: [],
  seenIn: ["Bottle cap", "Jar lid", "Tap washer"],
  sliders: [SQUEEZE],
  view: VIEW.bench,
  build,
  readouts,
  handle: {
    slider: "squeeze",
    label: "Press",
    at: (v) => v3(0, settle(v).lidTop + HANDLE_T / 2, 0),
    // The lid's top is at GASKET_Y + t + LID_T, t = T0 (1 - squeeze).
    solve: (point) => 1 - (point.y - HANDLE_T / 2 - LID_T - GASKET_Y) / T0,
  },
  game: {
    name: "Pressure test",
    goal: "Stop every drip without splitting the rubber.",
    rules: "Squeeze too little and the gasket leaks. Squeeze too much and the rubber is forced out and splits. Find the middle.",
    number: "squeeze",
    action: "Run the test",
    meters,
    judge,
    play,
    start: { squeeze: 0.05 },
    poses: [{ id: "drip", label: "Drip phase", min: -0.5, max: 12, step: 0.001, initial: DRIP_REST }],
  },
};

/** Exposed for tests: the layout the parts are placed by. */
export const geometry = { BORE_R, PIPE_R, GASKET_R0, FLANGE_R, FLANGE_T, PIPE_H, LID_T, GASKET_Y, HANDLE_T, DROP_X, DROP_R, WIDEST, dropY };
