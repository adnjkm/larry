import type { KnownMechanism } from "../types.ts";

export const frictionHold: KnownMechanism = {
  id: "friction-hold",
  name: "Friction hold",
  does: "A tight fit or pressed surfaces hold a part wherever it is left, yet let a firm push move it",
  slots: [
    { id: "part", is: "the part that stays where it is left", default: "the arm" },
    { id: "holder", is: "the tight joint or fit it moves in", default: "the joint" },
  ],
  subfunctions: [
    {
      id: "hold",
      does: "Keep {part} wherever it is left",
      primitive: "grip",
      row: {
        why: "{holder} is pressed tight, so friction holds {part} still against knocks but lets a firm push move it.",
        need: "Pressed tight enough that {part} stays put when bumped, loose enough to move with an easy push.",
        missing: "{part} swings or slides freely and will not stay where it is left.",
        little: "{part} stays at first, then shifts at the lightest bump.",
        much: "{part} only moves with a hard push, dragging everything else along with it.",
      },
    },
  ],
  path: ["Hand", "{=part}", "{=holder}"],
  steps: [
    { format: "who", sub: "hold" },
    { format: "much", sub: "hold" },
  ],
  fits: [
    { object: "laptop", words: { part: "the screen", holder: "the hinge" } },
    { object: "glasses", words: { part: "the arm", holder: "the hinge" } },
    { object: "matchbox", words: { part: "the tray", holder: "the sleeve" } },
  ],
};
