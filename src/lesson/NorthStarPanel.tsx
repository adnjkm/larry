import * as stylex from "@stylexjs/stylex";
import { Button } from "@ui-sdk/react/button";
import type { Kit } from "../../shared/kit.ts";
import { Dots } from "../ui/Dots.tsx";
import { bars, buttons, layout, notes, type } from "../ui/styles.ts";
import { colors, radii } from "../tokens.stylex.ts";
import { DownloadButton } from "./DownloadButton.tsx";
import { type LessonLoad, arrivedOf } from "./load.ts";
import { needText } from "./needText.ts";

const styles = stylex.create({
  needs: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" },
  line: { display: "flex", gap: 10, fontSize: 16, lineHeight: "22px" },
  need: { padding: "10px 0", borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: colors.rule },
  marker: { flexShrink: 0, width: 10, height: 10, marginTop: 6, borderRadius: radii.marker, backgroundColor: colors.accent },
  markerHollow: { backgroundColor: "transparent", boxShadow: `inset 0 0 0 1.5px ${colors.accent}` },
  surprise: { color: colors.graphite },
});

export function NorthStarPanel({ kit, lesson, onStart, onRetry }: { kit: Kit; lesson: LessonLoad; onStart: () => void; onRetry: () => void }) {
  const { chapters } = arrivedOf(lesson);
  const modules = chapters.flatMap((c) => (c.kind === "module" ? [c] : []));
  const known = modules.filter((m) => !m.surprise);
  const surprises = modules.length - known.length;
  // A lesson that failed after its first chapter is still playable; the player offers the retry where the chapters run out.
  const ready = chapters.length > 0;
  const failed = lesson.status === "failed" && !ready ? lesson : undefined;

  return (
    <>
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
                <span>
                  Larry is still writing the rest
                  <Dots />
                </span>
              </li>
            )}
          </ul>
        </section>
      )}

      {failed && (
        <div data-lesson-failed role="alert" {...stylex.props(notes.base, notes.fail)}>
          <p {...stylex.props(type.label, notes.failText)}>Larry could not plan the build</p>
          <p {...stylex.props(type.body)}>{failed.message}</p>
        </div>
      )}

      <DownloadButton kit={kit} />

      <div {...stylex.props(bars.action)}>
        {failed ? (
          <Button data-action="retry" {...stylex.props(buttons.base, buttons.primary)} onClick={onRetry}>
            Try again
          </Button>
        ) : (
          <Button data-action="start" disabled={!ready} {...stylex.props(buttons.base, buttons.primary, !ready && buttons.disabled)} onClick={onStart}>
            {ready ? (
              "Start building"
            ) : (
              <>
                Larry is planning your build
                <Dots />
              </>
            )}
          </Button>
        )}
      </div>
    </>
  );
}
