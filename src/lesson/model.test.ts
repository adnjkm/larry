import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseKit } from "../../shared/kit.ts";
import { parseLesson } from "../../shared/lesson.ts";
import { CATALOG, PRIMITIVE_BY_ID } from "../primitives/catalog.ts";
import { type Action, type Arrived, type LessonState, arrivedWhole, chapterStatus, earnedParts, isComplete, isFinished, isWaiting, reduce, startLesson } from "./model.ts";

const kit = parseKit(JSON.parse(readFileSync(new URL("../../fixtures/kits/pen.json", import.meta.url), "utf8")));

const step = (id: string, over: object) => ({ id, title: id, story: ["s"], primitive: null, problem: null, payoff: ["p"], earns: [], ...over });

const stiffness = PRIMITIVE_BY_ID.get("spring")?.sliders.find((s) => s.id === "stiffness");
assert.ok(stiffness, "the spring has a stiffness slider");
const along = (fraction: number) => stiffness.min + fraction * (stiffness.max - stiffness.min);
const [below, inside, above] = [along(0.25), along(0.65), along(0.95)];
const tune = { type: "tune", goal: "g", slider: "stiffness", min: along(0.55), max: along(0.8), tooLow: "low", tooHigh: "high", justRight: "ok" };
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

const whole = arrivedWhole(lesson);
const [moduleChapter, casingChapter] = lesson.chapters;
assert.ok(moduleChapter && casingChapter);
/** Only the module has been written, so the lesson is still growing. */
const partial: Arrived = { chapters: [moduleChapter], done: null };
const grow = (arrived: Arrived): Action => ({ type: "grow", arrived });
const solveModule: Action[] = [
  { type: "problem", action: { type: "run" } },
  { type: "next" },
  { type: "problem", action: { type: "pick", option: 1 } },
  { type: "next" },
  { type: "slider", id: "stiffness", value: inside },
  { type: "problem", action: { type: "tune" } },
  { type: "next" },
];

const run = (s: LessonState, ...actions: Action[]) => actions.reduce(reduce, s);
const tryTune = { type: "problem", action: { type: "tune" } } as const;

describe("lesson player", () => {
  it("blocks Next until the step's problem is solved", () => {
    const s = startLesson(whole);
    assert.equal(reduce(s, { type: "next" }).at, 0);
    const ran = run(s, { type: "problem", action: { type: "run" } });
    assert.equal(isComplete(ran, 0), true);
    assert.equal(reduce(ran, { type: "next" }).at, 1);
  });

  it("lets a wrong pick fail once, then the right one solve", () => {
    const s = run(startLesson(whole), { type: "problem", action: { type: "run" } }, { type: "next" });
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
      run(startLesson(whole), { type: "problem", action: { type: "run" } }, { type: "next" }, { type: "problem", action: { type: "pick", option: 1 } }, { type: "next" });
    assert.deepEqual(at(below).steps[2]?.problem, { type: "tune", verdict: "below", solved: false });
    assert.deepEqual(at(above).steps[2]?.problem, { type: "tune", verdict: "above", solved: false });
    const solved = run(at(above), { type: "slider", id: "stiffness", value: inside }, tryTune);
    assert.deepEqual(solved.steps[2]?.problem, { type: "tune", verdict: "inside", solved: true });
  });

  it("drops a tune verdict once the slider moves, so it never describes a setting that has changed", () => {
    const toTune = run(startLesson(whole), { type: "problem", action: { type: "run" } }, { type: "next" }, { type: "problem", action: { type: "pick", option: 1 } }, { type: "next" });
    const judged = run(toTune, { type: "slider", id: "stiffness", value: below }, tryTune);
    const moved = reduce(judged, { type: "slider", id: "stiffness", value: above });
    assert.deepEqual(moved.steps[2]?.problem, { type: "tune", verdict: null, solved: false });
    const solved = run(moved, { type: "slider", id: "stiffness", value: inside }, tryTune);
    assert.deepEqual(reduce(solved, { type: "slider", id: "stiffness", value: below }).steps[2]?.problem, { type: "tune", verdict: "inside", solved: true });
  });

  it("keeps a tune verdict when a slider the problem doesn't judge moves", () => {
    const toTune = run(startLesson(whole), { type: "problem", action: { type: "run" } }, { type: "next" }, { type: "problem", action: { type: "pick", option: 1 } }, { type: "next" });
    const judged = run(toTune, { type: "slider", id: "stiffness", value: below }, tryTune);
    const other = reduce(judged, { type: "slider", id: "force", value: 10 });
    assert.deepEqual(other.steps[2]?.problem, { type: "tune", verdict: "below", solved: false });
    assert.equal(other.steps[2]?.values.force, 10);
  });

  it("earns parts only from completed steps the player has reached", () => {
    let s = startLesson(whole);
    assert.deepEqual([...earnedParts(s)], []);
    s = run(s, { type: "problem", action: { type: "run" } });
    assert.deepEqual([...earnedParts(s)].sort(), ["barrel", "plunger", "refill"]);
    assert.equal(earnedParts(s).has("clip"), false, "the casing step has no problem but is not reached yet");
  });

  it("walks to the finish and keeps earned parts when going back", () => {
    let s = run(
      startLesson(whole),
      { type: "problem", action: { type: "run" } },
      { type: "next" },
      { type: "problem", action: { type: "pick", option: 1 } },
      { type: "next" },
      { type: "slider", id: "stiffness", value: inside },
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

  describe("as the lesson grows", () => {
    it("keeps the state of unchanged steps and plays on into the new chapter", () => {
      const s = run(startLesson(partial), ...solveModule.slice(0, 3));
      const grown = reduce(s, grow(whole));
      assert.equal(grown.flat.length, 4);
      assert.equal(grown.at, 1);
      assert.equal(isComplete(grown, 0), true);
      assert.deepEqual(grown.steps[1]?.problem, { type: "pick", tried: [1], solved: true });
      assert.equal(grown.steps[1]?.values.stiffness, s.steps[1]?.values.stiffness);
    });

    it("keeps slider values and a pick in progress", () => {
      const s = run(startLesson(partial), ...solveModule.slice(0, 2), { type: "problem", action: { type: "pick", option: 0 } }, { type: "next" });
      const grown = reduce(s, grow(whole));
      assert.deepEqual(grown.steps[1]?.problem, { type: "pick", tried: [0], solved: false });
    });

    it("resets only the step whose content changed", () => {
      const s = run(startLesson(whole), ...solveModule.slice(0, 3));
      const [run0, ...rest] = moduleChapter.steps;
      assert.ok(run0 && moduleChapter.kind === "module");
      const edited = { ...moduleChapter, steps: [{ ...run0, title: "rewritten" }, ...rest] };
      const rewritten: Arrived = { chapters: [edited, casingChapter], done: { ...lesson, chapters: [edited, casingChapter] } };
      const grown = reduce(s, grow(rewritten));
      assert.equal(isComplete(grown, 0), false, "the rewritten step starts over");
      assert.equal(isComplete(grown, 1), true, "the untouched pick keeps its answer");
      assert.equal(grown.at, 1);
    });

    it("keeps state when only earns changed, which is how the server repairs a finished lesson", () => {
      const s = run(startLesson(partial), { type: "problem", action: { type: "run" } });
      const [first, ...rest] = moduleChapter.steps;
      assert.ok(first && moduleChapter.kind === "module");
      const repaired = { ...moduleChapter, steps: [{ ...first, earns: ["barrel"] }, ...rest] };
      const grown = reduce(s, grow({ chapters: [repaired, casingChapter], done: null }));
      assert.equal(isComplete(grown, 0), true);
      assert.deepEqual([...earnedParts(grown)], ["barrel"]);
    });

    it("waits at the end of a partial lesson and moves on by itself when the next chapter arrives", () => {
      const atEnd = run(startLesson(partial), ...solveModule);
      assert.equal(atEnd.at, 3);
      assert.equal(isWaiting(atEnd), true);
      assert.equal(isFinished(atEnd), false);
      assert.equal(reduce(atEnd, { type: "next" }), atEnd);
      const grown = reduce(atEnd, grow({ chapters: lesson.chapters, done: null }));
      assert.equal(isWaiting(grown), false);
      assert.equal(grown.flat[grown.at]?.step.id, "clip");
      assert.equal(chapterStatus(grown, 0), "done");
    });

    it("finishes only when the lesson is complete", () => {
      const allWritten: Arrived = { chapters: lesson.chapters, done: null };
      const atEnd = run(startLesson(allWritten), ...solveModule, { type: "next" });
      assert.equal(atEnd.at, 4);
      assert.equal(isFinished(atEnd), false);
      assert.equal(isWaiting(atEnd), true);
      const done = reduce(atEnd, grow(whole));
      assert.equal(isFinished(done), true);
      assert.equal(earnedParts(done).size, kit.parts.length);
    });

    it("clamps its place when the lesson shrinks", () => {
      const atEnd = run(startLesson(whole), ...solveModule, { type: "next" });
      assert.equal(atEnd.at, 4);
      const shrunk = reduce(atEnd, grow(partial));
      assert.equal(shrunk.at, 3);
      assert.equal(shrunk.reached, 3);
    });

    it("does nothing for the same lesson", () => {
      const s = startLesson(whole);
      assert.equal(reduce(s, grow({ chapters: whole.chapters, done: whole.done })), s);
    });
  });
});
