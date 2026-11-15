// A hinged child is a lever (one bar on a pivot): the arm ratio trades the force your hand gives for
// travel where the work is done. The hinge can sit at one end (a lid: hand at the far end, work at a
// short end between) or, for a part on a pin, in the middle (scissors: hand on the handle, work on
// the blade across the pivot).
import { clamp01, easeOut, smooth } from "../../../shared/primitives/motion/ease.ts";
import type { Part } from "../../../shared/kit.ts";
import { type Axis, AXIS, type Mark, type Values, type Vec, type Window } from "../model.ts";
import { centreOf, extents } from "../pose.ts";
import { add, arrowMark, carry, cross, dot, latheAxis, overlay, type Pair, rotate, scale, sub, targetOf, type Template, tenth, unit } from "./pair.ts";
import { DEG_TO_RAD } from "../../../shared/angles.ts";

/** Arm ratios that pass. Game numbers. */
const WINDOW: Window = [2.5, 4];
const HAND_N = 20;
const HAND_MM = 24;
const JOB_N = 50;
const JOB_MM = 6;
const OPEN_DEG = 15;

const ratioOf = (v: Values) => tenth(v.ratio ?? 3);
/** Compared in tenths so 20 × 2.5 lands exactly on 50. */
const strongEnough = (r: number) => HAND_N * Math.round(r * 10) >= JOB_N * 10;
const farEnough = (r: number) => HAND_MM * 10 >= JOB_MM * Math.round(r * 10);

/**
 * The lever a turning part makes: the pivot, the axis it turns about, where the hand pushes, and the
 * direction from the pivot to the work. With a pin (evidence.ts) the pivot is the pin's centre and
 * turns about the pin's own axis; when the parts riding on the child (a scissors' grip and loop) sit
 * across the pivot from it, the hand is on them and the work on the child, a pivot in the middle.
 * Without a pin the hinge is guessed from the child's shape: at its end that reaches away from its
 * parent, with the hand at the far end and the work between.
 */
export type Lever = { pivot: Vec; turn: Vec; hand: Vec; handPart: Part; work: Vec; arm: number; open: number; middle: boolean; push: { at: Vec; dir: Vec } };

const across = (v: Vec, axis: Vec) => sub(v, scale(axis, dot(v, axis)));

/** +1 when a positive turn moves `point` away from `from`, else -1. */
const opening = (point: Vec, pivot: Vec, axis: Vec, from: Vec) => {
  const dist = (p: Vec) => Math.hypot(...[p.x - from.x, p.y - from.y, p.z - from.z]);
  return dist(rotate(point, pivot, axis, 5)) > dist(point) ? 1 : -1;
};

export function leverOf(pair: Pair): Lever {
  const { kit, child } = pair;
  const riders = kit.parts.filter((p) => p.id !== child.id && pair.subtree.includes(p.id));
  if (pair.pin) {
    const pivot = centreOf(extents([pair.pin]));
    const thin = (["x", "y", "z"] as Axis[]).reduce((a, b) => (pair.half[b] < pair.half[a] ? b : a));
    const turn = pair.pin.shape.kind === "lathe" || pair.pin.shape.kind === "torus" ? unit(latheAxis(pair.pin)) : AXIS[thin];
    const own = across(sub(pair.centre, pivot), turn);
    const far = riders
      .map((p) => ({ p, at: centreOf(extents([p])) }))
      .filter(({ at }) => dot(across(sub(at, pivot), turn), own) < 0)
      .sort((a, b) => Math.hypot(...Object.values(across(sub(b.at, pivot), turn))) - Math.hypot(...Object.values(across(sub(a.at, pivot), turn))))[0];
    const middle = far !== undefined;
    const hand = far ? far.at : add(pivot, scale(own, 2));
    const handVec = across(sub(hand, pivot), turn);
    const arm = Math.hypot(handVec.x, handVec.y, handVec.z);
    const work = middle ? unit(own) : unit(handVec);
    const against = kit.parts.find((p) => p.id === pair.pin!.parentId) ?? pair.parent;
    const open = opening(add(pivot, scale(work, arm / 3)), pivot, turn, centreOf(extents([against])));
    const dir = unit(scale(cross(turn, handVec), -open));
    const handHalf = far ? Math.max(...Object.values(scale(sub(extents([far.p]).max, extents([far.p]).min), 0.5))) : 0;
    return { pivot, turn, hand, handPart: far?.p ?? child, work, arm, open, middle, push: { at: sub(hand, scale(dir, handHalf)), dir } };
  }
  const axes: Axis[] = ["x", "y", "z"];
  const long = axes.reduce((a, b) => (pair.half[b] > pair.half[a] ? b : a));
  // The thinnest way across is how the far end swings; a tie goes to up and down, like a lid.
  const thin = (["y", "z", "x"] as Axis[]).filter((a) => a !== long).reduce((a, b) => (pair.half[b] < pair.half[a] - 0.5 ? b : a));
  const turnAxis = axes.find((a) => a !== long && a !== thin)!;
  const { parentCentre } = pair;
  // The hinge goes at the end of the child that reaches away from its parent.
  const back = Math.sign(pair.centre[long] - parentCentre[long]) || -1;
  const end = (s: number): Vec => ({ ...pair.centre, [long]: pair.centre[long] + s * pair.half[long] });
  const pivot = end(back);
  const free = end(-back);
  const away = Math.sign(pair.centre[thin] - parentCentre[thin]) || 1;
  const turned = rotate(free, pivot, AXIS[turnAxis], 5);
  const open = Math.sign((turned[thin] - free[thin]) * away) || 1;
  const closing = scale(AXIS[thin], -away);
  return {
    pivot, turn: AXIS[turnAxis], hand: free, handPart: child, work: unit(sub(free, pivot)), arm: 2 * pair.half[long], open, middle: false,
    push: { at: sub(free, scale(closing, pair.half[thin])), dir: closing },
  };
}

const ARM = 600;
const PUSH = 700;
const HOLD = 700;
const BACK = 600;

export const hingeTemplate: Template = {
  joints: ["hinge"],
  primitive: "lever",
  module: (pair: Pair) => {
    const { childName: child, parentName: parent, noun } = pair;
    const h = leverOf(pair);
    const pin = pair.pin?.name.toLowerCase();
    const swung = (present: readonly string[], deg: number) => carry(pair, present, { turns: [{ axis: h.turn, pivot: h.pivot, deg: h.open * deg }] });
    const hand = arrowMark("hand", h.push.at, h.push.dir, h.handPart.id);
    const workAt = (r: number) => add(h.pivot, scale(h.work, h.arm / r));
    const work = (r: number): Mark => ({ id: "work-point", shape: { kind: "box", width: 5, height: 5, depth: 5, cornerRadius: 1 }, at: workAt(r), ride: pair.child.id });
    const arm = Math.round(h.arm);
    const handName = h.handPart.name.toLowerCase();
    // Where the hand pushes and where the work is done, in the sentence's own words.
    const yours = h.middle ? `the ${handName}` : `the far end of the ${child}`;
    const there = h.middle ? "the work point" : "the short end";
    const There = h.middle ? "The work point" : "The short end";
    const tag = h.middle ? "Work point" : "Short end";
    const on = pin ? `the ${pin}` : "its hinge";
    const centre = pin ? "pivot" : "hinge";
    const push = `Push · ${noun}`;
    const swing = `Swing · ${noun}`;
    const against = pair.pin ? pair.kit.parts.find((p) => p.id === pair.pin!.parentId) : undefined;
    return {
      id: "hinge",
      title: pin ? `Pivot the ${child}` : `Hinge the ${child}`,
      need: `The ${child} must turn on ${on} and press hard enough, and far enough, ${h.middle ? "where it does its work" : "at its short end"}.`,
      primitive: "lever",
      produces: pair.produces,
      assemble: {
        piece: "Lever bar",
        title: pin ? `Pin the lever on the ${pin}: it becomes the ${child}.` : `Hinge the lever on the ${parent}: it becomes the ${child}.`,
        built: h.middle
          ? `The bar is now the ${child}, turning on the ${pin} with your hand on the ${handName} on one side and the work on the other.`
          : `The bar is now the ${child}, turning on ${pin ? `the ${pin}` : "a hinge"} at one end. Your hand works the far end.`,
      },
      target: targetOf(pair),
      enter: scale(pair.out, 50),
      fault: { primitive: "lever", slider: "ratio", start: 1 },
      fix: { window: WINDOW },
      tests: [
        {
          id: "hinge-push",
          label: push,
          run: (values, ctx) => {
            const r = ratioOf(values);
            const force = tenth(HAND_N * r);
            const ok = strongEnough(r);
            const closed = ok ? 1 : Math.min(0.85, force / JOB_N);
            const start = ARM + 200;
            return {
              verdict: ok
                ? { pass: true, line: `Your ${HAND_N} N on ${yours} became ${HAND_N} × ${r} = ${force} N at ${there}, enough for the ${JOB_N} N it has to press.` }
                : { pass: false, line: `Your ${HAND_N} N on ${yours} became ${HAND_N} × ${r} = ${force} N at ${there}. It has to press ${JOB_N} N, so it stopped partway.` },
              durationMs: start + PUSH + HOLD + BACK,
              at: (ms) => {
                if (ms < start) return overlay("Opening it", swung(ctx.present, OPEN_DEG * smooth(clamp01(ms / ARM))), [work(r)]);
                const q = easeOut(clamp01((ms - start) / PUSH));
                const deg = OPEN_DEG * (1 - closed * q);
                if (ms < start + PUSH + HOLD) return overlay(`${tag}: ${tenth(force * q)} of ${JOB_N} N`, swung(ctx.present, deg), [hand, work(r)]);
                const p = smooth(clamp01((ms - start - PUSH - HOLD) / BACK));
                return overlay(ok ? "Closed" : "Back to rest", swung(ctx.present, deg * (1 - p)), [work(r)]);
              },
            };
          },
        },
        {
          id: "hinge-swing",
          label: swing,
          run: (values, ctx) => {
            const r = ratioOf(values);
            const travel = tenth(HAND_MM / r);
            const ok = farEnough(r);
            const deg = Math.min(30, HAND_MM / h.arm / DEG_TO_RAD);
            return {
              verdict: ok
                ? { pass: true, line: `Your ${HAND_MM} mm became ${HAND_MM} ÷ ${r} = ${travel} mm at ${there}, enough for the ${JOB_MM} mm it has to move.` }
                : { pass: false, line: `Your ${HAND_MM} mm became ${HAND_MM} ÷ ${r} = ${travel} mm at ${there}. It has to move ${JOB_MM} mm, so it stopped short.` },
              durationMs: PUSH + HOLD + BACK,
              at: (ms) => {
                const q = smooth(clamp01(ms / PUSH));
                if (ms < PUSH + HOLD) return overlay(`${tag} moved ${tenth(travel * q)} of ${JOB_MM} mm`, swung(ctx.present, deg * q), [work(r)]);
                const p = smooth(clamp01((ms - PUSH - HOLD) / BACK));
                return overlay("Back to rest", swung(ctx.present, deg * (1 - p)), [work(r)]);
              },
            };
          },
        },
      ],
      hints: {
        observe: `Run ${push} and watch the ${child}. Your push closes it only partway.`,
        principle: h.middle
          ? `The ${child} on the ${pin} is a lever with the pivot in the middle: your hand on the ${handName} on one side, the work on the other. Force at the work point = your force × your distance from the pivot ÷ the work point's distance. Its travel is your travel divided by the same ratio.`
          : `The ${child} on ${on} is a lever. The force at the short end is your push times the arm ratio, your distance from the ${centre} divided by the short end's. Its travel is your travel divided by the same ratio.`,
        direction: `Raise the arm ratio until ${HAND_N} N becomes at least ${JOB_N} N at ${there}, and stop before its travel drops under ${JOB_MM} mm. Check ${push} and ${swing} together.`,
        low: `Too little force reaches ${there}, and it stops partway.`,
        high: `${There} moves less than ${JOB_MM} mm, and it stops short.`,
      },
      suspect: pair.child.id,
      misses: {
        [pair.parent.id]: pin ? `The ${pin} is the point the ${child} turns about. It does not set how hard it presses.` : `The ${parent} holds still. Watch the part that swings during ${push}.`,
        ...(against ? { [against.id]: `The ${against.name.toLowerCase()} holds still. Watch the part that turns during ${push}.` } : {}),
      },
      missDefault: `That part does not decide the force. Watch which part turns during ${push}.`,
      uses: { lever: `The ${child} itself, turning on ${on}. Your push on ${yours} becomes force at ${there}.` },
      task: "Find a ratio that pushes hard and far.",
      why: h.middle
        ? `A part turning on a pivot is a lever. With the pivot between your hand and the work, the force at the work is your force times your distance from the pivot divided by its distance, and its travel is divided by the same ratio. No work is gained, only a trade of force for distance.`
        : `A part turning on a ${centre} is a lever. Pushing farther from the ${centre} than the load multiplies your force by the arm ratio and divides your travel by it. No work is gained, only a trade of force for distance.`,
      gameNote: `Game numbers: your hand pushes ${HAND_N} N and moves ${HAND_MM} mm on ${yours}, ${arm} mm from the ${centre}, and ${there} has to press ${JOB_N} N and move ${JOB_MM} mm. ${pin ? `The pivot is the centre of the ${pin} in the kit.` : "Where the hinge sits is a guess from the part's shape."} Where ${there} sits is set by the ratio, not read from the ${pair.objectName}. The lever law is real. The purple block marks ${there}.`,
      hideLearnReadouts: true,
      numbers: (v) => {
        const r = ratioOf(v);
        return [
          { label: `At ${there}`, value: `${HAND_N} N × ${r} = ${tenth(HAND_N * r)} N (needs ${JOB_N} N)` },
          { label: "Arms", value: `your hand ${arm} mm from the ${centre}, ${there} ${arm} ÷ ${r} = ${tenth(arm / r)} mm` },
          { label: "Travel there", value: `${HAND_MM} mm ÷ ${r} = ${tenth(HAND_MM / r)} mm (needs ${JOB_MM} mm)` },
        ];
      },
    };
  },
};
