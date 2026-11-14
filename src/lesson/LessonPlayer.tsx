import * as stylex from "@stylexjs/stylex";
import { useEffect, useMemo, useReducer } from "react";
import type { Kit } from "../../shared/kit.ts";
import type { Lesson } from "../../shared/lesson.ts";
import { PRIMITIVE_BY_ID } from "../primitives/catalog.ts";
import { colors } from "../tokens.stylex.ts";
import { BuildViewer } from "./BuildViewer.tsx";
import { DownloadButton } from "./DownloadButton.tsx";
import { ui } from "./lessonTokens.stylex.ts";
import { type Arrived, type LessonState, earnedParts, isComplete, isFinished, isWaiting, reduce, startLesson } from "./model.ts";
import { PrimitiveFigure } from "./PrimitiveFigure.tsx";
import { ProblemView } from "./ProblemViews.tsx";
import { Roadmap } from "./Roadmap.tsx";
import { buttons, layout, notes, type } from "./styles.ts";

/** Set when the lesson stopped arriving before it was done. */
export type Stalled = { message: string; onRetry: () => void };

const styles = stylex.create({
  step: { display: "flex", flexDirection: "column", gap: 20 },
  header: { display: "flex", flexDirection: "column", gap: 8, paddingBottom: 18, borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: ui.line },
  need: { margin: 0, fontSize: 30, lineHeight: 1.12, fontWeight: 600, letterSpacing: "-0.025em", textWrap: "balance" },
  swatch: { width: 10, height: 10, borderRadius: 999, boxShadow: `inset 0 0 0 1px ${ui.line}` },
  part: { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, backgroundColor: colors.paper, fontSize: 14, fontWeight: 500 },
  nav: { display: "flex", gap: 10, paddingTop: 4, paddingBottom: "env(safe-area-inset-bottom)" },
  back: { width: "auto", flexShrink: 0 },
  next: { flexGrow: 1 },
});

type Dispatch = (action: Parameters<typeof reduce>[1]) => void;

/** Plays the lesson as far as it has arrived. A newer `arrived` is folded in without disturbing the steps that haven't changed. */
export function LessonPlayer({ kit, arrived, stalled, onRestart }: { kit: Kit; arrived: Arrived; stalled?: Stalled; onRestart: () => void }) {
  const [state, dispatch] = useReducer(reduce, arrived, startLesson);
  const earned = useMemo(() => earnedParts(state), [state]);
  const finished = isFinished(state);

  useEffect(() => {
    dispatch({ type: "grow", arrived: { chapters: arrived.chapters, done: arrived.done } });
  }, [arrived.chapters, arrived.done]);

  const waiting = isWaiting(state);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state.at, waiting]);

  return (
    <>
      <BuildViewer kit={kit} earned={earned} />
      <Roadmap state={state} />
      {state.done && finished ? (
        <Finish kit={kit} lesson={state.done} onRestart={onRestart} />
      ) : waiting ? (
        <Waiting stalled={stalled} />
      ) : (
        <StepScreen key={state.at} kit={kit} state={state} dispatch={dispatch} />
      )}
      {state.at >= state.flat.length && state.at > 0 && (
        <button type="button" {...stylex.props(buttons.base, buttons.quiet)} onClick={() => dispatch({ type: "back" })}>
          Back to the last step
        </button>
      )}
    </>
  );
}

function StepScreen({ kit, state, dispatch }: { kit: Kit; state: LessonState; dispatch: Dispatch }) {
  const flat = state.flat[state.at];
  const current = state.steps[state.at];
  if (!flat || !current) return null;
  const { step } = flat;
  const chapter = state.chapters[flat.chapter];
  const inChapter = state.flat.filter((f) => f.chapter === flat.chapter).length;
  const complete = isComplete(state, state.at);
  const primitive = step.primitive === null ? undefined : PRIMITIVE_BY_ID.get(step.primitive);
  const partsById = new Map(kit.parts.map((p) => [p.id, p]));
  const added = step.earns.flatMap((id) => partsById.get(id) ?? []);
  const last = state.done !== null && state.at === state.flat.length - 1;

  const figure = primitive && (
    <PrimitiveFigure
      primitive={primitive}
      values={current.values}
      onSlider={(id, value) => dispatch({ type: "slider", id, value })}
      focus={step.problem?.type === "tune" ? step.problem.slider : undefined}
      introduce={flat.introduces}
    />
  );

  return (
    <>
      <article data-step={step.id} data-chapter={chapter?.id} data-complete={complete || undefined} {...stylex.props(styles.step)}>
        {flat.index === 0 && chapter && (
          <header data-chapter-header {...stylex.props(styles.header)}>
            <p {...stylex.props(type.label, type.labelAccent)}>{chapter.kind === "module" ? "The next requirement" : chapter.kind === "join" ? "Putting it together" : "The last piece"}</p>
            <h2 {...stylex.props(styles.need)}>{chapter.kind === "module" ? chapter.need : chapter.title}</h2>
            {chapter.kind === "module" && <p {...stylex.props(type.muted)}>{chapter.why}</p>}
          </header>
        )}

        <div {...stylex.props(layout.tight)}>
          <p {...stylex.props(type.label)}>
            Step {flat.index + 1} of {inChapter}
          </p>
          <h3 {...stylex.props(type.title)}>{step.title}</h3>
        </div>

        <div {...stylex.props(layout.stack)}>
          {step.story.map((p) => (
            <p key={p} {...stylex.props(type.lead)}>
              {p}
            </p>
          ))}
        </div>

        {step.problem && current.problem ? (
          <ProblemView problem={step.problem} state={current.problem} dispatch={(action) => dispatch({ type: "problem", action })} figure={figure} />
        ) : (
          figure
        )}

        {complete && (
          <div data-payoff {...stylex.props(layout.stack)}>
            {step.payoff.map((p) => (
              <p key={p} {...stylex.props(type.body)}>
                {p}
              </p>
            ))}
          </div>
        )}

        {complete && added.length > 0 && (
          <div data-added {...stylex.props(notes.base, notes.observation, notes.accent)}>
            <p {...stylex.props(type.label, type.labelAccent)}>Added to your build</p>
            <div {...stylex.props(layout.row)}>
              {added.map((p) => (
                <span key={p.id} {...stylex.props(styles.part)}>
                  <span {...stylex.props(styles.swatch)} style={{ backgroundColor: p.color }} />
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </article>

      <div {...stylex.props(styles.nav)}>
        {state.at > 0 && (
          <button type="button" data-action="back" {...stylex.props(buttons.base, buttons.quiet, styles.back)} onClick={() => dispatch({ type: "back" })}>
            Back
          </button>
        )}
        <button type="button" data-action="next" disabled={!complete} {...stylex.props(buttons.base, styles.next, complete ? buttons.primary : buttons.disabled)} onClick={() => dispatch({ type: "next" })}>
          {last ? "Finish" : "Next"}
        </button>
      </div>
    </>
  );
}

function Waiting({ stalled }: { stalled?: Stalled }) {
  if (stalled)
    return (
      <section data-lesson-failed {...stylex.props(layout.stack)}>
        <div {...stylex.props(notes.base, notes.observation, notes.fail)}>
          <p {...stylex.props(type.label, notes.failText)}>Larry stopped writing</p>
          <p {...stylex.props(type.body)}>{stalled.message}</p>
        </div>
        <button type="button" data-action="retry" {...stylex.props(buttons.base, buttons.primary)} onClick={stalled.onRetry}>
          Try again
        </button>
      </section>
    );
  return (
    <section data-waiting role="status" {...stylex.props(layout.stack)}>
      <p {...stylex.props(type.label, type.labelAccent)}>Up next</p>
      <p {...stylex.props(type.lead)}>Larry is still writing the next part…</p>
    </section>
  );
}

function Finish({ kit, lesson, onRestart }: { kit: Kit; lesson: Lesson; onRestart: () => void }) {
  return (
    <section data-finish {...stylex.props(layout.stack)}>
      <p {...stylex.props(type.label, type.labelAccent)}>You built it</p>
      <h2 {...stylex.props(styles.need)}>{lesson.title}</h2>
      {lesson.closing.map((p) => (
        <p key={p} {...stylex.props(type.lead)}>
          {p}
        </p>
      ))}
      <DownloadButton kit={kit} />
      <button type="button" data-action="restart" {...stylex.props(buttons.base)} onClick={onRestart}>
        Scan something else
      </button>
    </section>
  );
}
