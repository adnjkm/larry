// A spring joint pushes the child back out after a press. Too soft and friction keeps it in; too
// stiff and a hand cannot press it all the way.
import { clamp01, easeOut, smooth } from "../ease.ts";
import type { Run, TestCtx, Values, Window } from "../model.ts";
import { arrowMark, carry, farFace, outBy, overlay, type Pair, scale, targetOf, type Template, tenth } from "./pair.ts";

/** Stiffness in N/mm. Game numbers. */
const WINDOW: Window = [1.3, 3];
/** How far a full press squeezes the spring, in mm. */
const TRAVEL = 10;
const FRICTION = 12;
const HAND = 30;

const stiffnessOf = (v: Values) => tenth(v.stiffness ?? 2);
/** Spring push at full travel, F = k × x. */
const pushOf = (k: number) => tenth(k * TRAVEL);
const springsBack = (k: number) => pushOf(k) > FRICTION;
const pressedMm = (k: number) => Math.min(TRAVEL, tenth(HAND / k));

const PRESS = 700;
const HOLD = 500;
const POP = 500;
const TAIL = 600;

/** The hand presses the child in as far as it can, holds, and lets go. */
function pressRelease(pair: Pair, ctx: TestCtx, k: number, verdict: Run["verdict"], judge: "press" | "release"): Run {
  const depth = pressedMm(k);
  const back = springsBack(k);
  const hand = arrowMark("hand", farFace(pair), scale(pair.out, -1), pair.child.id);
  const at = (mm: number) => carry(pair, ctx.present, outBy(pair, -mm));
  const letGo = PRESS + HOLD;
  return {
    verdict,
    durationMs: letGo + POP + TAIL,
    at: (ms) => {
      if (ms < PRESS) return overlay(`Pressed ${(depth * smooth(ms / PRESS)).toFixed(1)} of ${TRAVEL} mm`, at(depth * smooth(ms / PRESS)), [hand]);
      if (ms < letGo) return overlay(depth < TRAVEL ? `Stuck at ${depth} of ${TRAVEL} mm` : `Pressed ${TRAVEL} of ${TRAVEL} mm`, at(depth), [hand]);
      const p = easeOut(clamp01((ms - letGo) / POP));
      if (back) return overlay("Let go · springs back", at(depth * (1 - p)));
      return overlay(judge === "release" ? "Let go · stays in" : "Let go", at(depth - Math.min(1, depth) * p));
    },
  };
}

export const springTemplate: Template = {
  joints: ["spring"],
  primitive: "spring",
  module: (pair: Pair) => {
    const { childName: child, parentName: parent } = pair;
    return {
      id: "spring",
      title: `Spring back the ${child}`,
      need: `The ${child} must spring back after a press, and still press in by hand.`,
      primitive: "spring",
      produces: pair.produces,
      assemble: {
        piece: "Spring",
        title: `Fit the spring between the ${child} and the ${parent}.`,
        built: `The spring now pushes the ${child} back out from the ${parent}.`,
      },
      target: targetOf(pair),
      enter: scale(pair.out, 50),
      fault: { primitive: "spring", slider: "stiffness", start: 1 },
      fix: { window: WINDOW },
      tests: [
        {
          id: "spring-release",
          label: "Release",
          run: (values, ctx) => {
            const k = stiffnessOf(values);
            const detail = `The spring pushes ${pushOf(k)} N and friction holds with ${FRICTION} N.`;
            return pressRelease(pair, ctx, k, springsBack(k) ? { pass: true, line: `The ${child} sprang back. ${detail}` } : { pass: false, line: `The ${child} stayed in. ${detail}` }, "release");
          },
        },
        {
          id: "spring-press",
          label: "Press",
          run: (values, ctx) => {
            const k = stiffnessOf(values);
            const depth = pressedMm(k);
            return pressRelease(pair, ctx, k, depth >= TRAVEL
              ? { pass: true, line: `It pressed all ${TRAVEL} mm with ${pushOf(k)} N, under the ${HAND} N a hand gives.` }
              : { pass: false, line: `It went in only ${depth} of ${TRAVEL} mm. Full travel takes ${pushOf(k)} N and a hand gives about ${HAND} N.`, nudge: "The spring is far too stiff for a hand." }, "press");
          },
        },
      ],
      hints: {
        observe: `Run Release and watch the ${child}. After the press it stays in.`,
        principle: `A spring pushes back with F = k × x: stiffness times how far it is squeezed. Here a press squeezes it ${TRAVEL} mm, and its push has to beat ${FRICTION} N of friction to bring the ${child} back.`,
        direction: `Stiffen it, but not too far: you press against the same spring. Check Release and Press together.`,
        low: `The spring loses to friction, and the ${child} stays in.`,
        high: `Full travel takes more than the ${HAND} N a hand gives.`,
      },
      suspect: pair.child.id,
      misses: { [pair.parent.id]: `The ${parent} holds still. Watch the part that should come back during Release.` },
      missDefault: "That part does not move during Release. Watch which one stays in.",
      why: `A spring stores the work of your press and gives it back when you let go. Its push has to beat friction or the ${child} stays in, and you press against that same push every time, so stiffness is a trade between the two.`,
      gameNote: `Game numbers: a press squeezes the spring ${TRAVEL} mm, friction holds with ${FRICTION} N, and a hand presses up to ${HAND} N. None of them is measured from the ${pair.objectName}. F = k × x is real.`,
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
