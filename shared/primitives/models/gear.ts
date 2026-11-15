// Gear: change the speed or force of turning. A mechanism made of two wheels with teeth (src/primitives/docs/design-language.md,
// motion-language.md).
//
// The rig is the textbook picture and nothing more: a 12-tooth driving gear with a knob, and a driven gear whose tooth
// count is the number. Both are pink: the pair is the subject. Each turns on an axle held by one post behind it. The teeth
// are meshed by construction: whatever the angle of the driver, the driven gear's angle is solved from the contact
// direction so a tooth always meets a gap. One mesh reverses the direction of turn; the one curved arrow, on the output,
// says which way. A turn mark on the output shows how far it has turned.
//
// The game, "Shadow the hand": turn the driver once and keep the output's mark on a ghost arrow that turns 0.75 of a turn
// the other way round, as one mesh does. Direction is the same whatever the teeth, so the one number, the tooth count,
// decides everything: too many teeth and the output falls behind the ghost, too few and it runs ahead.
import type { Part } from "../../kit.ts";
import { clamp, smooth } from "../motion/ease.ts";
import { frame, LEAD, phases, REWIND, say, SCENE } from "../motion/run.ts";
import { arrow, fmt, gearOutline, knob, look, on, part, pin, pivoted, plate, post, turnMark, v3, DEG, RAD, type Pt, type Vec } from "../parts.ts";
import { type Cue, type Meter, type Primitive, type Run, type Values, type Verdict, VIEW } from "../types.ts";

// Geometry, millimetres.
export const MODULE = 3;
export const DRIVER_TEETH = 12;
const GEAR_T = 8;
/** The axles' height above the plate: tall enough for the biggest gear (24 teeth) to clear it. */
const AXLE_Y = 52;
/** The gears' mid-plane in z, chosen so the posts behind and the knob in front are centred on the plate. */
const Z0 = -5;
/** The driver's axle; the pair's union is centred on the plate. */
const X0 = -37.3;
const KNOB_R = 10;
const KNOB_AT_0 = 150;
/** The output's turn mark, degrees from the gear's own first tooth. */
const MARK_AT = 100;
const ARROW_R = 9;

export const pitchR = (teeth: number) => (MODULE * teeth) / 2;
export const tipR = (teeth: number) => pitchR(teeth) + MODULE;
export const drivenTeeth = (ratio: number) => clamp(Math.round(DRIVER_TEETH * ratio), 8, 24);

// The game, in game numbers.
/** The ghost turns this much of a turn for each turn of the driver, the other way round. */
export const GHOST = 0.75;
/** How far from the ghost the hand may end up, degrees. */
export const TOLERANCE = 20;

/** The angle a gear B must have to mesh with gear A, when B lies in direction `phi` (degrees) from A: a tooth meets a gap at the contact. */
export const meshAngle = (phi: number, thetaA: number, zA: number, zB: number) => phi + 180 - 180 / zB + (zA / zB) * (phi - thetaA);

/** Everything a pose needs. `build`, `readouts`, the handle and the game all read this. */
export function settle(v: Values) {
  const z2 = drivenTeeth(v.ratio ?? 1.5);
  const turn = v.turn ?? 0.1;
  const r1 = pitchR(DRIVER_TEETH);
  const r2 = pitchR(z2);
  const theta1 = turn * 360;
  const x1 = X0;
  const x2 = X0 + r1 + r2;
  const theta2 = meshAngle(0, theta1, DRIVER_TEETH, z2);
  /** Turns of the output for each turn of the driver: one mesh turns it the other way round, so it is negative. */
  const out = -DRIVER_TEETH / z2;
  return { z2, turn, r1, r2, theta1, theta2, x1, x2, out, torque: z2 / DRIVER_TEETH, hand: theta2 + MARK_AT };
}

const knobAngle = (theta1: number) => KNOB_AT_0 + theta1;
const knobPoint = (x1: number, theta1: number): Vec => v3(x1 + KNOB_R * Math.cos(knobAngle(theta1) * RAD), AXLE_Y + KNOB_R * Math.sin(knobAngle(theta1) * RAD), Z0 + GEAR_T / 2 + 10);

/**
 * A curved arrow in the x-y plane, one flat part: a band of `radius` about `centre` from `fromDeg` round to `toDeg`,
 * ending in a head at `toDeg`.
 */
function curvedArrow(id: string, centre: Vec, radius: number, from: number, to: number, name: string, role: string, parentId: string): Part {
  // Drawn centred on straight up and then turned into place, so the outline is wide along x as the arrow checks expect.
  const turnBy = (from + to) / 2 - 90;
  const fromDeg = from - turnBy;
  const toDeg = to - turnBy;
  const dir = Math.sign(toDeg - fromDeg) || 1;
  const headDeg = ((12 / radius) * DEG) * dir;
  const bodyEnd = toDeg - headDeg;
  const at = (r: number, deg: number): Pt => [r * Math.cos(deg * RAD), r * Math.sin(deg * RAD)];
  const steps = Math.max(2, Math.ceil(Math.abs(bodyEnd - fromDeg) / 8));
  const along = (r: number, reverse: boolean) => Array.from({ length: steps + 1 }, (_, i) => at(r, fromDeg + ((bodyEnd - fromDeg) * (reverse ? steps - i : i)) / steps));
  // Going the way the arrow points, the outer edge is on the left for anticlockwise (dir +1) and on the right for clockwise; the outline just needs to be a simple loop.
  const outline: Pt[] = [...along(radius + 2, false), at(radius + 5.5, bodyEnd), at(radius, toDeg), at(radius - 5.5, bodyEnd), ...along(radius - 2, true)];
  const a = pivoted(outline, 4, [0, 0], centre, turnBy);
  return part(id, name, role, a.shape, a.position, look.accent, on(parentId, "glue"), a.rotation);
}

function build(v: Values): Part[] {
  const s = settle(v);
  const gearAt = (id: string, role: string, teeth: number, x: number, angle: number, parent: string) => {
    const g = pivoted(gearOutline(teeth, MODULE), GEAR_T, [0, 0], v3(x, AXLE_Y, Z0), angle);
    return part(id, "Gear", role, g.shape, g.position, look.focus, on(parent, "hinge"), g.rotation);
  };
  const front = Z0 + GEAR_T / 2 + 1.5;
  return [
    plate(117, 38),
    post("post-1", s.x1, Z0 - 10, AXLE_Y, { name: "Post", role: "Carries the driving gear's axle." }),
    post("post-2", s.x2, Z0 - 10, AXLE_Y, { name: "Post", role: "Carries the driven gear's axle." }),
    pin("pin-1", v3(s.x1, AXLE_Y, Z0 - 2), 18, { name: "Axle", role: "The driving gear turns on it.", on: on("post-1", "press-fit") }),
    pin("pin-2", v3(s.x2, AXLE_Y, Z0 - 2), 18, { name: "Axle", role: "The driven gear turns on it.", on: on("post-2", "press-fit") }),
    gearAt("gear-driver", "The gear you turn: 12 teeth.", DRIVER_TEETH, s.x1, s.theta1, "pin-1"),
    gearAt("gear-driven", "Turned by the teeth of the driving gear; its tooth count sets the speed.", s.z2, s.x2, s.theta2, "pin-2"),
    knob("knob", knobPoint(s.x1, s.theta1), "z", { name: "Knob", role: "Where your hand turns the driving gear.", on: on("gear-driver", "press-fit") }),
    turnMark("mark-driven", v3(s.x2, AXLE_Y, front), s.r2, s.hand, { name: "Turn mark", role: "Shows how far the driven gear has turned.", on: on("gear-driven", "glue") }),
    // Direction: the driver turns anticlockwise and one mesh turns the output the other way round.
    curvedArrow("arrow-driven", v3(s.x2, AXLE_Y, Z0), tipR(s.z2) + ARROW_R, 90, 30, "Turn direction", "Which way the driven gear turns: the other way from the driving gear.", "gear-driven"),
  ];
}

function readouts(v: Values) {
  const s = settle(v);
  const driverDeg = s.turn * 360;
  const outDeg = -s.out * driverDeg;
  return [
    { label: "Speed", value: `${DRIVER_TEETH} ÷ ${s.z2} = ${fmt(DRIVER_TEETH / s.z2, 2)} turn out per turn in` },
    { label: "Travel", value: `driver ${fmt(driverDeg)}°, output ${fmt(outDeg)}° the other way` },
    { label: "State", value: `one mesh reverses it; ${fmt(s.torque, 2)}× the torque, ideal` },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "fast" | "slow";

/** The outcome, decided once from the teeth; meters, judge and play all read it. */
export function shadow(v: Values) {
  const s = settle({ ...v, turn: 1 });
  /** Degrees the output has turned beyond the ghost (positive) or short of it (negative), after one driver turn. */
  const err = (-s.out - GHOST) * 360;
  const kind: Kind = Math.abs(err) <= TOLERANCE + 1e-9 ? "pass" : err > 0 ? "fast" : "slow";
  return { kind, z2: s.z2, out: s.out, err, ghostDeg: GHOST * 360 };
}

function judge(v: Values): Verdict {
  const r = shadow(v);
  const turn = fmt(Math.abs(r.out), 2);
  switch (r.kind) {
    case "fast":
      return { pass: false, outcome: "too-fast", headline: "Output too fast", detail: `${DRIVER_TEETH} ÷ ${r.z2} = ${turn} turn, ${fmt(r.err)}° ahead of the ghost's ${GHOST}; ${TOLERANCE}° is allowed.` };
    case "slow":
      return { pass: false, outcome: "too-slow", headline: "Output too slow", detail: `${DRIVER_TEETH} ÷ ${r.z2} = ${turn} turn, ${fmt(-r.err)}° behind the ghost's ${GHOST}; ${TOLERANCE}° is allowed.` };
    case "pass":
      return { pass: true, outcome: "on-the-ghost", headline: "Mark on the ghost", detail: `${DRIVER_TEETH} ÷ ${r.z2} = ${turn} turn, ${fmt(Math.abs(r.err))}° off the ghost's ${GHOST}: inside ${TOLERANCE}°.` };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = shadow(v);
  return [
    { label: "Ahead", value: Math.min(120, Math.max(0, r.err)), target: TOLERANCE, max: 120, unit: "°", need: "atMost" },
    { label: "Behind", value: Math.min(120, Math.max(0, -r.err)), target: TOLERANCE, max: 120, unit: "°", need: "atMost" },
  ];
}

// Choreography, ms.
const TURN = 2200;
const HOLD = 800;

function play(v: Values): Run {
  const verdict = judge(v);
  const r = shadow(v);
  const t0 = clamp(v.turn ?? 0, 0, 1);
  const tl = phases({ rewind: t0 > 1e-9 ? REWIND : 0, lead: LEAD, turn: TURN, hold: HOLD });
  const values = (turn: number): Values => ({ ...v, ratio: v.ratio ?? 1.5, turn: clamp(turn, 0, 1) });
  const cues: Cue[] = [{ ms: tl.end("turn"), kind: r.kind === "pass" ? "click" : "thud" }];
  const off = (turn: number) => Math.abs(r.err) * turn;
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
          return frame(values(0), "Mark on the ghost");
        case "turn": {
          const turn = smooth(tl.t("turn", ms));
          return frame(values(turn), `Turn ${say(turn, 2)}, off by ${say(off(turn))}°`);
        }
        case "hold":
          return frame(values(1), r.kind === "pass" ? "Mark on the ghost" : `Off by ${say(Math.abs(r.err))}°`);
      }
    },
  };
}

/**
 * The game's one target: a ghost arrow on the output's axle, pointing where the output's turn mark should be. It turns
 * 0.75 of a turn for each turn of the driver, the other way round, as one mesh turns the output.
 */
function scene(v: Values): Part[] {
  const s = settle(v);
  const at0 = settle({ ...v, turn: 0 }).hand;
  const angle = at0 - GHOST * 360 * s.turn;
  const length = Math.max(12, 0.95 * s.r2 - 4);
  return arrow(`${SCENE}ghost-arrow`, v3(s.x2, AXLE_Y, Z0 + GEAR_T / 2 + 5), angle, length, "pull", {
    name: "Ghost arrow",
    role: "Where the output's turn mark should point: it turns 0.75 of a turn for each turn of the driver, the other way round.",
    on: on("pin-2", "glue"),
  });
}

export const gear: Primitive = {
  id: "gear",
  name: "Gear",
  level: "Mechanism",
  job: "Change the speed or force of turning",
  howItWorks:
    "A gear is a wheel with teeth cut into its rim, so two of them cannot slip against each other. The same number of teeth pass the contact point on both, so a gear with twice the teeth turns half as fast and, because the work in equals the work out, with twice the turning force. Each mesh also reverses the direction of turn. This is the ideal case with friction ignored, drawn with straight-sided teeth; real teeth are curved so the ratio stays exact all the way through each tooth.",
  madeOf: ["wheel", "wheel"],
  seenIn: ["Watch", "Bike", "Hand drill"],
  sliders: [
    { id: "ratio", label: "Tooth ratio", min: 8 / 12, max: 2, step: 1 / 12, initial: 1.5, unit: "×" },
    { id: "turn", label: "Turn", min: 0, max: 1, step: 0.005, initial: 0.1, unit: "°", displayScale: 360 },
  ],
  view: VIEW.bench,
  build,
  readouts,
  handle: {
    slider: "turn",
    label: "Turn",
    at: (v) => {
      const s = settle(v);
      return knobPoint(s.x1, s.theta1);
    },
    // The knob rides a circle round the driver's axle: the turn whose knob angle points at the finger, nearest the current one.
    solve: (point, v) => {
      const s = settle(v);
      const a = Math.atan2(point.y - AXLE_Y, point.x - s.x1) * DEG;
      const base = (a - KNOB_AT_0) / 360;
      return base + Math.round((v.turn ?? 0) - base);
    },
  },
  game: {
    name: "Shadow the ghost",
    goal: "Turn the driver once and keep the output's mark on the ghost arrow.",
    rules: `The ghost turns ${GHOST} of a turn for each turn of the driver, the other way round, as one mesh does. The output's mark must end within ${TOLERANCE}° of it.`,
    number: "ratio",
    action: "Turn once",
    meters,
    judge,
    play,
    start: { ratio: 2, turn: 0 },
    scene,
  },
};

/** Exposed for tests: the solved layout. */
export const rig = { AXLE_Y, Z0, GEAR_T, X0 };
