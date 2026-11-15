import type { KnownMechanism } from "../types.ts";

export const springReel: KnownMechanism = {
  id: "spring-reel",
  name: "Spring reel",
  does: "A coiled spring in a drum winds a tape or cord back in when you let go",
  slots: [
    { id: "line", is: "what pulls out and winds back in", default: "the cord" },
    { id: "end", is: "the end you pull", default: "the clip" },
  ],
  subfunctions: [
    {
      id: "wind-in",
      does: "Wind {line} back in when you let go",
      primitive: "spring",
      row: {
        why: "A coiled spring in the drum winds tighter as {line} comes out, and unwinds to reel it back in.",
        need: "Strong enough to reel in all of {line}, soft enough to pull out with an easy tug.",
        missing: "{line} stays out wherever you leave it.",
        little: "{line} winds in slowly and stops with a length still hanging out.",
        much: "{line} takes a hard pull to draw out, and whips back fast when let go.",
      },
    },
  ],
  path: ["Coil spring", "Drum", "{=line}", "{=end}"],
  steps: [
    { format: "broke", sub: "wind-in", fault: "little" },
    { format: "much", sub: "wind-in" },
  ],
  fits: [
    { object: "tape measure", words: { line: "the tape", end: "the hook" } },
    { object: "badge reel", words: { line: "the cord", end: "the badge clip" } },
    { object: "retractable dog lead", words: { line: "the lead", end: "the clip" } },
  ],
};
