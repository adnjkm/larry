import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex.ts";
import { type LessonState, chapterStatus, isComplete } from "./model.ts";

const styles = stylex.create({
  segments: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3 },
  segment: { width: 26, height: 4, borderRadius: 1, backgroundColor: colors.segmentTodo },
  done: { backgroundColor: colors.ink },
  current: { overflow: "hidden" },
  fill: (share: number) => ({ display: "block", height: "100%", width: `${share * 100}%`, backgroundColor: colors.accent, transitionProperty: "width", transitionDuration: "240ms", transitionTimingFunction: "ease-out" }),
});

/**
 * One segment per chapter, with a grey one after them while the rest of the lesson is still being written.
 * The current chapter's segment fills step by step, so no screen needs to say which step it is.
 */
export function Roadmap({ state }: { state: LessonState }) {
  const current = state.chapters.findIndex((_, i) => chapterStatus(state, i) === "current");
  const total = state.chapters.length;
  const finished = current < 0;
  const inChapter = state.flat.filter((f) => f.chapter === current);
  const index = state.flat[state.at]?.index ?? 0;
  const share = inChapter.length === 0 ? 0 : (index + (isComplete(state, state.at) ? 1 : 0.5)) / inChapter.length;
  const steps = inChapter.length > 1 ? `, step ${index + 1} of ${inChapter.length}` : "";
  const text = finished ? `All ${total} chapters done` : `Chapter ${current + 1}${state.done ? ` of ${total}` : ""}${steps}`;
  return (
    <div role="progressbar" aria-label={text} aria-valuemin={1} aria-valuemax={total} aria-valuenow={finished ? total : current + 1} data-roadmap {...stylex.props(styles.segments)}>
      {state.chapters.map((chapter, i) => {
        const status = chapterStatus(state, i);
        return (
          <span key={chapter.id} data-chapter={chapter.id} data-status={status} {...stylex.props(styles.segment, status === "done" && styles.done, status === "current" && styles.current)}>
            {status === "current" && <span {...stylex.props(styles.fill(share))} />}
          </span>
        );
      })}
      {state.done === null && <span data-placeholder {...stylex.props(styles.segment)} />}
    </div>
  );
}
