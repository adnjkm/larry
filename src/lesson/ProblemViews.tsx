import * as stylex from "@stylexjs/stylex";
import { type ReactNode, useEffect, useRef } from "react";
import type { Problem, ProblemType } from "../../shared/lesson.ts";
import { PRIMITIVE_BY_ID } from "../primitives/catalog.ts";
import { initialValues } from "../primitives/library.ts";
import { PrimitiveFigure } from "../primitives/PrimitiveFigure.tsx";
import { buttons, layout, notes, type } from "../styles.ts";
import { colors, radii } from "../tokens.stylex.ts";
import type { ProblemAction, ProblemState } from "./problems.ts";

type Of<T extends ProblemType> = Extract<Problem, { type: T }>;

type ViewProps<T extends ProblemType> = {
  problem: Of<T>;
  state: ProblemState<T>;
  dispatch: (action: ProblemAction<T>) => void;
  /** The step's primitive figure with its sliders, or null when the step has none. Each view places it where it belongs. */
  figure: ReactNode;
};

const styles = stylex.create({
  card: { position: "relative", display: "flex", flexDirection: "column", gap: 10, padding: 6, borderRadius: radii.tile, backgroundColor: colors.paper, boxShadow: `0 1px 0 ${colors.hairline}, 0 0 0 1px ${colors.faint}` },
  cardFail: { boxShadow: `inset 0 0 0 1.5px ${colors.fail}` },
  cardOk: { boxShadow: `inset 0 0 0 1.5px ${colors.ok}` },
  check: { position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: radii.pill, backgroundColor: colors.ink, color: colors.paper, fontSize: 11, lineHeight: "18px", textAlign: "center" },
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
    userSelect: "none",
    opacity: { default: 1, ":active": 0.6 },
  },
  optionName: { fontSize: 16, lineHeight: "22px", fontWeight: 600 },
  optionJob: { fontSize: 14, lineHeight: "19px", color: colors.graphite },
  optionDone: { cursor: "default" },
  cardBody: { display: "flex", flexDirection: "column", gap: 10, padding: "0 8px 8px" },
});

function Observation({ label, children, tone }: { label: string; children: ReactNode; tone?: "fail" | "ok" }) {
  return (
    <div data-note={tone ?? "observation"} aria-live="polite" {...stylex.props(notes.base, tone === "fail" && notes.fail, tone === "ok" && notes.ok)}>
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
  return (
    <div {...stylex.props(layout.stack)}>
      <p {...stylex.props(layout.inset, type.story)}>{problem.question}</p>
      {problem.options.map((option, i) => {
        const primitive = PRIMITIVE_BY_ID.get(option.primitive);
        const tried = state.tried.includes(i);
        const frozen = tried || state.solved;
        return (
          <div key={i} data-option={i} data-tried={tried || undefined} {...stylex.props(styles.card, tried && !option.works && styles.cardFail, tried && option.works && styles.cardOk)}>
            <button type="button" disabled={frozen} aria-label={`${primitive?.name ?? option.primitive}: ${primitive?.job ?? ""}`} {...stylex.props(styles.option, frozen && styles.optionDone)} onClick={() => dispatch({ type: "pick", option: i })}>
              {tried && <span {...stylex.props(type.label, option.works ? notes.okText : notes.failText)}>{option.works ? "This works" : "This fails"}</span>}
              <span {...stylex.props(styles.optionName)}>{primitive?.name ?? option.primitive}</span>
              {primitive && <span {...stylex.props(styles.optionJob)}>{primitive.job}</span>}
            </button>
            {tried && option.works && <span aria-hidden {...stylex.props(styles.check)}>✓</span>}
            {tried && (
              <div {...stylex.props(styles.cardBody)}>
                <p {...stylex.props(type.body)}>{option.outcome}</p>
                {lastFailed === i && primitive && !state.solved && <PrimitiveFigure primitive={primitive} values={initialValues(primitive)} height={180} />}
              </div>
            )}
          </div>
        );
      })}
      {state.solved && figure}
    </div>
  );
}

function TuneView({ problem, state, figure }: ViewProps<"tune">) {
  const verdict = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = verdict.current;
    if (!el) return;
    const { top, bottom } = el.getBoundingClientRect();
    if (top >= 0 && bottom <= innerHeight) return;
    el.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [state.verdict]);

  return (
    <div {...stylex.props(layout.stack)}>
      <div {...stylex.props(notes.base, notes.accent)}>
        <p {...stylex.props(type.label, type.labelAccent)}>Goal</p>
        <p {...stylex.props(type.body)}>{problem.goal}</p>
      </div>
      {figure}
      {state.verdict && (
        <div ref={verdict}>
          {state.verdict === "below" && <Observation label="Too low" tone="fail">{problem.tooLow}</Observation>}
          {state.verdict === "above" && <Observation label="Too high" tone="fail">{problem.tooHigh}</Observation>}
          {state.verdict === "inside" && <Observation label="Just right" tone="ok">{problem.justRight}</Observation>}
        </div>
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
