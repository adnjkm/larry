import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex.ts";
import { ui } from "./lessonTokens.stylex.ts";
import { type LessonState, chapterStatus } from "./model.ts";
import { layout, type } from "./styles.ts";

const styles = stylex.create({
  chip: {
    boxSizing: "border-box",
    maxWidth: "100%",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 999,
    backgroundColor: ui.surface,
    color: colors.graphite,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.2,
  },
  text: { overflowWrap: "anywhere" },
  small: { fontSize: 12, padding: "4px 10px" },
  current: { backgroundColor: ui.accent, color: "#FFFFFF" },
  done: { backgroundColor: colors.paper, color: colors.ink, boxShadow: `inset 0 0 0 1px ${ui.line}` },
  more: { backgroundColor: "transparent", boxShadow: `inset 0 0 0 1px ${ui.line}` },
  tick: { fontWeight: 700, color: ui.ok },
});

/** "It must carry ink out to the paper" becomes "Carry ink out to the paper", under an "It must" label. */
const short = (need: string) => {
  const rest = need.replace(/^it must\s+/i, "");
  return rest.charAt(0).toUpperCase() + rest.slice(1);
};

export function Roadmap({ state }: { state: LessonState }) {
  const chapterAt = (step: number) => state.flat[Math.min(step, state.flat.length - 1)]?.chapter ?? 0;
  const furthest = Math.max(chapterAt(state.at), chapterAt(state.reached));
  return (
    <nav aria-label="Roadmap" data-roadmap {...stylex.props(layout.tight)}>
      <p {...stylex.props(type.label)}>It must…</p>
      <div {...stylex.props(layout.row)}>
        {state.chapters.map((chapter, i) => {
          const status = chapterStatus(state, i);
          const hidden = chapter.kind === "module" && chapter.surprise && i > furthest && status === "upcoming";
          const label = chapter.kind === "module" ? (hidden ? "?" : short(chapter.need)) : chapter.title;
          return (
            <span key={chapter.id} data-chapter={chapter.id} data-status={status} aria-current={status === "current" ? "step" : undefined} {...stylex.props(styles.chip, chapter.kind !== "module" && styles.small, status === "done" && styles.done, status === "current" && styles.current)}>
              {status === "done" && <span {...stylex.props(styles.tick)}>✓</span>}
              <span {...stylex.props(styles.text)}>{label}</span>
            </span>
          );
        })}
        {state.done === null && (
          <span data-placeholder aria-label="More to come" {...stylex.props(styles.chip, styles.small, styles.more)}>
            …
          </span>
        )}
      </div>
    </nav>
  );
}
