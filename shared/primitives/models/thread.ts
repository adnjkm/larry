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
import { frame, phases, SCENE } from "../motion/run.ts";
import { coil, cylinder, DEG, fmt, knob, loadBlock, loadEdge, look, on, part, pivoted, plate, PLATE_TOP, polygon, RAD, v3 } from "../parts.ts";
import { type Cue, type Meter, type Primitive, type Run, type Values, type Verdict, VIEW } from "../types.ts";

// Geometry, millimetres. The bolt stands on the middle of the plate, x = 0, z = 0.
const ROD_R = 6;
/** Drawn mm of ridge spacing for one step of the pitch slider: the screw is drawn big enough for a 2.4 mm wire at the finest pitch. */
export const PITCH_UNIT = 2;
/** The nut at its highest (6 turns of the coarsest pitch) is still on the bolt. */
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
const MAX_TURNS = 6;
/** The weight's underside at turn 0: on the nut, which is on the plate. */
const LOAD_BOTTOM_0 = PLATE_TOP + NUT_H;

// The game, in game numbers. The lead angle against the friction angle is real; the mark is set so the window sits mid-range.
/** The weight must come up this far, to the mark. */
export const TARGET = 32;
/** Friction coefficient of the thread, 0.2: a friction angle of atan 0.2 = 11.3 degrees. */
export const FRICTION = 0.2;
export const FRICTION_DEG = Math.atan(FRICTION) * DEG;

/** The slider's pitch, snapped to its step. */
const stepOf = (v: Values) => clamp(Math.round((v.pitch ?? 4) * 2) / 2, 2, 6);
/** The ridge spacing as drawn, mm: the nut climbs this far per turn. */
const pitchOf = (v: Values) => stepOf(v) * PITCH_UNIT;
const leadOf = (pitch: number) => Math.atan(pitch / (2 * Math.PI * MEAN_R)) * DEG;

/** Everything a pose needs, from the two sliders. `build`, `readouts`, the handle and the game all read this. */
export function settle(v: Values) {
  const pitch = pitchOf(v);
  const turns = clamp(v.turns ?? 2.5, 0, MAX_TURNS);
  const lead = leadOf(pitch);
  return { pitch, turns, rise: turns * pitch, lead, holds: lead <= FRICTION_DEG + 1e-9, handPath: 2 * Math.PI * HAND_R * turns };
}

const nutMid = (rise: number) => PLATE_TOP + NUT_H / 2 + rise;
const handleAngle = (turns: number) => HANDLE_AT_0 + turns * 360;
const handlePoint = (turns: number, rise: number) => v3(HAND_R * Math.cos(handleAngle(turns) * RAD), nutMid(rise), -HAND_R * Math.sin(handleAngle(turns) * RAD));

/** The ridge wire's radius for a drawn pitch: thicker as the pitch grows, never under 1.2 (a 2.4 wire) and always clear of the next turn. */
export const ridgeWire = (pitch: number) => clamp(0.12 * pitch + 0.72, 1.2, 2);

const hexShape = (r: number, h: number) => pivoted(polygon(6, r), h, [0, 0], v3(0, 0, 0), 0).shape;

function build(v: Values): Part[] {
  const s = settle(v);
  const a = handleAngle(s.turns);
  const mid = nutMid(s.rise);
  const wire = ridgeWire(s.pitch);
  const length = RIDGE_TO - RIDGE_FROM;
  const load = loadBlock("load", v3(0, LOAD_BOTTOM_0 + s.rise, 0), LOAD_N, MM_PER_N, { name: "Weight", role: "The load: it has a hole for the bolt and rests on the nut.", on: on("nut", "glue"), arrowSide: "left" });
  const bar = knob("handle", handlePoint(s.turns, s.rise), "x", { name: "Handle", role: "A bar on the nut: your hand takes it once round the bolt for each pitch the weight rises.", on: on("nut", "press-fit") });
  return [
    plate(61, 49),
    part("rod", "Bolt", "The rod the ridge is wound on.", cylinder(ROD_R, ROD_TOP - PLATE_TOP).shape, v3(0, (PLATE_TOP + ROD_TOP) / 2, 0), look.steel, on("plate", "weld")),
    part("ridge", "Thread ridge", "A wedge wound round the rod, climbing one pitch per turn.", coil(MEAN_R, wire, length, (length - 2 * wire) / s.pitch), v3(0, (RIDGE_FROM + RIDGE_TO) / 2, 0), look.focusMetal, on("rod", "weld")),
    part("nut", "Nut", "Its matching thread rides the wedge, so it climbs one pitch for every turn.", hexShape(NUT_R, NUT_H), v3(0, mid, 0), look.focus, on("rod", "thread"), v3(-90, 0, a)),
    { ...bar, rotation: v3(0, a, 90) },
    ...load.parts,
  ];
}

function readouts(v: Values) {
  const s = settle(v);
  return [
    { label: "Rise", value: `turns × pitch = ${fmt(s.turns, 2)} × ${fmt(s.pitch, 1)} = ${fmt(s.rise, 1)} mm` },
    { label: "Travel", value: `hand ${fmt(s.handPath)} mm round, weight up ${fmt(s.rise, 1)} mm` },
    { label: "State", value: s.holds ? `lead ${fmt(s.lead, 1)}° under friction's ${fmt(FRICTION_DEG, 1)}°: holds` : `lead ${fmt(s.lead, 1)}° over friction's ${fmt(FRICTION_DEG, 1)}°: spins back` },
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
      return { pass: false, outcome: "ran-out-of-turns", headline: "Ran out of turns", detail: "Threads too close together: you run out of turns before the weight reaches the mark." };
    case "spins":
      return { pass: false, outcome: "spun-back", headline: "Spun back down", detail: "Threads too steep: friction cannot hold, so the weight spins the nut back down." };
    case "pass":
      return { pass: true, outcome: "held-at-mark", headline: "Held at the mark", detail: "Threads reach the mark and are gentle enough that friction holds the weight." };
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
const LEAD = 250;
const REWIND = 450;
/** The hand turns this long for each turn, before easing. */
const MS_PER_TURN = 300;
const AT_END = 300;
const HOLD = 700;
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

/** The game's standing prop: one slim post with a tick on it, level with the weight's top once it has come up TARGET mm. The post holds it, so it floats in nothing. */
function scene(): Part[] {
  const y = MARK_Y - 1.5;
  const x0 = POST_X - POST_W / 2;
  const x1 = EDGE / 2 + 2;
  const top = y + 1.5;
  const cx = (x1 + x0 + POST_W) / 2;
  const cy = (PLATE_TOP + top) / 2;
  const pts: [number, number][] = [[x0, PLATE_TOP], [x0 + POST_W, PLATE_TOP], [x0 + POST_W, top], [x1, top], [x1, y - 1.5], [x0, y - 1.5]];
  const outline = pts.map(([px, py]) => ({ x: px - cx, y: py - cy }));
  return [part(`${SCENE}mark`, "Mark", "The weight's top has to come up to this level: a tick on a slim post.", { kind: "extrusion", outline, depth: POST_W }, v3(cx, cy, 0), look.structure, on("plate", "weld"))];
}

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
    { id: "pitch", label: "Pitch", min: 2, max: 6, step: 0.5, initial: 4, unit: " mm", displayScale: PITCH_UNIT },
    { id: "turns", label: "Turns", min: 0, max: 6, step: 0.05, initial: 2.5, unit: " turns" },
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
    // The handle goes round the bolt: its x gives the angle, and of the two turns that give that x, take the one nearest the current turn.
    solve: (point, v) => {
      const theta = Math.acos(clamp(point.x / HAND_R, -1, 1)) * DEG;
      const now = v.turns ?? 0;
      const options = [theta, -theta].map((q) => {
        const base = (q - HANDLE_AT_0) / 360;
        return base + Math.round(now - base);
      });
      return options.reduce((best, o) => (Math.abs(o - now) < Math.abs(best - now) ? o : best));
    },
    // The weight cannot be turned up past the mark: nothing in the game goes beyond it.
    reach: (v) => [0, Math.min(MAX_TURNS, TARGET / pitchOf(v))],
  },
  game: {
    name: "Jack",
    goal: "Jack the weight up to the mark, then let go: it has to stay there.",
    rules: "You have a limited number of turns. Closer threads lift less per turn but hold. Steeper threads lift more but slip. Without threads, the weight could not stay up.",
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
