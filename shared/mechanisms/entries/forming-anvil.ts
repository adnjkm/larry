import type { KnownMechanism } from "../types.ts";

export const formingAnvil: KnownMechanism = {
  id: "forming-anvil",
  name: "Forming anvil",
  does: "A curved face meets a pushed fastener at a slant and bends it over to grip",
  slots: [
    { id: "die", is: "the shaped face that does the bending", default: "the anvil" },
    { id: "part", is: "the part that gets bent over", default: "the fastener" },
    { id: "held", is: "what the bent part grips", default: "the material" },
  ],
  subfunctions: [
    {
      id: "bend",
      does: "Bend {part} over onto {held}",
      primitive: "wedge",
      row: {
        why: "{die}'s curve meets {part} at a slant, turning the straight push sideways to roll it over.",
        need: "Curved steeply enough to roll {part} right over, gently enough that it bends without buckling.",
        missing: "Pressed on a flat face, {part} squashes or tips sideways instead of rolling over.",
        little: "{part} bends only partway over and sits loose on {held}.",
        much: "{part} stubs on the steep face and kinks, and closing takes a hard push.",
      },
    },
  ],
  path: ["Hand", "{=part}", "{=die}"],
  steps: [
    { format: "who", sub: "bend" },
    { format: "much", sub: "bend" },
  ],
  fits: [
    { object: "stapler", words: { die: "the anvil", part: "the staple", held: "the paper" } },
    { object: "wire crimper", words: { die: "the crimp die", part: "the terminal", held: "the wire" } },
    { object: "eyelet pliers", words: { die: "the setting tip", part: "the eyelet", held: "the fabric" } },
  ],
};
