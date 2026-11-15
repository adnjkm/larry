import type { KnownMechanism } from "../types.ts";

export const sprungLatch: KnownMechanism = {
  id: "sprung-latch",
  name: "Sprung latch",
  does: "A sprung bolt or tab snaps in and holds against a pull until its release is pressed or turned",
  slots: [
    { id: "tab", is: "the sprung bolt or tab that snaps in", default: "the catch" },
    { id: "held", is: "what it holds in place", default: "the lid" },
  ],
  subfunctions: [
    {
      id: "latch",
      does: "Snap {held} into place and hold it until released",
      primitive: "catch",
      row: {
        why: "Going in, a lip rides over {tab}'s sloped face and presses it down; past the lip, it springs back and holds.",
        need: "A spring firm enough and a lip deep enough to hold against a hard pull, yet easy to snap in and release.",
        missing: "{held} will not stay, and comes free again the moment you let go.",
        little: "{held} stays, but a tug or a knock pulls it free without the release.",
        much: "{held} takes a hard shove to snap in, and is hard to release again.",
      },
    },
  ],
  path: ["Hand", "{=held}", "Lip", "{=tab}"],
  steps: [
    { format: "much", sub: "latch" },
    { format: "break", failure: "Make {held} hard to release", causes: [{ sub: "latch", fault: "much" }] },
  ],
  fits: [
    { object: "door latch", words: { tab: "the bolt", held: "the door" } },
    { object: "backpack buckle", words: { tab: "the side prong", held: "the clip" } },
    { object: "push-button bottle lid", words: { tab: "the catch", held: "the lid" } },
    { object: "umbrella", words: { tab: "the shaft catch", held: "the runner" } },
  ],
};
