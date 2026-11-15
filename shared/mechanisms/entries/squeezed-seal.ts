import type { KnownMechanism } from "../types.ts";

export const squeezedSeal: KnownMechanism = {
  id: "squeezed-seal",
  name: "Squeezed seal",
  does: "A soft ring squeezed between a lid and its container keeps liquid from leaking out when tipped",
  slots: [
    { id: "ring", is: "the soft ring that is squeezed", default: "the rubber ring" },
    { id: "cover", is: "the part that closes and presses on the ring", default: "the lid" },
    { id: "body", is: "what the cover closes onto", default: "the container" },
  ],
  subfunctions: [
    {
      id: "close-gap",
      does: "Close the gap between {cover} and {body}",
      primitive: "seal",
      row: {
        why: "{ring} is soft, so closing {cover} squashes it into every tiny gap, leaving liquid no way past.",
        need: "Thick enough to be squashed all the way round, thin enough that {cover} still closes easily.",
        missing: "Liquid runs straight out round the edge of {cover} when {body} tips.",
        little: "Liquid beads round the edge of {cover} and drips slowly when {body} tips.",
        much: "{cover} takes real force to close fully, and {ring} comes out pressed flat.",
      },
    },
  ],
  path: ["Hand", "{=cover}", "{=ring}", "{=body}"],
  steps: [
    { format: "broke", sub: "close-gap", fault: "little" },
    { format: "much", sub: "close-gap" },
  ],
  fits: [
    { object: "lunch box", words: { ring: "the silicone seal", cover: "the lid", body: "the box" } },
    { object: "water bottle", words: { ring: "the rubber ring", cover: "the cap", body: "the bottle" } },
    { object: "travel mug", words: { ring: "the rubber ring", cover: "the lid", body: "the mug" } },
  ],
};
