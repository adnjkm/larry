import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex.ts";
import { type LessonState, chapterStatus } from "./model.ts";

const styles = stylex.create({
  segments: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3 },
  segment: { width: 26, height: 4, borderRadius: 1, backgroundColor: colors.segmentTodo },
  done: { backgroundColor: colors.ink },
  current: { backgroundColor: colors.accent },
});

/** One segment per chapter, with a grey one after them while the rest of the lesson is still being written. */
export function Roadmap({ state }: { state: LessonState }) {
  const current = state.chapters.findIndex((_, i) => chapterStatus(state, i) === "current");
  const total = state.chapters.length;
  const finished = current < 0;
  const text = finished ? `All ${total} chapters done` : `Chapter ${current + 1}${state.done ? ` of ${total}` : ""}`;
  return (
    <div role="progressbar" aria-label={text} aria-valuemin={1} aria-valuemax={total} aria-valuenow={finished ? total : current + 1}data-roadmap {...stylex.props(styles.segments)}>
      {state.chapters.map((chapter, i) => {
        const status = chapterStatus(state, i);
        return <span key={chapter.id} data-chapter={chapter.id} data-status={status} {...stylex.props(styles.segment, status === "done" && styles.done, status === "current" && styles.current)} />;
      })}
      {state.done === null && <span data-placeholder {...stylex.props(styles.segment)} />}
    </div>
  );
}
