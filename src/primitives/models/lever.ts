// Lever: trade force for distance about a pivot. An element, rewritten to src/primitives/docs/design-language.md.
//
// The rig is a seesaw: a plate, a tall black fulcrum, a pink bar resting on its point, a 30 N block on the bar, a press
// pad on the other end and the arrows. The number is the arm ratio: the pivot slides along the bar, so a bigger ratio is
// a visibly longer effort arm and a shorter load arm.
//
// The bar is never free to take any angle. Its underside always passes through the pivot's point. At rest its load end
// lies on the plate, so it sits load side down at the angle that gives. Pushed down, the finger decides: holding the
// block takes the load's weight over the arm ratio, 20 N only from a ratio of 1.5 up. With a smaller ratio the bar
// strains a millimetre or two and no further (`handle.reach`), and whatever the sliders ask for, `settle` puts the bar
// where the forces could hold it.
//
// Distance is the price. A finger moves a fixed TRAVEL (15 mm), so the block rises TRAVEL ÷ ratio: every point on the
// bar turns through the same angle, and the effort end goes down `ratio` times as far as the load end goes up. The
// plate never limits the push (a test proves the bar has room for the whole stroke), so a long effort arm runs out of
// finger, not floor.
//
// The game, "One finger": raise the block 6.5 mm with one 20 N finger that moves 15 mm. A small ratio needs more than
// 20 N; a large one turns 15 mm of finger into too little lift.
import type { Part } from "../../../shared/kit.ts";
import { clamp, shudder, smooth } from "../motion/ease.ts";
import { frame, handArrow, phases, SCENE } from "../motion/run.ts";
import { arrow, arrowLength, box, DEG, fmt, look, loadEdge, on, part, PLATE_TOP, plate, post, pushDisc, rotateAbout, tick, v3 } from "../parts.ts";
import { type Cue, type Meter, type Primitive, type Run, type Values, type Verdict, VIEW } from "../types.ts";

// Geometry, millimetres.
/** Effort point to load point, along the bar. */
const SPAN = 48;
/** Where the effort point sits with the bar level. */
const XE = -SPAN / 2;
/** The bar runs this far past each force point. */
const EXT = 16;
const BAR_T = 8;
const BAR_DEPTH = 20;
/** The pivot's point is this high above the plate's top. */
const PIVOT_H = 11;
const PIVOT_Y = PLATE_TOP + PIVOT_H;
/** The fulcrum is wider and deeper than the bar, so its faces show to the sides and front of the bar. */
const PIVOT_W = 16;
const PIVOT_DEPTH = 28;
const PAD_T = 4;
const FINGER_MIN = 12;

// The game, in game numbers. Moments and the sweep are real; the load, the finger and the line are set so the window sits
// at ratios 1.5 to 2.3 and the long-arm failure misses by 3.5 mm.
export const LOAD = 30;
/** What one finger can push with. */
export const FINGER = 20;
/** How far one finger can move the effort end: its stroke. */
export const TRAVEL = 15;
/** The block must rise this far. */
export const RISE = 6.5;
/** A bar the finger cannot move still gives this much before it stops. */
export const STRAIN = 1.5;
/** mm per N for every arrow: the 30 N block is 36 long. */
const MM_PER_N = 36 / LOAD;

const ratioOf = (v: Values) => Math.round((v.ratio ?? 3) * 10) / 10;
const BLOCK = loadEdge(LOAD);

/**
 * The bar for an arm ratio: arm lengths, the pivot's position, and the two angles that bound its swing, in closed form.
 * Angles are radians, positive when the effort end goes down. Rest: the load end's lower corner is on the plate; limit:
 * the effort end's lower corner is.
 */
export function bounds(ratio: number) {
  const aEff = (SPAN * ratio) / (1 + ratio);
  const aLoad = SPAN - aEff;
  const xp = XE + aEff;
  const s0 = -PIVOT_H / (aLoad + EXT);
  const sMax = PIVOT_H / (aEff + EXT);
  return { ratio, aEff, aLoad, xp, s0, sMax, phi0: Math.asin(s0), pushMax: aEff * (sMax - s0) };
}

/** The finger's hold at a ratio: the force that balances the block at any angle. */
export const holdFor = (ratio: number) => LOAD / ratio;

/** Everything a pose needs, from the two sliders. `build`, `readouts`, the handle and the game all read this. */
export function settle(v: Values) {
  const ratio = ratioOf(v);
  const b = bounds(ratio);
  const hold = holdFor(ratio);
  /** The finger cannot lift this block at this ratio: the bar only strains. */
  const weak = hold > FINGER + 1e-9;
  const limit = weak ? Math.min(STRAIN, b.pushMax) : Math.min(b.pushMax, TRAVEL);
  const push = clamp(v.push ?? 8, 0, limit);
  const sin = b.s0 + push / b.aEff;
  const phi = Math.asin(clamp(sin, -1, 1));
  return { ...b, hold, weak, limit, push, sin, phi, deg: phi * DEG, rise: push / ratio, effort: weak ? FINGER : hold };
}

type Bar = { aEff: number; aLoad: number; xp: number };
/** A point given in the bar's frame (along it from the pivot, up from its underside) as it lands in the world. */
export const onBar = (b: Bar, phi: number, lx: number, ly: number) => rotateAbout([lx, ly], phi * DEG, v3(b.xp, PIVOT_Y, 0));
/** The press pad's centre (`up` above the bar's top) and the block's centre, for a bar turned `phi`. */
const padAt = (b: Bar, phi: number, up: number) => onBar(b, phi, -b.aEff, BAR_T + up);
const blockAt = (b: Bar, phi: number) => onBar(b, phi, b.aLoad, BAR_T + BLOCK / 2);

function build(v: Values): Part[] {
  const s = settle(v);
  const bar = onBar(s, s.phi, (s.aLoad - s.aEff) / 2, BAR_T / 2);
  const pad = { ...pushDisc("pad", padAt(s, s.phi, PAD_T / 2), "y", { name: "Press pad", role: "Where one finger pushes the effort end down.", on: on("bar", "glue") }), rotation: v3(0, 0, s.deg) };
  const block = blockAt(s, s.phi);
  const load = part("load", "Load", "The weight being lifted.", box(BLOCK, BLOCK, BLOCK, 1.5), block, look.stone, on("bar", "glue"), v3(0, 0, s.deg));
  // The weight arrow stands over the block's highest corner.
  const blockTop = block.y + (BLOCK / 2) * (Math.cos(s.phi) + Math.abs(Math.sin(s.phi)));

  const parts: Part[] = [
    plate(84.6, 30),
    part("pivot", "Pivot", "The bar rests on its point and turns about it.", { kind: "extrusion", outline: [{ x: -PIVOT_W, y: 0 }, { x: PIVOT_W, y: 0 }, { x: 0, y: PIVOT_H }], depth: PIVOT_DEPTH }, v3(s.xp, PLATE_TOP + PIVOT_H / 2, 0), look.structure, on("plate", "weld")),
    part("bar", "Bar", "Carries the push on one side of the pivot and the load on the other.", box(SPAN + 2 * EXT, BAR_T, BAR_DEPTH, 1), bar, look.focus, on("pivot", "hinge"), v3(0, 0, s.deg)),
    pad,
    load,
    ...arrow("load-arrow", v3(block.x, blockTop, 0), -90, arrowLength(LOAD, LOAD, 36), "push", { name: "Arrow", role: "The block's weight, pulling down.", on: on("load", "glue") }),
  ];
  // The finger holds the bar only once it is pushing: at rest the plate carries the load.
  if (s.push > 1e-9) {
    parts.push(...arrow("effort-arrow", padAt(s, s.phi, PAD_T), -90, Math.max(FINGER_MIN, s.effort * MM_PER_N), "push", { name: "Arrow", role: s.weak ? "A finger's whole push: 20 N, not enough." : "The push that balances the block, to the same scale.", on: on("pad", "glue") }));
  }
  return parts;
}

function readouts(v: Values) {
  const s = settle(v);
  const state =
    s.weak ? `${fmt(s.hold, 1)} N needed, finger has ${FINGER}: it strains ${fmt(s.limit, 1)} mm`
    : s.push < 1e-9 ? `block rests on the plate; ${fmt(s.hold, 1)} N would hold it level`
    : s.push >= s.limit - 1e-9 ? `finger at the end of its ${TRAVEL} mm; ${fmt(s.hold, 1)} N holds the block ${fmt(s.rise, 1)} mm up`
    : `${fmt(s.hold, 1)} N holds the block ${fmt(s.rise, 1)} mm up`;
  return [
    { label: "Push", value: `F = ${LOAD} N ÷ ${fmt(s.ratio, 1)} = ${fmt(s.hold, 1)} N` },
    { label: "Travel", value: `your end down ${fmt(s.push, 1)} mm, block up ${fmt(s.push, 1)} ÷ ${fmt(s.ratio, 1)} = ${fmt(s.rise, 1)} mm` },
    { label: "State", value: state },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "weak" | "short";

/** The outcome, decided once from the ratio; meters, judge and play all read it. */
export function lift(v: Values) {
  const ratio = ratioOf(v);
  const hold = holdFor(ratio);
  /** The press the lift takes, and the lift the finger's whole stroke gives. */
  const need = RISE * ratio;
  const canRise = TRAVEL / ratio;
  const kind: Kind = hold > FINGER + 1e-9 ? "weak" : need > TRAVEL + 1e-9 ? "short" : "pass";
  return { kind, ratio, hold, need, canRise };
}

function judge(v: Values): Verdict {
  const r = lift(v);
  switch (r.kind) {
    case "weak":
      return { pass: false, outcome: "too-heavy", headline: "Too heavy to lift", detail: "Your arm is too short: without a long arm, one finger cannot push hard enough." };
    case "short":
      return { pass: false, outcome: "out-of-room", headline: "Not enough travel", detail: "Your arm is too long: the finger runs out of room before the block reaches the line." };
    case "pass":
      return { pass: true, outcome: "block-lifted", headline: "Block lifted", detail: "The lever makes the push easy, and the finger still has room to reach the line." };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = lift(v);
  return [
    { label: "Finger push", value: r.hold, target: FINGER, max: LOAD, unit: "N", need: "atMost", digits: 1 },
    { label: "Lift room", value: r.canRise, target: RISE, max: TRAVEL, unit: "mm", need: "atLeast", digits: 1 },
  ];
}

// Choreography, ms.
const LEAD = 300;
const HOLD = 700;
const RESET = 600;
const TWITCH = 700;

function play(v: Values): Run {
  const verdict = judge(v);
  const r = lift(v);
  const home = clamp(v.push ?? 0, 0, TRAVEL);
  // A pass presses just far enough; a finger with too little travel presses all of it, and the block stops short.
  const pressTo = r.kind === "pass" ? r.need : r.kind === "short" ? TRAVEL : 0;
  const pressMs = clamp(380 + 20 * pressTo, 400, 1000);
  const tl =
    r.kind === "weak"
      ? phases({ lead: LEAD, press: 0, twitch: TWITCH, hold: HOLD, reset: 0 })
      : phases({ lead: LEAD, press: pressMs, twitch: 0, hold: HOLD, reset: RESET });
  const cues: Cue[] = r.kind === "pass" ? [{ ms: tl.end("press"), kind: "click" }] : r.kind === "weak" ? [{ ms: tl.start("twitch") + 120, kind: "thud" }] : [];

  const values = (push: number): Values => ({ ...v, ratio: r.ratio, push });

  return {
    verdict,
    durationMs: tl.total,
    cues,
    at: (ms) => {
      const { phase } = tl.at(ms);
      if (phase === "lead") {
        const s = settle(values(home));
        const hand = handArrow(padAt(s, s.phi, PAD_T), -90, "push", Math.max(FINGER_MIN, FINGER * MM_PER_N));
        return frame(values(home), "Press the end", home < 1e-9 ? hand : []);
      }
      if (phase === "twitch") {
        const push = STRAIN * Math.abs(shudder(tl.t("twitch", ms)));
        return frame(values(push), "Too heavy");
      }
      if (phase === "press") {
        const push = home + (pressTo - home) * smooth(tl.t("press", ms));
        return frame(values(push), "Block rising");
      }
      if (phase === "hold") {
        if (r.kind === "weak") return frame(values(0), "Won't budge");
        return frame(values(pressTo), r.kind === "pass" ? "Block lifted" : "Not high enough");
      }
      const t = smooth(tl.t("reset", ms));
      return frame(values(pressTo + (home - pressTo) * t), "Putting it back");
    },
  };
}

/** Past the block's farthest lean (x = 43) and level with the bar's front face (z = 10), so the line is read in the block's own plane: a black post and, on it, the line the top of the block must reach. */
const MARK_LEN = 12;
const MARK_X = 49;
const MARK_Z = 10;

/** The height of the block's highest corner when the bar has lifted the load point RISE mm, at this ratio: the line the block must reach. */
export function markHeight(ratio: number): number {
  const b = bounds(ratio);
  const phi = Math.asin(clamp(b.s0 + (RISE * b.ratio) / b.aEff, -1, 1));
  return blockAt(b, phi).y + (BLOCK / 2) * (Math.cos(phi) + Math.abs(Math.sin(phi)));
}

function scene(v: Values): Part[] {
  const at = markHeight(ratioOf(v));
  return [
    post(`${SCENE}mark-post`, MARK_X, MARK_Z, at + 4, { name: "Mark post", role: "Carries the line the block has to reach." }),
    tick(`${SCENE}mark`, v3(MARK_X - 5 - MARK_LEN / 2, at, MARK_Z), MARK_LEN, "x", { name: "Mark", role: "How high the top of the block has to get.", on: on(`${SCENE}mark-post`, "weld") }),
  ];
}

export const lever: Primitive = {
  id: "lever",
  name: "Lever",
  level: "Element",
  job: "Trade force for distance about a pivot",
  howItWorks:
    "A lever balances when force times distance from the pivot is equal on both sides. Put the load close to the pivot and your push far from it, and a small push holds a big load: the push needed is the load times the load arm over the effort arm. But both ends turn through the same angle, so your end travels the same ratio further than the load does, and a finger that can only move so far lifts the load less the longer the effort arm is. Nothing is gained in work. The bar rests with its heavier side down, on the plate, and a finger that cannot supply the push only strains it a millimetre or two. The bar's own weight and the pivot's friction are left out.",
  madeOf: [],
  seenIn: ["Scissors", "Stapler", "Nail clipper"],
  sliders: [
    { id: "ratio", label: "Arm ratio", min: 1, max: 5, step: 0.1, initial: 3, unit: "×" },
    // Was 0..25 (the plate set the limit). Now 0..15: the finger's own stroke, the most the effort end can go down.
    { id: "push", label: "Effort end down", min: 0, max: TRAVEL, step: 1, initial: 8, unit: " mm" },
  ],
  view: VIEW.bench,
  build,
  readouts,
  handle: {
    slider: "push",
    label: "Press",
    at: (v) => {
      const s = settle(v);
      return padAt(s, s.phi, PAD_T / 2);
    },
    // The pad goes down by the push, less a little as the bar tilts: fold the tilt in by iterating.
    solve: (point, v) => {
      const b = bounds(ratioOf(v));
      const top = padAt(b, b.phi0, PAD_T / 2).y;
      let push = 0;
      for (let i = 0; i < 40; i++) {
        const phi = Math.asin(clamp(b.s0 + push / b.aEff, -1, 1));
        push = top - point.y + (BAR_T + PAD_T / 2) * (Math.cos(phi) - Math.cos(b.phi0));
      }
      return push;
    },
    // A finger that cannot hold the block gets a millimetre or two; otherwise as far as a finger moves.
    reach: (v) => [0, settle(v).limit],
  },
  game: {
    name: "One finger",
    goal: "Lift the block to the line with one finger.",
    rules: "A longer arm makes your push stronger, but your finger has to travel further. Find the arm that is strong enough and short enough.",
    number: "ratio",
    action: "Hold to press",
    meters,
    judge,
    play,
    start: { ratio: 4, push: 0 },
    scene,
  },
};

/** Exposed for tests: the bar's layout. */
export const rig = { PIVOT_Y, PIVOT_W, PIVOT_H, EXT, BAR_T, BAR_DEPTH, BLOCK, SPAN, PAD_T, MARK_LEN, MARK_X, MARK_Z };
