// Pulley: redirect a pull, or multiply it. A mechanism made of a cord and wheels (src/primitives/docs/design-language.md).
//
// The rig is the textbook picture: a beam on a post with the fixed wheels hung under it, a moving block with the other
// wheels carrying a load, and one pink cord zig-zagging between them to a ring you pull. The cord is the subject: the
// number is how many of its strands hold the load, and you can count them. Each strand takes an equal share of the weight,
// so the pull is the weight over the strands; the price is cord, because every strand has to shorten by the distance the
// load rises. The cord's lengths are drawn so they add up to the same at every pull, and the hauling end runs down the
// open side, clear of the blocks and the load.
//
// Two arrows say it: the load's weight, and the pull on the hauling end, drawn at one scale. The pull is the weight over
// the strands, so its arrow shrinks 60, 30, 20, 15, 12 as the strands go 1 to 5.
//
// The game, "Hoist": raise the crate 10 mm with a 25 N pull and 35 mm of cord to spend. Too few strands and the crate is
// too heavy to move; too many and the cord runs out before the crate has risen.
import type { Part } from "../../kit.ts";
import { clamp, easeOut, shudder, smooth } from "../motion/ease.ts";
import { frame, HOLD, LEAD, phases, REWIND, SCENE } from "../motion/run.ts";
import { ARROW_MIN, arrow, bar, box, fmt, lathe, loadEdge, look, on, part, plate, PLATE_TOP, pullRing, ring, shaped, tick, v3 } from "../parts.ts";
import { type Cue, type Meter, type Primitive, type Run, type Values, type Verdict, VIEW, type Slider, valueOf } from "../types.ts";

// Geometry, millimetres. A wheel is a plain disc with the cord resting on its rim, so every turn of cord round it shows.
const WHEEL_R = 9;
const WHEEL_T = 2.4;
const CORD = 4;
/** The cord's centre runs round a wheel on this radius: the rim plus the cord's own radius. */
const R_C = WHEEL_R + CORD / 2;
/** Gap between neighbouring strands, and between neighbouring wheels. */
const S = 2 * R_C;
const SHEAVE = lathe([[0, -WHEEL_T], [WHEEL_R, -WHEEL_T], [WHEEL_R, WHEEL_T], [0, WHEEL_T]]);
/** The block holds the cord's loops too, so the load can sit right under it. */
const BLOCK_H = 2 * (R_C + CORD / 2);
const BLOCK_Z = -(WHEEL_T + 2.5 + 0.2);
const POST_Z = -7;
const MAX_STRANDS = 5;
const PULL_MAX = 50;
/** Fixed wheels' centre, with the moving block at its highest (one strand, 50 mm of pull) still clear below them. */
const Y_FIXED = 120;
const Y_BEAM = Y_FIXED + R_C + CORD / 2 + 4;
/** The ring's height at no pull. */
const Y_HAND = 82;
const LOAD_N = 64;
const EDGE = loadEdge(LOAD_N);
/** The moving block's centre at no pull: on top of the load, which is on the plate. */
const Y_MOVING_0 = PLATE_TOP + EDGE + BLOCK_H / 2;
/** First wheel's x, and where the post stands, chosen so the union of every pose is centred on the plate. */
const X0 = -36.5;
const POST_X = X0 - 36;
const POST_W = 10;
const BEAM_T = 8;
/** The weight arrow and the pull arrow share this scale, mm of arrow per newton: the smallest pull (the load over 5 strands) is exactly the shortest arrow allowed. */
export const ARROW_PER_N = ARROW_MIN / (LOAD_N / MAX_STRANDS);
/** The weight arrow stands in front of the load, clear of the block and the cords; the pull arrow beside the ring. */
const ARROW_Z = 12;
const PULL_ARROW_DX = 10;
/** The plate's rig footprint, mm. */
const RIG_W = 155;
const RIG_D = 25;

// The game, in game numbers. Dividing the weight among the strands is real; the pull and the cord are set so the window sits mid-range.
export const LOAD = LOAD_N;
/** What your hand can pull with. */
export const HAND = 25;
/** The crate must rise this far. */
export const RISE = 10;
/** The cord you have to pull with, mm. */
export const ROPE = 35;
/** A hand that cannot move the load still gives this much, mm: the cord and the fingers take up some slack. */
const GIVE = 3;

/** Everything a pose needs, from the two sliders. `build`, `readouts`, the handle and the game all read this. */
export function settle(v: Values) {
  const n = valueOf(STRANDS, v);
  const pull = clamp(v.pull ?? 20, 0, PULL_MAX);
  const rise = pull / n;
  const yM = Y_MOVING_0 + rise;
  const xs = Array.from({ length: n }, (_, i) => X0 + i * S);
  /** The last wheel is always a fixed one, so the hauling end leaves it downward. */
  const fixed = (i: number) => (n - 1 - i) % 2 === 0;
  const odd = n % 2 === 1;
  const moving = xs.filter((_, i) => !fixed(i));
  const first = X0 - R_C;
  // The moving block: round its wheels, and for an odd count, under the cord tied to it.
  const lo = Math.min(...moving.map((x) => x - R_C - 2.5), odd ? first - 6 : Infinity);
  const hi = Math.max(...moving.map((x) => x + R_C + 2.5), odd ? first + 6 : -Infinity);
  const handX = xs[n - 1]! + R_C;
  return { n, pull, rise, yM, xs, fixed, odd, first, lo, hi, cx: (lo + hi) / 2, handX, handY: Y_HAND - pull, need: LOAD / n, cordUsed: pull };
}

/** The cord's straight runs, as [x, from y, to y]: n supporting strands, then the hauling end. */
function runs(s: ReturnType<typeof settle>): { x: number; a: number; b: number }[] {
  const yOf = (i: number) => (s.fixed(i) ? Y_FIXED : s.yM);
  const out = [{ x: s.first, a: s.odd ? s.yM + BLOCK_H / 2 : Y_BEAM - 4, b: yOf(0) }];
  for (let i = 0; i < s.n - 1; i++) out.push({ x: s.xs[i]! + R_C, a: yOf(i), b: yOf(i + 1) });
  out.push({ x: s.handX, a: Y_FIXED, b: s.handY + 8 });
  return out;
}

/** Total length of cord in the straight runs: it must be the same at every pull. */
export const cordLength = (v: Values) => runs(settle(v)).reduce((sum, r) => sum + Math.abs(r.a - r.b), 0);

/** One part, an L: the post on the plate and the beam the fixed wheels hang under, out as far as the last wheel. */
function stand(beamEnd: number): Part {
  const x0 = POST_X - POST_W / 2;
  const top = Y_BEAM + BEAM_T / 2;
  const cx = (x0 + beamEnd) / 2;
  const cy = (PLATE_TOP + top) / 2;
  const outline = [[x0, PLATE_TOP], [x0 + POST_W, PLATE_TOP], [x0 + POST_W, Y_BEAM - BEAM_T / 2], [beamEnd, Y_BEAM - BEAM_T / 2], [beamEnd, top], [x0, top]].map(([x, y]) => ({ x: x! - cx, y: y! - cy }));
  return part("stand", "Stand", "Holds the fixed wheels up: a post and a beam they hang under.", { kind: "extrusion", outline, depth: 8 }, v3(cx, cy, POST_Z), look.structure, on("plate", "weld"));
}

function build(v: Values): Part[] {
  const s = settle(v);
  const yOf = (i: number) => (s.fixed(i) ? Y_FIXED : s.yM);
  const lastX = s.xs[s.n - 1]!;
  const beamEnd = lastX + R_C + 2.5;
  const loadTop = PLATE_TOP + s.rise + EDGE;
  const parts: Part[] = [
    plate(RIG_W, RIG_D),
    stand(beamEnd),
    part("block", "Moving block", "Carries the moving wheels and the load.", box(s.hi - s.lo, BLOCK_H, 5, 1.5), v3(s.cx, s.yM, BLOCK_Z), look.steel, on("plate", "slide")),
    part("load", "Load", "The weight being lifted: it hangs from the moving block and rests on the plate at no pull.", box(EDGE, EDGE, EDGE, 1.5), v3(s.cx, PLATE_TOP + s.rise + EDGE / 2, 0), look.stone, on("block", "glue")),
    // The same scale for both: the pull is the weight over the strands, so its arrow is that fraction of the weight's.
    ...arrow("weight-arrow", v3(s.cx, loadTop, ARROW_Z), -90, LOAD * ARROW_PER_N, "push", { name: "Weight arrow", role: "The load's weight, pulling down.", on: on("load", "glue") }),
    ...arrow("pull-arrow", v3(s.handX + PULL_ARROW_DX, s.handY + 6, 0), -90, s.need * ARROW_PER_N, "push", { name: "Pull arrow", role: "The pull on the hauling end: the weight divided by the strands.", on: on("handle", "glue") }),
  ];
  s.xs.forEach((x, i) => {
    parts.push(part(`wheel-${i + 1}`, "Wheel", "A grooved wheel the cord runs round.", SHEAVE.shape, v3(x, yOf(i), 0), look.steel, on(s.fixed(i) ? "stand" : "block", "hinge"), v3(90, 0, 0)));
    parts.push(part(`wrap-${i + 1}`, "Cord", "The cord bending half a turn round a wheel.", ring(R_C, CORD / 2, 180), v3(x, yOf(i), 0), look.focus, on("plate", "glue"), v3(90, s.fixed(i) ? 90 : -90, 0)));
  });
  runs(s).forEach((r, k) => {
    const seg = bar([r.x, r.a], [r.x, r.b], CORD, CORD, 0);
    parts.push(shaped(`cord-${k}`, "Cord", k < s.n ? "One of the strands that hold the load up." : "The hauling end, running down the open side.", seg, look.focus, on("plate", "glue")));
  });
  parts.push(pullRing("handle", v3(s.handX, s.handY, 0), { name: "Pull ring", role: "Where you pull the cord down.", on: on("plate", "glue") }));
  return parts;
}

function readouts(v: Values) {
  const s = settle(v);
  return [
    { label: "Pull needed", value: `load ÷ strands = ${LOAD} ÷ ${s.n} = ${fmt(s.need, 1)} N` },
    { label: "Travel", value: `cord ${fmt(s.pull)} mm, load up ${fmt(s.rise, 1)} mm` },
    { label: "State", value: s.n === 1 ? "one strand: only the direction changes" : `each of ${s.n} strands carries ${fmt(s.need, 1)} N` },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "heavy" | "short";

/** The outcome, decided once from the strands; meters, judge and play all read it. */
export function hoist(v: Values) {
  const n = valueOf(STRANDS, v);
  const need = LOAD / n;
  const rope = n * RISE;
  const kind: Kind = need > HAND + 1e-9 ? "heavy" : rope > ROPE + 1e-9 ? "short" : "pass";
  /** The cord the hand pulls: what the crate needs, or all the hand has. */
  const pulled = kind === "heavy" ? 0 : Math.min(rope, ROPE);
  return { kind, n, need, rope, pulled, rise: pulled / n };
}

function judge(v: Values): Verdict {
  const r = hoist(v);
  switch (r.kind) {
    case "heavy":
      return { pass: false, outcome: "too-heavy", headline: "Too heavy to lift", detail: "Too few strands: each one still carries more than you can pull, so the crate stays put." };
    case "short":
      return { pass: false, outcome: "out-of-cord", headline: "Ran out of cord", detail: "Too many strands: they eat all your cord before the crate reaches the mark." };
    case "pass":
      return { pass: true, outcome: "crate-raised", headline: "Crate hoisted", detail: "Enough strands to lift it easily, and few enough that the cord lasts." };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = hoist(v);
  return [
    { label: "Pull needed", value: r.need, target: HAND, max: 70, unit: "N", need: "atMost", digits: 1 },
    { label: "Cord used", value: r.rope, target: ROPE, max: 60, unit: "mm", need: "atMost" },
  ];
}

// Choreography, ms.
const STRAIN = 800;

function play(v: Values): Run {
  const verdict = judge(v);
  const r = hoist(v);
  const p0 = clamp(v.pull ?? 0, 0, PULL_MAX);
  const heavy = r.kind === "heavy";
  const pullMs = clamp(500 + 28 * r.pulled, 700, 1700);
  const tl = phases({ rewind: p0 > 1e-9 ? REWIND : 0, lead: LEAD, pull: heavy ? STRAIN : pullMs, hold: HOLD });
  const values = (pull: number): Values => ({ ...v, strands: v.strands ?? 2, pull: clamp(pull, 0, PULL_MAX) });
  const cues: Cue[] = [];
  if (r.kind === "pass") cues.push({ ms: tl.end("pull"), kind: "click" });
  if (r.kind === "short") cues.push({ ms: tl.end("pull"), kind: "thud" });
  return {
    verdict,
    durationMs: tl.total,
    cues,
    at: (ms) => {
      const { phase } = tl.at(ms);
      switch (phase) {
        case "rewind":
          return frame(values(p0 * (1 - smooth(tl.t("rewind", ms)))), "Back to the start");
        case "lead":
          return frame(values(0), "Pull the ring");
        case "pull": {
          const t = tl.t("pull", ms);
          if (heavy) return frame(values(2 * Math.abs(shudder(t))), "Too heavy!");
          const pull = r.pulled * easeOut(t);
          return frame(values(pull), "Lifting");
        }
        case "hold":
          if (heavy) return frame(values(0), "It will not move");
          return frame(values(r.pulled), r.kind === "short" ? "Out of cord" : "At the mark");
      }
    },
  };
}

/** Length of the target's tick: it sticks out of the stand's post toward the load, level with where the load's top has to come to. */
const MARK_LEN = 10;

/** The game's standing prop: a tick on the stand's post, level with where the load's top will be once it has risen RISE mm. It is held by the post, so it floats in nothing. */
function scene(): Part[] {
  return [tick(`${SCENE}mark`, v3(POST_X + POST_W / 2 + MARK_LEN / 2, PLATE_TOP + EDGE + RISE - 1.5, POST_Z), MARK_LEN, "x", { name: "Mark", role: "The load's top has to come up to this level.", on: on("stand", "weld") })];
}

const STRANDS: Slider = { id: "strands", label: "Strands", min: 1, max: MAX_STRANDS, step: 1, initial: 2 };

export const pulley: Primitive = {
  id: "pulley",
  name: "Pulley",
  level: "Mechanism",
  job: "Redirect a pull, or multiply it",
  howItWorks:
    "A pulley is a cord running round a grooved wheel. One fixed wheel only turns your downward pull into an upward lift. Hang a second wheel from the load and the cord carries it in several strands at once: each strand holds an equal share, so you pull with that fraction of the weight. The price is cord: to raise the load by 1 cm, every supporting strand must shorten by 1 cm, so you pull as many centimetres as there are strands. Friction and the weight of the blocks and cord are ignored.",
  madeOf: ["cord", "wheel"],
  seenIn: ["Blinds", "Flagpole", "Crane"],
  sliders: [
    // The range stops at 5, up from 4, so the game has room to fail on both sides.
    STRANDS,
    { id: "pull", label: "Pull", min: 0, max: PULL_MAX, step: 1, initial: 20, unit: " mm" },
  ],
  view: VIEW.bench,
  build,
  readouts,
  handle: {
    slider: "pull",
    label: "Pull down",
    at: (v) => {
      const s = settle(v);
      return v3(s.handX, s.handY, 0);
    },
    solve: (point) => Y_HAND - point.y,
    // A cord cannot be pushed, and a load the hand cannot lift gives only a little.
    reach: (v) => [0, LOAD / valueOf(STRANDS, v) > HAND ? GIVE : Math.min(PULL_MAX, ROPE)],
  },
  game: {
    name: "Hoist",
    goal: "Raise the crate to the mark with the pull and the cord you have.",
    rules: "The crate is heavy and your cord is short. More strands make pulling easier but use up more cord. Without extra strands, you could not lift it.",
    number: "strands",
    action: "Hold to pull",
    meters,
    judge,
    play,
    start: { strands: 2, pull: 0 },
    scene,
  },
};

/** Exposed for tests: where the load, the blocks and the hauling end are. */
export const geometry = { EDGE, BLOCK_H, WHEEL_R, R_C, Y_FIXED, Y_HAND, Y_MOVING_0, runs, settle };
