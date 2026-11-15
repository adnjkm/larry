// Writes the hand-made pen as data: the snapshot the refactor is tested against, and the gold GenCourse fixture.
// Run: node prototypes/lesson/gen/write-gold.ts [--snapshot]
import { writeFileSync } from "node:fs";
import { GenCourse } from "../../../shared/course/gen.ts";
import { PEN_KIT, PEN_SHELL } from "../lessons/pen-kit.ts";
import { rounded, scaleKit } from "./scale.ts";

const here = (path: string) => new URL(path, import.meta.url);

if (process.argv.includes("--snapshot")) writeFileSync(here("./pen.snapshot.json"), JSON.stringify({ kit: PEN_KIT, shell: PEN_SHELL }));

/** The parts the rig installs itself; everything else is the pen's outside. */
const WORKS = /^(refill|tip|refill-collar|ball|spring|cam|cam-lug-\d)$/;
/** The hand-made pen is drawn three times real size. */
const REAL = 1 / 3;
const outside = { ...PEN_SHELL, parts: PEN_SHELL.parts.filter((p) => !WORKS.test(p.id)).map((p) => (p.finish === "clear" ? { ...p, color: "#c2c5c9", finish: "glossy" as const } : p)) };

const gold: GenCourse = {
  object: "Click Pen",
  kit: rounded(scaleKit(outside, REAL)),
  roles: { case: "barrel", nose: "nose", button: "plunger" },
  mechanisms: [
    {
      entry: "click-latch",
      name: "Retraction",
      does: "Each click sends the tip out or tucks it away.",
      words: {},
      tips: {
        spring: ["A spring only pushes back while it is squeezed between two things.", "Look for a ledge it can sit on, and a collar that comes down on it when the tip goes out."],
        cam: ["The cam pushes the rod up only while a bump is under it.", "This cam has two bumps, opposite each other.", "A click that lands on a bump leaves the tip out. The next click has to land between bumps."],
      },
    },
    {
      entry: "ball-tip",
      name: "Ball tip",
      does: "A ball that rolls a thin, even line of ink.",
      words: {},
      tips: { ball: ["The ball can only roll if it touches the paper.", "It also has to sit where the ink reaches it from behind."] },
    },
  ],
};
writeFileSync(here("../../../fixtures/courses/pen.gold.json"), `${JSON.stringify(GenCourse.parse(gold), null, 1)}\n`);
