// Cord: carry a pull around a corner. It can only pull. An element, rewritten to src/primitives/docs/design-language.md.
//
// The rig is a weight on a string: a post with a peg that sticks out of it, a cord that runs from a pull ring in the
// hand, over the peg, and down to a stone weight. The peg is the corner; the number is the weight, so the tension.
// The weight hangs on the left and the hand pulls to the right, with the post on the hand's side of the peg: seen from
// the front the near cord and the weight are never in front of the black post, so the cord is the eye's first stop.
// Everything the cord does follows from one rule, that it can pull and never push:
//  - the ring out (pull > 0) lifts the weight by the same distance, and the cord carries the weight's whole pull, the
//    same at both ends: the arrow at the ring and the arrow on the weight are one length;
//  - the ring toward the peg (pull < 0) does not push the weight: the extra cord hangs as a sag and the weight stays
//    where it is, on the floor, with nothing in the cord;
//  - the weight itself can be thrown above the cord's reach (the game's yank): the cord goes slack under it, again
//    as a sag, until it falls back and the cord catches it.
// `settle` puts the cord where those rules leave it, whatever the sliders ask for.
//
// The game, "Don't snap it": a yank pulls the ring out 10 mm with extra force, so the cord carries the weight times
// (1 + yank) for that moment, and the weight carries on rising after the hand stops, 10 x yank further. The line is 15 mm
// up and the cord breaks at 40 N: too gentle and the weight never reaches the line, too hard and the cord snaps.
import type { Part } from "../../kit.ts";
import { clamp, easeOut, fall, smooth } from "../motion/ease.ts";
import { frame, handArrow, MARK, phases, SCENE, whenReaches } from "../motion/run.ts";
import { arrow, box, chain, cylinder, fmt, look, on, part, PLATE_TOP, plate, post, pullRing, tick, v3, type Pt, type Vec } from "../parts.ts";
import { type Cue, type Meter, type Primitive, type Run, type Values, type Verdict, VIEW } from "../types.ts";

// Geometry, millimetres.
const PEG_R = 6;
const CORD = 3.2;
/** The radius the cord's centre line follows round the peg. */
const RC = PEG_R + CORD / 2;
const PEG_Y = 80;
/** From the peg's top to the ring when the hand has pulled 0: the cord is just taut. */
const C0 = 34;
const RING_R = 6;
const POST_Z = -12;
const PEG_BACK = POST_Z + 4;
const PEG_FRONT = 20;
/** The cord's plane, in front of the post so the weight clears it. */
const Z_CORD = 14;
/** Shift that centres the rig's depth on the plate. */
const ZS = -8.5;
const CORD_Y = PEG_Y + RC;
/** mm per N for both arrows: the biggest, at 40 N, is 40 long, and the smallest, at 10 N, is lifted to the 12 minimum. */
const MM_PER_N = 1;
/** The pull arrow floats above the cord's run, this far above it. */
const ARROW_RISE = 12;

// The game, in game numbers. The sums are real; the line and the breaking pull are set so the window sits mid-range.
/** The hand's yank pulls the ring out this far. */
export const STROKE = 10;
/** The weight has to rise this far. */
export const LINE = 15;
/** The cord holds up to this much, and snaps above it. */
export const BREAK = 40;

/** The peg's x: the rig's poses span about -22..76 around it, so this centres them on the plate. */
const PX = -27;
/** The post stands on the hand's side of the peg: its left face is this far in from the peg's middle. */
const POST_AT = 10;
const zc = (z: number) => z + ZS;
const pullOf = (v: Values) => clamp(Math.round(v.pull ?? 12), -20, 30);
const weightOf = (v: Values) => clamp(Math.round(v.tension ?? 25), 10, 40);
/** The weight's cube: 16 mm on a 10 N weight up to 30 mm on a 40 N one, so the number shows. */
const edgeOf = (weight: number) => 16 + (14 * (weight - 10)) / 30;

/** Everything a pose needs, from the two sliders and the run-only poses. `build`, `readouts` and the game all read this. */
export function settle(v: Values) {
  const weight = weightOf(v);
  const pull = pullOf(v);
  /** Run-only: the weight carried on above where the cord would hold it (or falling below, once snapped), the extra pull of a yank, and the break. */
  const flight = v.flight ?? 0;
  const extra = v.extra ?? 0;
  const snapped = (v.snapped ?? 0) > 0.5;
  const lift = Math.max(0, Math.max(pull, 0) + flight);
  /** Spare cord between the ring and the peg: it hangs as a sag. A cord can only pull, so it is never negative. */
  const slack = snapped ? 0 : Math.max(0, lift - pull);
  const held = !snapped && slack < 1e-9 && lift > 1e-9;
  return { weight, pull, flight, extra, snapped, lift, slack, held, tension: held ? weight + extra : 0, edge: edgeOf(weight), ringX: C0 + pull };
}

/** Points of the cord, weight to ring, in the figure's x-y plane (peg at x = 0, the hand to the right). */
export function cordPath(s: ReturnType<typeof settle>): Pt[] {
  const pts: Pt[] = [];
  const weightTop = PLATE_TOP + s.lift + s.edge;
  // Down to the weight (or a short frayed stub once it has snapped), up the peg's left side and over its top.
  pts.push(s.snapped ? [-RC, PEG_Y - 12] : [-RC, weightTop]);
  pts.push([-RC, PEG_Y]);
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([-RC * Math.cos(a), PEG_Y + RC * Math.sin(a)]);
  }
  const end: Pt = [s.ringX, CORD_Y];
  if (s.slack < 1e-9) {
    pts.push(end);
    return pts;
  }
  // Slack: the cord leaves the peg's top, clears the peg, and hangs in a sag down to the ring.
  const start: Pt = [RC + 2, CORD_Y];
  pts.push(start);
  const chord = end[0] - start[0];
  const sag = Math.sqrt((3 * chord * s.slack) / 8);
  for (let i = 1; i <= 8; i++) {
    const u = i / 8;
    pts.push([start[0] + (end[0] - start[0]) * u, CORD_Y - 4 * sag * u * (1 - u)]);
  }
  return pts;
}

function build(v: Values): Part[] {
  const s = settle(v);
  const at = (p: Pt): Vec => v3(p[0] + PX, p[1], zc(Z_CORD));
  const path = cordPath(s).map(at);
  const ringAt = v3(PX + s.ringX + RING_R, CORD_Y, zc(Z_CORD));
  const weightAt = v3(PX - RC, PLATE_TOP + s.lift + s.edge / 2, zc(Z_CORD));
  const parts: Part[] = [
    plate(100.6, 45),
    post("post", PX + POST_AT, zc(POST_Z), PEG_Y - 2, { name: "Post", role: "Holds the peg, on the hand's side so the cord and weight hang in the open." }),
    part("peg", "Post", "The corner the cord bends round.", cylinder(PEG_R, PEG_FRONT - PEG_BACK).shape, v3(PX, PEG_Y, zc((PEG_BACK + PEG_FRONT) / 2)), look.structure, on("post", "weld"), v3(90, 0, 0)),
    ...chain("cord", "Cord", "Carries the pull from the hand, round the peg, to the weight. It can only pull.", path, CORD, look.focus, "peg", "slide"),
    pullRing("ring", ringAt, { name: "Pull ring", role: "Where the hand pulls.", on: on("plate", "glue") }),
    part("weight", "Weight", "The load the cord lifts.", box(s.edge, s.edge, s.edge, 1.5), weightAt, look.stone, on("plate", "glue")),
    // The weight's own pull, over its top-left, clear of the cord that holds it.
    ...arrow("weight-arrow", v3(PX - RC - 9, PLATE_TOP + s.lift + s.edge, zc(Z_CORD)), -90, s.weight * MM_PER_N, "push", { name: "Arrow", role: "The weight, pulling down.", on: on("weight", "glue") }),
  ];
  // The cord's pull, drawn over the hand's end: the same size as the weight's while it holds it, nothing when it is slack.
  if (s.tension > 1e-9) {
    parts.push(...arrow("pull-arrow", pullArrowAt(s), 0, s.tension * MM_PER_N, "push", { name: "Arrow", role: "The cord's pull at the hand's end: the same all along it.", on: on("ring", "glue") }));
  }
  return parts;
}

/** Where the pull arrow's tip is aimed: over the ring, above the cord's run. */
const pullArrowAt = (s: { ringX: number }): Vec => v3(PX + s.ringX + RING_R + 2, CORD_Y + ARROW_RISE, zc(Z_CORD));

function readouts(v: Values) {
  const s = settle(v);
  const hand = s.pull > 0 ? `hand out ${fmt(s.pull)} mm` : s.pull < 0 ? `hand in ${fmt(-s.pull)} mm` : "hand at rest";
  const weight = s.lift > 0 ? `weight up ${fmt(s.lift, s.lift % 1 ? 1 : 0)} mm` : "weight on the floor";
  return [
    { label: "Tension", value: s.snapped ? "0 N: the cord has snapped" : s.held ? `T = W = ${fmt(s.tension)} N, the same at both ends` : `0 N: nothing in a slack cord (the weight is ${fmt(s.weight)} N)` },
    { label: "Travel", value: `${hand}, ${weight}` },
    { label: "State", value: s.snapped ? "broken: the weight dropped" : s.held ? "taut: it carries the pull round the peg" : s.slack > 1e-9 ? `${fmt(s.slack, s.slack % 1 ? 1 : 0)} mm of spare cord hangs; it can't push` : "just taut: the floor still takes the weight" },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "gentle" | "snap";

/** The outcome, decided once from the yank; meters, judge and play all read it. */
export function yank(v: Values) {
  const weight = weightOf(v);
  const f = v.yank ?? 0.2;
  /** The most the cord carries, at the yank. */
  const peak = weight * (1 + f);
  /** How high the weight gets: STROKE with the hand, then f x STROKE more on its own. */
  const reach = STROKE * (1 + f);
  const kind: Kind = peak > BREAK + 1e-9 ? "snap" : reach < LINE - 1e-9 ? "gentle" : "pass";
  return { kind, weight, f, peak, reach };
}

function judge(v: Values): Verdict {
  const r = yank(v);
  switch (r.kind) {
    case "snap":
      return { pass: false, outcome: "cord-snapped", headline: "The cord snapped", detail: "Too hard a yank: the cord cannot take the sudden pull, so it breaks." };
    case "gentle":
      return { pass: false, outcome: "too-gentle", headline: "Fell short", detail: "Too soft a yank: the weight lifts but never gets as high as the line." };
    case "pass":
      return { pass: true, outcome: "reached-the-line", headline: "Reached the line", detail: "The yank is hard enough to throw the weight past the line, and gentle enough to spare the cord." };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = yank(v);
  return [
    { label: "Cord strain", value: r.peak, target: BREAK, max: 90, unit: "N", need: "atMost", digits: 1 },
    { label: "Height", value: r.reach, target: LINE, max: 30, unit: "mm", need: "atLeast", digits: 1 },
  ];
}

// Choreography, ms.
const LEAD = 300;
const YANK_MS = 220;
const HOLD = 700;
const RESET = 600;
/** Free rise of a weight that goes 15 mm further than the hand: a quicker or slower flight scales with the square root. */
const FLIGHT_MS = 420;
const LAND_MS = 160;
const DROP_MS = 280;

function play(v: Values): Run {
  const verdict = judge(v);
  const r = yank(v);
  const w = r.weight;
  const free = STROKE * r.f;
  const up = FLIGHT_MS * Math.sqrt(Math.max(free, 1) / 15);
  const snaps = r.kind === "snap";
  /** How far through the yank the pull has built to the breaking load: the whole way, unless the cord gives. */
  const qb = snaps ? whenReaches((q) => w * (1 + r.f * smooth(q)), BREAK, 0, 1) : 1;
  const start = clamp(v.pull ?? 0, -20, 30);
  const pullAt = (q: number) => start + (STROKE - start) * easeOut(q);
  const pullB = pullAt(qb);
  const tl = phases({ lead: LEAD, yank: YANK_MS * qb, up: snaps ? 0 : up, down: snaps ? 0 : up, land: snaps ? 0 : LAND_MS, drop: snaps ? DROP_MS : 0, hold: HOLD, reset: RESET });
  /** The weight's height above the floor in the free rise: the hand's stroke, then `free` more, easing out as gravity takes over. */
  const height = (m: number) => STROKE + free * easeOut(clamp((m - tl.start("up")) / up, 0, 1));
  const cues: Cue[] = snaps ? [{ ms: tl.end("yank"), kind: "snap" }, { ms: tl.end("drop"), kind: "thud" }] : [{ ms: tl.end("down"), kind: "thud" }];
  if (!snaps && r.reach >= LINE - 1e-9) cues.push({ ms: whenReaches(height, LINE - 1e-9, tl.start("up"), tl.end("up")), kind: "ring" });

  const values = (pull: number, o: { flight?: number; extra?: number; snapped?: number } = {}): Values => ({ ...v, pull, flight: o.flight ?? 0, extra: o.extra ?? 0, snapped: o.snapped ?? 0 });
  return {
    verdict,
    durationMs: tl.total,
    cues: cues.sort((a, b) => a.ms - b.ms),
    at: (ms) => {
      const { phase } = tl.at(ms);
      if (phase === "lead") {
        const s = settle(values(start));
        const hand = handArrow(pullArrowAt(s), 0, "push", w * MM_PER_N, "hand-arrow");
        return frame(values(start), "Yank the ring", start === 0 ? hand : []);
      }
      if (phase === "yank") {
        const q = tl.t("yank", ms) * qb;
        const pull = pullAt(q);
        const extra = w * r.f * smooth(q);
        return frame(values(pull, { extra }), "Yanking");
      }
      if (phase === "up" || phase === "down") {
        // The yank's extra pull is spent in the first moments of the flight, and the cord goes slack under the weight.
        const q = tl.t("up", ms);
        const flight = phase === "up" ? free * easeOut(q) : free * (1 - fall(tl.t("down", ms)));
        const extra = phase === "up" ? w * r.f * (1 - smooth(clamp(q / 0.15, 0, 1))) : 0;
        return frame(values(STROKE, { flight, extra }), "Flying up");
      }
      if (phase === "land") return frame(values(STROKE), r.reach >= LINE - 1e-9 ? "Past the line" : "Too low");
      if (phase === "drop") return frame(values(pullB, { snapped: 1, flight: -Math.max(pullB, 0) * fall(tl.t("drop", ms)) }), "The weight drops");
      if (phase === "hold") return frame(snaps ? values(pullB, { snapped: 1, flight: -Math.max(pullB, 0) }) : values(STROKE), snaps ? "The cord is gone" : r.reach >= LINE - 1e-9 ? "It reached the line" : "It never got there");
      const from = snaps ? pullB : STROKE;
      const pull = from + (start - from) * smooth(tl.t("reset", ms));
      if (snaps) return frame(values(pull, { snapped: 1, flight: -Math.max(pull, 0) }), "Putting it back");
      return frame(values(pull), "Putting it back");
    },
  };
}

/**
 * The line the weight's top has to reach: a post just left of the weight and in front of it, and on the post one tick lying
 * across the weight's front face, a half millimetre clear of it, at the height its top must get to.
 */
const MARK_LEN = 10;
function scene(v: Values): Part[] {
  const e = edgeOf(weightOf(v));
  const left = PX - RC - e / 2;
  const front = zc(Z_CORD) + e / 2;
  const at = PLATE_TOP + LINE + e;
  return [
    post(`${SCENE}line-post`, left - 5, front + 4.5, at + 4, { name: "Mark post", role: "Carries the line the weight has to reach." }),
    tick(`${SCENE}line`, v3(left + MARK_LEN / 2, at, front + 2), MARK_LEN, "x", { name: "Mark", role: "How high the weight's top has to get.", on: on(`${SCENE}line-post`, "weld") }),
  ];
}

export const cord: Primitive = {
  id: "cord",
  name: "Cord",
  level: "Element",
  job: "Carry a pull around corners (it can't push)",
  howItWorks:
    "A cord can only pull along its length: push on it and it goes slack, the extra hanging in a sag. Because it bends, it can carry a pull round a corner, and with a smooth peg and no weight of its own the tension is the same everywhere along it. Here the tension equals the weight hanging from it while the hand holds the weight up. A sudden yank adds to that for a moment, and a cord that can only take so much snaps. Friction on the peg would add to the pull you need; it is left out.",
  madeOf: [],
  seenIn: ["Shoelace", "Brake cable", "Tape measure"],
  sliders: [
    { id: "tension", label: "Tension", min: 10, max: 40, step: 1, initial: 25, unit: " N" },
    { id: "pull", label: "Hand pulls out", min: -20, max: 30, step: 1, initial: 12, unit: " mm" },
  ],
  view: VIEW.bench,
  build,
  readouts,
  handle: {
    slider: "pull",
    label: "Pull",
    at: (v) => v3(PX + settle(v).ringX + RING_R, CORD_Y, zc(Z_CORD)),
    solve: (point) => point.x - PX - RING_R - C0,
    // Toward the peg the ring only makes slack, never a push on the weight, so the drag has the whole slider; the cord's tension is the weight's, and a hand can hold it.
    reach: () => [-20, 30],
  },
  game: {
    name: "Don't snap it",
    goal: "Yank the weight up to the line without snapping the cord.",
    rules: "A harder yank throws the weight higher, but strains the cord more. Too hard and it snaps; too soft and the weight falls short.",
    number: "yank",
    controls: [{ id: "yank", label: "Yank", min: 0, max: 2, step: 0.05, initial: 0.2, unit: "×" }],
    action: "Pull",
    meters,
    judge,
    play,
    start: { tension: 20, pull: 0, yank: 0.2 },
    poses: [
      { id: "flight", label: "Weight above the cord", min: -30, max: 26, step: 0.1, initial: 0, unit: " mm" },
      { id: "extra", label: "Yank's extra pull", min: 0, max: 80, step: 0.1, initial: 0, unit: " N" },
      { id: "snapped", label: "Cord snapped", min: 0, max: 1, step: 1, initial: 0 },
    ],
    scene,
  },
};

/** Exposed for tests: the layout. */
export const rig = { PX, PEG_Y, CORD_Y, RC, C0, RING_R, zc, Z_CORD, MARK, MARK_LEN, POST_AT, MM_PER_N, edgeOf };
