// Everything under the spinning model on the north-star screen.
import * as stylex from "@stylexjs/stylex";
import type { Kit } from "../../shared/kit.ts";
import { colors } from "../tokens.stylex.ts";
import { DownloadButton } from "./DownloadButton.tsx";
import { ui } from "./lessonTokens.stylex.ts";
import type { LessonLoad } from "./lessonSource.ts";
import { buttons, layout, notes, type } from "./styles.ts";

const styles = stylex.create({
  needs: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" },
  need: { display: "flex", gap: 10, padding: "10px 0", borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: ui.line, fontSize: 16, lineHeight: 1.35 },
  needMark: { flexShrink: 0, color: ui.accent, fontWeight: 600 },
  surprise: { color: colors.graphite },
});

export function NorthStarPanel({ kit, lesson, onStart, onRetry, onRestart }: { kit: Kit; lesson: LessonLoad; onStart: () => void; onRetry: () => void; onRestart: () => void }) {
  const modules = lesson.status === "ready" ? lesson.lesson.chapters.flatMap((c) => (c.kind === "module" ? [c] : [])) : [];
  const known = modules.filter((m) => !m.surprise);
  const surprises = modules.length - known.length;

  return (
    <>
      {lesson.status === "ready" && (
        <section data-hook {...stylex.props(layout.stack)}>
          {lesson.lesson.hook.map((p) => (
            <p key={p} {...stylex.props(type.lead)}>
              {p}
            </p>
          ))}
        </section>
      )}

      {lesson.status === "ready" && known.length > 0 && (
        <section data-requirements {...stylex.props(layout.tight)}>
          <p {...stylex.props(type.label)}>To make a {kit.name.toLowerCase()}, it must…</p>
          <ul {...stylex.props(styles.needs)}>
            {known.map((m) => (
              <li key={m.id} {...stylex.props(styles.need)}>
                <span {...stylex.props(styles.needMark)}>→</span>
                <span>{m.need.replace(/^it must\s+/i, "")}</span>
              </li>
            ))}
            {surprises > 0 && (
              <li {...stylex.props(styles.need, styles.surprise)}>
                <span {...stylex.props(styles.needMark)}>?</span>
                <span>
                  {surprises === 1 ? "One more you will only notice once it fails" : `${surprises} more you will only notice once they fail`}
                </span>
              </li>
            )}
          </ul>
        </section>
      )}

      {lesson.status === "failed" && (
        <div data-lesson-failed {...stylex.props(notes.base, notes.observation, notes.fail)}>
          <p {...stylex.props(type.label, notes.failText)}>Larry could not plan the build</p>
          <p {...stylex.props(type.body)}>{lesson.message}</p>
        </div>
      )}

      {lesson.status === "failed" ? (
        <button type="button" data-action="retry" {...stylex.props(buttons.base, buttons.primary)} onClick={onRetry}>
          Try again
        </button>
      ) : (
        <button type="button" data-action="start" disabled={lesson.status !== "ready"} {...stylex.props(buttons.base, lesson.status === "ready" ? buttons.primary : buttons.disabled)} onClick={onStart}>
          {lesson.status === "ready" ? "Start building" : "Larry is planning your build…"}
        </button>
      )}

      <DownloadButton kit={kit} />
      <button type="button" {...stylex.props(buttons.base, buttons.quiet)} onClick={onRestart}>
        Scan something else
      </button>
    </>
  );
}
