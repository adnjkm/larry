import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { type Brief, type MechanismLesson, Plan, briefOf, lessonProblems, planProblems } from "./curriculum.ts";
import { parseKit } from "./kit.ts";
import { PRIMITIVES } from "./primitives/library.ts";
import { TRADEOFFS } from "./primitives/tradeoffs.ts";

const read = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const ids = new Set(PRIMITIVES.map((p) => p.id));
const brief = (name: string): Brief => briefOf(parseKit(read(`../fixtures/kits/${name}.json`)));
const reference = (name: string) => Plan.parse((read(`../fixtures/curriculum/gold/${name}.json`) as { plan: unknown }).plan);

test("every primitive has a too-little and a too-much", () => {
  assert.deepEqual(Object.keys(TRADEOFFS).sort(), [...ids].sort());
});

test("every reference plan keeps the rules it is used to teach", () => {
  for (const file of readdirSync(new URL("../fixtures/curriculum/gold/", import.meta.url))) {
    const name = file.replace(/\.json$/, "");
    const gold = read(`../fixtures/curriculum/gold/${file}`) as { plan?: unknown };
    if (gold.plan) assert.deepEqual(planProblems(Plan.parse(gold.plan), brief(name), ids), [], name);
  }
});

test("a plan's rule breaks are named", () => {
  const plan = reference("bottle");
  const cap = plan.mechanisms.find((m) => m.id === "screw-cap")!;
  const broken: Plan = {
    ...plan,
    mechanisms: [
      { ...cap, needs: [], subfunctions: [{ ...cap.subfunctions[0]!, primitive: "hinge" }] },
      ...plan.mechanisms.filter((m) => m.id !== "screw-cap"),
    ],
  };
  const problems = planProblems(broken, brief("bottle"), ids).join("\n");
  assert.match(problems, /screw-cap is the first mechanism, so it has no gap/);
  assert.match(problems, /hinge, which is not in the catalogue/);
});

const retraction = reference("pen").mechanisms.find((m) => m.id === "retraction")!;
const row = (id: string) => ({
  id,
  why: "It does the job.",
  need: "Enough, but not too much.",
  missing: "The tip stays out.",
  little: "The tip droops.",
  much: "The button will not press.",
});
const lesson: MechanismLesson = {
  id: "retraction",
  rows: retraction.subfunctions.map((s) => row(s.id)),
  path: ["thumb", "button", "cam", "ink tube", "tip"],
  steps: [
    { format: "who", subfunction: "return-tip" },
    { format: "broke", subfunction: "hold-out", fault: "missing" },
    { format: "much", subfunction: "alternate" },
    { format: "trace" },
    { format: "break", failure: "Make the tip refuse to stay out", causes: [{ subfunction: "hold-out", fault: "missing" }] },
  ],
};

test("a lesson that asks about every sub-function holds together", () => {
  assert.deepEqual(lessonProblems(lesson, retraction), []);
});

test("a lesson's rule breaks are named", () => {
  const problems = lessonProblems(
    {
      ...lesson,
      rows: lesson.rows.map((r) => (r.id === "alternate" ? { ...r, need: null, little: null, much: null } : r)),
      steps: [
        { format: "who", subfunction: "return-tip" },
        { format: "who", subfunction: "hold-out" },
        { format: "much", subfunction: "alternate" },
        { format: "broke", subfunction: "clip", fault: "much" },
      ],
    },
    retraction,
  ).join("\n");
  assert.match(problems, /steps 1 and 2 are both who/);
  assert.match(problems, /asks how much of alternate, whose need is null/);
  assert.match(problems, /names clip, which is not one of this mechanism's sub-functions/);
});
