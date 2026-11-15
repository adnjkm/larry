import type { KnownMechanism } from "../types.ts";

export const ratchetWind: KnownMechanism = {
  id: "ratchet-wind",
  name: "One-way click",
  does: "A part moves freely one way, clicking over a row of teeth, and locks against moving the other way",
  slots: [
    { id: "part", is: "the part that clicks one way", default: "the handle" },
    { id: "load", is: "what it tightens or turns", default: "the load" },
  ],
  subfunctions: [
    {
      id: "one-way",
      does: "Let {part} move one way, never back",
      primitive: "ratchet",
      row: {
        why: "A sprung tooth rides up the sloped backs of the teeth one way, and catches on their square faces the other.",
        need: "Teeth close enough to catch after a small slip back, big enough not to skip when forced hard.",
        missing: "{part} moves freely both ways, so {load} is never tightened.",
        little: "{part} must go back a long way before it catches, so tightening goes in big jumps.",
        much: "{part} clicks in tiny steps, but forced hard, the small teeth skip and it slips.",
      },
    },
  ],
  path: ["Hand", "{=part}", "Teeth", "{=load}"],
  steps: [
    { format: "much", sub: "one-way" },
    { format: "break", failure: "Make tightening go in big jumps", causes: [{ sub: "one-way", fault: "little" }] },
  ],
  fits: [
    { object: "cable tie", words: { part: "the strap", load: "the bundle" } },
    { object: "socket wrench", words: { part: "the handle", load: "the bolt" } },
    { object: "ratchet screwdriver", words: { part: "the handle", load: "the screw" } },
  ],
};
