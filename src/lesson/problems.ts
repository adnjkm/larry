// The logic of each problem type. A new type is one entry in each of the three maps below
// (StateOf, ActionOf, PROBLEMS) and one entry in ProblemViews.tsx; the compiler flags any that is missing.
import type { Problem, ProblemType } from "../../shared/lesson.ts";
import type { Values } from "../primitives/types.ts";

type Of<T extends ProblemType> = Extract<Problem, { type: T }>;

type TuneVerdict = "below" | "inside" | "above";

type StateOf = {
  run: { ran: boolean };
  pick: { tried: number[]; solved: boolean };
  tune: { verdict: TuneVerdict | null; solved: boolean };
};

type ActionOf = {
  run: Record<never, never>;
  pick: { option: number };
  tune: Record<never, never>;
};

export type ProblemState<T extends ProblemType = ProblemType> = { [K in T]: { type: K } & StateOf[K] }[T];
export type ProblemAction<T extends ProblemType = ProblemType> = { [K in T]: { type: K } & ActionOf[K] }[T];

type Kind<T extends ProblemType> = {
  init: (problem: Of<T>) => StateOf[T];
  /** `values` are the step figure's current slider values. */
  reduce: (state: StateOf[T], action: ActionOf[T], problem: Of<T>, values: Values) => StateOf[T];
  solved: (state: StateOf[T]) => boolean;
};

const PROBLEMS: { [T in ProblemType]: Kind<T> } = {
  run: {
    init: () => ({ ran: false }),
    reduce: () => ({ ran: true }),
    solved: (s) => s.ran,
  },

  pick: {
    init: () => ({ tried: [], solved: false }),
    reduce: (s, { option }, problem) => {
      const chosen = problem.options[option];
      if (!chosen || s.solved || s.tried.includes(option)) return s;
      return { tried: [...s.tried, option], solved: chosen.works };
    },
    solved: (s) => s.solved,
  },

  tune: {
    init: () => ({ verdict: null, solved: false }),
    reduce: (s, _action, problem, values) => {
      if (s.solved) return s;
      const value = values[problem.slider];
      if (value === undefined) return s;
      const verdict: TuneVerdict = value < problem.min ? "below" : value > problem.max ? "above" : "inside";
      return { verdict, solved: verdict === "inside" };
    },
    solved: (s) => s.solved,
  },
};

export function initProblem(problem: Problem): ProblemState {
  return { type: problem.type, ...PROBLEMS[problem.type].init(problem as never) } as ProblemState;
}

export function reduceProblem(state: ProblemState, action: ProblemAction, problem: Problem, values: Values): ProblemState {
  if (state.type !== action.type || problem.type !== action.type) return state;
  const { type: _state, ...before } = state;
  const { type, ...rest } = action;
  const kind = PROBLEMS[type] as Kind<ProblemType>;
  const after = kind.reduce(before as never, rest as never, problem as never, values);
  return after === before ? state : ({ type, ...after } as ProblemState);
}

export function problemSolved(state: ProblemState): boolean {
  const { type, ...rest } = state;
  return (PROBLEMS[type] as Kind<ProblemType>).solved(rest as never);
}
