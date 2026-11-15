import type { KnownMechanism } from "../types.ts";

export const clickLatch: KnownMechanism = {
  id: "click-latch",
  name: "Click latch",
  does: "One press latches a part where it was pushed, and the next press lets a spring bring it back",
  slots: [
    { id: "part", is: "the part that is held, then let back", default: "the tip" },
    { id: "button", is: "the part the hand presses", default: "the button" },
  ],
  subfunctions: [
    {
      id: "bring-back",
      does: "Bring {part} back when nothing holds it",
      primitive: "spring",
      row: {
        why: "The press squeezes a spring, which pushes {part} back as soon as nothing holds it.",
        need: "Firm enough to push {part} all the way back every time, soft enough for a light press.",
        missing: "{part} is loose, staying wherever it is pushed, and nothing brings it back.",
        little: "{part} creeps back slowly and comes to rest short of where it began.",
        much: "Every press is hard work, and {part} slams back the instant it is freed.",
      },
    },
    {
      id: "hold",
      does: "Hold {part} where the press left it",
      primitive: "catch",
      row: {
        why: "As the press lets up, a tooth drops into a shallow notch, and the spring itself keeps it seated there.",
        need: "A notch lip high enough to hold through knocks and use, low enough that the next press lifts it out.",
        missing: "{part} springs straight back the moment the press lets up, and never stays.",
        little: "{part} latches, but a light knock sets it free and it springs back.",
        much: "{part} latches easily, but freeing it takes a hard press right to the end.",
      },
    },
    {
      id: "take-turns",
      does: "Free {part} on the next press",
      primitive: "cam",
      row: {
        why: "Sloped faces turn each press into a sideways step, landing the tooth in the notch one time and past it the next.",
        need: "Slopes that step the tooth far enough to clear the notch, yet gentle enough to slide, not stick.",
        missing: "{part} latches on the first press, and no press after that ever frees it.",
        little: "Some presses fail, leaving {part} where it started, and it takes another press.",
        much: "Presses stop dead before they click, and {part} sticks there until jiggled free.",
      },
    },
  ],
  path: ["Hand", "{=button}", "Stepping cam", "{=part}"],
  steps: [
    { format: "who", sub: "take-turns" },
    { format: "much", sub: "bring-back" },
    { format: "broke", sub: "hold", fault: "little" },
  ],
  fits: [
    { object: "click pen", words: { part: "the tip", button: "the button" } },
    { object: "push-to-open drawer", words: { part: "the drawer", button: "the drawer front" } },
    { object: "lamp push switch", words: { part: "the button", button: "the button" } },
  ],
};
