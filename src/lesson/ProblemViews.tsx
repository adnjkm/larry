// How each problem type looks and plays. Pair with the logic in problems.ts; the map below must have every type.
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import type { Problem, ProblemType } from "../../shared/lesson.ts";
import { PRIMITIVE_BY_ID } from "../primitives/catalog.ts";
import { initialValues } from "../primitives/library.ts";
import { colors } from "../tokens.stylex.ts";
import { ui } from "./lessonTokens.stylex.ts";
import { PrimitiveFigure } from "./PrimitiveFigure.tsx";
import type { ProblemAction, ProblemState } from "./problems.ts";
import { buttons, layout, notes, type } from "./styles.ts";

type Of<T extends ProblemType> = Extract<Problem, { type: T }>;

type ViewProps<T extends ProblemType> = {
  problem: Of<T>;
  state: ProblemState<T>;
  dispatch: (action: ProblemAction<T>) => void;
  /** The step's primitive figure with its sliders, or null when the step has none. Each view places it where it belongs. */
  figure: ReactNode;
};

const styles = stylex.create({
  card: { display: "flex", flexDirection: "column", gap: 10, padding: 6, borderRadius: 16, borderWidth: 2, borderStyle: "solid", borderColor: ui.line },
  cardFail: { borderColor: ui.failSoft, backgroundColor: ui.failSoft },
  cardOk: { borderColor: ui.ok, backgroundColor: ui.okSoft },
  option: {
    boxSizing: "border-box",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    padding: "10px 12px",
    borderWidth: 0,
    borderRadius: 12,
    backgroundColor: "transparent",
    color: colors.ink,
    fontFamily: "inherit",
    textAlign: "left",
    cursor: "pointer",
    touchAction: "manipulation",
  },
  optionOpen: { backgroundColor: ui.surface },
  optionName: { fontSize: 18, fontWeight: 600 },
  optionJob: { fontSize: 14, lineHeight: 1.4, color: colors.graphite },
  optionDone: { cursor: "default" },
  cardBody: { display: "flex", flexDirection: "column", gap: 10, padding: "0 8px 8px" },
  outcome: { margin: 0, fontSize: 15, lineHeight: 1.5 },
});

function Observation({ label, children, tone }: { label: string; children: ReactNode; tone?: "fail" | "ok" }) {
  return (
    <div data-note={tone ?? "observation"} aria-live="polite" {...stylex.props(notes.base, notes.observation, tone === "fail" && notes.fail, tone === "ok" && notes.ok)}>
      <p {...stylex.props(type.label, tone === "fail" && notes.failText, tone === "ok" && notes.okText)}>{label}</p>
      <p {...stylex.props(type.body)}>{children}</p>
    </div>
  );
}

function RunView({ problem, state, dispatch, figure }: ViewProps<"run">) {
  return (
    <div {...stylex.props(layout.stack)}>
      {figure}
      {state.ran ? (
        <Observation label="What happened">{problem.outcome}</Observation>
      ) : (
        <button type="button" data-action="run" {...stylex.props(buttons.base, buttons.primary)} onClick={() => dispatch({ type: "run" })}>
          {problem.action}
        </button>
      )}
    </div>
  );
}

function PickView({ problem, state, dispatch, figure }: ViewProps<"pick">) {
  const lastFailed = state.tried.findLast((i) => !problem.options[i]?.works);
  const tries = state.tried.length;
  return (
    <div {...stylex.props(layout.stack)}>
      <p {...stylex.props(type.lead)}>{problem.question}</p>
      {problem.options.map((option, i) => {
        const primitive = PRIMITIVE_BY_ID.get(option.primitive);
        const tried = state.tried.includes(i);
        const frozen = tried || state.solved;
        return (
          <div key={i} data-option={i} data-tried={tried || undefined} {...stylex.props(styles.card, tried && !option.works && styles.cardFail, tried && option.works && styles.cardOk)}>
            <button type="button" disabled={frozen} aria-label={`${primitive?.name ?? option.primitive}: ${primitive?.job ?? ""}`} {...stylex.props(styles.option, !frozen && styles.optionOpen, frozen && styles.optionDone)} onClick={() => dispatch({ type: "pick", option: i })}>
              {tried && <span {...stylex.props(type.label, option.works ? notes.okText : notes.failText)}>{option.works ? "This works" : "This fails"}</span>}
              <span {...stylex.props(styles.optionName)}>{primitive?.name ?? option.primitive}</span>
              {primitive && <span {...stylex.props(styles.optionJob)}>{primitive.job}</span>}
            </button>
            {tried && (
              <div {...stylex.props(styles.cardBody)}>
                <p {...stylex.props(styles.outcome)}>{option.outcome}</p>
                {lastFailed === i && primitive && !state.solved && <PrimitiveFigure primitive={primitive} values={initialValues(primitive)} height={180} />}
              </div>
            )}
          </div>
        );
      })}
      <p data-attempts {...stylex.props(type.label)}>
        {tries === 0 ? "Tap one to try it" : `${tries} ${tries === 1 ? "try" : "tries"}`}
      </p>
      {state.solved && figure}
    </div>
  );
}

function TuneView({ problem, state, dispatch, figure }: ViewProps<"tune">) {
  return (
    <div {...stylex.props(layout.stack)}>
      <div {...stylex.props(notes.base, notes.observation, notes.accent)}>
        <p {...stylex.props(type.label, type.labelAccent)}>Goal</p>
        <p {...stylex.props(type.body)}>{problem.goal}</p>
      </div>
      {figure}
      {!state.solved && (
        <button type="button" data-action="try" {...stylex.props(buttons.base, buttons.primary)} onClick={() => dispatch({ type: "tune" })}>
          Try it
        </button>
      )}
      {state.verdict === "below" && <Observation label="Too low" tone="fail">{problem.tooLow}</Observation>}
      {state.verdict === "above" && <Observation label="Too high" tone="fail">{problem.tooHigh}</Observation>}
      {state.verdict === "inside" && <Observation label="Just right" tone="ok">{problem.justRight}</Observation>}
      {state.attempts > 0 && (
        <p data-attempts {...stylex.props(type.label)}>
          {state.attempts} {state.attempts === 1 ? "try" : "tries"}
        </p>
      )}
    </div>
  );
}

const VIEWS: { [T in ProblemType]: (props: ViewProps<T>) => ReactNode } = { run: RunView, pick: PickView, tune: TuneView };

export function ProblemView({ problem, state, dispatch, figure }: { problem: Problem; state: ProblemState; dispatch: (action: ProblemAction) => void; figure: ReactNode }) {
  if (state.type !== problem.type) return null;
  const View = VIEWS[problem.type] as (props: ViewProps<ProblemType>) => ReactNode;
  return <View problem={problem} state={state} dispatch={dispatch} figure={figure} />;
}
