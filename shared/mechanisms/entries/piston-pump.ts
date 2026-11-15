import type { KnownMechanism } from "../types.ts";

export const pistonPump: KnownMechanism = {
  id: "piston-pump",
  name: "Piston pump",
  does: "A plug pushed along a tube squeezes the air or liquid ahead of it out of a nozzle each stroke",
  slots: [
    { id: "push", is: "the part the hand presses", default: "the plunger" },
    { id: "tube", is: "the tube the plug slides in", default: "the barrel" },
    { id: "fluid", is: "the air or liquid pushed out", default: "the liquid" },
  ],
  subfunctions: [
    {
      id: "squeeze",
      does: "Squeeze {fluid} out as {push} goes in",
      primitive: "piston",
      row: {
        why: "A plug fills {tube}, so pressing {push} squeezes {fluid} until it is driven out.",
        need: "A plug wide enough to send out enough with each stroke, narrow enough to press by hand.",
        missing: "{push} goes in, but {fluid} inside does not move and nothing comes out.",
        little: "{push} moves easily, but each stroke sends out only a little, so it takes many strokes.",
        much: "{push} needs a hard shove each stroke, though a big gush comes out.",
      },
    },
  ],
  path: ["Hand", "{=push}", "Plug", "{=fluid}", "Nozzle"],
  steps: [{ format: "much", sub: "squeeze" }, { format: "trace" }],
  fits: [
    { object: "syringe", words: { push: "the plunger", tube: "the barrel", fluid: "the medicine" } },
    { object: "bike pump", words: { push: "the handle", tube: "the barrel", fluid: "the air" } },
    { object: "soap pump", words: { push: "the pump head", tube: "the pump chamber", fluid: "the soap" } },
  ],
};
