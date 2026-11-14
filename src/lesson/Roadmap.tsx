import * as stylex from "@stylexjs/stylex";
import { type } from "../styles.ts";
import { colors } from "../tokens.stylex.ts";
import { type LessonState, chapterStatus } from "./model.ts";

const styles = stylex.create({
  bar: { display: "flex", flexDirection: "column", alignItems: "center", gap: 7 },
  segments: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3 },
  segment: { width: 26, height: 4, borderRadius: 1, backgroundColor: colors.segmentTodo },
  done: { backgroundColor: colors.ink },
  current: { backgroundColor: colors.accent },
});

/** One segment per chapter, with a grey one after them while the rest of the lesson is still being written. */
export function Roadmap({ state }: { state: LessonState }) {
  const current = state.chapters.findIndex((_, i) => chapterStatus(state, i) === "current");
  const total = state.done ? ` of ${state.chapters.length}` : "";
  return (
    <nav aria-label="Progress" data-roadmap {...stylex.props(styles.bar)}>
      <p {...stylex.props(type.label)}>{current < 0 ? "Chapters" : `Chapter ${current + 1}${total}`}</p>
      <div {...stylex.props(styles.segments)}>
        {state.chapters.map((chapter, i) => {
          const status = chapterStatus(state, i);
          return <span key={chapter.id} data-chapter={chapter.id} data-status={status} aria-current={status === "current" ? "step" : undefined} {...stylex.props(styles.segment, status === "done" && styles.done, status === "current" && styles.current)} />;
        })}
        {state.done === null && <span data-placeholder aria-label="More to come" {...stylex.props(styles.segment)} />}
      </div>
    </nav>
  );
}
