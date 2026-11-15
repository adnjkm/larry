// Thread: turn twisting into pushing, and stay put. A mechanism made of a wedge wound round a wheel
// (src/primitives/docs/design-language.md, motion-language.md).
//
// The rig is the textbook picture and nothing more: a bolt standing on the plate with a pink ridge wound round it, a pink
// nut with a handle bar, and a weight with a hole for the bolt resting on the nut. Pitch is the number: it sets the ridge
// you see (how far apart the turns are, how thick the wire is), and the nut climbs exactly one pitch per turn, so turning
// the handle one way round is the handle bar going round the bolt once and the weight rising by one pitch.
//
// The screw is drawn big: the ridge wire has to be at least 2.4 thick to be seen, and at the slider's finest pitch (2) a
// ridge that thick would fuse into stripes. So one slider step of pitch is PITCH_UNIT mm of drawn ridge spacing (the slider
// shows the drawn pitch, 4 to 12 mm), and every length in the model (rise, lead angle, the mark) is in those drawn mm.
//
// The game, "Jack": raise the weight to the mark in six turns, then let go. Too fine and the turns run out before the mark;
// too steep and the thread's lead angle beats friction (a coefficient of 0.2, about 11.3 degrees), so the weight drives the
// nut back down.
import type { Part } from "../../kit.ts";
import { clamp, fall, smooth } from "../motion/ease.ts";
import { frame, HOLD, LEAD, phases, REWIND, SCENE } from "../motion/run.ts";
import { box, coil, cylinder, fmt, knob, loadBlock, loadEdge, look, on, part, pivoted, plate, PLATE_TOP, polygon, v3 } from "../parts.ts";
import {
  type Cue,
  type Meter,
  type Motion,
  type Plot,
  type Primitive,
  type Run,
  type Task,
  type Values,
  type Verdict,
  VIEW,
  type Slider,
  valueOf,
} from "../types.ts";
import { DEG_TO_RAD, RAD_TO_DEG } from "../../angles.ts";

// Geometry, millimetres. The bolt stands on the middle of the plate, x = 0, z = 0.
const ROD_R = 6;
/** Drawn mm of ridge spacing for one step of the pitch slider: the screw is drawn big enough for a 2.4 mm wire at the finest pitch. */
export const PITCH_UNIT = 2;
/** The nut at its highest, its top level with the ridge's end, is still on the bolt. */
const ROD_TOP = 96;
const RIDGE_FROM = 8;
const RIDGE_TO = 94;
/** The wire's centre sits just outside the rod: this is the radius the pitch is wound at. */
export const MEAN_R = ROD_R + 1;
const NUT_H = 12;
const NUT_R = 15;
/** The handle bar's centre goes round on this radius: one turn is 2π × 24 mm of hand for one pitch of lift. */
export const HAND_R = 24;
const HANDLE_AT_0 = 215;
const LOAD_N = 100;
const MM_PER_N = 0.25;
const EDGE = loadEdge(LOAD_N);
/** The game's turns: the Jack gives the hand six. */
const MAX_TURNS = 6;
/** The nut's highest rise: its top level with the ridge's end, the last pose with the whole nut on the thread. */
const TOP_RISE = RIDGE_TO - PLATE_TOP - NUT_H;
/** The turns that run the nut from the plate up to the ridge's end: the thread's real stop, 19 at the finest pitch. */
const topTurns = (pitch: number) => TOP_RISE / pitch;
/** The weight's underside at turn 0: on the nut, which is on the plate. */
const LOAD_BOTTOM_0 = PLATE_TOP + NUT_H;

// The game, in game numbers. The lead angle against the friction angle is real; the mark is set so the window sits mid-range.
/** The weight must come up this far, to the mark. */
export const TARGET = 32;
/** Friction coefficient of the thread, 0.2: a friction angle of atan 0.2 = 11.3 degrees. */
export const FRICTION = 0.2;
export const FRICTION_DEG = Math.atan(FRICTION) * RAD_TO_DEG;

/** The slider's pitch, snapped to its step. */
/** The ridge spacing as drawn, mm: the nut climbs this far per turn. */
const pitchOf = (v: Values) => valueOf(PITCH, v) * PITCH_UNIT;
const leadOf = (pitch: number) => Math.atan(pitch / (2 * Math.PI * MEAN_R)) * RAD_TO_DEG;

/** Everything a pose needs, from the two sliders. `build`, `readouts`, the handle and the game all read this. */
export function settle(v: Values) {
  const pitch = pitchOf(v);
  const turns = clamp(v.turns ?? 2.5, 0, topTurns(pitch));
  const lead = leadOf(pitch);
  return { pitch, turns, rise: turns * pitch, lead, holds: lead <= FRICTION_DEG + 1e-9, handPath: 2 * Math.PI * HAND_R * turns };
}

const nutMid = (rise: number) => PLATE_TOP + NUT_H / 2 + rise;
const handleAngle = (turns: number) => HANDLE_AT_0 + turns * 360;
const handlePoint = (turns: number, rise: number) =>
  v3(HAND_R * Math.cos(handleAngle(turns) * DEG_TO_RAD), nutMid(rise), -HAND_R * Math.sin(handleAngle(turns) * DEG_TO_RAD));

/** The ridge wire's radius for a drawn pitch: thicker as the pitch grows, never under 1.2 (a 2.4 wire) and always clear of the next turn. */
export const ridgeWire = (pitch: number) => clamp(0.12 * pitch + 0.72, 1.2, 2);

/** The camera's line of sight in the figure's own space, from the eye toward the figure (the coaxial view, never turned). */
const SIGHT = (() => {
  const el = VIEW.coaxial.elevation * DEG_TO_RAD;
  const az = VIEW.coaxial.azimuth * DEG_TO_RAD;
  return { x: -Math.sin(az) * Math.cos(el), y: -Math.sin(el), z: -Math.cos(az) * Math.cos(el) };
})();

const hexShape = (r: number, h: number) => pivoted(polygon(6, r), h, [0, 0], v3(0, 0, 0), 0).shape;

function build(v: Values): Part[] {
  const s = settle(v);
  const a = handleAngle(s.turns);
  const mid = nutMid(s.rise);
  const wire = ridgeWire(s.pitch);
  const length = RIDGE_TO - RIDGE_FROM;
  const bar = knob("handle", handlePoint(s.turns, s.rise), "x", {
    name: "Handle",
    role: "A bar on the nut: your hand takes it once round the bolt for each pitch the nut rises.",
    on: on("nut", "press-fit"),
  });
  return [
    // Deep enough for the handle bar's whole circle round the bolt, not just the turns the game uses.
    plate(67, 65),
    part(
      "rod",
      "Bolt",
      "The rod the ridge is wound on.",
      cylinder(ROD_R, ROD_TOP - PLATE_TOP).shape,
      v3(0, (PLATE_TOP + ROD_TOP) / 2, 0),
      look.steel,
      on("plate", "weld"),
    ),
    part(
      "ridge",
      "Thread ridge",
      "A wedge wound round the rod, climbing one pitch per turn.",
      coil(MEAN_R, wire, length, (length - 2 * wire) / s.pitch),
      v3(0, (RIDGE_FROM + RIDGE_TO) / 2, 0),
      look.focusMetal,
      on("rod", "weld"),
    ),
    part(
      "nut",
      "Nut",
      "Its matching thread rides the wedge, so it climbs one pitch for every turn.",
      hexShape(NUT_R, NUT_H),
      v3(0, mid, 0),
      look.focus,
      on("rod", "thread"),
      v3(-90, 0, a),
    ),
    { ...bar, rotation: v3(0, a, 90) },
  ];
}

/**
 * The game's load: a weight with a hole for the bolt, resting on the nut. It belongs to the Jack game only, so the
 * library stills and the lessons show just the screw and the nut (the project owner's call, 2026-11-14). Its arrow is
 * left off: the scene may add two kinds of part, and the weight and the mark are those two.
 */
function weight(v: Values): Part[] {
  const s = settle(v);
  return loadBlock(`${SCENE}load`, v3(0, LOAD_BOTTOM_0 + s.rise, 0), LOAD_N, MM_PER_N, {
    name: "Weight",
    role: "The load: it has a hole for the bolt and rests on the nut.",
    on: on("nut", "glue"),
  }).parts.filter((q) => !q.id.endsWith("-arrow"));
}

function readouts(v: Values) {
  const s = settle(v);
  return [
    { label: "Rise", value: `turns × pitch = ${fmt(s.turns, 2)} × ${fmt(s.pitch, 1)} = ${fmt(s.rise, 1)} mm` },
    { label: "Travel", value: `hand ${fmt(s.handPath)} mm round, weight up ${fmt(s.rise, 1)} mm` },
    {
      label: "State",
      value: s.holds
        ? `lead ${fmt(s.lead, 1)}° under friction's ${fmt(FRICTION_DEG, 1)}°: holds`
        : `lead ${fmt(s.lead, 1)}° over friction's ${fmt(FRICTION_DEG, 1)}°: spins back`,
    },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "short" | "spins";

/** The outcome, decided once from the pitch; meters, judge and play all read it. */
export function jack(v: Values) {
  const pitch = pitchOf(v);
  const lead = leadOf(pitch);
  /** The most the six turns can raise it. */
  const reach = MAX_TURNS * pitch;
  const kind: Kind = reach < TARGET - 1e-9 ? "short" : lead > FRICTION_DEG + 1e-9 ? "spins" : "pass";
  /** The turns the hand gives: to the mark, or all it has. */
  const wound = kind === "short" ? MAX_TURNS : TARGET / pitch;
  return { kind, pitch, lead, reach, wound };
}

function judge(v: Values): Verdict {
  const r = jack(v);
  switch (r.kind) {
    case "short":
      return {
        pass: false,
        outcome: "ran-out-of-turns",
        headline: "Ran out of turns",
        detail: "Threads too close together: you run out of turns before the weight reaches the mark.",
      };
    case "spins":
      return {
        pass: false,
        outcome: "spun-back",
        headline: "Spun back down",
        detail: "Threads too steep: friction cannot hold, so the weight spins the nut back down.",
      };
    case "pass":
      return {
        pass: true,
        outcome: "held-at-mark",
        headline: "Held at the mark",
        detail: "Threads reach the mark and are gentle enough that friction holds the weight.",
      };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = jack(v);
  return [
    { label: "Steepness", value: r.lead, target: FRICTION_DEG, max: 9, unit: "°", need: "atMost", digits: 1 },
    { label: "Lift", value: r.reach, target: TARGET, max: 40, unit: "mm", need: "atLeast" },
  ];
}

// Choreography, ms.
/** The hand turns this long for each turn, before easing. */
const MS_PER_TURN = 300;
const AT_END = 300;
/** A spin-back's time: the weight falls, so time goes with the root of the turns it has to unwind. */
const SPIN_MS = 330;

function play(v: Values): Run {
  const verdict = judge(v);
  const r = jack(v);
  const t0 = clamp(v.turns ?? 0, 0, MAX_TURNS);
  const twistMs = clamp(MS_PER_TURN * r.wound + 300, 600, 2300);
  const spinMs = clamp(SPIN_MS * Math.sqrt(r.wound), 450, 900);
  const tl = phases({ rewind: t0 > 1e-9 ? REWIND : 0, lead: LEAD, twist: twistMs, atEnd: AT_END, spin: r.kind === "spins" ? spinMs : 0, hold: HOLD });
  const values = (turns: number): Values => ({ ...v, pitch: v.pitch ?? 4, turns: clamp(turns, 0, MAX_TURNS) });
  const cues: Cue[] = [];
  if (r.kind === "pass") cues.push({ ms: tl.end("twist"), kind: "thud" });
  if (r.kind === "spins") cues.push({ ms: tl.end("twist"), kind: "thud" }, { ms: tl.start("spin"), kind: "slip" }, { ms: tl.end("spin"), kind: "thud" });
  return {
    verdict,
    durationMs: tl.total,
    cues,
    at: (ms) => {
      const { phase } = tl.at(ms);
      switch (phase) {
        case "rewind":
          return frame(values(t0 * (1 - smooth(tl.t("rewind", ms)))), "Back to the start");
        case "lead":
          return frame(values(0), "Twist the handle");
        case "twist": {
          const turns = r.wound * smooth(tl.t("twist", ms));
          return frame(values(turns), "Lifting");
        }
        case "atEnd":
          return frame(values(r.wound), r.kind === "short" ? "Out of turns" : "At the mark");
        case "spin": {
          const turns = r.wound * (1 - fall(tl.t("spin", ms)));
          return frame(values(turns), "Spinning back");
        }
        case "hold":
          if (r.kind === "spins") return frame(values(0), "Back down");
          return frame(values(r.wound), r.kind === "short" ? "Too low" : "Holding");
      }
    },
  };
}

/** Where the weight's top is when it has risen to the mark. */
const MARK_Y = LOAD_BOTTOM_0 + EDGE + TARGET;

/** The mark stands on a slim post just outside the handle's sweep, and its tick reaches in to 2 mm short of the weight. */
const POST_W = 6;
const POST_X = HAND_R + 10 + 2 + POST_W / 2;

/** The game's props: the weight on the nut, and one slim post with a tick on it, level with the weight's top once it has come up TARGET mm. The post holds the tick, so it floats in nothing. */
function scene(v: Values): Part[] {
  const y = MARK_Y - 1.5;
  const x0 = POST_X - POST_W / 2;
  const x1 = EDGE / 2 + 2;
  const top = y + 1.5;
  const cx = (x1 + x0 + POST_W) / 2;
  const cy = (PLATE_TOP + top) / 2;
  const pts: [number, number][] = [
    [x0, PLATE_TOP],
    [x0 + POST_W, PLATE_TOP],
    [x0 + POST_W, top],
    [x1, top],
    [x1, y - 1.5],
    [x0, y - 1.5],
  ];
  const outline = pts.map(([px, py]) => ({ x: px - cx, y: py - cy }));
  return [
    ...weight(v),
    part(
      `${SCENE}mark`,
      "Mark",
      "The weight's top has to come up to this level: a tick on a slim post.",
      { kind: "extrusion", outline, depth: POST_W },
      v3(cx, cy, 0),
      look.structure,
      on("plate", "weld"),
    ),
  ];
}

const PITCH: Slider = { id: "pitch", label: "Pitch", min: 2, max: 6, step: 0.5, initial: 4, unit: " mm", displayScale: PITCH_UNIT, ends: ["Fine", "Coarse"] };

/** The most turns any thread here takes from the plate to the ridge's end: the finest, 19. The plot's whole width. */
const MOST_TURNS = topTurns(PITCH.min * PITCH_UNIT);

/**
 * The nut's rise (up, to the ridge's end) for the turns of the handle (across, to the finest thread's 19). One straight
 * line from the plate to the thread's end, climbing one pitch a turn: a fine thread takes the whole width to get there, a
 * coarse one a third of it. The axes are fixed, so the slope is the pitch. The dot is the nut now, and slides back down
 * the line when a steep thread spins back.
 */
function climb(v: Values): Plot {
  const s = settle(v);
  return {
    line: [
      [0, 0],
      [topTurns(s.pitch) / MOST_TURNS, 1],
    ],
    dot: [s.turns / MOST_TURNS, s.rise / TOP_RISE],
    caption: "nut rise for turns",
  };
}

// ---- Free play's goals: a level to twist the nut up to ------------------------------------------------------------

/** How far the nut has to come up: its top level with the green. */
const GOAL_RISE = 24;
/** Close enough to the green to count, in mm. */
const NEAR = 0.6;
/** The second goal's turns: fewer than a fine thread needs to get there. */
const FEW_TURNS = 4;
const GOAL_HALF = HAND_R + 6;
const GOAL_BAR = 1.6;

/**
 * The goal as a thin green square in the figure itself, level with the nut's top once it has come up GOAL_RISE: a
 * see-through sheet with a solid green edge, as on the spring, so the bolt passes through it and the nut comes up under it.
 */
function goalPlane(): Part[] {
  const y = PLATE_TOP + NUT_H + GOAL_RISE + GOAL_BAR / 2;
  const h = GOAL_HALF;
  const bar = (id: string, w: number, d: number, x: number, z: number) =>
    part(`goal-${id}`, "Goal edge", "The edge of the level the nut must reach.", box(w, GOAL_BAR, d), v3(x, y, z), look.goal, on("plate", "glue"));
  return [
    part("goal-sheet", "Goal", "The level the nut must reach.", box(2 * h, GOAL_BAR / 2, 2 * h), v3(0, y, 0), look.goalClear, on("plate", "glue")),
    bar("back", 2 * h, GOAL_BAR, 0, -h),
    bar("front", 2 * h, GOAL_BAR, 0, h),
    bar("left", GOAL_BAR, 2 * h, -h, 0),
    bar("right", GOAL_BAR, 2 * h, h, 0),
  ];
}

const atGoal = (v: Values) => settle(v).rise >= GOAL_RISE - NEAR;
/** At the green, on a thread gentle enough to stay there when the hand lets go. */
const held = (v: Values) => atGoal(v) && settle(v).holds;

/**
 * Watches the hand: `reached` once the nut has come up to the green, `fell` once a nut that got there has spun back to
 * the plate, and `spent` once the turns ran out short of it. It only records; the hand and the let-go move the machine.
 */
function watch(v: Values): Values {
  const s = settle(v);
  const reached = atGoal(v) ? 1 : (v.reached ?? 0);
  const fell = reached === 1 && !s.holds && s.turns < 0.05 ? 1 : (v.fell ?? 0);
  const spent = !atGoal(v) && s.turns >= FEW_TURNS - 0.02 ? 1 : (v.spent ?? 0);
  if (reached === (v.reached ?? 0) && fell === (v.fell ?? 0) && spent === (v.spent ?? 0)) return v;
  return { ...v, reached, fell, spent };
}

const WIND_DOWN_MS = 420;
/** The nut run back down to the plate as a goal begins, from wherever it was left. */
const windDown = (v: Values): Motion => {
  const from = settle(v).turns;
  return { durationMs: WIND_DOWN_MS, at: (t) => frame({ ...v, turns: from * (1 - smooth(clamp(t / WIND_DOWN_MS, 0, 1))) }, "") };
};

const TOO_STEEP = "Too steep, so it spins back down. Make it finer.";

const TASKS: Task[] = [
  {
    goal: "Twist it up to the green. It has to stay there.",
    hand: true,
    // The steepest thread: up in two turns, and straight back down when let go.
    start: { pitch: PITCH.max, reached: 0, fell: 0, spent: 0 },
    // The nut stops at the green: twist it as far as it goes, and the thread decides the rest.
    reach: (v) => [0, GOAL_RISE / pitchOf(v)],
    scene: goalPlane,
    met: held,
    hint: (v) => ((v.fell ?? 0) > 0 && !settle(v).holds ? TOO_STEEP : undefined),
    arrive: windDown,
    drive: watch,
  },
  {
    goal: "Now get it there in four turns.",
    hand: true,
    // The finest thread: it holds anywhere, but four turns leave it well short.
    start: { pitch: PITCH.min, reached: 0, fell: 0, spent: 0 },
    reach: (v) => [0, Math.min(FEW_TURNS, GOAL_RISE / pitchOf(v))],
    scene: goalPlane,
    met: held,
    hint: (v) => {
      const s = settle(v);
      if ((v.fell ?? 0) > 0 && !s.holds) return TOO_STEEP;
      return (v.spent ?? 0) > 0 && FEW_TURNS * s.pitch < GOAL_RISE - NEAR ? "Out of turns. Make it coarser." : undefined;
    },
    arrive: windDown,
    drive: watch,
  },
];

export const thread: Primitive = {
  id: "thread",
  name: "Thread",
  level: "Mechanism",
  job: "Turn twisting into pushing, and stay put",
  howItWorks:
    "Unroll a thread and it is a long, shallow wedge; wrap that wedge round a rod and it becomes a screw. Turning the nut makes it climb the wedge, so one turn moves it along the bolt by exactly the pitch, while your hand goes the whole way round: a small distance per turn means a big gain in force. Whether it stays put when you let go depends on the wedge's slope, the lead angle, against the friction angle: a gentler slope than friction holds, a steeper one lets the load drive the nut back down. Here friction is a flat 0.2, an angle of 11.3 degrees. The screw is drawn big so the ridge can be seen.",
  madeOf: ["wedge", "wheel"],
  seenIn: ["Bottle cap", "Bolt", "Lipstick"],
  sliders: [
    // The slider's value is a step of PITCH_UNIT drawn mm each, and it shows the drawn pitch (4 to 12 mm).
    PITCH,
    // Up to the top of the thread at the finest pitch, (94 - 6 - 12) / 4: free play runs the nut the whole bolt. It was 6,
    // the game's turns, which stopped a fine thread a third of the way up for no reason the figure shows.
    { id: "turns", label: "Turns", min: 0, max: 19, step: 0.05, initial: 2.5, unit: " turns" },
  ],
  view: VIEW.coaxial,
  build,
  readouts,
  handle: {
    slider: "turns",
    label: "Twist",
    at: (v) => {
      const s = settle(v);
      return handlePoint(s.turns, s.rise);
    },
    // The handle goes round the bolt in a level circle, which the camera sees from above as an ellipse. The finger's point
    // lies in the upright plane through the handle; follow the camera's line of sight from it down to the handle's level,
    // and the angle round the bolt there is the handle's. Its x alone cannot tell the near half of the circle from the
    // far one, so it could not take the bar all the way round. Of the turns at that angle, take the one nearest now.
    solve: (point, v) => {
      const s = settle(v);
      const z0 = handlePoint(s.turns, s.rise).z;
      const t = (nutMid(s.rise) - point.y) / SIGHT.y;
      const x = point.x + t * SIGHT.x;
      const z = z0 + t * SIGHT.z;
      const base = (Math.atan2(-z, x) * RAD_TO_DEG - HANDLE_AT_0) / 360;
      return base + Math.round(s.turns - base);
    },
    // The weight cannot be turned up past the mark: nothing in the game goes beyond it.
    reach: (v) => [0, Math.min(MAX_TURNS, TARGET / pitchOf(v))],
  },
  play: {
    facts: {
      say: "/THred/",
      is: "A ramp wound round a rod.",
      note: "Pitch affects how far each turn lifts it.",
    },
    tasks: TASKS,
    // The nut run down onto the plate, nothing on it.
    rest: { turns: 0 },
    // By hand it goes from the plate to the top of the thread, however many turns that is.
    reach: (v) => [0, topTurns(pitchOf(v))],
    plot: climb,
    // No hand arrows: free play's nut carries no load (the weight is the game's), so there is no lift to draw against the
    // turning effort, and the gain, 13 to 37 times, could not be drawn to one scale anyway.
    // Let go, a gentle thread holds the nut where it is: friction beats the slope. A steep one does not, and the nut's
    // own weight spins it back down to the plate, faster as it goes. The lead angle against friction does not depend on
    // the load, so a bare nut slips exactly when the loaded one in the game does.
    release: (v) => {
      const s = settle(v);
      if (s.holds || s.turns < 1e-9) return { durationMs: 1, at: () => frame({ ...v, turns: s.turns }, "") };
      const ms = Math.round(clamp(SPIN_MS * Math.sqrt(s.turns), 450, 2200));
      return {
        durationMs: ms,
        cues: [
          { ms: 0, kind: "slip" },
          { ms, kind: "thud" },
        ],
        at: (t) => frame({ ...v, turns: s.turns * (1 - fall(clamp(t / ms, 0, 1))) }, "Spinning back"),
      };
    },
  },
  game: {
    name: "Jack",
    goal: "Jack the weight up to the mark, then let go: it has to stay there.",
    rules:
      "You have a limited number of turns. Closer threads lift less per turn but hold. Steeper threads lift more but slip. Without threads, the weight could not stay up.",
    number: "pitch",
    action: "Let go",
    meters,
    judge,
    play,
    start: { pitch: 6, turns: 0 },
    scene,
  },
};

/** Exposed for tests: where the load and the mark sit, so contact can be checked against the geometry. */
export const geometry = { EDGE, LOAD_BOTTOM_0, MARK_Y, NUT_H, ROD_R, MEAN_R, POST_X, POST_W, ROD_TOP, nutMid, handleAngle };
