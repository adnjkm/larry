import type { KnownMechanism } from "../types.ts";

export const snapCatch: KnownMechanism = {
  id: "snap-catch",
  name: "Snap catch",
  does: "A springy lip clicks over an edge to hold a cap, lid or cover on until pulled or pressed hard",
  slots: [
    { id: "cover", is: "the part that clicks on", default: "the cover" },
    { id: "base", is: "what it clicks onto", default: "the case" },
  ],
  subfunctions: [
    {
      id: "click-hold",
      does: "Click {cover} into place and hold it there",
      primitive: "catch",
      row: {
        why: "The lip's sloped front bends the plastic aside as {cover} closes, then it springs back behind the edge to hold.",
        need: "A lip deep and stiff enough to hold {cover} through a knock, shallow enough to open by hand.",
        missing: "{cover} closes without a click and falls off when {base} is tipped.",
        little: "{cover} clicks shut faintly, then comes loose at a light knock.",
        much: "{cover} takes a hard press to click shut and a hard pull to open again.",
      },
    },
  ],
  path: ["Hand", "{=cover}", "Lip", "{=base}"],
  steps: [
    { format: "who", sub: "click-hold" },
    { format: "much", sub: "click-hold" },
  ],
  fits: [
    { object: "pen", words: { cover: "the cap", base: "the pen" } },
    { object: "TV remote", words: { cover: "the battery cover", base: "the remote" } },
    { object: "sunscreen bottle", words: { cover: "the flip lid", base: "the bottle" } },
  ],
};
