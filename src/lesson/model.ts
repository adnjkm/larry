// The lesson player's state machine. A lesson is flattened into one list of steps. `at` is the step on screen
// (flat.length means the end of what has arrived: the finish screen once the lesson is done, a wait for the
// next chapter before) and `reached` is the furthest `at` so far, so going back keeps what was earned.
import type { Chapter, Lesson, Step } from "../../shared/lesson.ts";
import { PRIMITIVE_BY_ID } from "../primitives/catalog.ts";
import { initialValues } from "../primitives/library.ts";
import type { Values } from "../primitives/types.ts";
import { type ProblemAction, type ProblemState, initProblem, problemSolved, reduceProblem } from "./problems.ts";

type FlatStep = {
  chapter: number;
  /** Position inside its chapter. */
  index: number;
  step: Step;
  /** True for the first step in the lesson that works with this step's primitive, which is when the player introduces it. A run step only draws it. */
  introduces: boolean;
};

type StepState = {
  /** The figure's slider values. A tune problem judges the one it names. */
  values: Values;
  problem: ProblemState | null;
};

/** A lesson as far as it has been written. `done` is the finished lesson, null while chapters are still arriving. */
export type Arrived = { chapters: Chapter[]; done: Lesson | null };

export const arrivedWhole = (lesson: Lesson): Arrived => ({ chapters: lesson.chapters, done: lesson });

export type LessonState = {
  chapters: Chapter[];
  done: Lesson | null;
  flat: FlatStep[];
  at: number;
  reached: number;
  steps: StepState[];
};

export type Action =
  | { type: "problem"; action: ProblemAction }
  | { type: "slider"; id: string; value: number }
  | { type: "next" }
  | { type: "back" }
  | { type: "grow"; arrived: Arrived };

function flatten(chapters: Chapter[]): FlatStep[] {
  const seen = new Set<string>();
  return chapters.flatMap((chapter, c) =>
    chapter.steps.map((step, index): FlatStep => {
      const worked = step.problem?.type === "run" ? null : step.primitive;
      const introduces = worked !== null && !seen.has(worked);
      if (worked !== null) seen.add(worked);
      return { chapter: c, index, step, introduces };
    }),
  );
}

function freshState({ step }: FlatStep): StepState {
  const primitive = step.primitive === null ? undefined : PRIMITIVE_BY_ID.get(step.primitive);
  return { values: primitive ? initialValues(primitive) : {}, problem: step.problem ? initProblem(step.problem) : null };
}

export function startLesson({ chapters, done }: Arrived): LessonState {
  const flat = flatten(chapters);
  return { chapters, done, flat, at: 0, reached: 0, steps: flat.map(freshState) };
}

/** `earns` is bookkeeping the server repairs when the lesson is finished, so it doesn't make a step a different step. */
const sameStep = (a: Step, b: Step) => JSON.stringify({ ...a, earns: null }) === JSON.stringify({ ...b, earns: null });

/** Takes a newer version of the lesson. Steps keep their state while their chapter id, step id and content are unchanged. */
function grow(s: LessonState, { chapters, done }: Arrived): LessonState {
  if (chapters === s.chapters && done === s.done) return s;
  const before = new Map(s.flat.map((f, i) => [`${s.chapters[f.chapter]?.id}/${f.step.id}`, { step: f.step, state: s.steps[i] }]));
  const flat = flatten(chapters);
  const steps = flat.map((f) => {
    const old = before.get(`${chapters[f.chapter]?.id}/${f.step.id}`);
    return old?.state && sameStep(old.step, f.step) ? old.state : freshState(f);
  });
  return { chapters, done, flat, steps, at: Math.min(s.at, flat.length), reached: Math.min(s.reached, flat.length) };
}

/** Past the last step of a finished lesson. */
export const isFinished = (s: LessonState) => s.done !== null && s.at >= s.flat.length;

/** Past the last step written so far, with more still to come. */
export const isWaiting = (s: LessonState) => s.done === null && s.at >= s.flat.length;

/** A step is complete when its problem is solved, or at once when it has none. */
export function isComplete(s: LessonState, i: number): boolean {
  const problem = s.steps[i]?.problem;
  return problem ? problemSolved(problem) : true;
}

/** Parts earned by completed steps that the player has reached. */
export function earnedParts(s: LessonState): Set<string> {
  const earned = new Set<string>();
  s.flat.forEach(({ step }, i) => {
    if (i <= s.reached && isComplete(s, i)) for (const id of step.earns) earned.add(id);
  });
  return earned;
}

type ChapterStatus = "done" | "current" | "upcoming";

export function chapterStatus(s: LessonState, chapter: number): ChapterStatus {
  const last = s.flat.findLastIndex((f) => f.chapter === chapter);
  const solved = s.flat.every((f, i) => f.chapter !== chapter || isComplete(s, i));
  if (s.reached > last && solved) return "done";
  return s.flat[s.at]?.chapter === chapter ? "current" : "upcoming";
}

export function reduce(s: LessonState, action: Action): LessonState {
  switch (action.type) {
    case "problem": {
      const current = s.steps[s.at];
      const problem = s.flat[s.at]?.step.problem;
      if (!current?.problem || !problem) return s;
      const next = reduceProblem(current.problem, action.action, problem, current.values);
      return next === current.problem ? s : { ...s, steps: s.steps.with(s.at, { ...current, problem: next }) };
    }
    case "slider": {
      const current = s.steps[s.at];
      if (!current) return s;
      // A verdict judged the old value, so it goes until the slider is let go again instead of describing a setting that has moved.
      const judged = s.flat[s.at]?.step.problem;
      const moved = judged?.type === "tune" && judged.slider === action.id;
      const problem = moved && current.problem?.type === "tune" && !current.problem.solved ? { ...current.problem, verdict: null } : current.problem;
      return { ...s, steps: s.steps.with(s.at, { values: { ...current.values, [action.id]: action.value }, problem }) };
    }
    case "next": {
      if (s.at >= s.flat.length || !isComplete(s, s.at)) return s;
      const at = s.at + 1;
      return { ...s, at, reached: Math.max(s.reached, at) };
    }
    case "back":
      return s.at > 0 ? { ...s, at: s.at - 1 } : s;
    case "grow":
      return grow(s, action.arrived);
  }
}
