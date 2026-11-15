import type { KnownMechanism } from "../types.ts";

export const shearBlades: KnownMechanism = {
  id: "shear-blades",
  name: "Shearing blades",
  does: "Two blades on one pivot slide past each other and cut what lies between them when the handles are squeezed",
  slots: [{ id: "material", is: "what is being cut", default: "the paper" }],
  subfunctions: [
    {
      id: "shear",
      does: "Part {material} along one thin line",
      primitive: "wedge",
      row: {
        why: "Each blade is ground to a thin edge, so the squeeze lands on one line and {material} parts along it.",
        need: "An edge keen enough to part {material} cleanly, sturdy enough not to nick or fold over.",
        missing: "Rounded blades fold {material} between them and chew it instead of cutting.",
        little: "The cut is clean at first, then the thin edges nick and it turns ragged.",
        much: "Even a thin piece is crushed and bent before it parts.",
      },
    },
    {
      id: "leverage",
      does: "Bite harder than a bare squeeze can",
      primitive: "lever",
      row: {
        why: "Each blade is an arm on the pivot: the nearer the pivot the cut, the harder the same squeeze bites.",
        need: "Handles long enough to cut tough things near the pivot, blades long enough for a long cut each squeeze.",
        missing: "With no handles, fingers on the bare blades cannot close them hard enough to cut.",
        little: "Thin pieces cut in long strokes, but the blades stall on anything thicker.",
        much: "The blades bite through anything, but each squeeze cuts only a short way.",
      },
    },
  ],
  path: ["Hand", "Handles", "Pivot", "Blades", "{=material}"],
  steps: [
    { format: "who", sub: "shear" },
    { format: "much", sub: "leverage" },
    { format: "broke", sub: "shear", fault: "much" },
  ],
  fits: [
    { object: "scissors", words: { material: "the paper" } },
    { object: "kitchen shears", words: { material: "the string" } },
    { object: "garden pruners", words: { material: "the stem" } },
  ],
};
