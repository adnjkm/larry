import type { KnownMechanism } from "../types.ts";

export const dispenserPump: KnownMechanism = {
  id: "dispenser-pump",
  name: "Dispenser pump",
  does: "Each press of a head or trigger squirts liquid out, then a spring lifts it and draws more up",
  slots: [
    { id: "push", is: "the head or trigger the hand presses", default: "the pump head" },
    { id: "fluid", is: "the liquid it gives out", default: "the liquid" },
  ],
  subfunctions: [
    {
      id: "squirt",
      does: "Squirt {fluid} out with each press",
      primitive: "piston",
      row: {
        why: "{push} drives a plug into a small chamber, squeezing {fluid} inside until it squirts out.",
        need: "A chamber wide enough to give a useful squirt, narrow enough to press with one finger.",
        missing: "{push} moves, but nothing squeezes {fluid} and none comes out.",
        little: "Each press gives only a drop, so it takes many presses.",
        much: "{push} takes a hard press, though a big squirt comes out.",
      },
    },
    {
      id: "return",
      does: "Bring {push} back for the next press",
      primitive: "spring",
      row: {
        why: "A spring behind {push} is squeezed by each press and pushes it back when the hand lets go.",
        need: "Stiff enough to bring {push} all the way back, soft enough to press easily.",
        missing: "{push} stays in after one press and has to be pulled back by hand.",
        little: "{push} creeps back slowly and stops short.",
        much: "{push} takes a hard press and snaps back.",
      },
    },
    {
      id: "refill",
      does: "Let {fluid} in from below, never back",
      primitive: "valve",
      row: {
        why: "As {push} returns, the chamber sucks, so a ball lifts to let {fluid} up, then drops to hold it there.",
        need: "A ball light enough to lift at a gentle suck, snug enough to close at once.",
        missing: "Each press pushes {fluid} back down the tube instead of out.",
        little: "{fluid} drains back between presses, so the first presses give nothing.",
        much: "The chamber never fills, and each press gives only a dribble.",
      },
    },
  ],
  path: ["Hand", "{=push}", "Plug", "Chamber", "{=fluid}"],
  steps: [
    { format: "who", sub: "refill" },
    { format: "much", sub: "squirt" },
    { format: "broke", sub: "return", fault: "little" },
    {
      format: "break",
      failure: "Make {push} hard to press",
      causes: [
        { sub: "squirt", fault: "much" },
        { sub: "return", fault: "much" },
      ],
    },
  ],
  fits: [
    { object: "soap pump", words: { push: "the pump head", fluid: "the soap" } },
    { object: "spray bottle", words: { push: "the trigger", fluid: "the cleaner" } },
    { object: "lotion bottle", words: { push: "the pump head", fluid: "the lotion" } },
  ],
};
