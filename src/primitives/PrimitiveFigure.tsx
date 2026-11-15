import * as stylex from "@stylexjs/stylex";
import { type ComponentProps, useEffect, useEffectEvent, useRef, useState } from "react";
import { chips, layout, notes, type } from "../ui/styles.ts";
import { colors, fonts } from "../tokens.stylex.ts";
import { VIEWPORT_HEIGHT } from "../viewport.ts";
import { PRIMITIVE_BY_ID } from "../../shared/primitives/catalog.ts";
import { type Primitive, type Values, formatSlider } from "../../shared/primitives/library.ts";
import { FigureStage, type StageController } from "./stage/FigureStage.tsx";

const thumb = { boxSizing: "border-box", width: 24, height: 24, borderRadius: 999, borderWidth: 0, backgroundColor: colors.paper, boxShadow: `0 0 0 1px ${colors.shadow}, 0 2px 6px ${colors.shadow}` } as const;
const track = { height: 4, borderRadius: 2, backgroundColor: colors.rule } as const;

const styles = stylex.create({
  figure: { display: "flex", flexDirection: "column", gap: 12 },
  intro: { display: "flex", flexDirection: "column", gap: 6 },
  introName: { margin: 0, fontSize: 22, lineHeight: "28px", fontWeight: 600, letterSpacing: "-0.02em" },
  sliders: { display: "flex", flexDirection: "column", gap: 2 },
  // Label and value above a full-width track, so the thumb has the whole screen width to travel.
  sliderRow: { display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", columnGap: 10, rowGap: 2, padding: "10px 12px 4px", borderRadius: 12 },
  sliderTrack: { gridColumn: "1 / -1" },
  sliderRowFocus: { backgroundColor: colors.accentSoft },
  range: { width: "100%", margin: 0, height: 32, cursor: "pointer" },
  rangeNeutral: {
    appearance: "none",
    backgroundColor: "transparent",
    "::-webkit-slider-runnable-track": track,
    "::-moz-range-track": track,
    "::-webkit-slider-thumb": { ...thumb, appearance: "none", marginTop: -10 },
    "::-moz-range-thumb": thumb,
  },
  value: { fontFamily: fonts.mono, fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums" },
});

/** The primitives this one is built from, each once. */
export const madeOfPrimitives = (primitive: Primitive): Primitive[] => [...new Set(primitive.madeOf)].flatMap((id) => PRIMITIVE_BY_ID.get(id) ?? []);

/** A range input that also reports `change`, which fires when a drag is released or a key press settles, where React's onChange fires on every step. */
function Range({ onCommit, ...props }: ComponentProps<"input"> & { onCommit?: (value: number) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const commit = useEffectEvent(() => onCommit?.(Number(ref.current!.value)));
  useEffect(() => {
    const input = ref.current;
    input?.addEventListener("change", commit);
    return () => input?.removeEventListener("change", commit);
  }, []);
  return <input ref={ref} type="range" {...props} />;
}

type FigureProps = {
  primitive: Primitive;
  values: Values;
  /** The slider settled: a drag was let go of, or a keyboard change was made. Without this the figure is a still picture with no sliders. */
  onSlider?: (id: string, value: number) => void;
  /** Called after `onSlider`, when the slider settles. */
  onCommit?: (id: string) => void;
  /** The slider the problem is about: the only one shown. */
  focus?: string;
  /** Show the name, job and parts of a primitive the lesson has not shown before. */
  introduce?: boolean;
  height?: number;
};

/**
 * A lesson's figure: the app palette and only the slider its step asks about, because the readouts simulate a generic rig
 * whose numbers are not the object's. While a slider is dragged its value lives here and moves the figure through the
 * controller, so the parent re-renders only when the drag settles.
 */
export function PrimitiveFigure({ primitive, values, onSlider, focus, onCommit, introduce = false, height = VIEWPORT_HEIGHT }: FigureProps) {
  const sliders = primitive.sliders.filter((s) => s.id === focus);
  const stage = useRef<StageController>(null);
  const [dragging, setDragging] = useState<Values>({});
  const madeOf = madeOfPrimitives(primitive);

  return (
    <div data-figure={primitive.id} {...stylex.props(styles.figure)}>
      {introduce && (
        <div {...stylex.props(notes.base, notes.accent)}>
          <p {...stylex.props(type.label, type.labelAccent)}>New piece</p>
          <h3 {...stylex.props(styles.introName)}>{primitive.name}</h3>
          <p {...stylex.props(type.body)}>{primitive.job}</p>
          {madeOf.length > 0 && (
            <div {...stylex.props(layout.row)}>
              <span {...stylex.props(type.label)}>Made of</span>
              {madeOf.map((p) => (
                <span key={p.id} {...stylex.props(chips.base, chips.outline)}>
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Orange for the piece the step is about, blue for annotations. */}
      <FigureStage primitive={primitive} values={values} height={height} palette="lesson" controllerRef={stage} />

      {onSlider && sliders.length > 0 && (
        <div {...stylex.props(styles.sliders)}>
          {sliders.map((s) => (
            <label key={s.id} data-slider={s.id} {...stylex.props(styles.sliderRow, focus === s.id && styles.sliderRowFocus)}>
              <span {...stylex.props(type.label, focus === s.id && type.labelAccent)}>{s.label}</span>
              <span {...stylex.props(styles.value)}>{formatSlider(s, dragging[s.id] ?? values[s.id] ?? s.initial)}</span>
              <Range
                onCommit={(value) => {
                  setDragging((now) => Object.fromEntries(Object.entries(now).filter(([id]) => id !== s.id)));
                  onSlider(s.id, value);
                  onCommit?.(s.id);
                }}
                aria-label={s.label}
                min={s.min}
                max={s.max}
                step={s.step}
                value={dragging[s.id] ?? values[s.id] ?? s.initial}
                onChange={(e) => {
                  const value = Number(e.currentTarget.value);
                  stage.current?.set({ [s.id]: value });
                  setDragging((now) => ({ ...now, [s.id]: value }));
                }}
                {...stylex.props(styles.range, styles.sliderTrack, styles.rangeNeutral)}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
