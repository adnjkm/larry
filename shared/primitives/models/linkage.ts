// Linkage: turn one motion into another. Rewritten to src/primitives/docs/design-language.md and motion-language.md.
//
// The rig is a four-bar linkage on two posts: a short pink crank with the knob (the input, it goes all the way round),
// a steel coupler, and a long pink rocker (the output, it only rocks to and fro). The joint between coupler and rocker
// can only sit where two circles meet, so every crank angle has exactly one pose: solved in closed form.
//
// The number is the rocker's length. A longer rocker rocks through a smaller angle; the arc behind its tip shows how far.
//
// The game, "Wiper": the rocker is a wiper, and one crank turn must sweep it down to the frame stop, a peg standing in the
// rocker's own plane, without hitting it. Too short a rocker swings wide onto the peg: the rocker stops dead against it
// and the crank stalls and shudders there, short of a full turn. Too long leaves a strip unwiped.
import type { Part } from "../../kit.ts";
import { clamp, shudder, smooth } from "../motion/ease.ts";
import { frame, HOLD, LEAD, phases, REWIND, SCENE, whenReaches } from "../motion/run.ts";
import { bar, fmt, knob, look, on, pin, plate, post, shaped, travelArc, v3, type Pt } from "../parts.ts";
import { type Cue, type Meter, type Primitive, type Run, type Values, type Verdict, VIEW, type Slider, valueOf } from "../types.ts";
import { DEG_TO_RAD, RAD_TO_DEG } from "../../angles.ts";

// Geometry, mm.
export const CRANK = 24;
export const COUPLER = 70;
export const FRAME = 80;
/** The pivots, high enough that the crank's tip, coupler end and knob clear the plate all the way round. */
const PIVOT_Y = 46;
/** Shifts the rig so the union of its poses is centred on the plate. */
const AX = -27.75;
export const A: Pt = [AX, PIVOT_Y];
export const D: Pt = [AX + FRAME, PIVOT_Y];
/** Links run this far past each pin, so the pin sits in a rounded end. */
const END = 5;
const BAR = 8;
/** Layers, front to back, as z centres: the coupler in front, then the crank, then the rocker and the crank's post, then the rocker's post. */
const Z0 = -2;
const Z_COUPLER = 4 + Z0;
const Z_CRANK = -4 + Z0;
const Z_ROCKER = -12 + Z0;
const Z_POST_A = -12 + Z0;
const Z_POST_D = -20 + Z0;
/** The knob stands on the crank pin, in front of the coupler. */
const Z_KNOB = 18 + Z0;
/** The rocker's swing arc stands this far past its tip. */
const ARC_PAST = 6;

/** Crank tip B and coupler/rocker joint C, by intersecting the coupler's circle round B with the rocker's round D. */
export function fourBar(rocker: number, crankDeg: number) {
  const a = crankDeg * DEG_TO_RAD;
  const B: Pt = [A[0] + CRANK * Math.cos(a), A[1] + CRANK * Math.sin(a)];
  const dx = D[0] - B[0];
  const dy = D[1] - B[1];
  const d = Math.hypot(dx, dy);
  const along = (COUPLER * COUPLER - rocker * rocker + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, COUPLER * COUPLER - along * along));
  const ux = dx / d;
  const uy = dy / d;
  const C: Pt = [B[0] + along * ux - h * uy, B[1] + along * uy + h * ux];
  return { B, C, rockerDeg: Math.atan2(C[1] - D[1], C[0] - D[0]) * RAD_TO_DEG };
}

/** The rocker's two ends of travel over a full crank turn, and the crank angles where it reaches them. Refined by golden-section search. */
const swings = new Map<number, { lo: number; hi: number; loAt: number; hiAt: number }>();
export function swingOf(rocker: number) {
  let s = swings.get(rocker);
  if (s) return s;
  const angle = (k: number) => fourBar(rocker, k).rockerDeg;
  const refine = (k0: number, sign: 1 | -1) => {
    let a = k0 - 2;
    let b = k0 + 2;
    for (let i = 0; i < 60; i++) {
      const m1 = b - (b - a) * 0.618;
      const m2 = a + (b - a) * 0.618;
      if (sign * angle(m1) > sign * angle(m2)) b = m2;
      else a = m1;
    }
    return (a + b) / 2;
  };
  let loK = 0;
  let hiK = 0;
  for (let k = 0; k < 360; k += 1) {
    if (angle(k) < angle(loK)) loK = k;
    if (angle(k) > angle(hiK)) hiK = k;
  }
  const loAt = refine(loK, -1);
  const hiAt = refine(hiK, 1);
  s = { lo: angle(loAt), hi: angle(hiAt), loAt: (loAt + 360) % 360, hiAt: (hiAt + 360) % 360 };
  if (swings.size > 200) swings.clear();
  swings.set(rocker, s);
  return s;
}

/** Everything a pose needs. `build`, `readouts`, the handle and the game all read this. */
export function settle(v: Values) {
  const rocker = valueOf(ROCKER, v);
  const crank = v.crank ?? 50;
  const { B, C, rockerDeg } = fourBar(rocker, crank);
  const swing = swingOf(rocker);
  /** Which way the rocker is going as the crank turns on: +1 up toward hi, -1 back. */
  const heading = Math.sign(fourBar(rocker, crank + 0.5).rockerDeg - rockerDeg);
  return { rocker, crank, B, C, rockerDeg, heading, ...swing, span: swing.hi - swing.lo };
}

/** A link from a to b, running END past each pin. */
function link(a: Pt, b: Pt, z: number) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  return bar([a[0] - u[0] * END, a[1] - u[1] * END], [b[0] + u[0] * END, b[1] + u[1] * END], BAR, BAR, z);
}

/** A pin along z between two layers' outer faces. */
const pinAt = (id: string, p: Pt, zFront: number, zBack: number, name: string, role: string, parent: string) =>
  pin(id, v3(p[0], p[1], (zFront + zBack) / 2), zFront - zBack, { name, role, on: on(parent, "press-fit") });

function build(v: Values): Part[] {
  const s = settle(v);
  const parts: Part[] = [
    plate(114.5, 52),
    post("post-a", A[0], Z_POST_A, A[1] + 4, { name: "Post", role: "Holds the crank's pivot." }),
    post("post-d", D[0], Z_POST_D, D[1] + 4, { name: "Post", role: "Holds the rocker's pivot, 80 mm from the crank's." }),
    pinAt("pin-a", A, Z_CRANK + 4, Z_POST_A - 4, "Pin", "The crank's pivot: it turns on it.", "post-a"),
    pinAt("pin-d", D, Z_ROCKER + 4, Z_POST_D - 4, "Pin", "The rocker's pivot: it rocks on it.", "post-d"),
    shaped("crank", "Crank", "The input: a short bar your hand turns all the way round.", link(A, s.B, Z_CRANK), look.focus, on("pin-a", "hinge")),
    pinAt("pin-b", s.B, Z_COUPLER + 4, Z_CRANK - 4, "Pin", "Joins the crank to the coupler.", "crank"),
    shaped("coupler", "Coupler", "Carries the crank's motion across to the rocker.", link(s.B, s.C, Z_COUPLER), look.steel, on("pin-b", "hinge")),
    pinAt("pin-c", s.C, Z_COUPLER + 4, Z_ROCKER - 4, "Pin", "Joins the coupler to the rocker.", "coupler"),
    shaped("rocker", "Rocker", "The output: a long bar that can only rock to and fro.", link(D, s.C, Z_ROCKER), look.focus, on("pin-d", "hinge")),
    knob("knob", v3(s.B[0], s.B[1], Z_KNOB), "z", { name: "Knob", role: "Where your hand turns the crank.", on: on("pin-b", "hinge") }),
  ];
  // How far the rocker rocks over a full turn: an arc just past its tip.
  const arc = travelArc("swing-arc", v3(D[0], D[1], Z_ROCKER), s.rocker + END + ARC_PAST, s.lo, s.hi, { name: "Rock", role: "How far the rocker rocks over one crank turn.", on: on("post-d", "weld") });
  if (arc) parts.push(arc);
  return parts;
}

function readouts(v: Values) {
  const s = settle(v);
  const at = s.rockerDeg - s.lo;
  return [
    { label: "Rock", value: `rocker ${s.rocker} mm rocks ${fmt(s.hi)}° − ${fmt(s.lo)}° = ${fmt(s.span)}°` },
    { label: "Travel", value: `crank ${fmt(s.crank)}° round, rocker ${fmt(at)}° of ${fmt(s.span)}° out` },
    { label: "State", value: Math.min(at, s.span - at) < 1 ? "rocker at the end of its rock" : s.heading > 0 ? "rocker swinging up" : "rocker swinging down" },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

/**
 * The frame stop is a round peg standing out of the rocker's pivot post, in the rocker's own plane. The rocker is
 * STOP_LO degrees about its pivot when its flat side lies against the peg. The peg is STOP_R from the pivot, so the
 * rocker's side (BAR / 2 from its centre line) meets the peg's surface (PEG_R from its centre) when the peg's centre is
 * BAR / 2 + PEG_R from the rocker's centre line: the peg sits that angle below STOP_LO. Nothing is typed in twice.
 */
export const STOP_LO = 96;
const STOP_R = 32;
const PEG_R = 3;
const PEG_LENGTH = 20;
const PEG_AT_DEG = STOP_LO - Math.asin((BAR / 2 + PEG_R) / STOP_R) * RAD_TO_DEG;
/** The peg's centre, in x and y. */
const PEG: Pt = [D[0] + STOP_R * Math.cos(PEG_AT_DEG * DEG_TO_RAD), D[1] + STOP_R * Math.sin(PEG_AT_DEG * DEG_TO_RAD)];
/** How close to the stop the wiper has to come to count as wiping it clean, degrees. */
export const TOLERANCE = 4;

type Kind = "pass" | "hits-frame" | "leaves-strip";

/** The outcome, decided once from the rocker length; meters, judge and play all read it. */
export function wipe(v: Values) {
  const rocker = valueOf(ROCKER, v);
  const s = swingOf(rocker);
  // Past the stop (positive) means the rocker would go through it; the gap is how far short of it the rocker stays.
  const past = STOP_LO - s.lo;
  const gap = s.lo - STOP_LO;
  const kind: Kind = past > 1e-9 ? "hits-frame" : gap > TOLERANCE + 1e-9 ? "leaves-strip" : "pass";
  return { kind, rocker, ...s, span: s.hi - s.lo, past, gap };
}

/**
 * How far the crank has turned, in degrees, when the rocker comes down to the stop and is stopped by it, or Infinity.
 * The run turns the crank backwards from 360 down to 0: the wiper climbs to its top first, then sweeps down toward the
 * stop, which is the end of the stroke that the length of the rocker decides.
 */
export function stallAt(rocker: number): number {
  if (swingOf(rocker).lo >= STOP_LO) return Infinity;
  const angle = (turned: number) => fourBar(rocker, 360 - turned).rockerDeg;
  let before = 0;
  for (let turned = 0.25; turned <= 360; turned += 0.25) {
    if (angle(turned) <= STOP_LO) {
      let lo = before;
      let hi = turned;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (angle(mid) > STOP_LO) lo = mid;
        else hi = mid;
      }
      return lo;
    }
    before = turned;
  }
  return Infinity;
}

function judge(v: Values): Verdict {
  const r = wipe(v);
  switch (r.kind) {
    case "hits-frame":
      return { pass: false, outcome: "hits-frame", headline: "Hit the frame", detail: "Too long a rocker: it swings into the frame stop and the crank jams." };
    case "leaves-strip":
      return { pass: false, outcome: "leaves-strip", headline: "Left a strip", detail: "Too short a rocker: it stops swinging before the stop, leaving a strip unwiped." };
    case "pass":
      return { pass: true, outcome: "wiped-clean", headline: "Wiped it clean", detail: "The rocker swings right down to the stop without touching it." };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = wipe(v);
  return [
    { label: "Past stop", value: Math.max(0, r.past), target: 0, max: 10, unit: "°", need: "atMost", digits: 1 },
    { label: "Gap left", value: Math.max(0, r.gap), target: TOLERANCE, max: 10, unit: "°", need: "atMost", digits: 1 },
  ];
}

// Choreography, ms.
/** One crank turn by hand, turning the crank backwards from 360 to 0. */
const TURN = 2600;
/** The crank shudders against the stop this long. */
const STALL = 700;
/** The crank backs off the stop and presses on again by up to this many degrees as it shudders. */
const SHUDDER_DEG = 2;

function play(v: Values): Run {
  const verdict = judge(v);
  const r = wipe(v);
  const c0 = clamp(v.crank ?? 360, 0, 360);
  const hits = r.kind === "hits-frame";
  /** How far the crank turns (degrees, from 360 down) before the stop stalls it; Infinity when the rocker never reaches the stop. */
  const stall = hits ? stallAt(r.rocker) : Infinity;
  /** The share of a full, eased turn at which the crank reaches the stall. */
  const uStall = hits ? whenReaches((u) => 360 * smooth(u), stall, 0, 1) : 1;
  const tl = phases({ rewind: c0 < 360 - 1e-9 ? REWIND : 0, lead: LEAD, turn: TURN * uStall, stall: hits ? STALL : 0, hold: HOLD });
  const values = (crank: number): Values => ({ ...v, rocker: r.rocker, crank: clamp(crank, 0, 360) });
  // The crank only ever turns on to the stall, and shudders back from it: the rocker never goes past the stop.
  const turnedAt = (ms: number): number => {
    const { phase } = tl.at(ms);
    switch (phase) {
      case "turn":
        return 360 * smooth(tl.t("turn", ms) * uStall);
      case "stall":
        return stall - SHUDDER_DEG * Math.abs(shudder(tl.t("stall", ms)));
      case "hold":
        return hits ? stall : 360;
      default:
        return 0;
    }
  };
  const crankAt = (ms: number): number => (tl.at(ms).phase === "rewind" ? c0 + (360 - c0) * smooth(tl.t("rewind", ms)) : 360 - turnedAt(ms));
  const cues: Cue[] = hits ? [{ ms: tl.end("turn"), kind: "thud" }] : [];
  const end = r.kind === "pass" ? "Wiped clean" : hits ? "Jammed!" : "Strip missed";

  return {
    verdict,
    durationMs: tl.total,
    cues,
    at: (ms) => {
      const { phase } = tl.at(ms);
      const crank = crankAt(ms);
      switch (phase) {
        case "rewind":
          return frame(values(crank), "Back to the start");
        case "lead":
          return frame(values(crank), "Crank ready");
        case "turn":
          return frame(values(crank), "Turning");
        case "stall":
          return frame(values(crank), "Jammed!");
        case "hold":
          return frame(values(crank), end);
      }
    },
  };
}

/**
 * The game's one target: the frame stop, a peg in the rocker's plane (z of the rocker) standing out of a piece of post
 * stacked on the rocker's pivot post, which is what holds it. Both are structure: the frame.
 */
function scene(): Part[] {
  const frontOfPost = Z_POST_D + 4;
  return [
    post(`${SCENE}post`, D[0], Z_POST_D, PEG[1] + PEG_R, { name: "Post", role: "Carries the frame stop above the rocker's pivot.", bottom: D[1] + 4, on: on("post-d", "weld") }),
    pin(`${SCENE}stop`, v3(PEG[0], PEG[1], frontOfPost + PEG_LENGTH / 2), PEG_LENGTH, { name: "Frame stop", role: "The frame: a rocker swinging this far hits it and cannot go on.", on: on(`${SCENE}post`, "press-fit") }),
  ];
}

const ROCKER: Slider = { id: "rocker", label: "Rocker bar", min: 50, max: 90, step: 1, initial: 66, unit: " mm" };

export const linkage: Primitive = {
  id: "linkage",
  name: "Linkage",
  level: "Mechanism",
  job: "Turn one motion into another",
  howItWorks:
    "A linkage is levers joined end to end by pins. Here four bars make a loop: the base between the two posts, a short crank you turn all the way round, a coupler, and a long rocker. The rocker cannot go round; it rocks to and fro, so a steady turn becomes a back-and-forth swing, as in a windscreen wiper. Because the bars cannot stretch, the rocker's end can only sit where two circles meet, so every crank angle gives exactly one pose. A longer rocker rocks through a smaller angle. Friction and the bars' own weight are left out.",
  madeOf: ["lever", "lever"],
  seenIn: ["Windscreen wiper", "Locking pliers", "Desk lamp"],
  sliders: [
    ROCKER,
    { id: "crank", label: "Crank", min: 0, max: 360, step: 1, initial: 50, unit: "°" },
  ],
  view: VIEW.bench,
  build,
  readouts,
  handle: {
    slider: "crank",
    label: "Crank",
    at: (v) => {
      const s = settle(v);
      return v3(s.B[0], s.B[1], Z_KNOB);
    },
    // The knob goes round the crank pivot: the crank angle pointing at the finger, the turn nearest the current one.
    solve: (point, v) => {
      const a = Math.atan2(point.y - A[1], point.x - A[0]) * RAD_TO_DEG;
      const now = v.crank ?? 50;
      return a + 360 * Math.round((now - a) / 360);
    },
  },
  game: {
    name: "Wiper",
    goal: "Sweep the wiper down to the stop without hitting it.",
    rules: "One turn of the crank swings the wiper. A longer rocker swings less. Too much and it hits the stop; too little and it leaves a strip.",
    number: "rocker",
    action: "Turn the crank",
    meters,
    judge,
    play,
    start: { rocker: 54, crank: 360 },
    scene,
  },
};

/** Exposed for tests: the layers the parts are placed on. */
export const rig = { A, D, PIVOT_Y, Z_COUPLER, Z_CRANK, Z_ROCKER, Z_POST_A, Z_POST_D, Z_KNOB, END, BAR, STOP_LO, PEG, PEG_R, PEG_LENGTH };
