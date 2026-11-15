import type { KnownMechanism } from "../types.ts";

export const ballTip: KnownMechanism = {
  id: "ball-tip",
  name: "Ball tip",
  does: "A ball in a socket rolls a thin coat of liquid onto a surface, and plugs the opening when still",
  slots: [
    { id: "fluid", is: "the ink or liquid it puts down", default: "the ink" },
    { id: "surface", is: "what the ball rolls over", default: "the paper" },
  ],
  subfunctions: [
    {
      id: "close",
      does: "Keep {fluid} in while the ball is still",
      primitive: "seal",
      row: {
        why: "The ball sits in a socket that fits it closely, so only the thin coat on its surface gets past.",
        need: "Fitted closely enough to hold {fluid} back, loosely enough for the ball to turn freely.",
        missing: "{fluid} runs straight out of the open tube and pools on {surface}.",
        little: "{fluid} seeps round the ball and leaves blobs along the line.",
        much: "The ball is pinched and cannot turn, so nothing comes out.",
      },
    },
    {
      id: "roll",
      does: "Turn the ball as it crosses {surface}",
      primitive: "grip",
      row: {
        why: "{surface} rubs the ball as the tip moves, turning it so its wet side comes round to the front.",
        need: "Pressed hard enough for {surface} to turn the ball, lightly enough not to dig in.",
        missing: "The ball slides over {surface} without turning, and its wet side never comes round.",
        little: "The ball turns in fits, and the line comes out broken.",
        much: "The tip digs a groove in {surface} and drags.",
      },
    },
  ],
  path: ["Hand", "Tip", "Ball", "{=fluid}", "{=surface}"],
  steps: [
    { format: "who", sub: "close" },
    { format: "much", sub: "roll" },
    {
      format: "break",
      failure: "Make the line skip",
      causes: [
        { sub: "roll", fault: "little" },
        { sub: "close", fault: "much" },
      ],
    },
  ],
  fits: [
    { object: "ballpoint pen", words: { fluid: "the ink", surface: "the paper" } },
    { object: "roll-on deodorant", words: { fluid: "the deodorant", surface: "the skin" } },
    { object: "roller lip gloss", words: { fluid: "the gloss", surface: "the lip" } },
  ],
};
