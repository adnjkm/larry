import type { KnownMechanism } from "../types.ts";

export const foldingFrame: KnownMechanism = {
  id: "folding-frame",
  name: "Folding frame",
  does: "Sliding or swinging one part opens hinged arms out, through short struts joined partway along each arm",
  slots: [
    { id: "driver", is: "the part slid or swung to open it", default: "the slider" },
    { id: "arm", is: "one of the hinged arms that swings out", default: "the arm" },
  ],
  subfunctions: [
    {
      id: "spread",
      does: "Swing {arm} out with {driver}",
      primitive: "linkage",
      row: {
        why: "{driver} pushes a strut joined partway along {arm}, so a short move swings the far end wide.",
        need: "Joined near enough the hinge to swing {arm} fully open, far enough out to stop at the right spread.",
        missing: "{driver} moves freely, and {arm} just hangs unless pulled out by hand.",
        little: "{arm} swings out past where it should stop, and the frame splays out of shape.",
        much: "{arm} opens only partway, though {driver} has gone all the way.",
      },
    },
  ],
  path: ["Hand", "{=driver}", "Strut", "{=arm}"],
  steps: [{ format: "who", sub: "spread" }, { format: "trace" }, { format: "much", sub: "spread" }],
  fits: [
    { object: "umbrella", words: { driver: "the runner", arm: "the rib" } },
    { object: "music stand", words: { driver: "the collar", arm: "the leg" } },
    { object: "rotary washing line", words: { driver: "the sliding hub", arm: "the arm" } },
  ],
};
