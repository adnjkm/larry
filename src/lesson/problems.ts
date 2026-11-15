import type { Problem, ProblemType } from "../../shared/lesson.ts";
import type { Values } from "../../shared/primitives/types.ts";

type TuneVerdict = "below" | "inside" | "above";

type AnyState =
  | { type: "run"; ran: boolean }
  | { type: "pick"; tried: number[]; solved: boolean }
  | { type: "tune"; verdict: TuneVerdict | null; solved: boolean };

type AnyAction = { type: "run" } | { type: "pick"; option: number } | { type: "tune" };

export type ProblemState<T extends ProblemType = ProblemType> = Extract<AnyState, { type: T }>;
export type ProblemAction<T extends ProblemType = ProblemType> = Extract<AnyAction, { type: T }>;

export function initProblem(problem: Problem): ProblemState {
  switch (problem.type) {
    case "run":
      return { type: "run", ran: false };
    case "pick":
      return { type: "pick", tried: [], solved: false };
    case "tune":
      return { type: "tune", verdict: null, solved: false };
  }
}

/** `values` are the step figure's current slider values. */
export function reduceProblem(state: ProblemState, action: ProblemAction, problem: Problem, values: Values): ProblemState {
  if (state.type === "run" && action.type === "run" && problem.type === "run") return { type: "run", ran: true };

  if (state.type === "pick" && action.type === "pick" && problem.type === "pick") {
    const chosen = problem.options[action.option];
    if (!chosen || state.solved || state.tried.includes(action.option)) return state;
    return { type: "pick", tried: [...state.tried, action.option], solved: chosen.works };
  }

  if (state.type === "tune" && action.type === "tune" && problem.type === "tune") {
    const value = values[problem.slider];
    if (state.solved || value === undefined) return state;
    const verdict: TuneVerdict = value < problem.min ? "below" : value > problem.max ? "above" : "inside";
    return { type: "tune", verdict, solved: verdict === "inside" };
  }

  return state;
}

export function problemSolved(state: ProblemState): boolean {
  switch (state.type) {
    case "run":
      return state.ran;
    case "pick":
    case "tune":
      return state.solved;
  }
}
