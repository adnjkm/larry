import type { KnownMechanism } from "../types.ts";

export const camClamp: KnownMechanism = {
  id: "cam-clamp",
  name: "Cam clamp",
  does: "Flipping a short handle turns an off-centre end that squeezes something tight and holds it there",
  slots: [
    { id: "flip", is: "the part the thumb flips shut", default: "the handle" },
    { id: "held", is: "what gets squeezed tight", default: "the clamped part" },
  ],
  subfunctions: [
    {
      id: "squeeze",
      does: "Squeeze {held} as {flip} turns",
      primitive: "cam",
      row: {
        why: "{flip} pivots off-centre, so its end rises slowly to squeeze {held} hard, then rests just past its peak.",
        need: "Rising far enough to clamp {held} firmly, not so far that it jams before {flip} shuts.",
        missing: "{flip} flops round with no squeeze anywhere, and {held} stays loose.",
        little: "{flip} shuts with a light press, but {held} still moves when pushed.",
        much: "{flip} jams partway and will not shut, however hard it is pushed.",
      },
    },
    {
      id: "close",
      does: "Close the squeeze with one hand",
      primitive: "lever",
      row: {
        why: "{flip} is long and its off-centre end is short, so the hand moves far and the end pushes hard.",
        need: "{flip} long enough to shut by hand, short enough to tuck in close once shut.",
        missing: "With nothing to grip but the short end, fingers cannot turn it tight.",
        little: "{flip} needs a hard shove with the palm, then shuts and holds firm.",
        much: "{flip} swings a long way round and sticks out, catching on things.",
      },
    },
  ],
  path: ["Hand", "{=flip}", "Off-centre end", "{=held}"],
  steps: [
    { format: "who", sub: "squeeze" },
    { format: "much", sub: "close" },
    {
      format: "break",
      failure: "Make {flip} hard to shut",
      causes: [
        { sub: "squeeze", fault: "much" },
        { sub: "close", fault: "little" },
      ],
    },
  ],
  fits: [
    { object: "bike quick release", words: { flip: "the handle", held: "the wheel" } },
    { object: "bike pump head", words: { flip: "the flip handle", held: "the valve" } },
    { object: "tripod leg lock", words: { flip: "the flip lock", held: "the leg" } },
  ],
};
