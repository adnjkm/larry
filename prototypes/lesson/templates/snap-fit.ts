// A snap-fit is a catch: a wedge held out by a spring. Too weak and a tug pops the child off; too
// strong and a finger cannot unclip it.
import type { Values, Window } from "../model.ts";
import { pullOff } from "./motions.ts";
import { type Pair, scale, targetOf, type Template } from "./pair.ts";

/** Release force in newtons. Game numbers. */
const WINDOW: Window = [6, 14];
const TUG = 5;
const FINGER = 20;
/** The catch in Learn needs this much more than its release force at the peak, as the bolt is pushed further in. */
const PEAK_EXTRA = 6;

const forceOf = (v: Values) => v.force ?? 10;

export const snapFitTemplate: Template = {
  joints: ["snap-fit"],
  primitive: "catch",
  module: (pair: Pair) => {
    const { childName: child, parentName: parent } = pair;
    const tugTest = `Tug · ${pair.noun}`;
    const unclipTest = `Unclip · ${pair.noun}`;
    return {
      id: "snap-fit",
      title: `Clip on the ${child}`,
      need: `The ${child} must stay clipped to the ${parent} when tugged, and unclip by hand.`,
      primitive: "catch",
      produces: pair.produces,
      assemble: {
        piece: "Catch",
        title: `Fit the catch between the ${child} and the ${parent}.`,
        built: `The catch now clips the ${child} to the ${parent}.`,
      },
      target: targetOf(pair),
      enter: scale(pair.out, 50),
      fault: { primitive: "catch", slider: "force", start: 3 },
      fix: { window: WINDOW },
      tests: [
        {
          id: "catch-tug",
          label: tugTest,
          run: (values, ctx) => {
            const f = forceOf(values);
            const ok = f > TUG;
            return pullOff(
              pair,
              ctx,
              ok
                ? { pass: true, line: `The ${child} stayed clipped under a ${TUG} N tug. The catch lets go at ${f} N.` }
                : { pass: false, line: `The ${child} popped off under a ${TUG} N tug. The catch lets go at ${f} N.` },
              ok,
              { pulling: `Tugging ${TUG} N`, held: "Still clipped", off: "Popped off" },
            );
          },
        },
        {
          id: "catch-unclip",
          label: unclipTest,
          run: (values, ctx) => {
            const f = forceOf(values);
            const peak = f + PEAK_EXTRA;
            const ok = peak <= FINGER;
            return pullOff(
              pair,
              ctx,
              ok
                ? { pass: true, line: `Unclipped by hand. It peaked at ${peak} N, under the ${FINGER} N a finger gives.` }
                : {
                    pass: false,
                    line: `It would not unclip. It peaks at ${peak} N and a finger gives about ${FINGER} N.`,
                    nudge: "The catch is far too strong for a finger.",
                  },
              !ok,
              { pulling: `Unclipping`, held: `Needs ${peak} N`, off: "Unclipped" },
            );
          },
        },
      ],
      hints: {
        observe: `Run ${tugTest} and watch the ${child}. It pops off the ${parent} at the first pull.`,
        principle: `A snap-fit is a catch: a wedge held out by a spring. It holds until a pull beats its release force. Unclipping by hand means pushing past the peak, which in Learn is about ${PEAK_EXTRA} N above the release force.`,
        direction: `Raise the release force above the ${TUG} N tug, and keep the peak under what a finger gives. Check ${tugTest} and ${unclipTest} together.`,
        low: `A light tug pops the ${child} off.`,
        high: `The peak is over the ${FINGER} N a finger gives, so it will not unclip.`,
      },
      suspect: pair.child.id,
      misses: { [pair.parent.id]: `The ${parent} holds still. Watch the part that pops off during ${tugTest}.` },
      missDefault: `That part does not move during ${tugTest}. Watch which one pops off.`,
      uses: { catch: `The clip between the ${child} and the ${parent}. It snaps shut and holds until you pull hard.` },
      task: "Set a catch that holds but still unclips.",
      why: `A snap-fit is a catch. Its sloped face lets the ${child} click on with a light push, and its steep face holds against a pull until the spring behind the wedge gives. A stronger spring holds harder, and is harder to unclip.`,
      gameNote: `Game numbers: a ${TUG} N tug and a ${FINGER} N finger, with the peak ${PEAK_EXTRA} N over the release force as in Learn. None of them is measured from the ${pair.objectName}. A real snap-fit's spring is usually the bent plastic itself.`,
      numbers: (v) => {
        const f = forceOf(v);
        return [
          { label: "Tug", value: `${TUG} N against a ${f} N catch: ${f > TUG ? "it holds" : "it lets go"}` },
          { label: "Unclip", value: `${f} + ${PEAK_EXTRA} = ${f + PEAK_EXTRA} N at the peak (a finger gives ${FINGER} N)` },
        ];
      },
    };
  },
};
