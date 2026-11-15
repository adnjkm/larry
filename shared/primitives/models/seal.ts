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
//
// Free play is a leaking jar lid: water under pressure in the pipe, drops spitting out round the joint. Press the lid
// and the drips slow and stop; let go and the rubber springs back and it leaks again. Its law agrees with the game's:
// at the game's test pressure the leak stops at exactly WEEP.
import type { Part } from "../../kit.ts";
import { clamp01, easeOut, fall, smooth } from "../motion/ease.ts";
import { frame, MARK, phases, returnTo } from "../motion/run.ts";
import { box, COLOR, cylinder, fmt, type Look, lathe, look, on, part, plate, PLATE_TOP, pushDisc, v3, type Pt } from "../parts.ts";
import { type Cue, type Meter, type Primitive, type Run, type Values, type Verdict, VIEW, type Slider, type Task, valueOf } from "../types.ts";
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
const dropShape = lathe(
  Array.from({ length: 9 }, (_, i): Pt => {
    const a = ((i / 8) * 180 - 90) * DEG_TO_RAD;
    return [DROP_R * Math.cos(a), DROP_R * Math.sin(a)];
  }),
);

function build(v: Values): Part[] {
  const s = settle(v);
  const pipe = lathe([
    [BORE_R, 0],
    [PIPE_R, 0],
    [PIPE_R, PIPE_H],
    [FLANGE_R, PIPE_H],
    [FLANGE_R, PIPE_H + FLANGE_T],
    [BORE_R, PIPE_H + FLANGE_T],
    [BORE_R, 0],
  ]);
  const gasket = lathe([
    [BORE_R, 0],
    [s.outer, 0],
    [s.outer, s.t],
    [BORE_R, s.t],
    [BORE_R, 0],
  ]);
  const lid = cylinder(FLANGE_R, LID_T);
  const drip = v.drip ?? DRIP_REST;
  return [
    plate(WIDEST + DROP_X + DROP_R, 2 * WIDEST),
    part(
      "pipe",
      "Pipe end",
      "The end of a pipe, with a flat flange for the gasket to sit on.",
      pipe.shape,
      v3(0, PLATE_TOP + pipe.midY, 0),
      look.structure,
      on("plate", "weld"),
    ),
    part(
      "gasket",
      "Gasket",
      "Soft rubber ring. Squeezed thinner, it spreads wider: the rubber is moved, not lost.",
      gasket.shape,
      v3(0, GASKET_Y + gasket.midY, 0),
      look.focus,
      on("pipe", "press-fit"),
    ),
    part(
      "lid",
      "Lid",
      "Closes the pipe and squeezes the gasket against the flange.",
      lid.shape,
      v3(0, GASKET_Y + s.t + lid.midY, 0),
      LID_LOOK,
      on("pipe", "screw"),
    ),
    pushDisc("handle", v3(0, s.lidTop + HANDLE_T / 2, 0), "y", { name: "Press disc", role: "Where your hand presses the lid down.", on: on("lid", "glue") }),
    ...Array.from({ length: s.drops }, (_, k) => ({ k, u: drip - k / s.drops }))
      .filter(({ u }) => u >= 0)
      .map(({ k, u }) =>
        part(
          `drop-${k + 1}`,
          "Drop",
          "A drop that has got through the gaps and runs down the pipe.",
          dropShape.shape,
          v3(DROP_X, dropY(u % 1), 0),
          look.slate,
          on("pipe", "glue"),
        ),
      ),
  ];
}

function readouts(v: Values) {
  const s = settle(v);
  return [
    { label: "Squeeze", value: `thickness lost ÷ original = (${fmt(T0, 1)} − ${fmt(s.t, 1)}) ÷ ${fmt(T0, 1)} = ${fmt(s.squeeze * 100)}%` },
    { label: "Travel", value: `lid down ${fmt(T0 - s.t, 1)} mm; the rubber spreads ${fmt(s.outer - GASKET_R0, 1)} mm outward` },
    {
      label: "State",
      value: s.weeps
        ? `weeping: gaps stay open under ${fmt(WEEP * 100)}%`
        : s.split
          ? `crushed: rubber forced ${fmt(s.lip, 1)} mm past the flange`
          : "sealed: the rubber fills the gaps",
    },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "weeps" | "splits";

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
/** Free play: the gasket springing back from the hardest squeeze, ms. */
const RELAX_MS = 380;

// ---- Free play: a leaking jar lid -----------------------------------------------------------------------------------
//
// Water stands in the pipe under pressure. The rubber, squeezed, pushes back on the lid and the flange, and that contact
// pressure is what holds the water in: where the water pushes harder than the rubber does, it opens a path and gets
// out. So the joint leaks while the rubber's push is below the water's pressure, and the leak is driven by the
// difference. Rubber this thin pushes back roughly in proportion to its squeeze, so higher pressure needs more squeeze.

/** The game's test pressure, kPa: the pressure its 15% sealing squeeze is for. */
const TEST_KPA = 300;
/** The rubber's push on the faces per unit of squeeze, kPa: set so the game's test pressure seals at exactly WEEP. */
const PUSH_PER_SQUEEZE = TEST_KPA / WEEP;
/** Up to 560 kPa: at the top only a squeeze of 28% to 30% holds, between the leak and the tear. */
const PRESSURE: Slider = { id: "pressure", label: "Water pressure", min: 50, max: 560, step: 10, initial: TEST_KPA, unit: " kPa", ends: ["Low", "High"] };

/** The joint in free play: the rubber's push, the squeeze that seals, and how fast it leaks (0 dry, 1 the most it can). */
export function leak(v: Values) {
  const squeeze = valueOf(SQUEEZE, v);
  const pressure = valueOf(PRESSURE, v);
  const push = PUSH_PER_SQUEEZE * squeeze;
  // Rounded off below a thousandth of a kPa, so 300 kPa at exactly 15% reads dry, as it does in the game.
  const excess = pressure - push > 1e-6 ? pressure - push : 0;
  return { squeeze, pressure, push, sealsAt: pressure / PUSH_PER_SQUEEZE, rate: excess / PRESSURE.max };
}

/**
 * Drips in free play. Twelve drip points take turns round the joint (two at each of six places), each on its own loop:
 * a bead swells where the water gets out, at the gasket's edge on the flange; it runs out to the flange's rim, falls,
 * and is gone at the plate. The faster the leak, the more of them run; at the sealing squeeze none do. Every point keeps
 * a fixed phase, so the picture depends on `ms` alone.
 */
const DRIP_POINTS = 12;
/** Where round the joint each place is, degrees, most visible first, so a slow leak drips where it can be seen. */
const DRIP_AT = [30, 150, 90, 330, 210, 270];
const DRIP_CYCLE_MS = 1500;
/** The shares of a loop spent swelling and running to the rim; the fall (the game's DRIP_MS) follows, then a pause. */
const SWELL = 0.3;
const RUN = 0.12;
const FALL = DRIP_MS / DRIP_CYCLE_MS;
/** A swelling bead in four sizes, smallest first. */
const BEADS = [0.45, 0.65, 0.85, 1];
const beadShapes = BEADS.map(
  (k) =>
    lathe(
      Array.from({ length: 9 }, (_, i): Pt => {
        const a = ((i / 8) * 180 - 90) * DEG_TO_RAD;
        return [k * DROP_R * Math.cos(a), k * DROP_R * Math.sin(a)];
      }),
    ).shape,
);

/** One drop `u` of the way round its loop, as its distance from the axis, its height and its size; null in the pause. */
function dripAt(outer: number, u: number): { r: number; y: number; size: number } | null {
  if (u < SWELL) {
    // Sitting on the flange against the rubber, growing.
    const size = Math.min(BEADS.length - 1, Math.floor((u / SWELL) * BEADS.length));
    const k = BEADS[size]!;
    return { r: outer + k * DROP_R, y: GASKET_Y + k * DROP_R, size };
  }
  const top = GASKET_Y + DROP_R;
  if (u < SWELL + RUN) return { r: outer + DROP_R + (DROP_X - outer - DROP_R) * smooth((u - SWELL) / RUN), y: top, size: BEADS.length - 1 };
  if (u < SWELL + RUN + FALL) return { r: DROP_X, y: top - (top - (PLATE_TOP + DROP_R)) * fall((u - SWELL - RUN) / FALL), size: BEADS.length - 1 };
  return null;
}

function drips(v: Values, ms: number): Part[] {
  const running = Math.ceil(leak(v).rate * DRIP_POINTS - 1e-9);
  const { outer } = settle(v);
  const out: Part[] = [];
  for (let i = 0; i < running; i++) {
    // Point i's phase: i × 5/12 of a loop, which visits every twelfth once and spreads neighbours apart.
    const d = dripAt(outer, (ms / DRIP_CYCLE_MS + ((i * 5) % DRIP_POINTS) / DRIP_POINTS) % 1);
    if (!d) continue;
    const a = DRIP_AT[i % DRIP_AT.length]! * DEG_TO_RAD;
    out.push(
      part(
        `${MARK}leak-${i + 1}`,
        "Drop",
        "Water that got past the rubber and drips off the joint.",
        beadShapes[d.size]!,
        v3(d.r * Math.cos(a), d.y, d.r * Math.sin(a)),
        look.slate,
        on("plate", "glue"),
      ),
    );
  }
  return out;
}

/** Four drops of spray, two each side: where each is `u` of the way through its flight, from the lip. */
function spray(outer: number, u: number): Part[] {
  const y0 = GASKET_Y + 4;
  return [
    [1, 0.8],
    [1, 0.3],
    [-1, 0.8],
    [-1, 0.3],
  ].map(([side, lift], k) => {
    const x = side! * (outer + 3 + 12 * u);
    const y = Math.max(PLATE_TOP + DROP_R, y0 + lift! * 30 * u - 38 * u * u);
    return part(`${MARK}spray-${k + 1}`, "Spray", "Fluid forced out of the split joint.", dropShape.shape, v3(x, y, 0), look.slate, on("plate", "glue"));
  });
}

/**
 * A blowout: crushed past the flange's edge, the rubber is pushed out of the joint and tears, and the water bursts out of
 * the tear in a jet. JET_DROPS drops ride the jet's arc at even spacing, so it reads as one stream, not a drip.
 */
const JET_DROPS = 10;
const JET_MS = 500;
/** Where round the joint it tears: the side toward the camera, so the jet is seen. */
const TEAR_AT = 40;
function burst(outer: number, ms: number): Part[] {
  const a = TEAR_AT * DEG_TO_RAD;
  return Array.from({ length: JET_DROPS }, (_, k) => {
    const u = (ms / JET_MS + k / JET_DROPS) % 1;
    const r = outer + 2 + 34 * u;
    const y = Math.max(PLATE_TOP + DROP_R, GASKET_Y + 4 + 22 * u - 52 * u * u);
    return part(`${MARK}burst-${k + 1}`, "Spray", "Water bursting out where the rubber tore.", dropShape.shape, v3(r * Math.cos(a), y, r * Math.sin(a)), look.slate, on("plate", "glue"));
  });
}

/** Free play's running water: drips while the rubber pushes back less than the water does, a burst once it has torn. */
function water(v: Values, ms: number): Part[] {
  const s = settle(v);
  return s.split ? burst(s.outer, ms) : drips(v, ms);
}

/** Dry and whole: the rubber pushes back at least as hard as the water, and has not been squeezed out past the flange. */
const holds = (v: Values) => leak(v).rate === 0 && !settle(v).split;

// ---- Free play's goals: water up a standpipe, held by the squeeze ---------------------------------------------------
//
// A clear standpipe beside the joint shows the water's pressure as a column of water: the higher the column, the harder
// the water pushes on the rubber. A pump fills it to the green line, but only while the joint holds: where the water
// pushes harder than the rubber does, it gets out at the joint and the column sinks back to what the rubber can hold.
// Squeezed too hard, the rubber is crushed out past the flange's edge (it has nowhere left to go), tears, and the water
// blows out: a burst, and the column falls away. The first line is low and a light squeeze holds it; the second is high,
// and only a hard squeeze, short of the burst, does.

/** The water's pressure as the pump left it: smooth, where the slider's reading snaps to its 10 kPa steps. */
const rawPressure = (v: Values) => Math.min(PRESSURE.max, Math.max(PRESSURE.min, v.pressure ?? PRESSURE.initial));

/** How fast the pump raises the water while the joint holds, kPa a second. */
const PUMP_KPA_S = 220;
/** How fast a leak lets the water out, kPa a second, at the fastest leak: a slow leak lets out less. */
const LEAK_KPA_S = 600;
/** How fast a burst seal loses it, kPa a second: all of it in about a third of a second. */
const TORN_KPA_S = 1600;
/** The green lines: low, held by a squeeze of 10% and up; high, held only from 25% to the burst at 30%. */
const LOW_KPA = 200;
const HIGH_KPA = 500;
/** How fast the green line moves up to the next goal, kPa a second. */
const LINE_KPA_S = 500;
/** Within this of the line counts as at it. */
const AT_LINE = 5;

/**
 * The pump, the joint and the line, `dtMs` on: the line moves to the goal's height, and the water rises toward it while
 * the joint holds, and leaks or bursts away while it does not.
 */
function pump(v: Values, _ms: number, dtMs: number): Values {
  const s = dtMs / 1000;
  const target = v.target ?? LOW_KPA;
  const was = v.line ?? target;
  const line = was < target ? Math.min(target, was + LINE_KPA_S * s) : Math.max(target, was - LINE_KPA_S * s);
  // The raw value, not the slider's snapped one: the pump moves it a little at a time, far under one 10 kPa step.
  const p = rawPressure(v);
  const rate = leak(v).rate;
  const next = settle(v).split ? p - TORN_KPA_S * s : rate > 0 ? p - LEAK_KPA_S * rate * s : Math.min(Math.max(p, line), p + PUMP_KPA_S * s);
  return { ...v, line, pressure: Math.min(PRESSURE.max, Math.max(PRESSURE.min, Math.min(next, Math.max(p, line)))) };
}

// The standpipe, mm: in front of the pipe and to its left as the camera sees it, clear of the flange and the joint, as
// tall as the column at the top of the scale.
const PIPE_X = -46;
const PIPE_Z = 24;
/** The feed's run from the pipe's side out to the standpipe: its direction round the axis, and its ends. */
const FEED_DEG = (Math.atan2(PIPE_Z, PIPE_X) * 180) / Math.PI;
const FEED_FROM = PIPE_R - 1;
const FEED_TO = Math.hypot(PIPE_X, PIPE_Z) - 4;
const TUBE_W = 14;
const TUBE_BOTTOM = PLATE_TOP + 4;
const COLUMN = 76;
const WATER_W = 11;
const LINE_RIM = 1.4;
/** The column's height for a pressure: the scale's bottom at the tube's foot, its top at the tube's top. */
const columnAt = (kPa: number) => (COLUMN * (kPa - PRESSURE.min)) / (PRESSURE.max - PRESSURE.min);
const TUBE_LOOK: Look = { color: COLOR.light, finish: "clear" };

function standpipe(v: Values): Part[] {
  const water = Math.max(0.6, columnAt(rawPressure(v)));
  const lineY = TUBE_BOTTOM + columnAt(v.line ?? v.target ?? LOW_KPA);
  const half = TUBE_W / 2 + LINE_RIM / 2;
  const rim = (id: string, w: number, d: number, x: number, z: number) =>
    part(`goal-${id}`, "Goal line", "The height the water has to reach.", box(w, LINE_RIM, d), v3(PIPE_X + x, lineY, PIPE_Z + z), look.goal, on("standpipe", "glue"));
  const feedMid = (FEED_FROM + FEED_TO) / 2;
  return [
    part(
      "feed",
      "Feed",
      "Joins the standpipe to the pipe, so the water in both is at one pressure.",
      box(FEED_TO - FEED_FROM, 5, 5),
      v3(feedMid * Math.cos((FEED_DEG * Math.PI) / 180), TUBE_BOTTOM + 3, feedMid * Math.sin((FEED_DEG * Math.PI) / 180)),
      look.slate,
      on("pipe", "weld"),
      v3(0, -FEED_DEG, 0),
    ),
    part("standpipe", "Standpipe", "A clear tube: the water in it stands as high as its pressure.", box(TUBE_W, COLUMN + 4, TUBE_W), v3(PIPE_X, TUBE_BOTTOM + (COLUMN + 4) / 2, PIPE_Z), TUBE_LOOK, on("plate", "weld")),
    part("column", "Water", "The water in the pipe, shown by how high it stands.", box(WATER_W, water, WATER_W), v3(PIPE_X, TUBE_BOTTOM + water / 2, PIPE_Z), look.accent, on("standpipe", "glue")),
    rim("front", 2 * half + LINE_RIM, LINE_RIM, 0, half),
    rim("back", 2 * half + LINE_RIM, LINE_RIM, 0, -half),
    rim("left", LINE_RIM, 2 * half, -half, 0),
    rim("right", LINE_RIM, 2 * half, half, 0),
  ];
}

/** The water up to the line, and the joint dry and whole. */
const atLine = (v: Values) => rawPressure(v) >= (v.target ?? LOW_KPA) - AT_LINE && holds(v);
const hint = (v: Values) =>
  settle(v).split
    ? "Crushed too far, the rubber bursts out."
    : leak(v).rate > 0 && rawPressure(v) > PRESSURE.min + 20
      ? "It leaks, so the water drops. Squeeze more."
      : undefined;

const TASKS: Task[] = [
  {
    goal: "Squeeze until the water reaches the green.",
    // No start values: setting any would stop the rubber springing back from the let-go. The low line is the default.
    sliders: ["squeeze"],
    scene: standpipe,
    met: atLine,
    hint,
    drive: pump,
  },
  {
    goal: "Higher now: squeeze more, but don't burst it.",
    start: { target: HIGH_KPA },
    sliders: ["squeeze"],
    scene: standpipe,
    met: atLine,
    hint,
    drive: pump,
  },
];

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

const SQUEEZE: Slider = { id: "squeeze", label: "Squeeze", min: 0, max: SQUEEZE_MAX, step: 0.01, initial: 0.2, unit: "%", displayScale: 100, ends: ["Loose", "Tight"] };

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
  play: {
    facts: {
      say: "/sēl/",
      is: "A squeezed rubber ring that closes a gap.",
      note: "Squeeze affects how much pressure it holds.",
    },
    // The squeeze is the hand's; the water's pressure is the one thing to try once the hand has felt the seal close.
    sliders: [SQUEEZE, PRESSURE],
    // The lid resting on a gasket at its full thickness, so the joint leaks from the start.
    rest: { squeeze: 0, pressure: PRESSURE.min },
    // The joint alone. The game's own drops (its `drip` pose) are left out: free play's leak is `ambient`, and runs by itself.
    build: (v) => build(v).filter((p) => !p.id.startsWith("drop-")),
    ambient: water,
    tasks: TASKS,
    // Let go, the rubber pushes the lid back up to its full thickness: quickly, and without ringing, since rubber soaks
    // up its own bounce.
    release: (v) => returnTo(v, "squeeze", 0, SQUEEZE_MAX, RELAX_MS, easeOut),
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
