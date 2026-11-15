import type { KnownMechanism } from "../types.ts";

export const zipSlider: KnownMechanism = {
  id: "zip-slider",
  name: "Zip slider",
  does: "A slider's narrowing channel presses two rows of teeth together, and a post inside pries them apart going back",
  slots: [
    { id: "pull", is: "the tab the hand pulls", default: "the zip pull" },
    { id: "opening", is: "what the zip closes", default: "the bag" },
  ],
  subfunctions: [
    {
      id: "close-rows",
      does: "Press the two rows of teeth together",
      primitive: "wedge",
      row: {
        why: "The slider's channel narrows like a V, so a light pull along the zip becomes a strong squeeze pressing the rows together.",
        need: "Narrowing gently enough to pull with a finger, sharply enough to press each tooth fully home.",
        missing: "The slider runs along, but the two rows stay apart and {opening} stays open.",
        little: "{opening} zips shut easily, but the teeth hook only loosely and burst apart when tugged.",
        much: "The slider takes a hard tug to close, and teeth jam and buckle inside it.",
      },
    },
    {
      id: "open-rows",
      does: "Pry the rows apart on the way back",
      primitive: "wedge",
      row: {
        why: "A pointed post between the slider's two mouths drives in between the rows, turning a light pull into a strong push apart.",
        need: "A post pointed enough to slip in with a light pull, wide enough to unhook every tooth.",
        missing: "The slider runs back freely, but {opening} stays zipped shut behind it.",
        little: "The slider runs back easily, but the teeth part only halfway and snag.",
        much: "The slider takes a hard tug to open, catching on each tooth as it goes.",
      },
    },
  ],
  path: ["Hand", "{=pull}", "Slider", "Teeth", "{=opening}"],
  steps: [
    { format: "who", sub: "close-rows" },
    { format: "much", sub: "open-rows" },
    {
      format: "break",
      failure: "Make the slider hard to pull",
      causes: [
        { sub: "close-rows", fault: "much" },
        { sub: "open-rows", fault: "much" },
      ],
    },
  ],
  fits: [
    { object: "backpack", words: { pull: "the zip pull", opening: "the backpack" } },
    { object: "jacket", words: { pull: "the pull tab", opening: "the jacket" } },
    { object: "pencil case", words: { pull: "the zip pull", opening: "the pencil case" } },
  ],
};
