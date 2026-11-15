import type { KnownMechanism } from "../types.ts";

export const screwClosure: KnownMechanism = {
  id: "screw-closure",
  name: "Screw closure",
  does: "A cap, lid or ring twists on to close or join, and stays on",
  slots: [
    { id: "closure", is: "the part that twists on", default: "the cap" },
    { id: "opening", is: "what it twists onto", default: "the neck" },
  ],
  subfunctions: [
    {
      id: "hold-on",
      does: "Hold {closure} down on {opening}",
      primitive: "thread",
      row: {
        why: "The ridge is a ramp wound round {opening}, so an easy twist becomes a hard pull down, and friction keeps it there.",
        need: "A ramp shallow enough to stay put when shaken, steep enough to close in a turn or two.",
        missing: "{closure} sits loose and lifts straight off at the first knock.",
        little: "{closure} needs turn after turn before it comes free.",
        much: "{closure} spins on in half a turn, then backs off by itself when shaken.",
      },
    },
  ],
  path: ["Hand", "{=closure}", "Thread ridge", "{=opening}"],
  steps: [
    { format: "who", sub: "hold-on" },
    { format: "much", sub: "hold-on" },
  ],
  fits: [
    { object: "water bottle", words: { closure: "the cap", opening: "the neck" } },
    { object: "mason jar", words: { closure: "the screw ring", opening: "the jar's rim" } },
    { object: "toothpaste tube", words: { closure: "the cap", opening: "the nozzle" } },
  ],
};
