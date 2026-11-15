// Spring: store work and give it back. The exemplar element (src/primitives/docs/design-language.md, motion-language.md).
//
// The rig, five kinds of part: the plate, a coil standing on it, a light push plate on top (the handle), the push
// arrow, and a slim post whose top arm is the tick where the plate sits at free length, so the squeeze reads and the tick
// is held by something. Stiffness is geometry: a stiffer
// spring has thicker wire and fewer turns, chosen so every spring here goes solid at the same length. Hooke's law is
// the only motion: the plate sits wherever F = k x puts it, and never past the point where the coils touch.
//
// The game, "Launch": pull the plate down with 50 N, let go, and the stored ½ k x² throws a puck up at a bell.
// Too stiff and 50 N barely squeezes it; too soft and the coils touch before the hand is done. The stiffest spring is
// not the strongest launch.
import type { Part } from "../../kit.ts";
import { clamp, fall, ring, rockBack, smooth } from "../motion/ease.ts";
import { frame, MARK, phases, SCENE, whenReaches } from "../motion/run.ts";
import { arrow, arrowLength, coil, cylinder, fmt, lathe, look, on, part, plate, PLATE_TOP, pushDisc, v3 } from "../parts.ts";
import { type Cue, type Meter, type Primitive, type Run, type Values, type Verdict, VIEW } from "../types.ts";

// Geometry, millimetres.
/** Coil length with no push. */
const FREE = 53;
/** Coil length with every turn touching the next. The same for every stiffness, so the game's 25 mm limit is fixed. */
const SOLID = 28;
/** The furthest the plate can go down: 25 mm. */
export const BIND = FREE - SOLID;
/** Coil radius to the middle of the wire. */
const COIL_R = 11;
/** Wire diameter of the softest (1 N/mm) spring. */
const WIRE_SOFT = 2.6;
const DISC_T = 4;
/** Coil axis, placed so the union of every pose (the mark's post on the left, the disc's rim on the right) is centred on the plate. */
const CX = 9;
/** The push arrow stands in front of the plate, over its near half, clear of the puck that sits in the middle during the game. */
const ARROW_Z = 12;
/** The free-length mark: a slim post, and the tick sticking out of its top toward the plate. The tick ends 2 mm short of the push plate's rim. */
const SLIM = 6;
export const TICK_LEN = 10;
const TICK_END = CX - 15 - 2;
const MARK_POST_X = TICK_END - TICK_LEN - SLIM / 2;
/** The bell's stand, right of the coil: game scene only. A slim post and an arm that reaches over to the bell. */
const BELL_POST_X = CX + 22;
/** The longest push arrow, at 50 N. */
const ARROW_LONG = 36;
const FORCE_MAX = 50;

// The game, in game numbers. Hooke's law and ½ k x² are real; the bell's 0.55 J is set so the window sits mid-range.
/** The hand pulls with this much. */
export const HAND = 50;
/** Energy that throws the puck up to the bell. */
export const NEED = 0.55;
/** Gap from the puck's top at launch to the bell's mouth. The flight is drawn to this scale: a puck with NEED joules just reaches it. */
const BELL_GAP = 20;
const PUCK_R = 8;
const PUCK_H = 8;

/**
 * Wire diameter for stiffness k. For a coil of fixed radius, k goes as d⁴ ÷ turns, and turns = SOLID ÷ d − 1 keeps the
 * solid length fixed; this solves d⁴ ÷ (SOLID ÷ d − 1) ∝ k from the 1 N/mm spring's 2.6 mm wire.
 */
const WIRE_C = WIRE_SOFT ** 4 / (SOLID / WIRE_SOFT - 1);
function wireFor(k: number): number {
  let lo = 1;
  let hi = 8;
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2;
    if (d ** 4 / (SOLID / d - 1) < WIRE_C * k) lo = d;
    else hi = d;
  }
  return (lo + hi) / 2;
}

const stiffnessOf = (v: Values) => Math.round((v.stiffness ?? 2) * 10) / 10;

/** Everything a pose needs, from the two sliders and the run-only bounce. `build`, `readouts` and the game all read this. */
export function settle(v: Values) {
  const k = stiffnessOf(v);
  const force = v.force ?? 30;
  const wire = wireFor(k);
  /** What Hooke's law asks for, before the coils stop it. */
  const wanted = force / k;
  const bound = wanted > BIND;
  const squeeze = Math.min(wanted, BIND);
  /** A run only: the plate ringing above (+) or below (-) where the force puts it, after the hand lets go. */
  const bounce = v.bounce ?? 0;
  const length = clamp(FREE - squeeze + bounce, SOLID, FREE + BIND);
  return { k, force, wire, turns: SOLID / wire - 1, wanted, bound, squeeze, length, energy: (0.5 * k * squeeze * squeeze) / 1000 };
}

const discCentreY = (length: number) => PLATE_TOP + length + DISC_T / 2;
const discTop = (length: number) => PLATE_TOP + length + DISC_T;
/** Where the plate's top sits with no push: the puck launches from here. */
const LAUNCH_Y = discTop(FREE);
const BELL_MOUTH = LAUNCH_Y + PUCK_H + BELL_GAP;


/** An L cut from one sheet: a slim post on the plate and, from its top, an arm of thickness `arm` reaching to `x1` (either side of the post), its middle at height `y`. */
function ell(id: string, name: string, role: string, postX: number, top: number, x1: number, y: number, arm: number, depth: number, joint: "weld"): Part {
  const x0 = postX - SLIM / 2;
  const left = x1 < x0;
  const cx = left ? (x1 + x0 + SLIM) / 2 : (x0 + x1) / 2;
  const cy = (PLATE_TOP + top) / 2;
  const pts: [number, number][] = left
    ? [[x0, PLATE_TOP], [x0 + SLIM, PLATE_TOP], [x0 + SLIM, top], [x1, top], [x1, y - arm / 2], [x0, y - arm / 2]]
    : [[x0, PLATE_TOP], [x0 + SLIM, PLATE_TOP], [x0 + SLIM, y - arm / 2], [x1, y - arm / 2], [x1, top], [x0, top]];
  const outline = pts.map(([x, py]) => ({ x: x - cx, y: py - cy }));
  return part(id, name, role, { kind: "extrusion", outline, depth }, v3(cx, cy, 0), look.structure, on("plate", joint));
}

/** The free-length mark: its arm's middle is level with the plate's underside at free length. */
function freeMark(): Part {
  const y = PLATE_TOP + FREE;
  return ell("tick-free", "Free-length mark", "Where the plate's underside sits with no push: the squeeze is measured from here.", MARK_POST_X, y + 1.5, TICK_END, y, 3, SLIM, "weld");
}

function build(v: Values): Part[] {
  const s = settle(v);
  const pushLen = arrowLength(s.force, FORCE_MAX, ARROW_LONG);
  return [
    plate(48, 30),
    part("coil", "Coil", "The spring's wire, wound into a helix. It pushes back in step with the squeeze.", coil(COIL_R, s.wire / 2, s.length, s.turns), v3(CX, PLATE_TOP + s.length / 2, 0), look.focusMetal, on("plate", "spring")),
    pushDisc("disc", v3(CX, discCentreY(s.length), 0), "y", { name: "Push plate", role: "Takes the push and squeezes the coil.", on: on("coil", "weld") }),
    freeMark(),
    ...arrow("push-arrow", v3(CX, discTop(s.length), ARROW_Z), -90, pushLen, "push", { name: "Push arrow", role: "The push on the plate, to scale.", on: on("disc", "glue") }),
  ];
}

function readouts(v: Values) {
  const s = settle(v);
  const law = s.bound
    ? `F ÷ k = ${fmt(s.force)} ÷ ${fmt(s.k, 1)} = ${fmt(s.wanted)} > ${BIND}, so x = ${BIND} mm`
    : `x = F ÷ k = ${fmt(s.force)} ÷ ${fmt(s.k, 1)} = ${fmt(s.squeeze, 1)} mm`;
  const state =
    s.force === 0 ? `free: ${FREE} mm long, storing nothing`
    : s.bound ? `coils touching: ½ × ${fmt(s.k, 1)} × ${BIND}² = ${fmt(s.energy, 2)} J`
    : `storing ½ × ${fmt(s.k, 1)} × ${fmt(s.squeeze, 1)}² = ${fmt(s.energy, 2)} J`;
  return [
    { label: "Squeeze", value: law },
    { label: "Travel", value: `plate down ${fmt(s.squeeze, 1)} of ${BIND} mm` },
    { label: "State", value: state },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "stiff" | "soft";

/** The outcome, decided once from the stiffness; meters, judge and play all read it. */
export function launch(v: Values) {
  const k = stiffnessOf(v);
  const s = settle({ stiffness: k, force: Math.min(HAND, k * BIND) });
  const kind: Kind = s.energy >= NEED - 1e-9 ? "pass" : HAND / k > BIND ? "soft" : "stiff";
  /** How high the puck's flight would take it, on the bell gap's scale. */
  const rise = (BELL_GAP * s.energy) / NEED;
  return { kind, k, squeeze: s.squeeze, wanted: HAND / k, energy: s.energy, rise, force: s.force };
}

function judge(v: Values): Verdict {
  const r = launch(v);
  switch (r.kind) {
    case "stiff":
      return { pass: false, outcome: "too-stiff", headline: "Too stiff", detail: "Too stiff: your pull barely squashes it, so it stores too little energy." };
    case "soft":
      return { pass: false, outcome: "too-soft", headline: "Coils bottomed out", detail: "Too soft: the coils touch and stop it squashing, so it can never store enough." };
    case "pass":
      return { pass: true, outcome: "rings-the-bell", headline: "Rang the bell", detail: "It squashed far enough to store the energy that rings the bell." };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = launch(v);
  return [
    { label: "Squash", value: r.wanted, target: BIND, max: 50, unit: "mm", need: "atMost" },
    { label: "Energy", value: r.energy, target: NEED, max: 0.7, unit: "J", need: "atLeast", digits: 2 },
  ];
}

// Choreography, ms.
const LEAD = 300;
const PULL = 800;
const HOLD_DOWN = 300;
/** The plate rings for this long after the hand lets go. */
const RING_MS = 1000;
const HOLD = 700;
const RESET = 600;
/** Rise time to the bell's height. A lower flight is quicker, as a thrown thing is: time goes with the square root of height. */
const RISE_MS = 460;
/** The plate's lift off solid coils when it hits them, mm. */
const REBOUND = 1.2;
const REBOUND_MS = 260;

/** The flight's shape from the launch, ms after the hand lets go: rise above the launch height, and the moments that matter. */
function flight(r: ReturnType<typeof launch>) {
  /** The plate takes a quarter of a swing to get back to free length; a stiffer spring is quicker. */
  const quarter = 170 / Math.sqrt(r.k);
  const up = RISE_MS * Math.sqrt(r.rise / BELL_GAP);
  const hits = r.rise >= BELL_GAP - 1e-9;
  // Rising as h (1 - (1 - s)²); it reaches the bell where that equals the gap.
  const contact = hits ? quarter + up * (1 - Math.sqrt(Math.max(0, 1 - BELL_GAP / r.rise))) : Infinity;
  const top = hits ? contact : quarter + up;
  const peak = hits ? BELL_GAP : r.rise;
  const down = RISE_MS * Math.sqrt(peak / BELL_GAP);
  const land = top + down;
  const height = (ms: number) => {
    if (ms <= quarter) return 0;
    if (ms < top) return r.rise * (1 - (1 - (ms - quarter) / up) ** 2);
    if (ms < land) return peak * (1 - fall((ms - top) / down));
    return 0;
  };
  return { quarter, contact, top, land, height, hits, cycles: RING_MS / (4 * quarter) };
}

function play(v: Values): Run {
  const verdict = judge(v);
  const r = launch(v);
  const f = flight(r);
  const k = r.k;
  const f0 = v.force ?? 30;
  /** Past k × BIND the coils are solid, so that is all the push the spring can take in. */
  const cap = k * BIND;
  const pullFrom = Math.min(f0, cap);
  const pullTo = (t: number) => Math.min(pullFrom + (HAND - pullFrom) * smooth(t), cap);
  /** When the coils touch during the pull, if they do: where the force reaches k × BIND. */
  const bindT = r.kind === "soft" ? whenReaches(pullTo, cap - 1e-9, 0, 1) : Infinity;
  const fly = Math.max(RING_MS, f.land) + 120;
  const tl = phases({ lead: LEAD, pull: PULL, holdDown: HOLD_DOWN, fly, hold: HOLD, reset: RESET });
  const bindMs = tl.start("pull") + bindT * PULL;
  const release = tl.start("fly");
  // The hand lets go at once: the push arrow goes and the plate takes over from the hand (a pop you can feel).
  const cues: Cue[] = [{ ms: release, kind: "pop" }];
  if (r.kind === "soft") cues.push({ ms: bindMs, kind: "thud" });
  if (f.hits) cues.push({ ms: release + f.contact, kind: "ring" });
  cues.push({ ms: release + f.land, kind: "thud" });

  const values = (force: number, bounce: number): Values => ({ ...v, stiffness: v.stiffness ?? 2, force, bounce });
  /** The puck rides the plate until the flight takes it higher: it is never below the plate's top. */
  const withPuck = (vals: Values, live: string, flightBottom = -Infinity) => frame(vals, live, [puck(Math.max(flightBottom, discTop(settle(vals).length)))]);

  return {
    verdict,
    durationMs: tl.total,
    cues,
    at: (ms) => {
      const { phase } = tl.at(ms);
      if (phase === "lead") {
        const force = f0 + (pullFrom - f0) * smooth(tl.t("lead", ms));
        return withPuck(values(force, 0), "Puck waiting");
      }
      if (phase === "pull" || phase === "holdDown") {
        const force = pullTo(tl.t("pull", ms));
        const sinceBind = ms - bindMs;
        const bounce = sinceBind > 0 && sinceBind < REBOUND_MS ? REBOUND * rockBack(sinceBind / REBOUND_MS, 1) : 0;
        const live =
          r.kind === "soft" && sinceBind >= 0 ? "Coils touching"
          : phase === "pull" ? "Pulling down"
          : "Holding down";
        return withPuck(values(force, bounce), live);
      }
      if (phase === "fly") {
        const t = ms - release;
        const bounce = t < RING_MS ? -r.squeeze * ring(t / RING_MS, f.cycles) : 0;
        const h = f.height(t);
        const live =
          t < f.quarter ? "Let go"
          : f.hits && t >= f.contact ? "Rang the bell"
          : !f.hits && t >= f.top ? "Fell short"
          : "Puck rising";
        return withPuck(values(0, bounce), live, LAUNCH_Y + h);
      }
      if (phase === "hold") return withPuck(values(0, 0), f.hits ? "Rang the bell" : "Fell short");
      // The puck is lifted off and the plate goes back to where the player left it.
      const p = smooth(tl.t("reset", ms));
      return frame(values(f0 * p, 0), "Putting it back");
    },
  };
}

/** Height of the bell: it hangs from the arm's underside. */
const BELL_H = 13;

/** The game's target, on screen whenever the game is: the bell, hung from one slim stand (a post and its arm) on the right. */
function scene(): Part[] {
  const bellTop = BELL_MOUTH + BELL_H;
  const arm = SLIM;
  const b = lathe([[0, 0], [9, 0], [8.6, 1.5], [7.2, 5], [6.2, 9], [4.6, 11.8], [2, BELL_H], [0, BELL_H]]);
  return [
    ell(`${SCENE}bell-stand`, "Bell stand", "Holds the bell over the spring: a slim post and an arm.", BELL_POST_X, bellTop + arm, CX - 4, bellTop + arm / 2, arm, SLIM, "weld"),
    part(`${SCENE}bell`, "Bell", "Rings when the puck reaches it.", b.shape, v3(CX, BELL_MOUTH + b.midY, 0), look.structure, on(`${SCENE}bell-stand`, "screw")),
  ];
}

/** The puck, a prop of the run: it sits on the plate, flies, lands. */
function puck(bottom: number): Part {
  return part(`${MARK}puck`, "Puck", "The load the spring throws.", cylinder(PUCK_R, PUCK_H).shape, v3(CX, bottom + PUCK_H / 2, 0), look.stone, on("disc", "glue"));
}

export const spring: Primitive = {
  id: "spring",
  name: "Spring",
  level: "Element",
  job: "Store work and give it back",
  howItWorks:
    "Squeezing a coil spring twists its wire, and the wire pushes back. Within its working range the push grows in step with the squeeze: F = k·x (Hooke's law). The work you put in is stored as ½·k·x², and it all comes back when you let go. A stiffer spring has thicker wire or fewer turns. Squeeze far enough and the coils touch: from then on it is solid, and pushing harder stores nothing more. The spring's own mass and the energy lost as it rings are left out.",
  madeOf: [],
  seenIn: ["Pen", "Stapler", "Clothes peg"],
  sliders: [
    { id: "stiffness", label: "Stiffness", min: 1, max: 4, step: 0.1, initial: 2, unit: " N/mm" },
    { id: "force", label: "Push", min: 0, max: 50, step: 1, initial: 30, unit: " N" },
  ],
  view: VIEW.coaxial,
  build,
  readouts,
  handle: {
    slider: "force",
    label: "Pull down",
    at: (v) => v3(CX, discCentreY(settle(v).length), 0),
    // The plate goes down F ÷ k for a push F, so a plate dragged to height y asks for k times the squeeze that puts it there.
    solve: (point, v) => stiffnessOf(v) * (discCentreY(FREE) - point.y),
    // Past the coils touching, more push moves nothing.
    reach: (v) => [0, Math.min(FORCE_MAX, stiffnessOf(v) * BIND)],
  },
  game: {
    name: "Launch",
    goal: "Launch the puck high enough to ring the bell.",
    rules: "A softer spring squashes further and stores more energy, but once its coils touch it can squash no more. The bell needs plenty of energy.",
    number: "stiffness",
    action: "Let go",
    meters,
    judge,
    play,
    start: { stiffness: 3.5, force: 0 },
    poses: [
      { id: "bounce", label: "Bounce", min: -BIND, max: BIND, step: 0.1, initial: 0, unit: " mm" },
    ],
    scene,
  },
};

/** Exposed for tests: where the plate, puck and bell are, so contact can be checked against the geometry. */
export const geometry = { CX, FREE, SOLID, LAUNCH_Y, BELL_MOUTH, BELL_H, PUCK_H, SLIM, ARROW_Z, MARK_POST_X, TICK_END, BELL_POST_X, discTop };
