import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseKit } from "../../shared/kit.ts";
import { parseLesson } from "../../shared/lesson.ts";
import { CATALOG } from "../primitives/catalog.ts";
import { type Action, type LessonState, chapterStatus, earnedParts, isComplete, isFinished, reduce, startLesson } from "./model.ts";

const kit = parseKit(JSON.parse(readFileSync(new URL("../../fixtures/kits/pen.json", import.meta.url), "utf8")));

const step = (id: string, over: object) => ({ id, title: id, story: ["s"], primitive: null, problem: null, payoff: ["p"], earns: [], ...over });

// Spring's stiffness slider runs 1..4 and starts at 2.
const tune = { type: "tune", goal: "g", slider: "stiffness", min: 2.6, max: 3.4, tooLow: "low", tooHigh: "high", justRight: "ok" };
const pick = {
  type: "pick",
  question: "q",
  options: [
    { primitive: "lever", works: false, outcome: "no" },
    { primitive: "spring", works: true, outcome: "yes" },
  ],
};

const lesson = parseLesson(
  {
    title: "t",
    hook: ["h"],
    closing: ["c"],
    chapters: [
      {
        kind: "module",
        id: "m",
        need: "It must x",
        why: "w",
        surprise: false,
        steps: [
          step("run", { problem: { type: "run", action: "Go", outcome: "o" }, earns: ["barrel", "refill", "plunger"] }),
          step("pick", { primitive: "spring", problem: pick, earns: ["nose-cone"] }),
          step("tune", { primitive: "spring", problem: tune }),
        ],
      },
      { kind: "casing", id: "c", title: "Casing", steps: [step("clip", { earns: ["clip"] })] },
    ],
  },
  kit,
  CATALOG,
);

const run = (s: LessonState, ...actions: Action[]) => actions.reduce(reduce, s);
const tryTune = { type: "problem", action: { type: "tune" } } as const;

describe("lesson player", () => {
  it("blocks Next until the step's problem is solved", () => {
    const s = startLesson(lesson);
    assert.equal(reduce(s, { type: "next" }).at, 0);
    const ran = run(s, { type: "problem", action: { type: "run" } });
    assert.equal(isComplete(ran, 0), true);
    assert.equal(reduce(ran, { type: "next" }).at, 1);
  });

  it("lets a wrong pick fail once, then the right one solve", () => {
    const s = run(startLesson(lesson), { type: "problem", action: { type: "run" } }, { type: "next" });
    const wrong = reduce(s, { type: "problem", action: { type: "pick", option: 0 } });
    assert.deepEqual(wrong.steps[1]?.problem, { type: "pick", tried: [0], solved: false });
    assert.equal(reduce(wrong, { type: "problem", action: { type: "pick", option: 0 } }), wrong);
    assert.equal(reduce(wrong, { type: "next" }).at, 1);
    const right = reduce(wrong, { type: "problem", action: { type: "pick", option: 1 } });
    assert.equal(isComplete(right, 1), true);
  });

  it("judges a tune step below, above, then inside the window", () => {
    const at = (value: number) => run(toTune(), { type: "slider", id: "stiffness", value }, tryTune);
    const toTune = () =>
      run(startLesson(lesson), { type: "problem", action: { type: "run" } }, { type: "next" }, { type: "problem", action: { type: "pick", option: 1 } }, { type: "next" });
    assert.deepEqual(at(2).steps[2]?.problem, { type: "tune", attempts: 1, verdict: "below", solved: false });
    assert.deepEqual(at(3.8).steps[2]?.problem, { type: "tune", attempts: 1, verdict: "above", solved: false });
    const solved = run(at(3.8), { type: "slider", id: "stiffness", value: 3 }, tryTune);
    assert.deepEqual(solved.steps[2]?.problem, { type: "tune", attempts: 2, verdict: "inside", solved: true });
  });

  it("earns parts only from completed steps the player has reached", () => {
    let s = startLesson(lesson);
    assert.deepEqual([...earnedParts(s)], []);
    s = run(s, { type: "problem", action: { type: "run" } });
    assert.deepEqual([...earnedParts(s)].sort(), ["barrel", "plunger", "refill"]);
    assert.equal(earnedParts(s).has("clip"), false, "the casing step has no problem but is not reached yet");
  });

  it("walks to the finish and keeps earned parts when going back", () => {
    let s = run(
      startLesson(lesson),
      { type: "problem", action: { type: "run" } },
      { type: "next" },
      { type: "problem", action: { type: "pick", option: 1 } },
      { type: "next" },
      { type: "slider", id: "stiffness", value: 3 },
      tryTune,
      { type: "next" },
    );
    assert.equal(chapterStatus(s, 0), "done");
    assert.equal(chapterStatus(s, 1), "current");
    s = run(s, { type: "next" });
    assert.equal(isFinished(s), true);
    assert.equal(earnedParts(s).size, kit.parts.length);
    const back = run(s, { type: "back" }, { type: "back" });
    assert.equal(back.at, 2);
    assert.equal(earnedParts(back).size, kit.parts.length);
    assert.equal(reduce(back, { type: "next" }).at, 3);
  });
});
