import * as stylex from "@stylexjs/stylex";
import type { Kit } from "../../shared/kit.ts";
import { buttons, layout, notes, type } from "../styles.ts";
import { colors, radii } from "../tokens.stylex.ts";
import { DownloadButton } from "./DownloadButton.tsx";
import { type LessonLoad, arrivedOf, hookOf } from "./lessonSource.ts";
import { needText } from "./needText.ts";

const styles = stylex.create({
  count: { display: "flex", alignItems: "baseline", gap: 8 },
  needs: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" },
  line: { display: "flex", gap: 10, fontSize: 16, lineHeight: "22px" },
  need: { padding: "10px 0", borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: colors.rule },
  marker: { flexShrink: 0, width: 10, height: 10, marginTop: 6, borderRadius: radii.marker, backgroundColor: colors.accent },
  markerHollow: { backgroundColor: "transparent", boxShadow: `inset 0 0 0 1.5px ${colors.accent}` },
  surprise: { color: colors.graphite },
});

export function NorthStarPanel({ kit, lesson, onStart, onRetry, onRestart }: { kit: Kit; lesson: LessonLoad; onStart: () => void; onRetry: () => void; onRestart: () => void }) {
  const { chapters } = arrivedOf(lesson);
  const hook = hookOf(lesson);
  const modules = chapters.flatMap((c) => (c.kind === "module" ? [c] : []));
  const known = modules.filter((m) => !m.surprise);
  const surprises = modules.length - known.length;
  const ready = chapters.length > 0 && lesson.status !== "failed";

  return (
    <>
      <div {...stylex.props(layout.inset, styles.count)}>
        <p {...stylex.props(type.numeral)}>{kit.parts.length}</p>
        <p {...stylex.props(type.numeralUnit)}>{kit.parts.length === 1 ? "part" : "parts"}</p>
      </div>

      {hook && (
        <section data-hook {...stylex.props(layout.inset, layout.stack)}>
          {hook.map((p) => (
            <div key={p} {...stylex.props(styles.line)}>
              <span {...stylex.props(styles.marker)} />
              <p {...stylex.props(type.story)}>{p}</p>
            </div>
          ))}
        </section>
      )}

      {known.length > 0 && (
        <section data-requirements {...stylex.props(layout.inset, layout.tight)}>
          <p {...stylex.props(type.label)}>To make a {kit.name.toLowerCase()}, it must…</p>
          <ul {...stylex.props(styles.needs)}>
            {known.map((m) => (
              <li key={m.id} {...stylex.props(styles.line, styles.need)}>
                <span {...stylex.props(styles.marker)} />
                <span>{needText(m.need)}</span>
              </li>
            ))}
            {surprises > 0 && (
              <li {...stylex.props(styles.line, styles.need, styles.surprise)}>
                <span {...stylex.props(styles.marker, styles.markerHollow)} />
                <span>{surprises === 1 ? "One more you will only notice once it fails" : `${surprises} more you will only notice once they fail`}</span>
              </li>
            )}
            {lesson.status === "planning" && (
              <li data-more {...stylex.props(styles.line, styles.need, styles.surprise)}>
                <span {...stylex.props(styles.marker, styles.markerHollow)} />
                <span>Larry is still writing the rest</span>
              </li>
            )}
          </ul>
        </section>
      )}

      {lesson.status === "failed" && (
        <div data-lesson-failed {...stylex.props(notes.base, notes.fail)}>
          <p {...stylex.props(type.label, notes.failText)}>Larry could not plan the build</p>
          <p {...stylex.props(type.body)}>{lesson.message}</p>
        </div>
      )}

      {lesson.status === "failed" ? (
        <button type="button" data-action="retry" {...stylex.props(buttons.base, buttons.primary)} onClick={onRetry}>
          Try again
        </button>
      ) : (
        <button type="button" data-action="start" disabled={!ready} {...stylex.props(buttons.base, buttons.primary, !ready && buttons.disabled)} onClick={onStart}>
          {ready ? "Start building" : "Larry is planning your build…"}
        </button>
      )}

      <DownloadButton kit={kit} />
      <button type="button" {...stylex.props(buttons.base, buttons.secondary)} onClick={onRestart}>
        Scan something else
      </button>
    </>
  );
}
