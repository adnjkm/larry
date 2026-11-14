import * as stylex from "@stylexjs/stylex";
import { type ReactNode, useEffect, useRef } from "react";
import type { Problem, ProblemType } from "../../shared/lesson.ts";
import { PRIMITIVE_BY_ID } from "../primitives/catalog.ts";
import { reducedMotion } from "../motion.ts";
import { layout, notes, type } from "../styles.ts";
import { colors, radii } from "../tokens.stylex.ts";
import type { ProblemAction, ProblemState } from "./problems.ts";

type Of<T extends ProblemType> = Extract<Problem, { type: T }>;

type ViewProps<T extends ProblemType> = {
  problem: Of<T>;
  state: ProblemState<T>;
  dispatch: (action: ProblemAction<T>) => void;
};

/** A wrong pick gives one short shake, the way a refused passcode does, on top of its colour and label. */
const shake = stylex.keyframes({
  "0%, 100%": { transform: "translateX(0)" },
  "20%": { transform: "translateX(-6px)" },
  "40%": { transform: "translateX(5px)" },
  "60%": { transform: "translateX(-3px)" },
  "80%": { transform: "translateX(2px)" },
});

const styles = stylex.create({
  card: { position: "relative", display: "flex", flexDirection: "column", gap: 10, padding: 6, borderRadius: radii.tile, backgroundColor: colors.paper, boxShadow: `0 1px 0 ${colors.hairline}, 0 0 0 1px ${colors.faint}` },
  cardFail: { boxShadow: `inset 0 0 0 1.5px ${colors.fail}` },
  cardShake: { animationName: { default: shake, "@media (prefers-reduced-motion: reduce)": "none" }, animationDuration: "320ms", animationTimingFunction: "ease-out" },
  cardOk: { boxShadow: `inset 0 0 0 1.5px ${colors.ok}` },
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
    transform: { default: "none", ":active": "scale(0.98)" },
    opacity: { default: 1, ":active": 0.7 },
    transitionProperty: "transform, opacity",
    transitionDuration: "120ms",
    transitionTimingFunction: "ease-out",
  },
  optionName: { fontSize: 16, lineHeight: "22px", fontWeight: 600 },
  optionJob: { fontSize: 14, lineHeight: "19px", color: colors.graphite },
  optionDone: { cursor: "default" },
  cardBody: { display: "flex", flexDirection: "column", gap: 10, padding: "0 8px 8px" },
});

function Observation({ label, children, tone }: { label: string; children: ReactNode; tone?: "fail" | "ok" }) {
  return (
    <div data-note={tone ?? "observation"} {...stylex.props(notes.base, tone === "fail" && notes.fail, tone === "ok" && notes.ok)}>
      <p {...stylex.props(type.label, tone === "fail" && notes.failText, tone === "ok" && notes.okText)}>{label}</p>
      <p {...stylex.props(type.body)}>{children}</p>
    </div>
  );
}

/** The run action itself sits in the action bar; this is where its outcome lands, brought into view. */
function RunView({ problem, state }: ViewProps<"run">) {
  const outcome = useScrollIntoViewOn(state.ran);
  return (
    <div ref={outcome} aria-live="polite">
      {state.ran && <Observation label="What happened">{problem.outcome}</Observation>}
    </div>
  );
}

/** Scrolls the element into view when `trigger` turns truthy, unless it is already on screen. */
function useScrollIntoViewOn(trigger: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !trigger) return;
    const { top, bottom } = el.getBoundingClientRect();
    if (top >= 0 && bottom <= innerHeight) return;
    el.scrollIntoView({ block: "center", behavior: reducedMotion.matches ? "instant" : "smooth" });
  }, [trigger]);
  return ref;
}

/** Once solved, only what was tried stays: the wrong tries shrink to their names and the right one keeps its reason. */
function PickView({ problem, state, dispatch }: ViewProps<"pick">) {
  return (
    <div {...stylex.props(layout.stack)}>
      <p {...stylex.props(layout.inset, type.story)}>{problem.question}</p>
      {problem.options.map((option, i) => {
        const primitive = PRIMITIVE_BY_ID.get(option.primitive);
        const tried = state.tried.includes(i);
        const frozen = tried || state.solved;
        if (state.solved && !tried) return null;
        const spent = state.solved && !option.works;
        return (
          <div
            key={i}
            data-option={i}
            data-tried={tried || undefined}
            {...stylex.props(styles.card, tried && !option.works && styles.cardFail, tried && !option.works && !state.solved && styles.cardShake, tried && option.works && styles.cardOk)}
          >
            {/* aria-disabled, not disabled, so a tried option keeps focus and its verdict stays readable. */}
            <button type="button" aria-disabled={frozen} {...stylex.props(styles.option, frozen && styles.optionDone)} onClick={() => frozen || dispatch({ type: "pick", option: i })}>
              {tried && <span {...stylex.props(type.label, option.works ? notes.okText : notes.failText)}>{option.works ? "This works" : "This fails"}</span>}
              <span {...stylex.props(styles.optionName)}>{primitive?.name ?? option.primitive}</span>
              {primitive && !spent && <span {...stylex.props(styles.optionJob)}>{primitive.job}</span>}
            </button>
            {tried && !spent && (
              <div {...stylex.props(styles.cardBody)}>
                <p {...stylex.props(type.body)}>{option.outcome}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The slider itself is on the stage above; this is the target and the verdict on each release. */
function TuneView({ problem, state }: ViewProps<"tune">) {
  const verdict = useScrollIntoViewOn(state.verdict);

  return (
    <div {...stylex.props(layout.stack)}>
      <div {...stylex.props(notes.base, notes.accent)}>
        <p {...stylex.props(type.label, type.labelAccent)}>Goal</p>
        <p {...stylex.props(type.body)}>{problem.goal}</p>
      </div>
      <div ref={verdict} aria-live="polite">
        {state.verdict === "below" && <Observation label="Too low" tone="fail">{problem.tooLow}</Observation>}
        {state.verdict === "above" && <Observation label="Too high" tone="fail">{problem.tooHigh}</Observation>}
        {state.verdict === "inside" && <Observation label="Just right" tone="ok">{problem.justRight}</Observation>}
      </div>
    </div>
  );
}

const VIEWS: { [T in ProblemType]: (props: ViewProps<T>) => ReactNode } = { run: RunView, pick: PickView, tune: TuneView };

export function ProblemView({ problem, state, dispatch }: { problem: Problem; state: ProblemState; dispatch: (action: ProblemAction) => void }) {
  if (state.type !== problem.type) return null;
  const View = VIEWS[problem.type] as (props: ViewProps<ProblemType>) => ReactNode;
  return <View problem={problem} state={state} dispatch={dispatch} />;
}
