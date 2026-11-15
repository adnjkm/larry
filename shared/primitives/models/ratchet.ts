// Ratchet: allow motion one way only. The exemplar mechanism (src/primitives/docs/design-language.md, motion-language.md).
//
// A ratchet wheel on a stand, wound by a knob on its face; a cord on its hub lifts an 80 N bucket, and a pawl, pressed on
// by one coil spring wound round its own hinge, stops the bucket running back down. There is no housing and no block for
// the spring: it is the coil on the pawl's pivot, between the pawl and the stand. The pawl's angle is never typed in: it is solved from the
// wheel's and the pawl's outlines at every pose (ratchetGeometry.ts), so the nose rides up each ramp, drops behind each
// cliff with a click, and never cuts into a tooth. The number is the tooth count: it sets each tooth's size, the step
// between landings, and how much the wheel can roll back before the pawl catches it.
//
// The game, "Stop at the mark": wind the bucket to the mark and let go. It drops back to the last tooth the pawl
// passed, so the landings must be fine enough to stop within 1.5 mm of the mark; but many teeth are small teeth, and past
// 13 each one is, on this wheel, too weak for the bucket and they shear one after another. The strength rule (1100 divided
// by the teeth, in newtons) is the game's own simplification: it says finer teeth are weaker, not what steel does.
import type { Part } from "../../kit.ts";
import { clamp, clamp01, fall, shudder, smooth } from "../motion/ease.ts";
import { frame, HOLD, LEAD, MARK as MARK_ID, phases, SCENE, whenReaches } from "../motion/run.ts";
import {
  arrow,
  coil,
  cylinder,
  fmt,
  knob,
  loadBlock,
  loadEdge,
  look,
  on,
  part,
  pin,
  pivoted,
  plate,
  PLATE_TOP,
  post,
  shaped,
  strand,
  tick,
  v3,
  type Pt,
} from "../parts.ts";
import { type Cue, type Meter, type Primitive, type Run, type Values, type Verdict, VIEW, type Slider, valueOf } from "../types.ts";
import { REST_LIFT } from "./ratchetTable.ts";
import { LIFT_CLEAR, PAWL, PIVOT, ROOT, STUMP, type Stripped, toothHeight, turnAbout, Wheel, restingLift, wheelDeg } from "./ratchetGeometry.ts";

// Layout, mm. W is the wheel's centre; the geometry module works relative to it.
const W = v3(-6.4, 97, 0);
/**
 * Front to back: the knob on the wheel's face (z 5..25), the wheel (±5) with the pawl in its plane (±4), the pawl's
 * spring on its pivot stub (-15..-4), the wheel's hub (-15..-5) that the cord winds on, and the stand (-25..-15) that
 * carries both.
 */
const Z_KNOB = 15;
const Z_HUB = -10;
const Z_STAND = -20;
/** The stand's front face, and the pawl's back face: the spring fills the gap between them. */
const Z_STAND_FACE = Z_STAND + 5;
const Z_PAWL_BACK = -4;
const HUB_R = 6;
const CORD = 3.2;
/** A turn of the hub lifts the bucket this far: 37.7 mm. */
export const LIFT_PER_TURN = 2 * Math.PI * HUB_R;
/** Where the cord leaves the hub, on its left. */
const CORD_X = -(HUB_R + CORD / 2);
/** The knob sits on the wheel's face this far from the axle, inside the teeth. */
const KNOB_R = 14;
/** The knob's angle at turn 0, degrees anticlockwise from +x. */
const KNOB_AT_0 = 150;
/**
 * The stand, one black piece behind the wheel: a column from the plate with an arm out to the axle, and the pawl's pivot
 * near its top. Nothing else is black but the plate.
 */
const STAND: Pt[] = (() => {
  const yb = PLATE_TOP - W.y;
  return [
    [28, yb],
    [38, yb],
    [38, 34],
    [28, 34],
    [28, 4],
    [-4, 4],
    [-4, -4],
    [28, -4],
  ];
})();
/** The pawl's spring is a coil on its pivot stub, between the pawl's back face and the stand's face: this wide to the wire's centre. */
const SPRING_R = 5.5;
const SPRING_WIRE = 1.4;

// The game, in game numbers. The torque balance and the landing spacing are real; the tooth strength is set so the
// window sits mid-range.
export const LOAD = 80;
/**
 * On this game's wheel a tooth holds about TOOTH ÷ n newtons: finer teeth are thinner at the root, so weaker. The
 * constant is chosen so the game's window sits mid-range; it is a simplification, not a property of any real steel.
 */
const TOOTH = 1100;
/** The mark is this far above the bucket's start. */
export const MARK = 32;
/** The bucket must come to rest no further than this under the mark. */
export const TOLERANCE = 1.5;

/** The last landing the pawl has dropped into at this turn: landings are at whole multiples of 1 / n. */
const landingBelow = (turn: number, n: number) => Math.floor(turn * n + 1e-9) / n;

/** Cliffs stripped by a run that began shearing at landing `from` and has been dragged back to `turn`. */
function strippedBetween(n: number, turn: number, from: number): Stripped {
  if (from <= 0) return () => false;
  return (c) => [c / n, c / n + 1].some((landing) => landing >= turn - 1e-9 && landing <= from + 1e-9);
}

// An unstripped wheel's resting lift repeats every tooth, so it is read from a baked table (scripts/ratchet-table.ts).
// Only a run that shears teeth has a wheel of its own, and solves it by hand (a millisecond or two, remembered). Wheels are remembered per tooth count and stripped set.
export function tabulatedLift(n: number, turn: number): number {
  const { drop, lift } = REST_LIFT[n]!;
  const pitches = turn * n + 1e-9;
  const u = pitches - Math.floor(pitches);
  if (u >= drop) return 0;
  const x = (u / drop) * (lift.length - 1);
  const i = Math.min(lift.length - 2, Math.floor(x));
  return lift[i]! + (lift[i + 1]! - lift[i]!) * (x - i);
}

const wheels = new Map<string, Wheel>();
function wheelFor(n: number, turn: number, from: number): Wheel {
  const strip = strippedBetween(n, turn, from);
  const key = `${n}:${Array.from({ length: n }, (_, c) => (strip(c) ? 1 : 0)).join("")}`;
  let w = wheels.get(key);
  if (!w) {
    if (wheels.size > 400) wheels.clear();
    w = new Wheel(n, strip);
    wheels.set(key, w);
  }
  return w;
}

const solved = new Map<string, number>();
function strippedLift(n: number, turn: number, from: number): number {
  const key = `${n}:${turn.toFixed(10)}:${from.toFixed(10)}`;
  let rest = solved.get(key);
  if (rest === undefined) {
    if (solved.size > 2000) solved.clear();
    rest = restingLift(wheelFor(n, turn, from), turn);
    solved.set(key, rest);
  }
  return rest;
}

function pawlLift(n: number, turn: number, from: number, lift: number): number {
  const rest = from > 0 ? strippedLift(n, turn, from) : tabulatedLift(n, turn);
  // A hand lifting the pawl swings it out toward LIFT_CLEAR, where it clears every tooth.
  return rest + clamp01(lift) * Math.max(0, LIFT_CLEAR - rest);
}

/** Everything a pose needs. `build`, `readouts`, the handle and the game all read this. */
export function settle(v: Values) {
  const n = valueOf(TEETH, v);
  const turn = v.turn ?? 0.06;
  /** Run-only: the turn at which teeth began to shear (0: none), and the pawl lifted by hand (0..1). */
  const strip = v.strip ?? 0;
  const lift = v.lift ?? 0;
  const landing = landingBelow(turn, n);
  /** How far it would roll back if let go now, as a turn. */
  const slack = strip > 0 || lift > 0.5 ? 0 : turn - landing;
  return {
    n,
    turn,
    strip,
    lift,
    landing,
    slack,
    /** Seated in a notch: the pawl holds the bucket and the hand on the knob need not. */
    seated: slack < 1e-9 && lift === 0,
    clicks: Math.round(landing * n),
    rise: LIFT_PER_TURN * turn,
    psi: pawlLift(n, turn, strip, lift),
  };
}

const at = (p: Pt, z = 0) => v3(W.x + p[0], W.y + p[1], W.z + z);
const knobAngle = (turn: number) => KNOB_AT_0 + wheelDeg(turn);
const knobPoint = (turn: number): Pt => {
  const a = (knobAngle(turn) * Math.PI) / 180;
  return [KNOB_R * Math.cos(a), KNOB_R * Math.sin(a)];
};

function build(v: Values): Part[] {
  const s = settle(v);
  const wheel = wheelFor(s.n, s.turn, s.strip);
  const w = pivoted(wheel.outline, 10, [0, 0], W, wheelDeg(s.turn));
  const pawl = pivoted(PAWL, 8, PIVOT, at(PIVOT), s.psi);
  const stand = pivoted(STAND, 10, [0, 0], at([0, 0], Z_STAND), 0);
  // The load is a stone cube on the cord: its weight is obvious, so it has no arrow (the figure stays small).
  const bucket = loadBlock("bucket", at([CORD_X, PLATE_TOP + s.rise - W.y], Z_HUB), LOAD, 0, {
    name: "Bucket",
    role: "The load: its weight tries to turn the wheel back.",
    on: on("cord", "glue"),
  });
  const springLength = Z_PAWL_BACK - Z_STAND_FACE;
  return [
    plate(70, 50),
    shaped("stand", "Stand", "Carries the wheel's axle and the pawl's pivot.", stand, look.structure, on("plate", "weld")),
    // The pivot stub comes forward from the stand to the pawl's plane.
    pin("pivot", at(PIVOT, Z_STAND_FACE + springLength / 2 - 1), springLength + 2, {
      name: "Stand",
      role: "The stub the pawl swings on.",
      on: on("stand", "weld"),
    }),
    part("wheel", "Ratchet wheel", "Sawtooth wedges: ramps one way, cliffs the other.", w.shape, w.position, look.focus, on("stand", "hinge"), w.rotation),
    // The hub is cast with the wheel, behind it: the cord winds onto it.
    part(
      "hub",
      "Ratchet wheel",
      "The wheel's hub: the cord winds onto it as the wheel turns.",
      cylinder(HUB_R, 10).shape,
      at([0, 0], Z_HUB),
      look.focus,
      on("wheel", "weld"),
      v3(90, 0, 0),
    ),
    knob("knob", at(knobPoint(s.turn), Z_KNOB), "z", { name: "Knob", role: "Where your hand winds the wheel.", on: on("wheel", "hinge") }),
    shaped(
      "cord",
      "Cord",
      "Hangs the bucket from the hub.",
      strand(at([CORD_X, 0], Z_HUB), at([CORD_X, bucket.top - W.y], Z_HUB), CORD),
      look.slate,
      on("hub", "glue"),
    ),
    ...bucket.parts.filter((q) => !/arrow/.test(q.id)),
    part(
      "pawl",
      "Pawl",
      "Rides up each ramp and drops behind each cliff; a backward push jams it into the tooth.",
      pawl.shape,
      pawl.position,
      look.focus,
      on("pivot", "hinge"),
      pawl.rotation,
    ),
    // One coil round the pawl's pivot presses it onto the wheel. Its ends are on the stand and the pawl, so it needs no housing.
    part(
      "spring",
      "Spring",
      "Presses the pawl onto the wheel.",
      coil(SPRING_R, SPRING_WIRE, springLength, 4),
      at(PIVOT, Z_STAND_FACE + springLength / 2),
      look.slate,
      on("stand", "spring"),
      v3(90, 0, 0),
    ),
  ];
}

function readouts(v: Values) {
  const s = settle(v);
  const step = LIFT_PER_TURN / s.n;
  return [
    { label: "Step", value: `360° ÷ ${s.n} = ${fmt(360 / s.n, 1)}° = ${fmt(step, 1)} mm of lift` },
    { label: "Travel", value: `knob ${fmt(s.turn * 360)}° round, bucket up ${fmt(s.rise, 1)} mm` },
    {
      label: "State",
      value: s.seated ? `pawl holds it on landing ${s.clicks}` : `${s.clicks} clicks; let go and it drops ${fmt(s.slack * LIFT_PER_TURN, 1)} mm`,
    },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "slips" | "strips";

/** The outcome, decided once from the tooth count; meters, judge and play all read it. */
export function stopAt(v: Values) {
  const n = valueOf(TEETH, v);
  const markTurn = MARK / LIFT_PER_TURN;
  const landTurn = landingBelow(markTurn, n);
  const drop = (markTurn - landTurn) * LIFT_PER_TURN;
  const holds = TOOTH / n;
  const kind: Kind = holds < LOAD ? "strips" : drop > TOLERANCE + 1e-9 ? "slips" : "pass";
  return { kind, n, markTurn, landTurn, drop, holds, spacing: LIFT_PER_TURN / n };
}

function judge(v: Values): Verdict {
  const r = stopAt(v);
  switch (r.kind) {
    case "strips":
      return { pass: false, outcome: "teeth-stripped", headline: "Teeth sheared off", detail: "Too many fine teeth: each one is too weak to hold the bucket." };
    case "slips":
      return {
        pass: false,
        outcome: "slipped-past",
        headline: "Slipped past the mark",
        detail: "Too few teeth: the pawl only catches far below the mark, so the bucket sinks.",
      };
    case "pass":
      return {
        pass: true,
        outcome: "held-at-mark",
        headline: "Held at the mark",
        detail: "The pawl catches right under the mark, and the teeth are strong enough to hold.",
      };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = stopAt(v);
  return [
    { label: "Tooth grip", value: r.holds, target: LOAD, max: 140, unit: "N", need: "atLeast" },
    { label: "Sinks", value: r.drop, target: TOLERANCE, max: 7, unit: "mm", need: "atMost", digits: 1 },
  ];
}

// Choreography, ms.
const PREP = { unload: 200, lift: 200, lower: 450, setDown: 200 };
const AT_MARK = 300;
/** How long the bucket takes to drop `mm` back onto the pawl: a short fall, with the root of the distance. */
const dropMs = (mm: number) => clamp(110 * Math.sqrt(mm), 80, 320);
const STRAIN = 380;
/** A chip of tooth falls to the plate in this long. */
const CHIP_FALL = 380;

/** The tooth tip a shear breaks off: what is above the stump. */
function chip(n: number): Pt[] {
  const h = Math.max(3, toothHeight(n) - STUMP);
  return [
    [0, 0],
    [3.5, 0],
    [0, h],
  ];
}

function play(v: Values): Run {
  const verdict = judge(v);
  const r = stopAt(v);
  const n = r.n;
  const t0 = v.turn ?? 0.06;
  // Past the mark already: lift the pawl and let the bucket down first, to the middle of the first ramp.
  const prepped = t0 > r.markTurn + 1e-9;
  const mid = (Math.floor(t0 * n + 1e-9) + 0.5) / n;
  const from = prepped ? 0.5 / n : t0;
  const windMs = clamp(400 + 1100 * (r.markTurn - from), 400, prepped ? 1000 : 1400);
  const dropFor = dropMs(r.drop);
  const strips = r.kind === "strips";
  const downMs = clamp(260 * Math.sqrt((r.landTurn * LIFT_PER_TURN) / 10), 450, 800);
  const tl = phases({
    unload: prepped ? PREP.unload : 0,
    lift: prepped ? PREP.lift : 0,
    lower: prepped ? PREP.lower : 0,
    setDown: prepped ? PREP.setDown : 0,
    lead: prepped ? 0 : LEAD,
    wind: windMs,
    atMark: AT_MARK,
    drop: dropFor,
    strain: strips ? STRAIN : 0,
    rundown: strips ? downMs : 0,
    hold: HOLD,
  });

  const windTurn = (ms: number) => from + (r.markTurn - from) * smooth(tl.t("wind", ms));
  const downTurn = (ms: number) => r.landTurn * (1 - fall(tl.t("rundown", ms)));
  const cues: Cue[] = [];
  for (let k = Math.floor(from * n + 1e-9) + 1; k / n <= r.markTurn + 1e-9; k++)
    cues.push({ ms: whenReaches(windTurn, k / n, tl.start("wind"), tl.end("wind")), kind: "click" });
  cues.push({ ms: tl.end("drop"), kind: "click" });
  /** When the rundown (turn = landTurn × (1 - u²)) passes landing j, the tooth there shears. */
  const shearAt = (j: number) => tl.start("rundown") + Math.sqrt(1 - j / (n * r.landTurn)) * downMs;
  const sheared: { j: number; ms: number }[] = [];
  if (strips) {
    const first = Math.round(r.landTurn * n);
    cues.push({ ms: tl.start("rundown"), kind: "snap" });
    sheared.push({ j: first, ms: tl.start("rundown") });
    for (let j = first - 1; j >= 0; j--) {
      const ms = shearAt(j);
      sheared.push({ j, ms });
      cues.push({ ms, kind: "slip" });
    }
    cues.push({ ms: tl.end("rundown"), kind: "thud" });
  }

  const values = (turn: number, extra: { lift?: number; strip?: number } = {}): Values => ({
    ...v,
    teeth: v.teeth ?? 12,
    turn,
    lift: extra.lift ?? 0,
    strip: extra.strip ?? 0,
  });
  const chips = (ms: number): Part[] =>
    sheared
      .filter((c) => ms >= c.ms)
      .map((c, i) => {
        const q = clamp01((ms - c.ms) / CHIP_FALL);
        const startY = W.y + 1;
        const y = startY + (PLATE_TOP - startY) * fall(q);
        const x = W.x + ROOT + STUMP + 2 + q * (i % 4) * 3;
        const z = W.z + q * ((i % 3) - 1) * 5;
        const p = pivoted(chip(n), 10, [0, 0], v3(x, y, z), 0);
        return part(
          `${MARK_ID}chip-${c.j}`,
          "Tooth chip",
          "A tooth tip sheared off by the bucket's weight.",
          p.shape,
          p.position,
          look.focus,
          on("plate", "glue"),
          p.rotation,
        );
      });
  const liftArrow = (turn: number, lift: number): Part[] => {
    const psi = pawlLift(n, turn, 0, lift);
    const face = turnAbout([32, 26], psi, PIVOT);
    return arrow(`${MARK_ID}lift-arrow`, at(face), 0, 14, "pull", { name: "Hand", role: "Your hand lifting the pawl off the teeth.", on: on("plate", "glue") });
  };

  return {
    verdict,
    durationMs: tl.total,
    cues,
    at: (ms) => {
      const { phase } = tl.at(ms);
      switch (phase) {
        case "unload": {
          const turn = t0 + (mid - t0) * smooth(tl.t("unload", ms));
          return frame(values(turn), "Taking the weight");
        }
        case "lift": {
          const lift = smooth(tl.t("lift", ms));
          return frame(values(mid, { lift }), "Lifting the pawl", liftArrow(mid, lift));
        }
        case "lower": {
          const turn = mid + (from - mid) * smooth(tl.t("lower", ms));
          return frame(values(turn, { lift: 1 }), "Letting it down", liftArrow(turn, 1));
        }
        case "setDown":
          return frame(values(from, { lift: 1 - smooth(tl.t("setDown", ms)) }), "Pawl back on");
        case "lead":
          return frame(values(t0), "Wind to the mark");
        case "wind": {
          const turn = windTurn(ms);
          return frame(values(turn), "Clicking up");
        }
        case "atMark":
          return frame(values(r.markTurn), "At the mark");
        case "drop": {
          const q = tl.t("drop", ms);
          const turn = r.markTurn - (r.markTurn - r.landTurn) * fall(q);
          return frame(values(turn), "Let go");
        }
        case "strain": {
          // The tooth takes the bucket's weight and the wheel shivers on the pawl: forward only, never through it.
          const turn = r.landTurn + (0.4 / 360) * Math.abs(shudder(tl.t("strain", ms)));
          return frame(values(turn), "Tooth takes weight");
        }
        case "rundown": {
          const turn = downTurn(ms);
          return frame(values(turn, { strip: r.landTurn }), "Teeth shearing", chips(ms));
        }
        case "hold": {
          if (strips) return frame(values(0, { strip: r.landTurn }), "Teeth gone", chips(ms));
          return frame(values(r.landTurn), r.kind === "pass" ? "Held" : "Slipped");
        }
      }
    },
  };
}

/** The game's one target: a tick at the height the bucket's top has to reach, held out over the bucket's path by a slim post beside it. */
const MARK_LENGTH = 12;
/** The tick stops this far short of the bucket's side, so the bucket can come up to it and never into it. */
const MARK_CLEAR = 0.65;
function scene(): Part[] {
  const right = W.x + CORD_X + loadEdge(LOAD) / 2;
  const markY = PLATE_TOP + MARK + loadEdge(LOAD);
  const z = W.z + Z_HUB;
  const tickAt = right + MARK_CLEAR;
  return [
    post(`${SCENE}post`, tickAt + MARK_LENGTH + 5, z, markY + 1.5, { name: "Post", role: "Holds the mark beside the bucket's path." }),
    tick(`${SCENE}mark`, v3(tickAt + MARK_LENGTH / 2, markY, z), MARK_LENGTH, "x", {
      name: "Mark",
      role: "Where the bucket's top has to stop.",
      on: on(`${SCENE}post`, "weld"),
    }),
  ];
}

/**
 * How far the bucket drops if let go, over one turn of winding: a sawtooth, one tooth per landing. It climbs as the
 * wheel is wound past a landing and falls to nothing as the pawl clicks into the next. More teeth give more, smaller
 * teeth: finer landings and a shorter drop. The height is a share of the coarsest wheel's drop, a whole tooth of it.
 */
function slipBack(v: Values) {
  const s = settle(v);
  const most = LIFT_PER_TURN / TEETH.min;
  const tooth = LIFT_PER_TURN / s.n / most;
  const line: [number, number][] = [[0, 0]];
  for (let k = 1; k <= s.n; k++) line.push([k / s.n, tooth], [k / s.n, 0]);
  const turn = clamp01(s.turn);
  return { line, dot: [turn, (s.slack * LIFT_PER_TURN) / most] as [number, number], caption: "drop if you let go" };
}

const TEETH: Slider = { id: "teeth", label: "Teeth", min: 8, max: 24, step: 1, initial: 12, ends: ["Coarse", "Fine"] };

export const ratchet: Primitive = {
  id: "ratchet",
  name: "Ratchet",
  level: "Mechanism",
  job: "Allow motion one way only",
  howItWorks:
    "A ratchet wheel's teeth are wedges: a gentle ramp on one side and a straight cliff on the other. A coil spring round its hinge presses a hooked catch, the pawl, onto the wheel. Winding forward, the pawl's nose rides up each ramp and drops behind each cliff: that is the click. Let go and the load turns the wheel back until a cliff meets the nose; the pawl's pivot sits above and outside the nose, so that push turns it further into the tooth and it locks. The wheel can only stop at a landing, so it rolls back up to one tooth before it holds. More teeth give finer landings, but smaller teeth that shear more easily. In this game a tooth holds about 1100 ÷ teeth newtons: that is a simplification to show finer teeth being weaker, not a rule for real steel. Friction and the spring's force are left out.",
  madeOf: ["wheel", "wedge", "spring"],
  seenIn: ["Socket wrench", "Bike freewheel", "The watch's click"],
  sliders: [TEETH, { id: "turn", label: "Turn", min: 0, max: 1, step: 0.002, initial: 0.06, unit: "°", displayScale: 360 }],
  view: VIEW.bench,
  build,
  readouts,
  handle: {
    slider: "turn",
    label: "Wind",
    at: (v) => at(knobPoint(settle(v).turn), Z_KNOB),
    // The knob turns on a circle round the axle: the turn whose knob angle points at the finger, nearest the current one.
    solve: (point, v) => {
      const a = (Math.atan2(point.y - W.y, point.x - W.x) * 180) / Math.PI;
      const base = (KNOB_AT_0 - a) / 360;
      const now = v.turn ?? 0.06;
      return base + Math.round(now - base);
    },
    // Forward freely; backward only to the landing the pawl last dropped into, unless the pawl is lifted or the teeth are gone.
    reach: (v) => {
      const s = settle(v);
      return s.strip > 0 || s.lift > 0.5 ? [0, 1] : [s.landing, 1];
    },
  },
  play: {
    // The bucket on the plate and the pawl seated behind the first cliff. The handle's own reach is the real thing: the
    // wheel winds forward, clicking over each tooth, and backward only as far as the cliff the pawl last dropped behind.
    rest: { turn: 0 },
    // No hand arrow: winding takes the same pull whatever the tooth count, so an arrow would not change with the slider.
    plot: slipBack,
    // Let go, the bucket's weight turns the wheel back until that cliff meets the pawl's nose: it drops what it was wound
    // past the last landing, as a fall, and the pawl catches it with a click. Seated in a notch, it does not move.
    release: (v) => {
      const s = settle(v);
      const drop = s.slack * LIFT_PER_TURN;
      if (drop < 1e-6) return { durationMs: 1, at: () => frame({ ...v, turn: s.turn }, "") };
      const ms = dropMs(drop);
      return {
        durationMs: ms,
        cues: [{ ms, kind: "click" }],
        at: (t) => frame({ ...v, turn: s.turn - s.slack * fall(clamp01(t / ms)) }, "Caught"),
      };
    },
  },
  game: {
    name: "Stop at the mark",
    goal: "Wind the bucket to the mark and let go: it must stay.",
    rules: "More teeth let the pawl catch closer to the mark, but each tooth is thinner and weaker. Too few and it sinks; too many and they snap.",
    number: "teeth",
    action: "Let go",
    meters,
    judge,
    play,
    start: { teeth: 8, turn: 0 },
    poses: [
      { id: "lift", label: "Pawl lifted", min: 0, max: 1, step: 0.01, initial: 0 },
      { id: "strip", label: "Stripped from", min: 0, max: 1, step: 0.002, initial: 0 },
    ],
    scene,
  },
};

/** Exposed for tests: the solved pose and the layout the parts are placed by. */
export const rig = { W, settle, landingBelow, bucketTop: (turn: number) => PLATE_TOP + LIFT_PER_TURN * turn + loadEdge(LOAD) };
