import type { KnownMechanism } from "../types.ts";

export const checkValve: KnownMechanism = {
  id: "check-valve",
  name: "Check valve",
  does: "Air or liquid pushed through lifts a flap or plug, and pushing back presses it shut, so none returns",
  slots: [
    { id: "fluid", is: "the air or liquid that passes", default: "the air" },
    { id: "door", is: "the flap or plug that opens and shuts", default: "the flap" },
    { id: "beyond", is: "where it is pushed into and kept", default: "the chamber" },
  ],
  subfunctions: [
    {
      id: "one-way",
      does: "Let {fluid} through one way, never back",
      primitive: "valve",
      row: {
        why: "{fluid} pushing one way lifts {door} off its hole; pushing back, it presses {door} down tighter.",
        need: "{door} held shut firmly enough to close at once, lightly enough to open at an easy push.",
        missing: "{fluid} goes through, then flows straight back out the way it came.",
        little: "{fluid} goes through, then slowly seeps back the way it came.",
        much: "It takes a hard push to force {fluid} past {door} at all.",
      },
    },
  ],
  path: ["{=fluid}", "{=door}", "{=beyond}"],
  steps: [
    { format: "broke", sub: "one-way", fault: "little" },
    { format: "much", sub: "one-way" },
  ],
  fits: [
    { object: "bike tyre", words: { fluid: "the air", door: "the valve pin", beyond: "the tyre" } },
    { object: "neck pillow", words: { fluid: "the air", door: "the flap", beyond: "the pillow" } },
    { object: "air mattress", words: { fluid: "the air", door: "the flap", beyond: "the mattress" } },
  ],
};
