import * as stylex from "@stylexjs/stylex";
import { SegmentedControl, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { camera } from "../camera/camera.stylex.ts";
import { ACCENT, CAMERA, even } from "../camera/look.ts";
import { screen } from "../camera/screen.stylex.ts";
import { rrect } from "../surface/relief.ts";
import { Surface } from "../surface/Surface.tsx";
import { fonts } from "../tokens.stylex.ts";

/** Keys sit this far apart and round their corners this much, so together they read as one bar. */
const GAP = 6;
const RADIUS = 10;

/**
 * The lesson's progress, one key per mechanism across `width`, under a count. Each key is a sculpted keycap (see
 * feature.keycap). Before the lesson starts every key is grey. Once it starts, the steps reached so far are pink. Any
 * step reached can be opened again; the ones ahead can't, as their parts
 * aren't built yet and each step builds on the last. It's a segmented control, so it's one tab stop and the arrow keys
 * move along the steps that can be opened.
 */
export function LessonProgress({
  count,
  reached,
  step,
  onStep,
  width,
  height,
}: {
  count: number;
  /** The furthest step reached, -1 before the lesson starts, `count` once it's finished. */
  reached: number;
  step: number;
  onStep: (step: number) => void;
  width: number;
  /** The keys' height in CSS px. */
  height: number;
}) {
  const key = even((width - GAP * (count - 1)) / count);
  const started = reached >= 0;
  return (
    <div {...stylex.props(s.progress(width))}>
      <span {...stylex.props(s.count)}>
        {count} {count === 1 ? "mechanism" : "mechanisms"}
      </span>
      <SegmentedControl
        aria-label="Lesson steps"
        value={started ? String(step) : null}
        onValueChange={(next) => next !== null && onStep(Number(next))}
        {...stylex.props(s.steps)}
      >
        {Array.from({ length: count }, (_, i) => {
          const open = started && i <= reached;
          return (
            <SegmentedControlItem key={i} value={String(i)} disabled={!open} aria-label={`Step ${i + 1} of ${count}`} {...stylex.props(s.step(key, height))}>
              <Surface
                shape={rrect(key, height, RADIUS)}
                relief="keycap"
                material={open ? "pink" : "bone"}
                ground="light"
                grain={CAMERA.grain}
                depth={CAMERA.relief}
                drift={CAMERA.idleDither}
              />
            </SegmentedControlItem>
          );
        })}
      </SegmentedControl>
    </div>
  );
}

const s = stylex.create({
  progress: (width: number) => ({ width, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }),
  count: { fontFamily: fonts.mono, fontSize: 12, lineHeight: "16px", letterSpacing: "0.08em", textTransform: "uppercase", color: screen.muted },
  // The keys together span the width. Each is positioned, so its Surface sits under it.
  steps: { display: "flex", gap: GAP, alignSelf: "stretch" },
  step: (width: number, height: number) => ({
    position: "relative",
    width,
    height,
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: { default: "pointer", ":disabled": "default" },
    outline: { default: "none", ":focus-visible": `2px solid ${ACCENT}` },
    outlineOffset: 3,
    borderRadius: RADIUS,
    transform: { default: "none", ":active:not(:disabled)": "scale(0.97)" },
    transition: `transform 160ms ${camera.easeOut}`,
  }),
});
