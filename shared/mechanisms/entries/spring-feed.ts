import type { KnownMechanism } from "../types.ts";

export const springFeed: KnownMechanism = {
  id: "spring-feed",
  name: "Spring feed",
  does: "A spring behind a row or stack pushes the next one into place each time one is used",
  slots: [
    { id: "stack", is: "the row or stack being fed", default: "the stack" },
    { id: "item", is: "the one next in line", default: "the next one" },
  ],
  subfunctions: [
    {
      id: "feed",
      does: "Push {item} into place each time one is used",
      primitive: "spring",
      row: {
        why: "A spring loaded as {stack} goes in keeps pushing on it from behind, so the next one is always in place.",
        need: "A spring firm enough to push the very last one into place, soft enough to load without a fight.",
        missing: "Once the first is used, the rest stay put and the next try comes up empty.",
        little: "It feeds well when full, but near the end {item} stops short of its place.",
        much: "Loading takes a hard push, and {item} is pressed so tight it sticks.",
      },
    },
  ],
  path: ["Spring", "Pusher", "{=stack}", "{=item}"],
  steps: [
    { format: "who", sub: "feed" },
    { format: "much", sub: "feed" },
  ],
  fits: [
    { object: "stapler", words: { stack: "the staple strip", item: "the next staple" } },
    { object: "sweet dispenser", words: { stack: "the sweet stack", item: "the next sweet" } },
    { object: "toy dart magazine", words: { stack: "the dart stack", item: "the next dart" } },
  ],
};
