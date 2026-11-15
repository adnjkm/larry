import type { KnownMechanism } from "../types.ts";

export const leverPress: KnownMechanism = {
  id: "lever-press",
  name: "Lever press",
  does: "A hinged arm takes a press anywhere along it, drives one part straight in, then springs back",
  slots: [
    { id: "arm", is: "the hinged part the hand presses", default: "the arm" },
    { id: "load", is: "the part the arm drives in", default: "the plunger" },
  ],
  subfunctions: [
    {
      id: "drive",
      does: "Drive {load} straight in, wherever the hand presses",
      primitive: "lever",
      row: {
        why: "{arm} swings on a hinge and guides the push, so a press anywhere lands square on {load}.",
        need: null,
        missing: "A fingertip pushing {load} alone slips off it or drives it in crooked.",
        little: null,
        much: null,
      },
    },
    {
      id: "return",
      does: "Bring {arm} back for the next press",
      primitive: "spring",
      row: {
        why: "A spring is squeezed by each press and pushes {arm} back when the hand lets go.",
        need: "Stiff enough to bring {arm} all the way back, soft enough to press without a hard push.",
        missing: "{arm} stays where the press left it until it is pulled back by hand.",
        little: "{arm} creeps back slowly and stops short of where it started.",
        much: "{arm} takes a hard push to press, and snaps back hard when let go.",
      },
    },
  ],
  path: ["Hand", "{=arm}", "{=load}"],
  steps: [
    { format: "broke", sub: "return", fault: "little" },
    { format: "who", sub: "drive" },
    { format: "much", sub: "return" },
  ],
  fits: [
    { object: "stapler", words: { arm: "the top arm", load: "the staple" } },
    { object: "wall soap dispenser", words: { arm: "the push panel", load: "the pump" } },
    { object: "spray bottle", words: { arm: "the trigger", load: "the pump" } },
  ],
};
