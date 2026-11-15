// The catch's contact geometry: the bolt's two faces and the door's notched top edge as outlines, and the bolt's lift
// solved from them. models/catch.ts draws exactly these outlines, so the solve and the picture cannot disagree.
//
// Millimetres, in the latch's own frame: x along the door's travel (the door shuts moving +x), y up, the origin on the
// bolt's axis at the height of the door's top edge. The bolt hangs down out of the frame on that axis and only slides
// up and down; its spring pushes it down until its flange sits on the frame's lips. `door` is the door's x (0 = shut),
// and `lift` is how far the door's top edge has pushed the bolt up from there.
import type { Pt } from "../parts.ts";
import { DEG_TO_RAD } from "../../angles.ts";


/** The bolt's leading face, which the door's edge meets as it shuts, rises at this angle from the door's travel. */
export const CLOSE_DEG = 30;
/** Its trailing face, which the notch's wall bears on when the door is pulled, rises this steeply. */
export const HOLD_DEG = 70;
/** A face at angle a turns the spring's push S into a push along the travel of S × tan a (no friction). */
export const CLOSE_GAIN = Math.tan(CLOSE_DEG * DEG_TO_RAD);
export const HOLD_GAIN = Math.tan(HOLD_DEG * DEG_TO_RAD);

/** How far the bolt sticks down below the door's top edge: the furthest the door pushes it up. */
export const THROW = 10;
/** The flat at the bolt's tip, between its two faces: short, so the door slider's starting -9 mm sits on the gentle face. */
const TIP = 1;
/** The bolt's width: the two faces' runs and the tip together. */
export const BOLT_W = THROW / CLOSE_GAIN + TIP + THROW / HOLD_GAIN;
const HALF = BOLT_W / 2;
/** Where the gentle face ends and the steep face starts, along the tip. */
const TIP_L = -HALF + THROW / CLOSE_GAIN;
const TIP_R = TIP_L + TIP;

/** Gap between the door's top edge and the frame's lips, and the lips' thickness. The flange sits on the lips. */
export const CLEAR = 1.5;
export const LIP = 3;
/** The flange stands out this far either side of the bolt's body, and is this tall. */
const FLANGE = 3.5;
export const FLANGE_T = 3;
/** The flange's top, with the bolt all the way down: the spring's foot. */
export const FLANGE_TOP = CLEAR + LIP + FLANGE_T;

/** The bolt, all the way down, clockwise from the top of its gentle face. */
export const BOLT: Pt[] = [
  [-HALF, 0],
  [TIP_L, -THROW],
  [TIP_R, -THROW],
  [HALF, 0],
  [HALF, CLEAR + LIP],
  [HALF + FLANGE, CLEAR + LIP],
  [HALF + FLANGE, FLANGE_TOP],
  [-HALF - FLANGE, FLANGE_TOP],
  [-HALF - FLANGE, CLEAR + LIP],
  [-HALF, CLEAR + LIP],
];
/** The bolt's underside, left to right: the gentle face, the tip, the steep face. */
const BOLT_EDGE: Pt[] = [[-HALF, 0], [TIP_L, -THROW], [TIP_R, -THROW], [HALF, 0]];

/** The notch the bolt drops into: its floor is this far below the door's top, 2 below the bolt's tip. */
const NOTCH_D = THROW + 2;
/** Its left wall stands this far clear of the bolt's widest point. */
const NOTCH_L = -HALF - 1.5;
/** The keeper: the door's top between the notch and the door's leading edge. */
const KEEPER = 4;
/** The door's leading edge, from the bolt's axis with the door shut: it rests on the frame's post there. */
export const LEAD = HALF + KEEPER;
/** The door's trailing edge: the door is this far across, so the notch sits near its leading end. */
export const DOOR_LEFT = -24;
/**
 * The door's top edge with the door shut, left to right: the flat, the notch's left wall and floor, then its right wall,
 * which leans parallel to the bolt's steep face so the two lie flat on each other when shut, then the keeper.
 */
export const DOOR_EDGE: Pt[] = [
  [DOOR_LEFT, 0],
  [NOTCH_L, 0],
  [NOTCH_L, -NOTCH_D],
  [HALF - NOTCH_D / HOLD_GAIN, -NOTCH_D],
  [HALF, 0],
  [LEAD, 0],
];

/** Door positions where things change as it shuts: its edge meets the gentle face; the tip reaches the keeper; the keeper's corner passes the tip. */
export const TOUCH_AT = -HALF - LEAD;
export const FLAT_AT = TIP_L - LEAD;
export const LIP_AT = TIP_R - HALF;

/** Height of a polyline at x, linear between corners; undefined outside it. At a vertical step, `pick` chooses the side. */
function heightAt(line: Pt[], x: number, pick: (a: number, b: number) => number): number | undefined {
  let best: number | undefined;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]!;
    const [bx, by] = line[i]!;
    if (x < Math.min(ax, bx) - 1e-12 || x > Math.max(ax, bx) + 1e-12) continue;
    const y = Math.abs(bx - ax) < 1e-12 ? pick(ay, by) : ay + ((by - ay) * (x - ax)) / (bx - ax);
    best = best === undefined ? y : pick(best, y);
  }
  return best;
}

/**
 * How far the door's top edge pushes the bolt up with the door at `door`: the least lift at which no point of the
 * door's edge is above the bolt's underside. Both are straight between corners, so the worst point is always a corner of
 * one or the other, and checking those is exact.
 */
export function liftAt(door: number): number {
  const lo = Math.max(-HALF, door + DOOR_EDGE[0]![0]);
  const hi = Math.min(HALF, door + LEAD);
  if (lo > hi) return 0;
  const xs = [lo, hi, ...DOOR_EDGE.map(([x]) => x + door), ...BOLT_EDGE.map(([x]) => x)].filter((x) => x >= lo - 1e-12 && x <= hi + 1e-12);
  let lift = 0;
  for (const x of xs) {
    const floor = heightAt(DOOR_EDGE, x - door, Math.max) ?? -Infinity;
    const under = heightAt(BOLT_EDGE, x, Math.min) ?? Infinity;
    lift = Math.max(lift, floor - under);
  }
  return lift;
}

/**
 * The push along the door's travel that holds the door at `door` for each newton the spring pushes: the slope of the
 * face in contact (virtual work: push × door travel = spring × bolt travel). Positive on the gentle face (shutting
 * lifts the bolt), negative on the steep face (opening lifts it), 0 on the flat or clear of the bolt.
 */
export function gainAt(door: number): number {
  const e = 1e-5;
  return (liftAt(door + e) - liftAt(door - e)) / (2 * e);
}

/** The door position in [from, to] where a rising `f` first reaches `target`, by bisection; `to` if it never does. */
export function doorWhere(f: (door: number) => number, target: number, from: number, to: number): number {
  if (f(to) < target) return to;
  let a = from;
  let b = to;
  for (let i = 0; i < 50; i++) {
    const m = (a + b) / 2;
    if (f(m) < target) a = m;
    else b = m;
  }
  return b;
}
