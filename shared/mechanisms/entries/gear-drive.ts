import type { KnownMechanism } from "../types.ts";

export const gearDrive: KnownMechanism = {
  id: "gear-drive",
  name: "Gear drive",
  does: "Turning a big toothed wheel spins a smaller one faster, meshed directly or through a chain",
  slots: [
    { id: "crank", is: "the part turned by hand or foot", default: "the handle" },
    { id: "output", is: "what the small toothed wheel spins", default: "the shaft" },
  ],
  subfunctions: [
    {
      id: "speed",
      does: "Spin {output} faster than {crank}",
      primitive: "gear",
      row: {
        why: "{crank} turns a big toothed wheel that drives a small one, so {output} spins faster but less strongly.",
        need: "The small wheel small enough to spin {output} fast, big enough that {crank} turns easily.",
        missing: "{crank} spins round freely, and {output} stays still.",
        little: "{output} whirls free but stalls once loaded; {crank} feels heavy.",
        much: "{crank} spins easily, but {output} creeps round, hardly faster than it.",
      },
    },
  ],
  path: ["{=crank}", "Big toothed wheel", "Small toothed wheel", "{=output}"],
  steps: [
    { format: "who", sub: "speed" },
    { format: "much", sub: "speed" },
  ],
  fits: [
    { object: "hand whisk", words: { crank: "the handle", output: "the beater" } },
    { object: "salad spinner", words: { crank: "the handle", output: "the basket" } },
    { object: "bike", words: { crank: "the crank", output: "the back wheel" } },
  ],
};
