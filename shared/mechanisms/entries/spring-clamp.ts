import type { KnownMechanism } from "../types.ts";

export const springClamp: KnownMechanism = {
  id: "spring-clamp",
  name: "Spring clamp",
  does: "Jaws squeeze shut by themselves on what they hold, and open when the handles are pinched",
  slots: [
    { id: "clip", is: "the whole clamp", default: "the clip" },
    { id: "item", is: "what the jaws hold", default: "the item" },
  ],
  subfunctions: [
    {
      id: "squeeze",
      does: "Squeeze {item} between the jaws",
      primitive: "spring",
      row: {
        why: "A spring already bent at rest presses the jaws together, so {clip} closes on {item} by itself.",
        need: "A spring stiff enough to hold {item} against a tug, soft enough to pinch open with one hand.",
        missing: "{clip} flops open, and {item} slides straight out.",
        little: "The jaws close, but {item} slides out at a light tug.",
        much: "The jaws bite hard enough to dent {item}, and the handles take a hard squeeze.",
      },
    },
    {
      id: "open",
      does: "Open the jaws when the handles are pinched",
      primitive: "lever",
      row: {
        why: "Handles and jaws sit either side of a pivot, so pinching the handles swings the jaws apart; longer handles make it lighter.",
        need: "Handles long enough to open with an easy pinch, short enough that a small pinch opens the jaws wide.",
        missing: "With no handles, the jaws open only if you pry their tips apart with your nails.",
        little: "The handles take a hard squeeze but barely move, and {item} is gripped no tighter.",
        much: "The handles travel a long way in before the jaws open wide enough for {item}.",
      },
    },
  ],
  path: ["Hand", "Handles", "Spring", "Jaws", "{=item}"],
  steps: [
    { format: "broke", sub: "squeeze", fault: "little" },
    { format: "much", sub: "open" },
    {
      format: "break",
      failure: "Make the handles hard to squeeze",
      causes: [
        { sub: "squeeze", fault: "much" },
        { sub: "open", fault: "little" },
      ],
    },
  ],
  fits: [
    { object: "clothes peg", words: { clip: "the peg", item: "the shirt" } },
    { object: "binder clip", words: { clip: "the binder clip", item: "the paper" } },
    { object: "claw hair clip", words: { clip: "the claw clip", item: "the hair" } },
  ],
};
