// A press-fit holds by grip: friction up to μ times the squeeze. Too loose and a pull slides the
// child off; too tight and a hand cannot push it on.
import type { Values, Window } from "../model.ts";
import { pullOff, pushOn } from "./motions.ts";
import { type Pair, scale, targetOf, type Template, tenth } from "./pair.ts";

/** Squeeze on each side, in newtons. Game numbers, with μ as in Learn. */
const WINDOW: Window = [20, 40];
const MU = 0.4;
const PULL = 16;
const HAND = 32;

const squeezeOf = (v: Values) => v.squeeze ?? 30;
const limitOf = (squeeze: number) => tenth(MU * 2 * squeeze);
/** Compared in whole newtons times ten so 0.4 × 2 × 20 lands exactly on 16. */
const holds = (squeeze: number) => Math.round(MU * 20 * squeeze) >= PULL * 10;
const fits = (squeeze: number) => Math.round(MU * 20 * squeeze) <= HAND * 10;

export const pressFitTemplate: Template = {
  joints: ["press-fit"],
  primitive: "grip",
  module: (pair: Pair) => {
    const { childName: child, parentName: parent } = pair;
    const pullTest = `Pull · ${pair.noun}`;
    const pushOnTest = `Push on · ${pair.noun}`;
    return {
      id: "press-fit",
      title: `Press on the ${child}`,
      need: `The ${child} must push onto the ${parent} by hand and stay on when pulled.`,
      primitive: "grip",
      produces: pair.produces,
      assemble: {
        piece: "Grip pads",
        title: `Press the grip into the joint: it holds the ${child} on the ${parent}.`,
        built: `The grip is now the tight fit between the ${child} and the ${parent}.`,
      },
      target: targetOf(pair),
      enter: scale(pair.out, 50),
      fault: { primitive: "grip", slider: "squeeze", start: 12 },
      fix: { window: WINDOW },
      tests: [
        {
          id: "grip-pull",
          label: pullTest,
          run: (values, ctx) => {
            const s = squeezeOf(values);
            const ok = holds(s);
            return pullOff(pair, ctx, ok
              ? { pass: true, line: `The ${child} held under a ${PULL} N pull. The grip holds up to ${limitOf(s)} N.` }
              : { pass: false, line: `The ${child} slid off under a ${PULL} N pull. The grip let go at ${limitOf(s)} N.` },
            ok, { pulling: `Pulling ${PULL} N`, held: "Held", off: "Slid off" });
          },
        },
        {
          id: "grip-fit",
          label: pushOnTest,
          run: (values, ctx) => {
            const s = squeezeOf(values);
            const ok = fits(s);
            return pushOn(pair, ctx, ok
              ? { pass: true, line: `It pushed on with ${limitOf(s)} N, under the ${HAND} N a hand gives.` }
              : { pass: false, line: `It would not go on. It takes ${limitOf(s)} N and a hand pushes about ${HAND} N.`, nudge: "The grip is far too tight for a hand." },
            ok, { pushing: `Pushing on`, seated: "Seated", stuck: `Needs ${limitOf(s)} N` });
          },
        },
      ],
      hints: {
        observe: `Run ${pullTest} and watch the ${child}. It slides off the ${parent} under the load.`,
        principle: `A press-fit holds by grip: friction up to μ times the squeeze. Here μ = ${MU} and the squeeze presses on two sides, so it holds up to ${MU * 2} × squeeze. Pushing it on by hand has to beat the same friction.`,
        direction: `Squeeze harder so the grip beats the ${PULL} N pull, but keep it light enough to push on with ${HAND} N. Check ${pullTest} and ${pushOnTest} together.`,
        low: `The grip is under the pull, and the ${child} slides off.`,
        high: `Pushing it on takes more than a hand gives.`,
      },
      suspect: pair.child.id,
      misses: { [pair.parent.id]: `The ${parent} holds still. Watch the part that slides during ${pullTest}.` },
      missDefault: `That part does not move during ${pullTest}. Watch which one slides.`,
      why: `A press-fit is a grip. The tighter the fit, the harder the surfaces press, and friction holds up to μ times that squeeze. The same friction is what you fight to push it on, so a fit tight enough to stay on must still be loose enough for a hand.`,
      gameNote: `Game numbers: a ${PULL} N pull and a ${HAND} N hand push, with μ = ${MU} as in Learn. None of them is measured from the ${pair.objectName}. A real press-fit's squeeze comes from the part being slightly bigger than its seat, not from a dial.`,
      readoutWith: () => ({ load: PULL }),
      numbers: (v) => {
        const s = squeezeOf(v);
        return [
          { label: "Holds up to", value: `${MU} × 2 × ${s} N = ${limitOf(s)} N (pull ${PULL} N)` },
          { label: "Push to fit", value: `${limitOf(s)} N (a hand gives ${HAND} N)` },
        ];
      },
    };
  },
};
