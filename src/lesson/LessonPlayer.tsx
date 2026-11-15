import * as stylex from "@stylexjs/stylex";
import { Button } from "@ui-sdk/react/button";
import { type RefObject, useEffect, useEffectEvent, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import type { Kit } from "../../shared/kit.ts";
import type { Lesson } from "../../shared/lesson.ts";
import { Chevron } from "../ui/Chevron.tsx";
import { Dots } from "../ui/Dots.tsx";
import { project, reducedMotion, rubberBand, spring, velocityTracker } from "../motion.ts";
import { PRIMITIVE_BY_ID } from "../../shared/primitives/catalog.ts";
import { PrimitiveFigure } from "../primitives/PrimitiveFigure.tsx";
import { bars, buttons, layout, notes, type } from "../ui/styles.ts";
import { BuildViewer } from "./BuildViewer.tsx";
import { DownloadButton } from "./DownloadButton.tsx";
import { GlowCard } from "./GlowCard.tsx";
import { HoldButton } from "../ui/HoldButton.tsx";
import { type Arrived, type LessonState, earnedParts, isComplete, isFinished, isWaiting, reduce, startLesson } from "./model.ts";
import { ProblemView } from "./ProblemViews.tsx";
import { Roadmap } from "./Roadmap.tsx";

/** Set when the lesson stopped arriving before it was done. */
type Stalled = { message: string; onRetry: () => void };

const fadeIn = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

const styles = stylex.create({
  screen: { display: "contents" },
  // Vertical pans and pinch zoom stay with the browser; horizontal ones are the swipe between steps.
  step: { display: "flex", flexDirection: "column", gap: 20, touchAction: "pan-y pinch-zoom" },
  header: { display: "flex", flexDirection: "column", gap: 8 },
  stage: { animationName: fadeIn, animationDuration: "240ms", animationTimingFunction: "ease-out" },
  roadmap: { flexGrow: 1 },
  // Holds the back chevron's place on the first step so the progress bar never shifts.
  backSpace: { width: 44, flexShrink: 0 },
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

  // Steps push in from the side they are in: forward from the right, back from the left.
  const previousAt = useRef(state.at);
  const enterFrom = Math.sign(state.at - previousAt.current);
  useEffect(() => {
    previousAt.current = state.at;
  }, [state.at]);

  const waiting = isWaiting(state);
  const screen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    // Tells a screen reader the step changed; the heading is the first thing on every screen.
    screen.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [state.at, waiting]);

  return (
    <>
      <div {...stylex.props(bars.top)}>
        {state.at > 0 ? (
          <Button data-action="back" aria-label="Back" {...stylex.props(buttons.base, buttons.icon)} onClick={() => dispatch({ type: "back" })}>
            <Chevron />
          </Button>
        ) : (
          <span {...stylex.props(styles.backSpace)} />
        )}
        <div {...stylex.props(styles.roadmap)}>
          <Roadmap state={state} />
        </div>
        <span {...stylex.props(styles.backSpace)} />
      </div>
      <div ref={screen} {...stylex.props(styles.screen)}>
        {state.done && finished ? (
          <Finish kit={kit} earned={earned} lesson={state.done} onRestart={onRestart} />
        ) : waiting ? (
          <Waiting stalled={stalled} />
        ) : (
          <StepScreen key={state.at} kit={kit} earned={earned} state={state} dispatch={dispatch} enterFrom={enterFrom} />
        )}
      </div>
    </>
  );
}

function StepScreen({ kit, earned, state, dispatch, enterFrom }: { kit: Kit; earned: ReadonlySet<string>; state: LessonState; dispatch: Dispatch; enterFrom: number }) {
  const article = useRef<HTMLElement>(null);
  const flat = state.flat[state.at];
  const current = state.steps[state.at];
  const complete = isComplete(state, state.at);
  useStepSwipe(article, {
    enterFrom,
    onNext: complete ? () => dispatch({ type: "next" }) : undefined,
    onBack: state.at > 0 ? () => dispatch({ type: "back" }) : undefined,
  });
  if (!flat || !current) return null;
  const { step } = flat;
  const chapter = state.chapters[flat.chapter];
  const primitive = step.primitive === null ? undefined : PRIMITIVE_BY_ID.get(step.primitive);
  const last = state.done !== null && state.at === state.flat.length - 1;
  const run = step.problem?.type === "run" && current.problem?.type === "run" && !current.problem.ran ? step.problem : undefined;

  // Only a tune step is about a setting, so every other figure is drawn still: a run step at the setting where it fails, so the outcome matches what is drawn.
  const tune = step.problem?.type === "tune" ? step.problem : undefined;
  // One stage per step. It shows the build instead of the figure when there is no figure, when the figure would give a pick's answer away,
  // and once the step has earned its parts, so the reward lands where the reader is already looking.
  const showBuild = !primitive || (step.problem?.type === "pick" && !complete) || (complete && step.earns.length > 0);

  return (
    <>
      <article ref={article} data-step={step.id} data-chapter={chapter?.id} data-complete={complete || undefined} {...stylex.props(styles.step)}>
        {flat.index === 0 && chapter && (
          <header data-chapter-header {...stylex.props(layout.inset, styles.header)}>
            {flat.chapter > 0 && <p {...stylex.props(type.label, type.labelAccent)}>{chapter.kind === "module" ? "The next requirement" : chapter.kind === "join" ? "Putting it together" : "The last piece"}</p>}
            <h2 tabIndex={-1} {...stylex.props(type.title)}>
              {chapter.kind === "module" ? chapter.need : chapter.title}
            </h2>
          </header>
        )}

        <h2 tabIndex={-1} {...stylex.props(layout.inset, type.task)}>
          {step.title}
        </h2>

        <div key={showBuild ? "build" : "figure"} data-stage={showBuild ? "build" : "figure"} {...stylex.props(styles.stage)}>
          {showBuild || !primitive ? (
            <BuildViewer kit={kit} earned={earned} />
          ) : (
            <PrimitiveFigure
              primitive={primitive}
              values={current.values}
              onSlider={tune && ((id, value) => dispatch({ type: "slider", id, value }))}
              focus={tune?.slider}
              onCommit={(id) => tune?.slider === id && dispatch({ type: "problem", action: { type: "tune" } })}
              // A pick step's option card has already named the piece.
              introduce={flat.introduces && step.problem?.type !== "pick"}
            />
          )}
        </div>

        <GlowCard data-story>
          {step.story.map((p) => (
            <p key={p} {...stylex.props(type.story)}>
              {p}
            </p>
          ))}
        </GlowCard>

        {step.problem && current.problem && <ProblemView problem={step.problem} state={current.problem} dispatch={(action) => dispatch({ type: "problem", action })} />}

        {complete && (
          <div data-payoff {...stylex.props(layout.inset, layout.stack)}>
            {step.payoff.map((p) => (
              <p key={p} {...stylex.props(type.story)}>
                {p}
              </p>
            ))}
          </div>
        )}
      </article>

      {(run || complete) && (
        <div data-action-bar {...stylex.props(bars.action)}>
          {run ? (
            <HoldButton data-action="run" label={run.action} onHeld={() => dispatch({ type: "problem", action: { type: "run" } })} />
          ) : (
            <Button data-action="next" {...stylex.props(buttons.base, buttons.primary)} onClick={() => dispatch({ type: "next" })}>
              {last ? "Finish" : "Next"}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

/**
 * The step follows a horizontal swipe 1:1: left for the next step once this one is complete, right for the one before.
 * A direction that isn't open rubber-bands. On release the flick's projected landing decides, and the step leaves at the finger's speed.
 * Mouse drags are left alone so text stays selectable on a desktop.
 */
function useStepSwipe(ref: RefObject<HTMLElement | null>, { enterFrom, onNext, onBack }: { enterFrom: number; onNext?: () => void; onBack?: () => void }) {
  const next = useEffectEvent(() => onNext?.());
  const back = useEffectEvent(() => onBack?.());
  const can = useEffectEvent((direction: number) => (direction < 0 ? onNext : onBack) !== undefined);

  // Only on mount: the screen is keyed by step, and a later render must not cut the entrance short.
  const enter = useRef(enterFrom);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || enter.current === 0) return;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
    if (reducedMotion.matches) return;
    return spring(enter.current * el.offsetWidth * 0.3, 0, 0, (x) => (el.style.transform = x ? `translateX(${x}px)` : ""), { response: 0.4 });
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tracker = velocityTracker();
    let start: { x: number; y: number; id: number } | undefined;
    let axis: "x" | "y" | undefined;
    /** Where the step is drawn now, so a finger can catch it mid-spring. */
    let x = 0;
    const set = (to: number) => {
      x = to;
      el.style.transform = to ? `translateX(${to}px)` : "";
    };
    let stop: (() => void) | undefined;

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !e.isPrimary) return;
      if (e.target instanceof Element && e.target.closest("input, [data-kit-viewer]")) return;
      stop?.();
      start = { x: e.clientX - x, y: e.clientY, id: e.pointerId };
      axis = undefined;
      tracker.reset();
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!axis) {
        // A little travel first, so a tap or a scroll never nudges the step.
        if (Math.hypot(dx, dy) < 10) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (axis === "x") el.setPointerCapture(e.pointerId);
      }
      if (axis !== "x") return;
      set(can(Math.sign(dx)) ? dx : rubberBand(dx, el.offsetWidth));
      tracker.add(x, e.timeStamp);
    };
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      start = undefined;
      if (axis !== "x") return;
      const width = el.offsetWidth;
      const velocity = e.type === "pointerup" ? tracker.velocity(e.timeStamp) : 0;
      const landing = x + project(velocity);
      const direction = Math.abs(landing) > width / 2 && can(Math.sign(landing)) ? Math.sign(landing) : 0;
      if (direction === 0) {
        stop = spring(x, 0, velocity, set, { response: 0.3 });
        return;
      }
      const go = () => (direction < 0 ? next() : back());
      if (reducedMotion.matches) go();
      else stop = spring(x, direction * width, velocity, set, { response: 0.25, onDone: go });
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      stop?.();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [ref]);
}

function Waiting({ stalled }: { stalled?: Stalled }) {
  return (
    <section data-waiting={stalled ? undefined : ""} data-lesson-failed={stalled ? "" : undefined} {...stylex.props(layout.stack)}>
      {stalled ? (
        <div role="alert" {...stylex.props(notes.base, notes.fail)}>
          <h2 tabIndex={-1} {...stylex.props(type.label, notes.failText)}>
            Larry stopped writing
          </h2>
          <p {...stylex.props(type.body)}>{stalled.message}</p>
        </div>
      ) : (
        <div role="status" {...stylex.props(layout.inset, layout.stack)}>
          <h2 tabIndex={-1} {...stylex.props(type.label, type.labelAccent)}>
            Up next
          </h2>
          <p {...stylex.props(type.story)}>
            Larry is still writing the next part
            <Dots />
          </p>
        </div>
      )}
      {stalled && (
        <div {...stylex.props(bars.action)}>
          <Button data-action="retry" {...stylex.props(buttons.base, buttons.primary)} onClick={stalled.onRetry}>
            Try again
          </Button>
        </div>
      )}
    </section>
  );
}

function Finish({ kit, earned, lesson, onRestart }: { kit: Kit; earned: ReadonlySet<string>; lesson: Lesson; onRestart: () => void }) {
  return (
    <section data-finish {...stylex.props(layout.stack)}>
      <BuildViewer kit={kit} earned={earned} />
      <div {...stylex.props(layout.inset, layout.tight)}>
        <p {...stylex.props(type.label, type.labelAccent)}>You built it</p>
        <h2 tabIndex={-1} {...stylex.props(type.task)}>
          {lesson.title}
        </h2>
      </div>
      <GlowCard>
        {lesson.closing.map((p) => (
          <p key={p} {...stylex.props(type.story)}>
            {p}
          </p>
        ))}
      </GlowCard>
      <Button data-action="restart" {...stylex.props(buttons.base, buttons.secondary)} onClick={onRestart}>
        Photograph something else
      </Button>
      <div {...stylex.props(bars.action)}>
        <DownloadButton kit={kit} primary />
      </div>
    </section>
  );
}
