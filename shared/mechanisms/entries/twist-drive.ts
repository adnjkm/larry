import type { KnownMechanism } from "../types.ts";

export const twistDrive: KnownMechanism = {
  id: "twist-drive",
  name: "Twist drive",
  does: "Twisting one part drives another straight along inside it, so a stick, tip or jaw moves and stays put",
  slots: [
    { id: "turner", is: "the part the hand twists", default: "the knob" },
    { id: "mover", is: "the part pushed along inside", default: "the stick" },
  ],
  subfunctions: [
    {
      id: "drive",
      does: "Drive {mover} along as {turner} turns",
      primitive: "thread",
      row: {
        why: "A spiral ramp turns a long twist of {turner} into a short push on {mover}, and friction holds it there.",
        need: "A ramp gentle enough that {mover} holds firm when pressed, steep enough to move it far in a short twist.",
        missing: "{turner} spins round freely and {mover} does not move at all.",
        little: "{turner} takes turn after turn to move {mover} a short way.",
        much: "{mover} moves far for a small twist, then is pushed back by whatever it presses on.",
      },
    },
  ],
  path: ["Hand", "{=turner}", "Spiral", "{=mover}"],
  steps: [
    { format: "who", sub: "drive" },
    { format: "much", sub: "drive" },
  ],
  fits: [
    { object: "glue stick", words: { turner: "the base", mover: "the glue" } },
    { object: "lip balm", words: { turner: "the bottom dial", mover: "the balm" } },
    { object: "twist pen", words: { turner: "the barrel", mover: "the refill" } },
  ],
};
