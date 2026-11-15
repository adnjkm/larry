import type { KnownMechanism } from "../types.ts";

export const leverPry: KnownMechanism = {
  id: "lever-pry",
  name: "Pry lever",
  does: "A thin tip slips under something stuck, and a long handle over a pivot levers it up or out",
  slots: [
    { id: "tip", is: "the thin end that goes under", default: "the tip" },
    { id: "handle", is: "the long end the hand pushes", default: "the handle" },
    { id: "load", is: "what gets lifted or pulled out", default: "the stuck part" },
  ],
  subfunctions: [
    {
      id: "under",
      does: "Slip {tip} under {load}",
      primitive: "wedge",
      row: {
        why: "{tip} tapers thin, so a push slides it into the gap and starts to lift {load}.",
        need: "Tapered thin enough to slip under {load}, thick enough to take the lift without bending.",
        missing: "A blunt end butts against {load} and will not go under it.",
        little: "{tip} slips under easily, then bends instead of lifting {load}.",
        much: "{tip} needs a hard shove to go in, and pops back out when pried.",
      },
    },
    {
      id: "lift",
      does: "Lift {load} with a light push",
      primitive: "lever",
      row: {
        why: "The pivot is close to {load} and far from the hand, so a long, light push gives a short, strong lift.",
        need: "{handle} long enough to lift {load} one-handed, short enough that one push lifts it clear.",
        missing: "With no {=handle}, fingers pulling on {tip} barely move {load}.",
        little: "{handle} stops dead under a full push, and {load} stays stuck.",
        much: "{handle} swings a long way, and {load} lifts only a crack.",
      },
    },
  ],
  path: ["Hand", "{=handle}", "{=tip}", "{=load}"],
  steps: [{ format: "who", sub: "under" }, { format: "trace" }, { format: "much", sub: "lift" }, { format: "broke", sub: "under", fault: "much" }],
  fits: [
    { object: "claw hammer", words: { tip: "the claw", handle: "the handle", load: "the nail" } },
    { object: "tyre lever", words: { tip: "the tip", handle: "the long end", load: "the tyre" } },
    { object: "paint tin opener", words: { tip: "the hook", handle: "the handle", load: "the lid" } },
  ],
};
