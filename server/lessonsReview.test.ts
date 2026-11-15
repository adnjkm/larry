import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { type MechanismLesson, Plan, lessonProblems } from "../shared/curriculum.ts";
import { type Review, applyReview, reviewRequest } from "./lessonsReview.ts";
import { writeLessons } from "./streamCurriculum.ts";

const plan = Plan.parse((JSON.parse(readFileSync(new URL("../fixtures/curriculum/gold/pen.json", import.meta.url), "utf8")) as { plan: unknown }).plan);
const retraction = plan.mechanisms.find((m) => m.id === "retraction")!;
const lesson: MechanismLesson = {
  id: "retraction",
  rows: retraction.subfunctions.map((s) => ({
    id: s.id,
    why: "It does the job.",
    need: "Enough, but not too much.",
    missing: "The tip stays out.",
    little: "The tip droops.",
    much: "The button will not press.",
  })),
  path: ["thumb", "button", "cam", "ink tube", "tip"],
  steps: retraction.subfunctions.map((s, i) => (i % 2 === 0 ? { format: "who", subfunction: s.id } : { format: "much", subfunction: s.id })),
};
const first = lesson.rows[0]!.id;
const nothing: Review = { fixes: [], path: null, steps: null, flags: [] };

test("a review's fixes replace only the sentences they name", () => {
  assert.deepEqual(lessonProblems(lesson, retraction), []);
  const fixed = applyReview(
    lesson,
    {
      ...nothing,
      fixes: [{ row: first, field: "missing", problem: "Same as little.", text: "The tip never comes back in." }],
      path: ["thumb", "button", "tip"],
    },
    retraction,
  );
  assert.equal(fixed.rows[0]!.missing, "The tip never comes back in.");
  assert.equal(fixed.rows[0]!.little, lesson.rows[0]!.little);
  assert.deepEqual(fixed.rows.slice(1), lesson.rows.slice(1));
  assert.deepEqual(fixed.path, ["thumb", "button", "tip"]);
  assert.deepEqual(fixed.steps, lesson.steps);
});

test("a review that breaks a rule is dropped, so the lesson stays playable", () => {
  const tooLong = Array.from({ length: 40 }, () => "word").join(" ");
  const broken = applyReview(lesson, { ...nothing, fixes: [{ row: first, field: "missing", problem: "x", text: tooLong }] }, retraction);
  assert.equal(broken, lesson);
  const badSteps = applyReview(lesson, { ...nothing, path: ["thumb", "button", "tip"], steps: [{ format: "trace" }] }, retraction);
  assert.deepEqual(badSteps.steps, lesson.steps);
  assert.deepEqual(badSteps.path, ["thumb", "button", "tip"]);
});

test("the reviewer reads the plan and the one lesson, with no instruction to write a lesson", () => {
  const text = reviewRequest(plan, lesson);
  assert.match(text, /The lesson written for retraction:/);
  assert.doesNotMatch(text, /Write the lesson for/);
});

test("lessons are reviewed as they are written, and a failed review yields the draft", async () => {
  const mechanisms = plan.mechanisms.filter((m) => m.lesson);
  const drafts = mechanisms.map((m): MechanismLesson => ({
    ...lesson,
    id: m.id,
    rows: m.subfunctions.map((s) => ({ ...lesson.rows[0]!, id: s.id })),
    steps: m.subfunctions.map((s, i) => (i % 2 === 0 ? { format: "who", subfunction: s.id } : { format: "much", subfunction: s.id })),
  }));
  const flags: string[] = [];
  const ask = async function* (request: { streamKey: string; content: unknown }) {
    if (request.streamKey === "lessons") {
      for (const value of drafts) yield { type: "item" as const, value };
      yield { type: "result" as const, output: { lessons: drafts }, costUsd: 1 };
      return;
    }
    const id = mechanisms.find((m) => JSON.stringify(request.content).includes(`The lesson written for ${m.id}:`))!.id;
    if (id !== mechanisms[0]!.id) throw new Error("review failed");
    const output: Review = { ...nothing, path: ["hand", "ball", "paper"], flags: [{ row: "r", note: "Not honest here." }] };
    yield { type: "result" as const, output, costUsd: 1 };
  };
  const written: MechanismLesson[] = [];
  let cost = 0;
  const options = { ask: ask as never, onFlag: (f: { mechanism: string }) => flags.push(f.mechanism), onStats: (s: { costUsd: number }) => (cost = s.costUsd) };
  for await (const l of writeLessons(plan, options)) written.push(l);
  assert.deepEqual(written.map((l) => l.id).sort(), mechanisms.map((m) => m.id).sort());
  assert.deepEqual(written.find((l) => l.id === mechanisms[0]!.id)!.path, ["hand", "ball", "paper"]);
  for (const l of written.filter((x) => x.id !== mechanisms[0]!.id)) assert.deepEqual(l.path, lesson.path);
  assert.deepEqual(flags, [mechanisms[0]!.id]);
  assert.equal(cost, 2);
});
