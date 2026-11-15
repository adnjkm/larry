// Catch: hold until pushed hard enough. A mechanism made of a wedge and a spring (src/primitives/docs/design-language.md,
// motion-language.md).
//
// The rig is the textbook spring latch, side on: a door slides along the plate toward a post, and a pink bolt hangs
// down out of the frame above its path, pushed down by a spring. The bolt has a gentle face toward the coming door and a
// steep face behind; the door has a notch in its top edge. Shutting, the door's edge rides up the gentle face, lifting
// the bolt, slides under it, and the spring snaps the bolt down into the notch. Pulled back, the notch's wall bears on
// the steep face. The bolt's lift is never typed in: it is solved from the two outlines at every door position
// (catchGeometry.ts).
//
// Why this way up: at VIEW.bench the camera looks along the door's face, so both of the bolt's faces, the notch and the
// gap between them are seen side on. The door slides on the plate, so nothing has to hold it up, and the latch lives in
// the frame, as on a gate or a cupboard: the moving thing that meets the bolt is the door's own edge.
//
// The number is the release force: the pull it takes to drag the door open. A face at angle a turns the spring's push S
// into a push along the travel of S × tan a: 2.75 S on the 70° face, 0.58 S on the 30° one. So each release force is a
// spring, and the spring is what you see change: every one here is fitted squeezed by the same 6 mm and goes solid at the
// same length, so a stronger one has thicker wire and fewer turns.
//
// The game, "Shut and hold": a gentle 3 N push has to shut the door, and a 9 N gust must not pull it open. Too weak a
// spring and the gust drags the notch's wall up the steep face; too strong and the push stalls on the gentle face.
import type { Part } from "../../kit.ts";
import { clamp, clamp01, easeOut, shudder, smooth } from "../motion/ease.ts";
import { frame, handArrow, LEAD as LEAD_MS, MARK, phases, REWIND, SCENE } from "../motion/run.ts";
import { arrow, arrowLength, coilSpring, fmt, look, on, part, pivoted, plate, PLATE_TOP, pullRing, v3, type Pt } from "../parts.ts";
import { type Cue, type Meter, type Motion, type Primitive, type Run, type Task, type Values, type Verdict, VIEW, type Slider, valueOf } from "../types.ts";
import {
  BOLT,
  BOLT_W,
  CLEAR,
  CLOSE_DEG,
  CLOSE_GAIN,
  DOOR_EDGE,
  DOOR_LEFT,
  doorWhere,
  FLANGE_TOP,
  FLAT_AT,
  gainAt,
  HOLD_DEG,
  HOLD_GAIN,
  LEAD,
  LIP,
  LIP_AT,
  liftAt,
  THROW,
  TOUCH_AT,
} from "./catchGeometry.ts";

// Layout, mm. The latch frame's origin (catchGeometry.ts) is at (BX, DOOR_TOP) in the world.
const DOOR_H = 44;
const DOOR_TOP = PLATE_TOP + DOOR_H;
const DOOR_MIN = -42;
const POST_W = 10;
/** Shifts the rig so the union of its poses (door all the way open to the post's far face) is centred on the plate. */
const BX = -(DOOR_LEFT + DOOR_MIN + LEAD + POST_W) / 2;
const HALF = BOLT_W / 2;
/** The frame's slot: the bolt's flange slides in it, and its right wall is the post's face, where the door stops. */
const SLOT = LEAD;
const MOUTH = HALF + 0.5;
const WALL = 3;
const ROOF_T = 4;
/** The spring: its length with the bolt all the way down, its squeeze when fitted, the length its coils touch at, its coil radius. */
const FITTED = 26;
const PRELOAD = 6;
const SOLID = 14;
const COIL_R = 8;
const ROOF = FLANGE_TOP + FITTED;
/** Depths, front to back: the frame and door, and the bolt (a little thinner, so it reads as sliding in the frame). */
const DEPTH = 20;
const BOLT_DEPTH = 16;
/** The pull ring sits on the door's front face; arrows act on the door's back (left) face, at three heights. */
const RING_X = DOOR_LEFT + 11;
const RING_Y = PLATE_TOP + 22;
const PUSH_Y = PLATE_TOP + 10;
const GUST_Y = PLATE_TOP + 34;
/** mm per N for every arrow: the 20 N release is 30 long. */
const MM_PER_N = 1.5;

// The game, in newtons. The face angles are the drawn ones; the push and the gust are set so the window sits mid-range.
export const PUSH = 3;
export const GUST = 9;
/** Where the door starts a run, and where it ends up when the gust opens it. */
const OPEN_DOOR = -36;

/** The release force, on the slider's grid. */

/** Wire diameter for the 2 N spring; k goes as d⁴ ÷ turns, and turns = SOLID ÷ d − 1 keeps the solid length fixed (as spring.ts). */
const WIRE_SOFT = 2.4;
const WIRE_C = WIRE_SOFT ** 4 / (SOLID / WIRE_SOFT - 1);

/**
 * The spring that gives release force R: with the bolt pushed all the way up it pushes S = R ÷ tan 70°, and it is then
 * squeezed PRELOAD + THROW, so its rate is k = S ÷ 16 mm. Its wire comes from that rate.
 */
export function springFor(release: number) {
  const full = release / HOLD_GAIN;
  const rate = full / (PRELOAD + THROW);
  const softRate = 2 / HOLD_GAIN / (PRELOAD + THROW);
  let lo = 1;
  let hi = 8;
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2;
    if (d ** 4 / (SOLID / d - 1) < (WIRE_C * rate) / softRate) lo = d;
    else hi = d;
  }
  const wire = (lo + hi) / 2;
  return { full, rate, rest: rate * PRELOAD, wire, turns: SOLID / wire - 1, toShut: full * CLOSE_GAIN };
}

/** Everything a pose needs. `build`, `readouts`, the handle and the game all read this. */
export function settle(v: Values) {
  const release = valueOf(FORCE, v);
  const spring = springFor(release);
  const door = clamp(v.door ?? -9, DOOR_MIN, 0);
  const lift = liftAt(door);
  /** The spring's push now, and the hand's push along the travel that holds the door here (+ shuts, − opens). */
  const push = spring.rate * (PRELOAD + lift);
  const gain = gainAt(door);
  const shut = door > -1e-9 && lift < 1e-9;
  // Shut, the post holds the door against the spring, so no hand is needed (the slope there is the steep face's corner).
  const hand = shut || Math.abs(gain) < 1e-6 ? 0 : push * gain;
  return {
    release,
    ...spring,
    door,
    lift,
    push,
    hand,
    shut,
    length: FITTED - lift,
    /** Run-only: whether build draws the holding hand's arrow (a run draws its own). */
    showHand: (v.hand ?? 1) > 0.5,
  };
}

const doorLeft = (door: number) => BX + door + DOOR_LEFT;
const ringAt = (door: number) => v3(BX + door + RING_X, RING_Y, DEPTH / 2 + 2);
const arrowLen = (newtons: number) => arrowLength(newtons, 1, MM_PER_N);

/** The door: a block on the plate with the notched top edge from catchGeometry.ts. Door frame, world y. */
const DOOR: Pt[] = [
  [DOOR_LEFT, PLATE_TOP],
  [LEAD, PLATE_TOP],
  ...DOOR_EDGE.slice()
    .reverse()
    .map(([x, y]): Pt => [x, DOOR_TOP + y]),
];

/** The frame, latch frame: the post the door stops on, its head over the door's path, the slot and the lips. */
const FRAME: Pt[] = [
  [SLOT + POST_W, PLATE_TOP - DOOR_TOP],
  [SLOT + POST_W, ROOF + ROOF_T],
  [-SLOT - WALL, ROOF + ROOF_T],
  [-SLOT - WALL, CLEAR],
  [-MOUTH, CLEAR],
  [-MOUTH, CLEAR + LIP],
  [-SLOT, CLEAR + LIP],
  [-SLOT, ROOF],
  [SLOT, ROOF],
  [SLOT, CLEAR + LIP],
  [MOUTH, CLEAR + LIP],
  [MOUTH, CLEAR],
  [SLOT, CLEAR],
  [SLOT, PLATE_TOP - DOOR_TOP],
];

/** An extrusion from an outline already placed in world x-y, `depth` deep, centred on z = 0. */
const placed = (outline: Pt[], depth: number) => pivoted(outline, depth, [0, 0], v3(0, 0, 0), 0);

function build(v: Values): Part[] {
  const s = settle(v);
  const d = s.door;
  const frameShape = placed(
    FRAME.map(([x, y]) => [BX + x, DOOR_TOP + y]),
    DEPTH,
  );
  const door = placed(
    DOOR.map(([x, y]) => [BX + d + x, y]),
    DEPTH,
  );
  const bolt = placed(
    BOLT.map(([x, y]) => [BX + x, DOOR_TOP + s.lift + y]),
    BOLT_DEPTH,
  );
  const parts: Part[] = [
    plate(BX + SLOT + POST_W - doorLeft(DOOR_MIN), DEPTH + 4),
    part(
      "frame",
      "Frame",
      "Fixed: the post the door stops on, and the head that holds the bolt over the door's path.",
      frameShape.shape,
      frameShape.position,
      look.structure,
      on("plate", "weld"),
    ),
    part(
      "door",
      "Door",
      "Slides along the plate. The notch in its top edge is the strike the bolt drops into.",
      door.shape,
      door.position,
      { ...look.steel, finish: "matte" },
      on("plate", "slide"),
    ),
    coilSpring(
      "spring",
      "Spring",
      "Pushes the bolt down. Fitted squeezed, so it pushes even with the bolt all the way down.",
      [BX, DOOR_TOP + FLANGE_TOP + s.lift],
      [BX, DOOR_TOP + ROOF],
      0,
      COIL_R,
      s.wire / 2,
      s.turns,
      look.slate,
      on("frame", "spring"),
    ),
    part(
      "bolt",
      "Bolt",
      "A wedge on a spring: a gentle face to shut on, a steep face to hold with.",
      bolt.shape,
      bolt.position,
      look.focus,
      on("frame", "slide"),
    ),
    pullRing("ring", ringAt(d), { name: "Handle", role: "Where your hand slides the door.", on: on("door", "screw") }),
  ];
  // Riding a face, the door stays put only while a hand holds it: pushing on the gentle face, pulling on the steep one.
  const len = arrowLen(Math.abs(s.hand));
  if (s.showHand && s.hand > 1e-6)
    parts.push(
      ...arrow("hand-arrow", v3(doorLeft(d), PUSH_Y, 0), 0, len, "push", {
        name: "Hand",
        role: "The push that holds the door here against the spring.",
        on: on("door", "glue"),
      }),
    );
  if (s.showHand && s.hand < -1e-6)
    parts.push(
      ...arrow("hand-arrow", v3(doorLeft(d), RING_Y, 0), 180, len, "pull", {
        name: "Hand",
        role: "The pull that holds the door here against the spring.",
        on: on("door", "glue"),
      }),
    );
  return parts;
}

function readouts(v: Values) {
  const s = settle(v);
  const S = fmt(s.full, 2);
  const state = s.shut
    ? `latched: the spring pushes ${fmt(s.rest, 1)} N with the bolt down`
    : s.hand > 1e-6
      ? `riding the gentle face: holding it takes a ${fmt(s.hand, 1)} N push`
      : s.hand < -1e-6
        ? `on the steep face: holding it takes a ${fmt(-s.hand, 1)} N pull`
        : s.lift > 1e-6
          ? "bolt all the way up, on the door's top"
          : "open: the bolt hangs clear of the door";
  return [
    { label: "Faces", value: `${S} N × tan ${HOLD_DEG}° = ${fmt(s.release)} N to open; ${S} N × tan ${CLOSE_DEG}° = ${fmt(s.toShut, 1)} N to shut` },
    { label: "Travel", value: `door ${fmt(-s.door, 1)} mm from shut, bolt up ${fmt(s.lift, 1)} of ${THROW} mm` },
    { label: "State", value: state },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "wont-shut" | "gust-opens";

/** The outcome, decided once from the release force; meters, judge and play all read it. */
export function shutAndHold(v: Values) {
  const release = valueOf(FORCE, v);
  const spring = springFor(release);
  const kind: Kind = spring.toShut > PUSH + 1e-9 ? "wont-shut" : release < GUST - 1e-9 ? "gust-opens" : "pass";
  const pushAt = (door: number) => spring.rate * (PRELOAD + liftAt(door));
  /** The push stalls where the gentle face asks as much as it gives; the gust stops where the steep face holds it. */
  const pushStall = doorWhere((d) => CLOSE_GAIN * pushAt(d), PUSH, TOUCH_AT, FLAT_AT);
  const gustStall = -doorWhere((x) => HOLD_GAIN * pushAt(-x), GUST, 0, -LIP_AT);
  return { kind, release, ...spring, pushStall, gustStall };
}

function judge(v: Values): Verdict {
  const r = shutAndHold(v);
  switch (r.kind) {
    case "wont-shut":
      return {
        pass: false,
        outcome: "wont-shut",
        headline: "Too stiff to shut",
        detail: "Too strong a spring: a gentle push cannot ride the bolt over the ramp.",
      };
    case "gust-opens":
      return {
        pass: false,
        outcome: "gust-opens",
        headline: "Gust pulled it open",
        detail: "Too weak a spring: the steep face lets go and the gust pulls the door open.",
      };
    case "pass":
      return {
        pass: true,
        outcome: "shuts-and-holds",
        headline: "Shuts and holds",
        detail: "The gentle ramp lets a light push shut it, and the steep face holds against the gust.",
      };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = shutAndHold(v);
  return [
    { label: "Ease to shut", value: r.toShut, target: PUSH, max: 5, unit: "N", need: "atMost", digits: 1 },
    { label: "Grip", value: r.release, target: GUST, max: 22, unit: "N", need: "atLeast" },
  ];
}

// Choreography, ms.
/** The push carries the door in and up the gentle face. */
const PUSH_MS = 900;
/** Past the tip the spring drives the bolt down the steep face and pulls the door shut onto the post. */
const SNAP = 120;
const STALL = 400;
/** The push gives up and the spring pushes the door back down the gentle face. */
const BACK = 450;
const LATCHED = 300;
const GUST_LEAD = 200;
/** A gust the steep face holds: the door gives a little and is pulled back. */
const GUST_IN = 350;
const GUST_OUT = 350;
/** A gust that beats the face drags the bolt up in this long, then the door swings open. */
const GIVE = 300;
const SWING = 500;
const HOLD = 650;

function play(v: Values): Run {
  const verdict = judge(v);
  const r = shutAndHold(v);
  const d0 = clamp(v.door ?? OPEN_DOOR, DOOR_MIN, 0);
  const shuts = r.kind !== "wont-shut";
  const holds = r.kind === "pass";
  const tl = phases({
    rewind: Math.abs(d0 - OPEN_DOOR) > 1e-9 ? REWIND : 0,
    lead: LEAD_MS,
    push: PUSH_MS,
    snap: shuts ? SNAP : 0,
    stall: shuts ? 0 : STALL,
    back: shuts ? 0 : BACK,
    latched: shuts ? LATCHED : 0,
    gustLead: shuts ? GUST_LEAD : 0,
    gustIn: holds ? GUST_IN : 0,
    gustOut: holds ? GUST_OUT : 0,
    give: shuts && !holds ? GIVE : 0,
    swing: shuts && !holds ? SWING : 0,
    hold: HOLD,
  });
  const pushTo = shuts ? LIP_AT : r.pushStall;
  const cues: Cue[] = [];
  if (shuts) cues.push({ ms: tl.end("snap"), kind: "snap" });
  if (shuts && !holds) cues.push({ ms: tl.end("give"), kind: "slip" });

  const values = (door: number, hand = 0): Values => ({ ...v, force: v.force ?? 8, door: clamp(door, DOOR_MIN, 0), hand });
  const push = (door: number) => handArrow(v3(doorLeft(door), PUSH_Y, 0), 0, "push", arrowLen(PUSH), "push-arrow");
  const gust = (door: number) =>
    arrow(`${MARK}gust-arrow`, v3(doorLeft(door), GUST_Y, 0), 180, arrowLen(GUST), "pull", {
      name: "Gust",
      role: "The gust's pull on the door.",
      on: on("plate", "glue"),
    });

  return {
    verdict,
    durationMs: tl.total,
    cues,
    at: (ms) => {
      const { phase } = tl.at(ms);
      // The figure's own holding-hand arrow fades out up to the push: the run draws its own arrows.
      const hand = 1 - clamp01(ms / tl.end("lead"));
      switch (phase) {
        case "rewind":
          return frame(values(d0 + (OPEN_DOOR - d0) * smooth(tl.t("rewind", ms)), hand), "Back to the start");
        case "lead":
          return frame(values(OPEN_DOOR, hand), "Pushing", push(OPEN_DOOR));
        case "push": {
          const door = OPEN_DOOR + (pushTo - OPEN_DOOR) * smooth(tl.t("push", ms));
          return frame(values(door), liftAt(door) > 0.05 ? "Bolt riding up" : "Pushing", push(door));
        }
        case "snap": {
          const door = LIP_AT * (1 - easeOut(tl.t("snap", ms)));
          return frame(values(door), "Snap", push(door));
        }
        case "stall": {
          const door = r.pushStall - 0.5 * Math.abs(shudder(tl.t("stall", ms)));
          return frame(values(door), "Stuck", push(door));
        }
        case "back": {
          const door = r.pushStall + (TOUCH_AT - r.pushStall) * easeOut(tl.t("back", ms));
          return frame(values(door), "Pushed back out");
        }
        case "latched":
          return frame(values(0), "Latched");
        case "gustLead":
          return frame(values(0), "Gust blowing", gust(0));
        case "gustIn": {
          const door = r.gustStall * smooth(tl.t("gustIn", ms));
          return frame(values(door), "Bolt giving way", gust(door));
        }
        case "gustOut": {
          const door = r.gustStall * (1 - smooth(tl.t("gustOut", ms)));
          return frame(values(door), "Holding", gust(door));
        }
        case "give": {
          const door = LIP_AT * smooth(tl.t("give", ms));
          return frame(values(door), "Bolt giving way", gust(door));
        }
        case "swing": {
          const door = LIP_AT + (OPEN_DOOR - LIP_AT) * easeOut(tl.t("swing", ms));
          return frame(values(door), "Blown open", gust(door));
        }
        case "hold":
          if (!shuts) return frame(values(TOUCH_AT), "Won't shut");
          if (!holds) return frame(values(OPEN_DOOR), "The gust opened it");
          return frame(values(0), "Shut and held");
      }
    },
  };
}

// ---- Free play ---------------------------------------------------------------------------------------------------

/** The spring pushing the door back down the whole gentle face, ms, and how far the door coasts on once off it, mm. */
const PUSHED_OUT_MS = 380;
const COAST = 1.5;
/** The spring driving the bolt down the whole steep face and the door onto the post, ms. */
const SNAP_SHUT_MS = 140;

/**
 * Let go of the door: on the flat, clear of the bolt or shut, nothing pushes it along, so it stays. On the gentle face
 * the spring pushes the bolt down it and the door back out, off the face. On the steep face the spring drives the bolt
 * down into the notch and pulls the door shut onto the post, faster as it goes, with a snap.
 */
function release(v: Values): Motion {
  const s = settle(v);
  const from = s.door;
  const values = (door: number) => ({ ...v, door, hand: 0 });
  if (s.hand > 1e-6) {
    const to = TOUCH_AT - COAST;
    const ms = Math.round(PUSHED_OUT_MS * Math.sqrt((from - to) / (FLAT_AT - to)));
    return { durationMs: ms, at: (t) => frame(values(from + (to - from) * easeOut(clamp01(t / ms))), "") };
  }
  if (s.hand < -1e-6) {
    const ms = Math.max(1, Math.round(SNAP_SHUT_MS * Math.sqrt(-from / -LIP_AT)));
    return { durationMs: ms, cues: [{ ms, kind: "snap" }], at: (t) => frame(values(from * (1 - clamp01(t / ms) ** 2)), "") };
  }
  return { durationMs: 1, at: () => frame(v, "") };
}

const FORCE: Slider = { id: "force", label: "Release force", min: 2, max: 20, step: 1, initial: 8, unit: " N", ends: ["Weak", "Strong"] };

// ---- Free play's goal: a gust that comes and goes, and a hand that pulls when asked ------------------------------------

/** A hand's pull on the door, in newtons: an ordinary tug, harder than the gust. */
export const HAND = 15;
/** The gust's round, ms: still, then a blow, then still. A blown-open door is shut again at the start of each round. */
const GUST_CYCLE = 3200;
const GUST_AT = 700;
const GUST_END = 2200;
/** The gust is never quite steady: its arrow grows and shrinks by this share, this many times a second. */
const FLUTTER = 0.12;
const FLUTTER_HZ = 3;
/** A pull, ms: the hand pulls this long, and a door it opened stands open this much longer before it is shut again. */
const PULL_MS = 1200;
const OPEN_MS = 900;
/** How fast the door can slide, mm per ms (the gust's blow, a pull, and the hand that shuts it again). */
const SLIDE = 0.15;

/** The gust beats a spring weaker than itself (as in the game); a hand opens any spring up to its own pull. */
const gustOpens = (release: number) => release < GUST - 1e-9;
const handOpens = (release: number) => release <= HAND + 1e-9;

/** Where the steep face holds a pull of `newtons` (a negative door position): the pull drags the notch up it until the spring's push wins. */
function holdsAt(release: number, newtons: number) {
  const spring = springFor(release);
  const pushAt = (door: number) => spring.rate * (PRELOAD + liftAt(door));
  return -doorWhere((d) => HOLD_GAIN * pushAt(-d), newtons, 0, -LIP_AT);
}

/** 0 outside [from, to], rising and falling over a quarter second at each end. */
const bump = (t: number, from: number, to: number) => smooth(clamp01((t - from) / 250)) * smooth(clamp01((to - t) / 250));

/**
 * The door, `dtMs` on from `v`. The gust blows on its own, round after round. A pull happens when asked: the Pull button
 * sets `tug`, and the hand pulls from then. The release force is read afresh each frame, so the door answers the slider.
 * `opened` records a pull that opened a door the gust could not: the goal. `failed`, a pull the spring held against.
 */
function demo(v: Values, ms: number, dtMs: number): Values {
  const release = valueOf(FORCE, v);
  const out: Values = { ...v, tug: 0 };
  if ((v.tug ?? 0) > 0 && (v.tugAt ?? -1) < 0) out.tugAt = ms;
  const since = (out.tugAt ?? -1) < 0 ? -1 : ms - out.tugAt!;
  let to: number;
  if (since >= 0 && since < PULL_MS + OPEN_MS) {
    // The hand's pull: a spring up to the hand's pull lets the door slide open; a stronger one only gives a little.
    const opens = handOpens(release);
    to = opens ? OPEN_DOOR : holdsAt(release, HAND) * bump(since, 0, PULL_MS);
    out.pull = since < PULL_MS ? HAND : 0;
    out.pullY = RING_Y;
    if (since < PULL_MS) {
      if (opens && !gustOpens(release)) out.opened = 1;
      out.failed = opens ? 0 : 1;
    }
  } else {
    if (since >= 0) out.tugAt = -1;
    const t = ms % GUST_CYCLE;
    const blowing = t >= GUST_AT && t < GUST_END;
    to = !blowing ? (t < GUST_AT ? 0 : gustOpens(release) ? OPEN_DOOR : 0) : gustOpens(release) ? OPEN_DOOR : holdsAt(release, GUST) * bump(t, GUST_AT, GUST_END);
    out.pull = blowing ? GUST : 0;
    out.pullY = GUST_Y;
    out.gust = blowing ? bump(t, GUST_AT, GUST_END) * (1 + FLUTTER * Math.sin((ms / 1000) * FLUTTER_HZ * 2 * Math.PI)) : 0;
  }
  const door = clamp(v.door ?? 0, DOOR_MIN, 0);
  out.door = door + clamp(to - door, -SLIDE * dtMs, SLIDE * dtMs);
  return out;
}

/** The gust's or the hand's pull on the door's back face, as an arrow to scale; the gust's flutters as it blows. */
function pullScene(v: Values): Part[] {
  const newtons = v.pull ?? 0;
  if (newtons <= 0) return [];
  const gust = newtons === GUST;
  const len = arrowLen(newtons) * (gust ? Math.max(0.2, v.gust ?? 1) : 1);
  return arrow(`${SCENE}pull-arrow`, v3(doorLeft(clamp(v.door ?? 0, DOOR_MIN, 0)), v.pullY ?? GUST_Y, 0), 180, len, "pull", {
    name: gust ? "Gust" : "Hand",
    role: gust ? "The gust's pull on the door." : "A hand pulling the door open.",
    on: on("plate", "glue"),
  });
}

/** In the window the spring holds against the gust and gives to a hand: exactly the releases between the two pulls. */
const holds = (v: Values) => {
  const release = valueOf(FORCE, v);
  return !gustOpens(release) && handOpens(release);
};

// One goal, with a failure on each side: too weak and the gust opens the door, too strong and a hand cannot. The gust
// is the world's; the pull is the user's, on the Pull button, and the goal is met only once they have pulled it open.
const TASKS: Task[] = [
  {
    goal: "Hold against the gust, then pull it open.",
    start: { force: 4, pull: 0, tug: 0, tugAt: -1, opened: 0, failed: 0 },
    scene: pullScene,
    met: (v) => holds(v) && (v.opened ?? 0) > 0,
    hint: (v) => {
      const release = valueOf(FORCE, v);
      if (gustOpens(release)) return "The gust blows it open. Make it stronger.";
      if (!handOpens(release) && (v.failed ?? 0) > 0) return "Too strong to pull open. Make it weaker.";
      return undefined;
    },
    action: { label: "Pull", set: { tug: 1 } },
    drive: demo,
  },
];

export const catchLatch: Primitive = {
  id: "catch",
  name: "Catch",
  level: "Mechanism",
  job: "Hold until pushed hard enough",
  howItWorks:
    "A latch bolt is a wedge pushed out by a spring. Its leading face is gentle (30°): as the door shuts, the door's edge rides up it, and pushing the door along takes only the spring's push × tan 30°, about 0.58 of it. Once past, the spring snaps the bolt into the notch. Now its trailing face, steep at 70°, bears on the notch's wall, and pulling the door open takes the spring's push × tan 70°, about 2.75 of it. One spring, two very different forces. A stronger spring holds harder but also takes more to shut. Friction is left out; it would add to both.",
  madeOf: ["wedge", "spring"],
  seenIn: ["Door latch", "Gate catch", "Snap-fit"],
  sliders: [FORCE, { id: "door", label: "Door", min: DOOR_MIN, max: 0, step: 0.5, initial: -9, unit: " mm" }],
  view: VIEW.bench,
  build,
  readouts,
  handle: {
    slider: "door",
    label: "Slide",
    at: (v) => ringAt(settle(v).door),
    solve: (point) => point.x - ringAt(0).x,
  },
  play: {
    facts: {
      say: "/kaCH/",
      is: "A sprung bolt that lets a door shut and holds it.",
      note: "Release force affects how hard it is to open.",
    },
    // The door slid open, clear of the bolt, which hangs all the way down on its spring.
    rest: { door: OPEN_DOOR },
    // The latch alone: no holding hand's arrow, since the hand is the finger on the ring.
    build: (v) => build(v).filter((p) => p.id !== "hand-arrow"),
    // While the finger holds the door, the game's holding arrow, to scale: a light push on the gentle face, a pull as big
    // as the release force on the steep one.
    hand: (v) => build({ ...v, hand: 1 }).filter((p) => p.id === "hand-arrow"),
    tasks: TASKS,
    release,
  },
  game: {
    name: "Shut and hold",
    goal: "Shut the door with a light push, and keep it shut in a gust.",
    rules: "A stronger spring grips the door harder against the gust, but makes it harder to push shut. Find the balance.",
    number: "force",
    action: "Push it shut",
    meters,
    judge,
    play,
    start: { force: 8, door: OPEN_DOOR },
    poses: [{ id: "hand", label: "Hand arrow", min: 0, max: 1, step: 0.01, initial: 1 }],
  },
};

/** Exposed for tests: the layout the parts are placed by. */
export const rig = { BX, DOOR_TOP, DEPTH, FRAME, DOOR, FITTED, SOLID, PRELOAD, MM_PER_N };
