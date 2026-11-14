// The lesson player's state machine. A lesson is flattened into one list of steps. `at` is the step on screen
// (flat.length means the finish screen) and `reached` is the furthest `at` so far, so going back keeps what was earned.
import type { Lesson, Step } from "../../shared/lesson.ts";
import { PRIMITIVE_BY_ID } from "../primitives/catalog.ts";
import { initialValues } from "../primitives/library.ts";
import type { Values } from "../primitives/types.ts";
import { type ProblemAction, type ProblemState, initProblem, problemSolved, reduceProblem } from "./problems.ts";

export type FlatStep = {
  chapter: number;
  /** Position inside its chapter. */
  index: number;
  step: Step;
  /** True for the first step in the lesson that shows this step's primitive, which is when the player introduces it. */
  introduces: boolean;
};

export type StepState = {
  /** The figure's slider values. A tune problem judges the one it names. */
  values: Values;
  problem: ProblemState | null;
};

export type LessonState = {
  lesson: Lesson;
  flat: FlatStep[];
  at: number;
  reached: number;
  steps: StepState[];
};

export type Action =
  | { type: "problem"; action: ProblemAction }
  | { type: "slider"; id: string; value: number }
  | { type: "next" }
  | { type: "back" };

export function startLesson(lesson: Lesson): LessonState {
  const seen = new Set<string>();
  const flat = lesson.chapters.flatMap((chapter, c) =>
    chapter.steps.map((step, index): FlatStep => {
      const introduces = step.primitive !== null && !seen.has(step.primitive);
      if (step.primitive !== null) seen.add(step.primitive);
      return { chapter: c, index, step, introduces };
    }),
  );
  const steps = flat.map(({ step }): StepState => {
    const primitive = step.primitive === null ? undefined : PRIMITIVE_BY_ID.get(step.primitive);
    return { values: primitive ? initialValues(primitive) : {}, problem: step.problem ? initProblem(step.problem) : null };
  });
  return { lesson, flat, at: 0, reached: 0, steps };
}

export const isFinished = (s: LessonState) => s.at >= s.flat.length;

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

export type ChapterStatus = "done" | "current" | "upcoming";

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
      return current ? { ...s, steps: s.steps.with(s.at, { ...current, values: { ...current.values, [action.id]: action.value } }) } : s;
    }
    case "next": {
      if (isFinished(s) || !isComplete(s, s.at)) return s;
      const at = s.at + 1;
      return { ...s, at, reached: Math.max(s.reached, at) };
    }
    case "back":
      return s.at > 0 ? { ...s, at: s.at - 1 } : s;
  }
}
