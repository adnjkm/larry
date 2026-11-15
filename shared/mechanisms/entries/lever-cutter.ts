import type { KnownMechanism } from "../types.ts";

export const leverCutter: KnownMechanism = {
  id: "lever-cutter",
  name: "Lever cutter",
  does: "A squeeze or press on long arms drives a sharp edge, close to their pivot, through something tough",
  slots: [
    { id: "handle", is: "the long part the hand squeezes or presses", default: "the handle" },
    { id: "material", is: "what the edge cuts through", default: "the material" },
  ],
  subfunctions: [
    {
      id: "cut",
      does: "Part {material} along one thin line",
      primitive: "wedge",
      row: {
        why: "The edge narrows to a thin line, so the whole push lands there and forces {material} apart on each side.",
        need: "Ground thin enough to bite in under a squeeze, thick enough not to chip on {material}.",
        missing: "A rounded edge just presses a dent into {material} and parts nothing.",
        little: "The edge bites in easily but soon chips, leaving notches along it.",
        much: "Each cut takes a hard squeeze and squashes {material} flat before it parts.",
      },
    },
    {
      id: "press",
      does: "Bite the edge in harder than fingers can",
      primitive: "lever",
      row: {
        why: "The hand pushes far from the pivot and the edge bites close to it, so a long, light squeeze makes a short, hard bite.",
        need: "{handle} long enough to cut with one hand, short enough that one squeeze carries the edge right through.",
        missing: "With no {=handle}, fingers pressing on the edge cannot drive it through {material}.",
        little: "{handle} stalls under one hand's full press, and cuts clean only with both hands.",
        much: "{handle} closes easily, but the edge stops partway through {material}.",
      },
    },
  ],
  path: ["Hand", "{=handle}", "Cutting edge", "{=material}"],
  steps: [
    { format: "who", sub: "cut" },
    { format: "much", sub: "press" },
    {
      format: "break",
      failure: "Make each cut take a hard squeeze",
      causes: [
        { sub: "cut", fault: "much" },
        { sub: "press", fault: "little" },
      ],
    },
  ],
  fits: [
    { object: "nail clippers", words: { handle: "the top arm", material: "the nail" } },
    { object: "hole punch", words: { handle: "the handle", material: "the paper" } },
    { object: "wire cutters", words: { handle: "the handle", material: "the wire" } },
  ],
};
