// A spring joint pushes the child back after a press. Too soft and friction keeps it pressed; too
// stiff and a hand cannot press it all the way. Two motions: a button pressed straight in, or a jaw.
// A jaw is a long child lying along its parent with a spring part beside it (a part the kit itself
// names or describes as a spring, like a clothes peg's coil): pinching its back end, on the spring's
// side, opens its front end, and the spring pushes the back ends apart again, which closes the front.
import { clamp01, easeOut, smooth } from "../../../shared/primitives/motion/ease.ts";
import { type Axis, AXIS, type PartMove, type Run, type TestCtx, type Values, type Vec, vec, type Window } from "../model.ts";
import { centreOf, extents } from "../pose.ts";
import { add, arrowMark, carry, farFace, outBy, overlay, type Pair, scale, sub, targetOf, type Template, tenth } from "./pair.ts";

/** Stiffness in N/mm. Game numbers. */
const WINDOW: Window = [1.3, 3];
/** How far a full press squeezes the spring, in mm. */
export const TRAVEL = 10;
const FRICTION = 12;
const HAND = 30;
/** A child at least this many times longer than it is thick, lying across the way it comes off, can be a jaw. */
const JAW_RATIO = 3;
export const SPRING_WORDS = /\bsprings?\b/i;

const stiffnessOf = (v: Values) => tenth(v.stiffness ?? 2);
/** Spring push at full travel, F = k × x. */
const pushOf = (k: number) => tenth(k * TRAVEL);
const springsBack = (k: number) => pushOf(k) > FRICTION;
const pressedMm = (k: number) => Math.min(TRAVEL, tenth(HAND / k));

/** How the child moves when pressed `mm` of the full travel, and where the hand pushes. */
export type Motion = { kind: "button" | "jaw"; move: (mm: number) => PartMove; hand: { at: Vec; dir: Vec } };

export function motionOf(pair: Pair): Motion {
  const press = scale(pair.out, -1);
  const button: Motion = { kind: "button", move: (mm) => outBy(pair, -mm), hand: { at: farFace(pair), dir: press } };
  const axes: Axis[] = ["x", "y", "z"];
  const long = axes.filter((a) => a !== pair.axis).reduce((a, b) => (pair.half[b] > pair.half[a] ? b : a));
  const springs = pair.kit.parts.filter((p) => p.id !== pair.child.id && (SPRING_WORDS.test(p.name) || SPRING_WORDS.test(p.role)));
  if (pair.half[long] < JAW_RATIO * pair.half[pair.axis] || springs.length === 0) return button;
  const side = centreOf(extents(springs))[long] - pair.centre[long];
  if (Math.abs(side) < 1e-6) return button;
  const back = Math.sign(side);
  const length = 2 * pair.half[long];
  // Drawn turning about its back end, which the hand holds shut, so the front end opens. A real jaw
  // turns about its spring, but scanned arms often touch along their whole length, and a turn about
  // the middle would push the back end through the parent.
  const pivot = add(add(pair.centre, scale(AXIS[long], back * pair.half[long])), scale(pair.out, -pair.half[pair.axis]));
  const turnAxis = AXIS[axes.find((a) => a !== long && a !== pair.axis)!];
  // Positive turns lift the front end away from the parent when the front's turning direction points out.
  const arm = sub(add(pair.centre, scale(AXIS[long], -back * pair.half[long])), pivot);
  const velocity = vec(turnAxis.y * arm.z - turnAxis.z * arm.y, turnAxis.z * arm.x - turnAxis.x * arm.z, turnAxis.x * arm.y - turnAxis.y * arm.x);
  const open = velocity.x * pair.out.x + velocity.y * pair.out.y + velocity.z * pair.out.z > 0 ? 1 : -1;
  const degPerMm = Math.atan(2 / length) * (180 / Math.PI);
  return {
    kind: "jaw",
    move: (mm) => ({ turns: [{ axis: turnAxis, pivot, deg: open * degPerMm * mm }] }),
    hand: { at: add(add(pair.centre, scale(AXIS[long], back * 0.8 * pair.half[long])), scale(pair.out, pair.half[pair.axis] + 2)), dir: press },
  };
}

const PRESS = 700;
const HOLD = 500;
const POP = 500;
const TAIL = 600;

/** The hand presses as far as it can, holds, and lets go. */
function pressRelease(pair: Pair, motion: Motion, ctx: TestCtx, k: number, verdict: Run["verdict"], judge: "press" | "release"): Run {
  const depth = pressedMm(k);
  const back = springsBack(k);
  const hand = arrowMark("hand", motion.hand.at, motion.hand.dir, pair.child.id);
  const at = (mm: number) => carry(pair, ctx.present, motion.move(mm));
  const letGo = PRESS + HOLD;
  const jaw = motion.kind === "jaw";
  return {
    verdict,
    durationMs: letGo + POP + TAIL,
    at: (ms) => {
      if (ms < PRESS) return overlay(`Pressed ${(depth * smooth(ms / PRESS)).toFixed(1)} of ${TRAVEL} mm`, at(depth * smooth(ms / PRESS)), [hand]);
      if (ms < letGo) return overlay(depth < TRAVEL ? `Stuck at ${depth} of ${TRAVEL} mm` : `Pressed ${TRAVEL} of ${TRAVEL} mm`, at(depth), [hand]);
      const p = easeOut(clamp01((ms - letGo) / POP));
      if (back) return overlay(jaw ? "Let go · snaps shut" : "Let go · springs back", at(depth * (1 - p)));
      return overlay(judge === "release" ? (jaw ? "Let go · stays open" : "Let go · stays in") : "Let go", at(depth - Math.min(1, depth) * p));
    },
  };
}

export const springTemplate: Template = {
  joints: ["spring"],
  primitive: "spring",
  module: (pair: Pair) => {
    const { childName: child, parentName: parent } = pair;
    const motion = motionOf(pair);
    const jaw = motion.kind === "jaw";
    const release = `Release · ${pair.noun}`;
    const press = `Press · ${pair.noun}`;
    const stuck = jaw ? "stays open" : "stays in";
    return {
      id: "spring",
      title: jaw ? `Spring the ${child} shut` : `Spring back the ${child}`,
      need: jaw
        ? `The ${child} must open when you press its back end, and the spring must shut it again when you let go.`
        : `The ${child} must spring back after a press, and still press in by hand.`,
      primitive: "spring",
      produces: pair.produces,
      assemble: {
        piece: "Spring",
        title: `Fit the spring between the ${child} and the ${parent}.`,
        built: jaw
          ? `The spring now pushes the back ends of the ${child} and the ${parent} apart, which closes their front ends together.`
          : `The spring now pushes the ${child} back out from the ${parent}.`,
      },
      target: targetOf(pair),
      enter: scale(pair.out, 50),
      fault: { primitive: "spring", slider: "stiffness", start: 1 },
      fix: { window: WINDOW },
      tests: [
        {
          id: "spring-release",
          label: release,
          run: (values, ctx) => {
            const k = stiffnessOf(values);
            const detail = `The spring pushes ${pushOf(k)} N and friction holds with ${FRICTION} N.`;
            const ok = springsBack(k);
            const line = ok
              ? `The ${child} ${jaw ? "snapped shut" : "sprang back"}. ${detail}`
              : `The ${child} ${jaw ? "stayed open" : "stayed in"}. ${detail}`;
            return pressRelease(pair, motion, ctx, k, { pass: ok, line }, "release");
          },
        },
        {
          id: "spring-press",
          label: press,
          run: (values, ctx) => {
            const k = stiffnessOf(values);
            const depth = pressedMm(k);
            return pressRelease(
              pair,
              motion,
              ctx,
              k,
              depth >= TRAVEL
                ? { pass: true, line: `It pressed all ${TRAVEL} mm with ${pushOf(k)} N, under the ${HAND} N a hand gives.` }
                : {
                    pass: false,
                    line: `It went only ${depth} of ${TRAVEL} mm${jaw ? ", so it opened only partway" : ""}. Full travel takes ${pushOf(k)} N and a hand gives about ${HAND} N.`,
                    nudge: "The spring is far too stiff for a hand.",
                  },
              "press",
            );
          },
        },
      ],
      hints: {
        observe: `Run ${release} and watch the ${child}. After the press it ${stuck}.`,
        principle: `A spring pushes back with F = k × x: stiffness times how far it is squeezed. Here a press squeezes it ${TRAVEL} mm, and its push has to beat ${FRICTION} N of friction to ${jaw ? `shut the ${child} again` : `bring the ${child} back`}.`,
        direction: `Stiffen it, but not too far: you press against the same spring. Check ${release} and ${press} together.`,
        low: `The spring loses to friction, and the ${child} ${stuck}.`,
        high: `Full travel takes more than the ${HAND} N a hand gives.`,
      },
      suspect: pair.child.id,
      misses: { [pair.parent.id]: `The ${parent} holds still. Watch the part that should ${jaw ? "shut" : "come back"} during ${release}.` },
      missDefault: `That part does not move during ${release}. Watch which one ${stuck}.`,
      uses: {
        spring: jaw
          ? `The spring between the ${child} and the ${parent}. It pushes the ${child} shut when you let go.`
          : `The spring between the ${child} and the ${parent}. It pushes the ${child} back after you press.`,
      },
      task: "Find a spring that returns but still presses.",
      why: jaw
        ? `A spring stores the work of your press and gives it back when you let go: it pushes the back ends apart, so the front ends close. Its push has to beat friction or the ${child} ${stuck}, and you press against that same push every time, so stiffness is a trade between the two.`
        : `A spring stores the work of your press and gives it back when you let go. Its push has to beat friction or the ${child} ${stuck}, and you press against that same push every time, so stiffness is a trade between the two.`,
      gameNote: `Game numbers: a press squeezes the spring ${TRAVEL} mm, friction holds with ${FRICTION} N, and a hand presses up to ${HAND} N. None of them is measured from the ${pair.objectName}. F = k × x is real.${jaw ? ` The back end is drawn staying put while the front end opens; a real one turns about its spring, so the back end moves too.` : ""}`,
      readoutWith: (k) => ({ force: Math.round(k * TRAVEL) }),
      numbers: (v) => {
        const k = stiffnessOf(v);
        return [
          { label: "Spring push", value: `${k} N/mm × ${TRAVEL} mm = ${pushOf(k)} N (friction ${FRICTION} N)` },
          { label: "Press", value: `${pushOf(k)} N for full travel (a hand gives ${HAND} N)` },
        ];
      },
    };
  },
};
